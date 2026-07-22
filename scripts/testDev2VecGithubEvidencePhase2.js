const assert = require('assert');
const axios = require('axios');

const { buildContributionSummary, selectCommitEvidence } = require('../src/services/github/github.contribution.service');
const {
  normalizePullRequest,
  selectUserPullRequests,
  getUserPullRequestEvidence,
} = require('../src/services/github/github.pullRequest.service');
const { normalizeGithubIssue, selectRelevantIssues, isCacheFresh } = require('../src/services/github/github.issue.service');
const { buildDev2VecInputFromRepositoryAnalysis } = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');

const account = { username: 'student-dev', githubId: 42, email: 'student@example.com', accessToken: 'fixture-token' };
const userCommit = (additions, deletions, overrides = {}) => ({
  sha: `user-${additions}-${deletions}`,
  additions,
  deletions,
  authorLogin: 'student-dev',
  files: [{ filename: 'src/user.js' }],
  ...overrides,
});
const teammateCommit = { ...userCommit(100, 100), sha: 'teammate', authorLogin: 'teammate' };
const userPull = (overrides = {}) => ({
  number: 10, title: 'Add attributed PR evidence', authorLogin: 'student-dev', relation: 'authored', identityVerified: true, additions: 2, deletions: 1,
  changedPaths: ['src/pr.js'], updatedAt: '2026-07-20T00:00:00Z', ...overrides,
});

assert.strictEqual(buildContributionSummary({ commits: [userCommit(3, 2)], githubAccount: account }).accepted, true);
assert.strictEqual(buildContributionSummary({ commits: [userCommit(3, 1)], githubAccount: account }).status, 'insufficient_contribution');
assert.strictEqual(buildContributionSummary({ commits: [teammateCommit], githubAccount: account }).verifiedChangedLines, 0);
assert.strictEqual(buildContributionSummary({ pullRequests: [userPull({ relation: 'reviewed' })], githubAccount: account }).verifiedChangedLines, 0);
assert.strictEqual(buildContributionSummary({ pullRequests: [userPull({ authorLogin: 'teammate' })], githubAccount: account }).verifiedChangedLines, 0);
const combined = buildContributionSummary({ commits: [userCommit(2, 0)], pullRequests: [userPull()], githubAccount: account });
assert.strictEqual(combined.verifiedChangedLines, 5);
assert.strictEqual(combined.accepted, true);
const missingStats = buildContributionSummary({ commits: [userCommit(undefined, undefined)], githubAccount: account });
assert.strictEqual(missingStats.verifiedChangedLines, 0);
assert.strictEqual(missingStats.missingStatsCount, 1);
assert.strictEqual(buildContributionSummary({ commits: [userCommit(10, 0)], githubAccount: {} }).status, 'contribution_unverified');
assert.strictEqual(buildContributionSummary({ commits: [userCommit(5, 0)], githubAccount: account }).accepted, true, 'org repo contribution is accepted by identity, not ownership');
assert.strictEqual(buildContributionSummary({ commits: [], githubAccount: account }).accepted, false, 'repo ownership alone is not contribution');
assert.strictEqual(selectCommitEvidence(Array.from({ length: 20 }, (_, i) => userCommit(1, 0, {
  sha: `sha-${i}`, files: Array.from({ length: 25 }, (__, j) => ({ filename: `src/${i}-${j}.js` })),
})), account).length, 15);
assert.strictEqual(selectCommitEvidence([userCommit(5, 0, { files: Array.from({ length: 25 }, (_, i) => ({ filename: `${i}.js` })) })], account)[0].files.length, 20);

const pulls = [
  { number: 1, user: { login: 'student-dev' }, updated_at: '2026-07-01' },
  { number: 1, user: { login: 'student-dev' }, updated_at: '2026-07-01' },
  { number: 2, user: { login: 'teammate' }, updated_at: '2026-07-02' },
  ...Array.from({ length: 7 }, (_, i) => ({ number: i + 3, user: { login: 'student-dev' }, updated_at: `2026-07-${String(i + 3).padStart(2, '0')}` })),
];
const selectedPulls = selectUserPullRequests(pulls, 'student-dev');
assert.strictEqual(selectedPulls.length, 5);
assert(!selectedPulls.some((pull) => pull.number === 2));
const normalizedPull = normalizePullRequest({
  pull: { number: 9, title: ' Feature   title ', body: ' PR body ', state: 'open', user: { login: 'student-dev' } },
  detail: { additions: 3, deletions: 2, changed_files: 25 },
  files: Array.from({ length: 25 }, (_, i) => ({ filename: `src/file-${i}.js` })), username: 'student-dev',
});
assert.strictEqual(normalizedPull.title, 'Feature title');
assert.strictEqual(normalizedPull.changedPaths.length, 20);
assert.strictEqual(normalizePullRequest({ pull: { user: { login: 'teammate' } }, username: 'student-dev' }), null);

