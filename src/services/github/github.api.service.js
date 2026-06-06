const axios = require('axios');

const {
  GITHUB_REPOS_URL,
  GITHUB_TOKEN_URL,
  GITHUB_USER_URL,
  createStatusError,
} = require('./github.utils');

const getGithubHeaders = (accessToken) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

const handleGithubApiError = (error, fallbackMessage) => {
  const status = error.response ? error.response.status : 500;
  const githubMessage = error.response && error.response.data && error.response.data.message;

  if (status === 401) {
    throw createStatusError('GitHub token is invalid or expired. Please reconnect GitHub.', 401);
  }

  if (status === 403) {
    const rateLimited = githubMessage && /rate limit/i.test(githubMessage);
    throw createStatusError(
      rateLimited ? 'GitHub API rate limit exceeded. Please try again later.' : githubMessage || 'GitHub API request was forbidden.',
      rateLimited ? 429 : 403
    );
  }

  throw createStatusError(githubMessage || fallbackMessage, status >= 400 ? status : 500);
};

const fetchGithubAccessToken = async ({ clientId, clientSecret, code, redirectUri }) => {
  const response = await axios.post(
    GITHUB_TOKEN_URL,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  return response.data || {};
};

const fetchGithubUserProfile = async (accessToken) => {
  const response = await axios.get(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  return response.data || {};
};

const fetchGithubRepositories = async (accessToken) => {
  try {
    const response = await axios.get(GITHUB_REPOS_URL, {
      params: {
        per_page: 100,
        sort: 'updated',
        type: 'owner',
      },
      headers: getGithubHeaders(accessToken),
    });

    return response.data || [];
  } catch (error) {
    handleGithubApiError(error, 'Failed to fetch GitHub repositories');
  }
};

const fetchGithubContent = async (owner, repo, path, accessToken) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

  try {
    const response = await axios.get(url, {
      headers: getGithubHeaders(accessToken),
    });

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }

    handleGithubApiError(error, 'Failed to fetch file from GitHub');
  }
};

module.exports = {
  fetchGithubAccessToken,
  fetchGithubUserProfile,
  fetchGithubRepositories,
  fetchGithubContent,
  handleGithubApiError,
  getGithubHeaders,
};
