const axios = require('axios');
const { getGithubHeaders } = require('./github.api.service');

const DEFAULTS = { maxInspected: 30, maxUserPullRequests: 5, maxChangedFiles: 20, timeoutMs: 8000 };
const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const login = (value) => compact(value?.login || value).toLowerCase();

const classifyFailure = (error) => {
  const status = Number(error?.response?.status || 0);
  const remaining = String(error?.response?.headers?.['x-ratelimit-remaining'] ?? '');
  if (status === 403 && remaining === '0' || status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'not_authorized';
  return 'fetch_failed';
};

const normalizePullRequest = ({ pull = {}, detail = {}, files = [], username = '' } = {}) => {
  const source = { ...pull, ...detail };
  const authorLogin = compact(source.user?.login);
  if (!username || login(authorLogin) !== login(username)) return null;
  const selectedFiles = (Array.isArray(files) ? files : []).slice(0, DEFAULTS.maxChangedFiles);
  const changedPaths = [...new Set(selectedFiles
    .slice(0, DEFAULTS.maxChangedFiles)
    .map((file) => compact(file?.filename || file?.path))
    .filter(Boolean))];
  return {
    number: Number(source.number) || null,
    title: compact(source.title).slice(0, 300),
    body: compact(source.body).slice(0, 1200),
    state: compact(source.state),
    authorLogin,
    createdAt: source.created_at || source.createdAt || null,
    updatedAt: source.updated_at || source.updatedAt || null,
    mergedAt: source.merged_at || source.mergedAt || null,
    additions: typeof source.additions === 'number' && Number.isFinite(source.additions) && source.additions >= 0 ? source.additions : null,
    deletions: typeof source.deletions === 'number' && Number.isFinite(source.deletions) && source.deletions >= 0 ? source.deletions : null,
    changedFiles: Number.isFinite(Number(source.changed_files)) ? Number(source.changed_files) : changedPaths.length,
    changedPaths,
    files: selectedFiles.map((file) => ({
      filename: compact(file?.filename || file?.path),
      status: compact(file?.status),
      additions: Number(file?.additions || 0),
      deletions: Number(file?.deletions || 0),
      evidenceSource: 'pull_request_patch',
      evidenceContent: String(file?.patch || '').slice(0, 12000),
    })).filter((file) => file.filename),
    relation: 'authored',
    identityVerified: true,
  };
};

const selectUserPullRequests = (pulls = [], username = '', limit = DEFAULTS.maxUserPullRequests) => {
  const seen = new Set();
  return [...pulls]
    .filter((pull) => login(pull?.user) === login(username))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
      || Number(b.number || 0) - Number(a.number || 0))
    .filter((pull) => {
      const number = Number(pull?.number);
      if (!number || seen.has(number)) return false;
      seen.add(number);
      return true;
    })
    .slice(0, limit);
};

const getUserPullRequestEvidence = async ({ repository, githubAccount, config = {} } = {}) => {
  const limits = { ...DEFAULTS, ...config };
  if (!githubAccount?.username) return { pullRequests: [], metadata: { status: 'identity_missing', succeeded: false } };
  if (!githubAccount?.accessToken) return { pullRequests: [], metadata: { status: 'not_authorized', succeeded: false } };
  const [owner, repo] = String(repository?.fullName || '').split('/');
  if (!owner || !repo) return { pullRequests: [], metadata: { status: 'fetch_failed', succeeded: false, errorCode: 'INVALID_REPOSITORY_FULL_NAME' } };
  try {
    const list = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      params: { state: 'all', per_page: Math.min(30, limits.maxInspected), sort: 'updated', direction: 'desc' },
      headers: getGithubHeaders(githubAccount.accessToken), timeout: limits.timeoutMs,
    });
    const selected = selectUserPullRequests((list.data || []).slice(0, limits.maxInspected), githubAccount.username, limits.maxUserPullRequests);
    const pullRequests = [];
    for (const pull of selected) {
      const [detail, files] = await Promise.all([
        axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}`, { headers: getGithubHeaders(githubAccount.accessToken), timeout: limits.timeoutMs }),
        axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}/files`, {
          params: { per_page: Math.min(20, limits.maxChangedFiles) }, headers: getGithubHeaders(githubAccount.accessToken), timeout: limits.timeoutMs,
        }),
      ]);
      const normalized = normalizePullRequest({ pull, detail: detail.data, files: files.data, username: githubAccount.username });
      if (normalized) pullRequests.push(normalized);
    }
    return {
      pullRequests,
      metadata: {
        status: pullRequests.length ? 'available' : 'empty', succeeded: true,
        inspectedCount: Math.min((list.data || []).length, limits.maxInspected), selectedCount: pullRequests.length,
      },
    };
  } catch (error) {
    return { pullRequests: [], metadata: { status: classifyFailure(error), succeeded: false, httpStatus: error?.response?.status || null } };
  }
};

module.exports = { DEFAULTS, normalizePullRequest, selectUserPullRequests, getUserPullRequestEvidence, classifyFailure };
