const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_REPOS_URL = 'https://api.github.com/user/repos';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const createStatusError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureAuthorizedUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    throw createStatusError('Unauthorized', 401);
  }
};

const parseBooleanQuery = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return defaultValue;
};

module.exports = {
  GITHUB_AUTHORIZE_URL,
  GITHUB_TOKEN_URL,
  GITHUB_USER_URL,
  GITHUB_REPOS_URL,
  OAUTH_STATE_TTL_MS,
  createStatusError,
  ensureAuthorizedUser,
  parseBooleanQuery,
};
