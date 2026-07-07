const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const GithubAuthState = require('../models/GithubAuthState');
const RevokedToken = require('../models/RevokedToken');
const User = require('../models/User');
const { getGithubAuthRedirectUrl } = require('../config/frontend');
const {
  GITHUB_AUTHORIZE_URL,
  GITHUB_TOKEN_URL,
  OAUTH_STATE_TTL_MS,
} = require('./github/github.utils');
const generateToken = require('../utils/generateToken');

const sanitizeUser = (userDocument) => ({
  id: userDocument._id,
  fullName: userDocument.fullName,
  email: userDocument.email,
  avatarUrl: userDocument.avatarUrl || null,
  role: userDocument.role,
  settings: userDocument.settings,
  createdAt: userDocument.createdAt,
  updatedAt: userDocument.updatedAt,
});

const buildAuthPayload = (userDocument) => {
  const token = generateToken({
    id: String(userDocument._id),
    userId: String(userDocument._id),
    email: userDocument.email,
    provider: userDocument.provider,
    role: userDocument.role,
  });

  return {
    user: sanitizeUser(userDocument),
    token,
  };
};

const buildSocialAuthPayload = (userDocument, provider) => {
  const accessToken = generateToken({
    id: String(userDocument._id),
    userId: String(userDocument._id),
    email: userDocument.email || null,
    provider,
  });

  return {
    accessToken,
    user: {
      _id: userDocument._id,
      name: userDocument.name || userDocument.fullName,
      email: userDocument.email || null,
      avatar: userDocument.avatar || userDocument.avatarUrl || '',
      provider,
    },
  };
};

const createStatusError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getGithubAuthCallbackUrl = () => {
  const explicitUrl = String(process.env.GITHUB_CALLBACK_URL || '').trim();
  if (explicitUrl) return explicitUrl;

  const apiBaseUrl = String(process.env.API_BASE_URL || '').trim();
  if (apiBaseUrl) {
    return `${apiBaseUrl.replace(/\/$/, '')}/api/auth/github/callback`;
  }

  return 'http://localhost:5000/api/auth/github/callback';
};

const requireGithubAuthConfig = () => {
  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
  const callbackUrl = getGithubAuthCallbackUrl();

  if (!clientId) {
    throw createStatusError('GITHUB_CLIENT_ID is not configured', 500);
  }

  if (!clientSecret) {
    throw createStatusError('GITHUB_CLIENT_SECRET is not configured', 500);
  }

  if (!callbackUrl) {
    throw createStatusError('GITHUB_CALLBACK_URL is not configured', 500);
  }

  return {
    clientId,
    clientSecret,
    callbackUrl,
  };
};

const normalizeEmail = (email) => {
  if (!email) return null;
  return String(email).trim().toLowerCase() || null;
};

const findOrCreateSocialUser = async ({
  provider,
  providerIdField,
  providerId,
  email,
  name,
  avatar,
  githubUsername,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || githubUsername || 'Social User').trim();
  const avatarUrl = String(avatar || '').trim();

  let user = await User.findOne({ [providerIdField]: providerId });

  if (!user && normalizedEmail) {
    user = await User.findOne({ email: normalizedEmail });
  }

  if (!user) {
    const userPayload = {
      fullName: displayName,
      name: displayName,
      avatarUrl,
      avatar: avatarUrl,
      provider,
      [providerIdField]: providerId,
      githubUsername,
      role: 'student',
    };

    if (normalizedEmail) {
      userPayload.email = normalizedEmail;
    }

    user = await User.create(userPayload);

    return user;
  }

  user[providerIdField] = user[providerIdField] || providerId;
  user.provider = provider;
  user.name = user.name || displayName;
  user.fullName = user.fullName || displayName;

  if (avatarUrl) {
    user.avatar = avatarUrl;
    user.avatarUrl = avatarUrl;
  }

  if (!user.email && normalizedEmail) {
    user.email = normalizedEmail;
  }

  if (githubUsername) {
    user.githubUsername = githubUsername;
  }

  await user.save();
  return user;
};