const authoredCommented = normalizeGithubIssue({
  number: 1, title: 'Authored', body: 'Body', user: { login: 'student-dev' }, assignees: [], comments: 2,
}, { githubUsername: 'student-dev', userComments: [{ body: 'Mine' }, { body: 'Mine too' }] });
assert.deepStrictEqual(authoredCommented.relations, ['authored', 'commented']);
const assigned = normalizeGithubIssue({ number: 2, title: 'Assigned', user: { login: 'other' }, assignees: [{ login: 'student-dev' }] }, { githubUsername: 'student-dev' });
assert.deepStrictEqual(assigned.relations, ['assigned']);
const unrelated = normalizeGithubIssue({ number: 3, title: 'Unrelated', user: { login: 'other' } }, { githubUsername: 'student-dev' });
assert.deepStrictEqual(selectRelevantIssues([unrelated]), []);
assert.strictEqual(selectRelevantIssues(Array.from({ length: 25 }, (_, i) => ({ ...authoredCommented, number: i + 1 }))).length, 20);

const rejected = buildContributionSummary({ commits: [userCommit(2, 2)], githubAccount: account });
const rejectedInput = buildDev2VecInputFromRepositoryAnalysis({
  repository: { name: 'owned-but-rejected', description: 'Must not leak' },
  packages: [{ packages: ['express'] }], commits: [userCommit(2, 2)], issues: [unrelated],
  contributionSummary: rejected, channelStatus: { issue: 'no_user_relevant_issues' },
});
assert.strictEqual(rejectedInput.repoDocument, '');
assert.deepStrictEqual(rejectedInput.apiTokens, []);
assert.strictEqual(rejectedInput.issueDocument, '');
assert.strictEqual(rejectedInput.evidenceChannels.availableChannels.repo, false);

const acceptedInput = buildDev2VecInputFromRepositoryAnalysis({
  repository: { name: 'org-repo' }, commits: [userCommit(3, 2)], pullRequests: [userPull()],
  issues: [authoredCommented], contributionSummary: buildContributionSummary({ commits: [userCommit(3, 2)], pullRequests: [userPull()], githubAccount: account }),
  channelStatus: { issue: 'available' },
});
assert(acceptedInput.repoDocument.includes('user pull request'));
assert(acceptedInput.issueDocument.includes('mine'));
assert.strictEqual(acceptedInput.evidenceChannels.channelStatus.issue, 'available');
assert.strictEqual(getCurrentDev2VecPipelineMetadata().analysisPipelineVersion, 'dev2vec-analysis-pipeline-v12');
assert.strictEqual(isCacheFresh({ lastFetchedAt: new Date(), metadata: { evidenceVersion: 'github-issue-evidence-v1' } }, { cacheTtlMs: 60000 }), false);
assert.strictEqual(isCacheFresh({
  lastFetchedAt: new Date(), metadata: { evidenceVersion: getCurrentDev2VecPipelineMetadata().issueEvidenceVersion },
}, { cacheTtlMs: 60000 }), true);

const verifyMockedPullFlow = async () => {
  const originalGet = axios.get;
  let mode = 'success';
  axios.get = async (url) => {
    if (mode === 'rate') {
      const error = new Error('rate limited');
      error.response = { status: 403, headers: { 'x-ratelimit-remaining': '0' } };
      throw error;
    }
    if (url.endsWith('/pulls')) return { data: pulls };
    if (url.endsWith('/files')) return { data: [{ filename: 'src/mock.js' }] };
    return { data: { additions: 4, deletions: 1, changed_files: 1 } };
  };
  try {
    const evidence = await getUserPullRequestEvidence({ repository: { fullName: 'org/repo' }, githubAccount: account });
    assert.strictEqual(evidence.metadata.status, 'available');
    assert.strictEqual(evidence.pullRequests.length, 5);
    mode = 'rate';
    const limited = await getUserPullRequestEvidence({ repository: { fullName: 'org/repo' }, githubAccount: account });
    assert.strictEqual(limited.metadata.status, 'rate_limited');
    assert.deepStrictEqual(limited.pullRequests, []);
  } finally {
    axios.get = originalGet;
  }
};

verifyMockedPullFlow()
  .then(() => console.log('PASS: Dev2Vec Phase 2 user-attributed GitHub evidence'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
