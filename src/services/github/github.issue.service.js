const axios = require('axios');
const { nowMs } = require('../../utils/dev2vecTiming');
const { recordGithubCall } = require('../../utils/analysisPerformance');

const GithubAccount = require('../../models/GithubAccount');
const RepositoryIssue = require('../../models/RepositoryIssue');
const { findRepositoryForUser } = require('./github.repository.service');
const { getGithubHeaders } = require('./github.api.service');

const DEFAULTS = {
  maxPages: 2,
  perPage: 50,
  maxItems: 40,
  bodyMaxChars: 1200,
  documentMaxChars: 12000,
  timeoutMs: 8000,
  cacheTtlMs: 30 * 60 * 1000,
  retries: 1,
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getIssueConfig = (overrides = {}) => ({
  maxPages: parsePositiveInteger(overrides.maxPages || process.env.GITHUB_ISSUE_MAX_PAGES, DEFAULTS.maxPages),
  perPage: Math.min(100, parsePositiveInteger(overrides.perPage || process.env.GITHUB_ISSUE_PER_PAGE, DEFAULTS.perPage)),
  maxItems: parsePositiveInteger(overrides.maxItems || process.env.GITHUB_ISSUE_MAX_ITEMS, DEFAULTS.maxItems),
  bodyMaxChars: parsePositiveInteger(overrides.bodyMaxChars || process.env.GITHUB_ISSUE_BODY_MAX_CHARS, DEFAULTS.bodyMaxChars),
  documentMaxChars: parsePositiveInteger(
    overrides.documentMaxChars || process.env.GITHUB_ISSUE_DOCUMENT_MAX_CHARS,
    DEFAULTS.documentMaxChars
  ),
  timeoutMs: parsePositiveInteger(overrides.timeoutMs || process.env.GITHUB_ISSUE_FETCH_TIMEOUT_MS, DEFAULTS.timeoutMs),
  cacheTtlMs: parsePositiveInteger(overrides.cacheTtlMs || process.env.GITHUB_ISSUE_CACHE_TTL_MS, DEFAULTS.cacheTtlMs),
  retries: Math.min(2, parsePositiveInteger(overrides.retries || process.env.GITHUB_ISSUE_FETCH_RETRIES, DEFAULTS.retries)),
});

const compactString = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const stripMarkdownNoise = (value = '', maxChars = DEFAULTS.bodyMaxChars) => {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, (block) => block.slice(0, 400))
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/data:[^;\s]+;base64,\S+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  return compactString(text).slice(0, maxChars).trim();
};

const normalizeLabels = (labels = []) => (
  Array.isArray(labels)
    ? labels
        .map((label) => (typeof label === 'string' ? label : label?.name))
        .map(compactString)
        .filter(Boolean)
        .slice(0, 12)
    : []
);

const normalizeAssignees = (issue = {}) => {
  const assignees = Array.isArray(issue.assignees) ? issue.assignees : [];
  const fromList = assignees.map((assignee) => assignee?.login).filter(Boolean);
  const single = issue.assignee?.login ? [issue.assignee.login] : [];
  return [...new Set([...fromList, ...single].map(compactString).filter(Boolean))].slice(0, 10);
};

const getRelevanceType = (issue, username) => {
  const normalizedUser = String(username || '').trim().toLowerCase();
  if (!normalizedUser) return 'repository_fallback';
  if (String(issue.user?.login || '').trim().toLowerCase() === normalizedUser) return 'authored';
  if (normalizeAssignees(issue).some((login) => login.toLowerCase() === normalizedUser)) return 'assigned';
  return 'repository_fallback';
};

const normalizeGithubIssue = (issue = {}, context = {}, config = getIssueConfig()) => {
  if (!issue || typeof issue !== 'object') return null;
  if (issue.pull_request) return null;

  const title = compactString(issue.title);
  const labels = normalizeLabels(issue.labels);
  const body = stripMarkdownNoise(issue.body, config.bodyMaxChars);
  if (!title && !labels.length && !body) return null;

  return {
    number: issue.number || null,
    title,
    body,
    labels,
    state: compactString(issue.state),
    authorLogin: compactString(issue.user?.login),
    assigneeLogins: normalizeAssignees(issue),
    commentCount: Number(issue.comments || 0),
    createdAt: issue.created_at || issue.createdAt || null,
    updatedAt: issue.updated_at || issue.updatedAt || null,
    closedAt: issue.closed_at || issue.closedAt || null,
    sourceType: 'issue',
    relevanceType: getRelevanceType(issue, context.githubUsername),
    repositoryFullName: context.fullName || '',
    htmlUrl: issue.html_url || '',
  };
};

