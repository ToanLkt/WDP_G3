const assert = require('assert');

const {
  normalizeGithubIssue,
  selectRelevantIssues,
  getRepositoryIssueEvidence,
} = require('../src/services/github/github.issue.service');
const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  normalizeDev2VecInput,
} = require('../src/services/dev2vec/dev2vec.service');
const axios = require('axios');
const GithubAccount = require('../src/models/GithubAccount');
const RepositoryIssue = require('../src/models/RepositoryIssue');

const config = {
  maxItems: 10,
  bodyMaxChars: 180,
  documentMaxChars: 800,
};
const context = {
  githubUsername: 'student-dev',
  fullName: 'owner/frontend-auth',
};

const authoredIssue = {
  number: 1,
  title: 'Fix React authentication redirect',
  body: 'React Router redirects authenticated users back to /login after refresh. Please inspect authentication state handling.',
  labels: [{ name: 'bug' }, { name: 'frontend' }],
  state: 'open',
  user: { login: 'student-dev' },
  assignees: [],
  comments: 2,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-03T00:00:00Z',
  html_url: 'https://github.com/owner/frontend-auth/issues/1',
};

const assignedIssue = {
  number: 2,
  title: 'Add Express authentication middleware',
  body: 'Implement Express middleware for authentication and security checks.',
  labels: ['backend', 'security'],
  state: 'open',
  user: { login: 'teammate' },
  assignees: [{ login: 'student-dev' }],
  comments: 1,
  created_at: '2026-07-02T00:00:00Z',
  updated_at: '2026-07-04T00:00:00Z',
};

const pullRequestItem = {
  number: 3,
  title: 'PR: refactor auth flow',
  body: 'Pull request body',
  labels: ['frontend'],
  user: { login: 'student-dev' },
  pull_request: { url: 'https://api.github.com/repos/owner/frontend-auth/pulls/3' },
};

const nullBodyIssue = {
  number: 4,
  title: 'Document OAuth setup',
  body: null,
  labels: [{ name: 'documentation' }],
  state: 'closed',
  user: { login: 'student-dev' },
  assignees: [],
  updated_at: '2026-07-05T00:00:00Z',
};

const longIssue = {
  number: 5,
  title: 'Very long issue',
  body: `Start ${'long technical detail '.repeat(200)} end`,
  labels: ['backend'],
  state: 'open',
  user: { login: 'student-dev' },
  assignees: [],
  updated_at: '2026-07-06T00:00:00Z',
};

const unrelatedIssue = {
  number: 6,
  title: 'Repository fallback issue',
  body: 'General project issue from another user.',
  labels: ['enhancement'],
  state: 'open',
  user: { login: 'another-user' },
  assignees: [],
  updated_at: '2026-07-07T00:00:00Z',
};
const commentedIssue = {
  ...unrelatedIssue,
  number: 7,
  title: 'Issue discussed by linked user',
  comments: 4,
};

const normalized = [
  authoredIssue,
  assignedIssue,
  pullRequestItem,
  nullBodyIssue,
  longIssue,
  authoredIssue,
].map((issue) => normalizeGithubIssue(issue, context, config)).filter(Boolean);

assert.strictEqual(normalized.length, 5);
assert(!normalized.some((issue) => issue.number === 3));
assert.strictEqual(normalized.find((issue) => issue.number === 1).relevanceType, 'authored');
assert.strictEqual(normalized.find((issue) => issue.number === 2).relevanceType, 'assigned');
assert(normalized.find((issue) => issue.number === 4).title.includes('Document OAuth setup'));
assert(normalized.find((issue) => issue.number === 5).body.length <= config.bodyMaxChars);

const selected = selectRelevantIssues(normalized, config);
assert.strictEqual(selected.filter((issue) => issue.number === 1).length, 1);
assert(selected.every((issue) => issue.relevanceType !== 'repository_fallback'));

const fallbackOnly = selectRelevantIssues([
  normalizeGithubIssue(unrelatedIssue, context, config),
], config);
assert.strictEqual(fallbackOnly.length, 0);