const registerUser = async (payload) => {
  const fullName = String(payload.fullName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error('Email already exists');
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const createdUser = await User.create({
    fullName,
    name: fullName,
    email,
    password: hashedPassword,
    provider: 'local',
    role: 'student',
  });

  return {
    message: 'Register successful',
    data: buildAuthPayload(createdUser),
    statusCode: 201,
  };
};

const loginUser = async (payload) => {
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  return {
    message: 'Login successful',
    data: buildAuthPayload(user),
    statusCode: 200,
  };
};

const loginWithGoogle = async (payload) => {
  const idToken = String(payload.idToken || '').trim();

  if (!idToken) {
    throw createStatusError('idToken is required', 400);
  }

  let googleUser;
  try {
    const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: idToken },
    });
    googleUser = response.data;
  } catch (error) {
    throw createStatusError('Invalid Google token', 401);
  }

  if (!googleUser || !googleUser.sub) {
    throw createStatusError('Invalid Google token', 401);
  }

  if (process.env.GOOGLE_CLIENT_ID && googleUser.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw createStatusError('Invalid Google token', 401);
  }

  const user = await findOrCreateSocialUser({
    provider: 'google',
    providerIdField: 'googleId',
    providerId: String(googleUser.sub),
    email: googleUser.email,
    name: googleUser.name || googleUser.email,
    avatar: googleUser.picture,
  });

  return {
    message: 'Login with Google successfully',
    data: buildSocialAuthPayload(user, 'google'),
    statusCode: 200,
  };
};

const getGithubPrimaryEmail = async (accessToken) => {
  const response = await axios.get('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  const emails = Array.isArray(response.data) ? response.data : [];
  const primaryVerifiedEmail = emails.find((item) => item.primary && item.verified && item.email);
  const verifiedEmail = emails.find((item) => item.verified && item.email);

  return normalizeEmail((primaryVerifiedEmail || verifiedEmail || {}).email);
};

const fetchGithubProfile = async (accessToken) => {
  let githubUser;
  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    githubUser = response.data;
  } catch (error) {
    throw createStatusError('Invalid GitHub token', 401);
  }

  if (!githubUser || !githubUser.id) {
    throw createStatusError('Invalid GitHub token', 401);
  }

  return githubUser;
};

const loginWithGithubAccessToken = async (accessToken) => {
  if (!accessToken) {
    throw createStatusError('GitHub access token not received', 400);
  }

  const githubUser = await fetchGithubProfile(accessToken);
  let email = normalizeEmail(githubUser.email);

  try {
    email = email || (await getGithubPrimaryEmail(accessToken));
  } catch (error) {
    email = email || null;
  }

  const user = await findOrCreateSocialUser({
    provider: 'github',
    providerIdField: 'githubId',
    providerId: String(githubUser.id),
    email,
    name: githubUser.name || githubUser.login,
    avatar: githubUser.avatar_url,
    githubUsername: githubUser.login,
  });

  return {
    message: 'Login with GitHub successfully',
    data: buildSocialAuthPayload(user, 'github'),
    statusCode: 200,
  };
};

