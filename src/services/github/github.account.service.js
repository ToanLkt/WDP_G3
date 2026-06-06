const GithubAccount = require('../../models/GithubAccount');
const StudentProfile = require('../../models/StudentProfile');

const { ensureAuthorizedUser } = require('./github.utils');

const sanitizeGithubAccount = (account) => {
  if (!account) {
    return null;
  }

  return {
    username: account.username,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    profileUrl: account.profileUrl,
    connectedAt: account.connectedAt,
  };
};

const getGithubAccount = async (authUser) => {
  ensureAuthorizedUser(authUser);

  const account = await GithubAccount.findOne({ userId: authUser.userId }).select(
    'username displayName avatarUrl profileUrl connectedAt'
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

  await GithubAccount.deleteOne({ userId: authUser.userId });

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
    data: null,
    statusCode: 200,
  };
};

module.exports = {
  getGithubAccount,
  disconnectGithubAccount,
};
