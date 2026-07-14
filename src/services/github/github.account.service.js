const GithubAccount = require('../../models/GithubAccount');
const StudentProfile = require('../../models/StudentProfile');

const { ensureAuthorizedUser } = require('./github.utils');
const { revokeGithubAccessToken } = require('./github.api.service');

const GITHUB_LOGOUT_URL = 'https://github.com/logout';
const DISCONNECT_NOTE = 'Disconnected from this app. To connect a different GitHub account, log out from GitHub.com or use an incognito window before reconnecting.';

const sanitizeGithubAccount = (account) => {
  if (!account) {
    return null;
  }

  return {
    githubUserId: account.githubId ? String(account.githubId) : '',
    username: account.username,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    email: account.email || '',
    profileUrl: account.profileUrl,
    connectedAt: account.connectedAt,
    updatedAt: account.updatedAt,
  };
};

const buildAccountResponse = (account) => ({
  connected: Boolean(account),
  account: sanitizeGithubAccount(account),
});

const tryRevokeToken = async (account) => {
  const accessToken = account?.accessToken;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!accessToken || !clientId || !clientSecret) {
    console.info('[github-account]', { event: 'github_revoke_skipped_missing_config' });
    return 'skipped_missing_config';
  }

  try {
    await revokeGithubAccessToken({ clientId, clientSecret, accessToken });
    console.info('[github-account]', { event: 'github_revoke_success' });
    return 'success';
  } catch (error) {
    console.warn('[github-account]', {
      event: 'github_revoke_failed',
      reason: error.response?.status || error.code || error.message,
    });
    return 'failed';
  }
};

const getGithubAccount = async (authUser) => {
  ensureAuthorizedUser(authUser);

  const account = await GithubAccount.findOne({ userId: authUser.userId }).select(
    'githubId username displayName avatarUrl email profileUrl connectedAt updatedAt'
  );

  return {
    message: 'GitHub account fetched successfully',
    data: buildAccountResponse(account),
    statusCode: 200,
  };
};

const getGithubAccountLegacy = async (authUser) => {
  ensureAuthorizedUser(authUser);

  const account = await GithubAccount.findOne({ userId: authUser.userId }).select(
    'githubId username displayName avatarUrl email profileUrl connectedAt updatedAt'
  );

  return {
    message: 'GitHub account fetched successfully',
    data: {
      githubAccount: sanitizeGithubAccount(account),
    },
    statusCode: 200,
  };
};

const disconnectGithubAccount = async (authUser) => {
  ensureAuthorizedUser(authUser);

  const account = await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken');
  if (account) {
    await tryRevokeToken(account);
    await GithubAccount.deleteOne({ _id: account._id, userId: authUser.userId });
  }

  await StudentProfile.findOneAndUpdate(
    { userId: authUser.userId },
    {
      $set: {
        githubConnected: false,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  return {
    message: 'GitHub account disconnected successfully',
    data: {
      connected: false,
      githubLogoutUrl: GITHUB_LOGOUT_URL,
      note: DISCONNECT_NOTE,
    },
    statusCode: 200,
  };
};

module.exports = {
  sanitizeGithubAccount,
  getGithubAccount,
  getGithubAccountLegacy,
  disconnectGithubAccount,
};