const startGithubOAuthLogin = async (options = {}) => {
  const { clientId, callbackUrl } = requireGithubAuthConfig();
  const redirectUrl = getGithubAuthRedirectUrl(options.redirectUrl, options.origin);

  if (!redirectUrl) {
    throw createStatusError('Frontend redirect URL is not configured', 500);
  }

  const state = crypto.randomBytes(32).toString('hex');

  // Store a short-lived state so the callback can reject forged OAuth responses.
  await GithubAuthState.create({
    state,
    redirectUrl,
    used: false,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('scope', 'read:user user:email');
  authorizeUrl.searchParams.set('state', state);

  return authorizeUrl.toString();
};

const exchangeGithubCodeForToken = async (code) => {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    throw createStatusError('GitHub authorization code is required', 400);
  }

  const { clientId, clientSecret, callbackUrl } = requireGithubAuthConfig();

  let response;
  try {
    response = await axios.post(
      GITHUB_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code: normalizedCode,
        redirect_uri: callbackUrl,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
  } catch (error) {
    throw createStatusError('Failed to exchange GitHub authorization code', 400);
  }

  const accessToken = response.data && response.data.access_token;
  if (!accessToken) {
    throw createStatusError('GitHub access token not received', 400);
  }

  return accessToken;
};

const consumeGithubOAuthState = async (state) => {
  const normalizedState = String(state || '').trim();
  if (!normalizedState) {
    throw createStatusError('GitHub OAuth state is required', 400);
  }

  const stateRecord = await GithubAuthState.findOne({ state: normalizedState });
  if (!stateRecord) {
    throw createStatusError('Invalid GitHub OAuth state', 400);
  }

  if (stateRecord.used) {
    throw createStatusError('GitHub OAuth state has already been used', 400);
  }

  if (stateRecord.expiresAt.getTime() < Date.now()) {
    throw createStatusError('GitHub OAuth state has expired', 400);
  }

  stateRecord.used = true;
  await stateRecord.save();

  return stateRecord;
};

const buildGithubAuthErrorRedirect = (redirectUrl, error) => {
  const url = new URL(redirectUrl);
  url.searchParams.set('error', error.message || 'GitHub login failed');
  return url.toString();
};

const handleGithubOAuthCallback = async (query = {}) => {
  if (query.error) {
    const oauthError = createStatusError(String(query.error_description || query.error), 400);
    if (query.state) {
      const stateRecord = await consumeGithubOAuthState(query.state);
      return buildGithubAuthErrorRedirect(stateRecord.redirectUrl, oauthError);
    }

    throw oauthError;
  }

  const stateRecord = await consumeGithubOAuthState(query.state);

  try {
    const githubAccessToken = await exchangeGithubCodeForToken(query.code);
    const result = await loginWithGithubAccessToken(githubAccessToken);

    const redirectUrl = new URL(stateRecord.redirectUrl);
    // Use URL fragment so the JWT is not sent back to the frontend server in an HTTP request.
    redirectUrl.hash = new URLSearchParams({
      success: 'true',
      accessToken: result.data.accessToken,
      provider: 'github',
    }).toString();

    return redirectUrl.toString();
  } catch (error) {
    return buildGithubAuthErrorRedirect(stateRecord.redirectUrl, error);
  }
};

const getCurrentUser = async (authUser) => {
  const userId = authUser && (authUser.userId || authUser.id);

  if (!userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Current user retrieved successfully',
    data: sanitizeUser(user),
    statusCode: 200,
  };
};

const logoutUser = async ({ authUser, token }) => {
  const userId = authUser && (authUser.userId || authUser.id);

  if (!userId || !token) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const expiresAt = authUser.exp ? new Date(authUser.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RevokedToken.updateOne(
    { token },
    {
      $setOnInsert: {
        token,
        userId,
        expiresAt,
      },
    },
    { upsert: true }
  );

  return {
    message: 'Logout successfully',
    data: null,
    statusCode: 200,
  };
};

const changePassword = async ({ authUser, body }) => {
  const userId = authUser && (authUser.userId || authUser.id);

  if (!userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const user = await User.findById(userId).select('+password');

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const isPasswordMatched = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordMatched) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 400;
    throw error;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return {
    message: 'Password changed successfully',
    data: null,
    statusCode: 200,
  };
};

module.exports = {
  changePassword,
  registerUser,
  loginUser,
  loginWithGoogle,
  startGithubOAuthLogin,
  handleGithubOAuthCallback,
  getCurrentUser,
  logoutUser,
};