const normalizedCommented = normalizeGithubIssue(commentedIssue, {
  ...context,
  userComments: [
    { body: 'My first technical comment', user: { login: 'student-dev' } },
    { body: 'My second technical comment', user: { login: 'student-dev' } },
    { body: 'My third technical comment', user: { login: 'student-dev' } },
    { body: 'Must be capped', user: { login: 'student-dev' } },
  ],
}, { ...config, maxUserComments: 3 });
assert.deepStrictEqual(normalizedCommented.relations, ['commented']);
assert.strictEqual(normalizedCommented.userComments.length, 3);
assert.strictEqual(selectRelevantIssues([normalizedCommented], config).length, 1);

const emptyInput = buildDev2VecInputFromRepositoryAnalysis({
  repository: {
    name: 'empty-issues',
    fullName: 'owner/empty-issues',
    language: 'JavaScript',
  },
  packages: [],
  commits: [],
  issues: [],
  requestId: 'issue-empty',
});
assert.strictEqual(emptyInput.issueDocument, '');

const dev2vecInput = buildDev2VecInputFromRepositoryAnalysis({
  repository: {
    name: 'frontend-auth',
    fullName: 'owner/frontend-auth',
    language: 'JavaScript',
  },
  packages: [],
  commits: [],
  issues: selected,
  requestId: 'issue-evidence',
}, {
  issueMaxLength: config.documentMaxChars,
  issueBodyMaxLength: config.bodyMaxChars,
});

assert(dev2vecInput.issueDocument.includes('fix react authentication redirect'));
assert(dev2vecInput.issueDocument.includes('bug frontend'));
assert(dev2vecInput.issueDocument.includes('react router'));
assert(dev2vecInput.issueDocument.includes('add express authentication middleware'));
assert(!dev2vecInput.issueDocument.includes('"title"'));
assert(dev2vecInput.issueDocument.length <= config.documentMaxChars);

const noFallbackInput = buildDev2VecInputFromRepositoryAnalysis({
  repository: { name: 'no-fallback', fullName: 'owner/no-fallback' },
  issues: fallbackOnly,
  channelStatus: { issue: 'no_user_relevant_issues' },
});
assert.strictEqual(noFallbackInput.issueDocument, '');
assert.strictEqual(noFallbackInput.evidenceChannels.availableChannels.issue, false);

const payload = normalizeDev2VecInput(dev2vecInput);
assert(payload.issueDocument.includes('fix react authentication redirect'));
assert(payload.issueDocument.includes('express authentication middleware'));

const originalFindOne = RepositoryIssue.findOne;
const originalFindOneAndUpdate = RepositoryIssue.findOneAndUpdate;
const originalGithubFindOne = GithubAccount.findOne;
const originalAxiosGet = axios.get;

const makeLeanQuery = (value) => ({
  lean: async () => value,
  select: () => makeLeanQuery(value),
});

(async () => {
  RepositoryIssue.findOne = () => makeLeanQuery(null);
  RepositoryIssue.findOneAndUpdate = async () => ({});
  GithubAccount.findOne = () => ({
    select: () => makeLeanQuery({
      username: 'student-dev',
      accessToken: 'test-token',
    }),
  });
  axios.get = async () => {
    const error = new Error('rate limited');
    error.response = {
      status: 403,
      data: { message: 'API rate limit exceeded' },
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1780000000',
      },
    };
    throw error;
  };

  const failedEvidence = await getRepositoryIssueEvidence({
    user: { userId: '507f1f77bcf86cd799439011' },
    repository: {
      _id: '507f1f77bcf86cd799439012',
      githubRepoId: 123,
      fullName: 'owner/frontend-auth',
    },
    config: { retries: 1, maxPages: 1, maxItems: 2 },
  });

  assert.deepStrictEqual(failedEvidence.issues, []);
  assert.strictEqual(failedEvidence.metadata.attempted, true);
  assert.strictEqual(failedEvidence.metadata.succeeded, false);
  assert.strictEqual(failedEvidence.metadata.unavailable, true);
  assert.strictEqual(failedEvidence.metadata.status, 403);

  RepositoryIssue.findOne = originalFindOne;
  RepositoryIssue.findOneAndUpdate = originalFindOneAndUpdate;
  GithubAccount.findOne = originalGithubFindOne;
  axios.get = originalAxiosGet;

  console.log('PASS: GitHub issue evidence pipeline fixtures');
})().catch((error) => {
  RepositoryIssue.findOne = originalFindOne;
  RepositoryIssue.findOneAndUpdate = originalFindOneAndUpdate;
  GithubAccount.findOne = originalGithubFindOne;
  axios.get = originalAxiosGet;
  throw error;
});