const dedupeIssues = (issues = [], limit = DEFAULTS.maxItems) => {
  const seen = new Set();
  const output = [];
  for (const issue of issues) {
    const key = issue.number
      ? `${issue.repositoryFullName || ''}#${issue.number}`
      : `${issue.repositoryFullName || ''}:${issue.title}:${issue.createdAt}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(issue);
    if (output.length >= limit) break;
  }
  return output;
};

const rankIssues = (issues = []) => (
  [...issues].sort((left, right) => {
    const leftRelevant = left.relevanceType === 'repository_fallback' ? 0 : 1;
    const rightRelevant = right.relevanceType === 'repository_fallback' ? 0 : 1;
    if (leftRelevant !== rightRelevant) return rightRelevant - leftRelevant;
    return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
  })
);

const selectRelevantIssues = (issues = [], config = getIssueConfig()) => {
  const direct = issues.filter((issue) => issue.relevanceType !== 'repository_fallback');
  const selected = direct.length ? direct : issues.map((issue) => ({ ...issue, relevanceType: 'repository_fallback' }));
  return dedupeIssues(rankIssues(selected), config.maxItems);
};

const isCacheFresh = (record, config) => {
  if (!record?.lastFetchedAt) return false;
  return Date.now() - new Date(record.lastFetchedAt).getTime() < config.cacheTtlMs;
};

const buildIssueFetchMetadata = (overrides = {}) => ({
  attempted: Boolean(overrides.attempted),
  succeeded: Boolean(overrides.succeeded),
  unavailable: Boolean(overrides.unavailable),
  empty: Boolean(overrides.empty),
  source: overrides.source || 'github',
  fetchedAt: overrides.fetchedAt || new Date(),
  fetchedCount: Number(overrides.fetchedCount || 0),
  normalizedCount: Number(overrides.normalizedCount || 0),
  selectedCount: Number(overrides.selectedCount || 0),
  relevantCount: Number(overrides.relevantCount || 0),
  fallbackCount: Number(overrides.fallbackCount || 0),
  errorCode: overrides.errorCode || '',
  status: overrides.status || null,
  rateLimitRemaining: overrides.rateLimitRemaining || null,
  rateLimitReset: overrides.rateLimitReset || null,
});

const logIssueFetchFailure = ({ error, repositoryId, userId }) => {
  const response = error?.response;
  console.warn('[github-issues] fetch unavailable:', {
    status: response?.status || error?.code || 'unknown',
    message: response?.data?.message || error?.message || 'unknown error',
    repositoryId: String(repositoryId || ''),
    userId: String(userId || ''),
    rateLimitRemaining: response?.headers?.['x-ratelimit-remaining'],
    rateLimitReset: response?.headers?.['x-ratelimit-reset'],
  });
};

const fetchGithubIssuesPage = async ({ owner, repo, accessToken, page, config }) => {
  const started = nowMs();
  let response;
  try {
    response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      params: { state: 'all', sort: 'updated', direction: 'desc', per_page: config.perPage, page },
      headers: getGithubHeaders(accessToken), timeout: config.timeoutMs,
    });
  } finally {
    recordGithubCall('issues', nowMs() - started);
  }
  return {
    items: Array.isArray(response.data) ? response.data : [],
    headers: response.headers || {},
  };
};

const fetchGithubIssuesWithRetry = async ({ owner, repo, accessToken, config }) => {
  const items = [];
  let lastHeaders = {};

  for (let page = 1; page <= config.maxPages && items.length < config.maxItems; page += 1) {
    let attempt = 0;
    while (attempt <= config.retries) {
      try {
        const result = await fetchGithubIssuesPage({ owner, repo, accessToken, page, config });
        lastHeaders = result.headers;
        items.push(...result.items);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt > config.retries || error?.response?.status === 401 || error?.response?.status === 404) {
          throw error;
        }
      }
    }
    if (items.length < page * config.perPage) break;
  }

  return {
    issues: items.slice(0, config.maxItems),
    headers: lastHeaders,
  };
};

const persistIssueCache = async ({ userId, repository, issues, metadata }) => {
  await RepositoryIssue.findOneAndUpdate(
    { userId, repositoryId: repository._id },
    {
      $set: {
        userId,
        repositoryId: repository._id,
        githubRepoId: repository.githubRepoId,
        fullName: repository.fullName,
        issues,
        metadata,
        lastFetchedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const getRepositoryIssueEvidence = async ({ user, repository, repoId, forceRefresh = false, config: configOverrides = {} }) => {
  const config = getIssueConfig(configOverrides);
  const targetRepository = repository || await findRepositoryForUser(user, repoId);
  const cached = await RepositoryIssue.findOne({ userId: user.userId, repositoryId: targetRepository._id }).lean();
  if (!forceRefresh && isCacheFresh(cached, config)) {
    return {
      issues: cached.issues || [],
      metadata: {
        ...(cached.metadata || {}),
        source: 'cache',
      },
    };
  }

  const githubAccount = await GithubAccount.findOne({ userId: user.userId }).select('+accessToken').lean();
  if (!githubAccount?.accessToken) {
    return {
      issues: [],
      metadata: buildIssueFetchMetadata({ attempted: false, unavailable: true, source: 'none', errorCode: 'GITHUB_ACCOUNT_MISSING' }),
    };
  }

  const [owner, repo] = String(targetRepository.fullName || '').split('/');
  if (!owner || !repo) {
    return {
      issues: [],
      metadata: buildIssueFetchMetadata({ attempted: false, unavailable: true, source: 'none', errorCode: 'INVALID_REPOSITORY_FULL_NAME' }),
    };
  }

  try {
    const result = await fetchGithubIssuesWithRetry({
      owner,
      repo,
      accessToken: githubAccount.accessToken,
      config,
    });
    const normalized = result.issues
      .map((issue) => normalizeGithubIssue(issue, {
        githubUsername: githubAccount.username,
        fullName: targetRepository.fullName,
      }, config))
      .filter(Boolean);
    const selected = selectRelevantIssues(normalized, config);
    const metadata = buildIssueFetchMetadata({
      attempted: true,
      succeeded: true,
      empty: selected.length === 0,
      fetchedCount: result.issues.length,
      normalizedCount: normalized.length,
      selectedCount: selected.length,
      relevantCount: selected.filter((issue) => issue.relevanceType !== 'repository_fallback').length,
      fallbackCount: selected.filter((issue) => issue.relevanceType === 'repository_fallback').length,
      rateLimitRemaining: result.headers['x-ratelimit-remaining'] || null,
      rateLimitReset: result.headers['x-ratelimit-reset'] || null,
    });

    await persistIssueCache({ userId: user.userId, repository: targetRepository, issues: selected, metadata });
    return { issues: selected, metadata };
  } catch (error) {
    logIssueFetchFailure({ error, repositoryId: targetRepository._id, userId: user.userId });
    const metadata = buildIssueFetchMetadata({
      attempted: true,
      succeeded: false,
      unavailable: true,
      fetchedCount: 0,
      selectedCount: 0,
      errorCode: error?.code || error?.response?.data?.message || 'GITHUB_ISSUE_FETCH_FAILED',
      status: error?.response?.status || null,
      rateLimitRemaining: error?.response?.headers?.['x-ratelimit-remaining'] || null,
      rateLimitReset: error?.response?.headers?.['x-ratelimit-reset'] || null,
    });
    await persistIssueCache({ userId: user.userId, repository: targetRepository, issues: [], metadata });
    return { issues: [], metadata };
  }
};

module.exports = {
  getIssueConfig,
  normalizeGithubIssue,
  selectRelevantIssues,
  getRepositoryIssueEvidence,
  stripMarkdownNoise,
};
