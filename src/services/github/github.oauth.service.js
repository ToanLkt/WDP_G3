const crypto = require('crypto');

const GithubOAuthState = require('../../models/GithubOAuthState');
const GithubAccount = require('../../models/GithubAccount');
const StudentProfile = require('../../models/StudentProfile');

const {
  GITHUB_AUTHORIZE_URL,
  OAUTH_STATE_TTL_MS,
  createStatusError,
  ensureAuthorizedUser,
} = require('./github.utils');
const { fetchGithubAccessToken, fetchGithubUserProfile } = require('./github.api.service');

const requireGithubConfig = () => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, FRONTEND_URL } = process.env;

  if (!GITHUB_CLIENT_ID) {
    throw createStatusError('GITHUB_CLIENT_ID is not configured', 500);
  }

  if (!GITHUB_CLIENT_SECRET) {
    throw createStatusError('GITHUB_CLIENT_SECRET is not configured', 500);
  }

  if (!GITHUB_CALLBACK_URL) {
    throw createStatusError('GITHUB_CALLBACK_URL is not configured', 500);
  }

  if (!FRONTEND_URL) {
    throw createStatusError('FRONTEND_URL is not configured', 500);
  }

  return {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
    FRONTEND_URL,
  };
};

const ensureGithubQuery = (query) => {
  const code = String(query.code || '').trim();
  const state = String(query.state || '').trim();

  if (!code || !state) {
    throw createStatusError('code and state are required', 400);
  }

  return { code, state };
};

const buildAuthSuccessHtml = () => `
<html>
  <head>
    <title>GitHub connected successfully</title>
  </head>
  <body>
    <h1>GitHub connected successfully</h1>
    <p>You can close this tab and return to Postman.</p>
  </body>
</html>`;

const startOAuth = async (authUser) => {
  ensureAuthorizedUser(authUser);

  const { GITHUB_CLIENT_ID, GITHUB_CALLBACK_URL } = requireGithubConfig();
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  await GithubOAuthState.create({
    userId: authUser.userId,
    state,
    used: false,
    expiresAt,
  });

  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', GITHUB_CALLBACK_URL);
  url.searchParams.set('scope', 'repo read:user user:email');
  url.searchParams.set('state', state);

  return {
    message: 'GitHub OAuth URL generated successfully',
    data: {
      authorizeUrl: url.toString(),
    },
    statusCode: 200,
  };
};

const handleOAuthCallback = async (query) => {
  const { code, state } = ensureGithubQuery(query);
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL } = requireGithubConfig();

  const stateRecord = await GithubOAuthState.findOne({ state });
  if (!stateRecord) {
    throw createStatusError('Invalid OAuth state', 400);
  }

  if (stateRecord.used) {
    throw createStatusError('OAuth state has already been used', 400);
  }

  if (stateRecord.expiresAt.getTime() < Date.now()) {
    throw createStatusError('OAuth state has expired', 400);
  }

  const tokenPayload = await fetchGithubAccessToken({
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    code,
    redirectUri: GITHUB_CALLBACK_URL,
  });

  const accessToken = tokenPayload && tokenPayload.access_token;
  if (!accessToken) {
    throw createStatusError('GitHub access token not received', 400);
  }

  const githubUser = await fetchGithubUserProfile(accessToken);

  await GithubAccount.findOneAndUpdate(
    { userId: stateRecord.userId },
    {
      userId: stateRecord.userId,
      githubId: githubUser.id,
      username: githubUser.login,
      displayName: githubUser.name || '',
      avatarUrl: githubUser.avatar_url || '',
      profileUrl: githubUser.html_url || '',
      accessToken,
      tokenType: tokenPayload.token_type || 'bearer',
      scope: tokenPayload.scope || '',
      connectedAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  await StudentProfile.findOneAndUpdate(
    { userId: stateRecord.userId },
    {
      $set: {
        githubUsername: githubUser.login || '',
        githubConnected: true,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  stateRecord.used = true;
  await stateRecord.save();

  return buildAuthSuccessHtml();
};

module.exports = {
  startOAuth,
  handleOAuthCallback,
};
