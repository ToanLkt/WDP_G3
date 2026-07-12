const assert = require('assert');

const {
  filterUserContributionCommits,
  getCommitUserMatchInfo,
} = require('../src/services/analysis/analysis.engine');
const {
  getBranchForCommitFetch,
  normalizeCommit,
} = require('../src/services/github/github.commit.service');

const user = { userId: 'user-1' };
const repository = {
  _id: 'repo-1',
  githubRepoId: 123,
  fullName: 'ToanLkt/Plantcare_admin_Web',
  defaultBranch: 'master',
};
const githubAccount = {
  username: 'ToanLkt',
  githubId: 456,
  email: 'toan@example.com',
};

const githubCommit = ({
  sha = 'abc',
  authorLogin = 'ToanLkt',
  authorId = 456,
  committerLogin = null,
  authorName = 'ToanLkt',
  authorEmail = 'toan@example.com',
} = {}) => ({
  sha,
  html_url: `https://github.com/ToanLkt/Plantcare_admin_Web/commit/${sha}`,
  author: authorLogin ? { login: authorLogin, id: authorId } : null,
  committer: committerLogin ? { login: committerLogin } : null,
  commit: {
    message: 'feat: plant care admin',
    author: {
      name: authorName,
      email: authorEmail,
      date: '2026-07-13T00:00:00Z',
    },
    committer: {
      name: authorName,
      email: authorEmail,
      date: '2026-07-13T00:00:00Z',
    },
  },
});

const loginCommit = normalizeCommit({
  commit: githubCommit(),
  authUser: user,
  repository,
  branch: 'master',
  githubAccount,
});
assert.strictEqual(getCommitUserMatchInfo(loginCommit, githubAccount).matchedBy, 'author_login');
assert.strictEqual(filterUserContributionCommits([loginCommit], githubAccount).userCommits.length, 1);

const emailCommit = normalizeCommit({
  commit: githubCommit({ sha: 'def', authorLogin: null, authorEmail: 'toan@example.com' }),
  authUser: user,
  repository,
  branch: 'master',
  githubAccount,
});
assert.strictEqual(getCommitUserMatchInfo(emailCommit, githubAccount).matchedBy, 'verified_email');
assert.strictEqual(filterUserContributionCommits([emailCommit], githubAccount).userCommits.length, 1);

assert.strictEqual(getBranchForCommitFetch(repository, {}), 'master');
assert.strictEqual(getBranchForCommitFetch({ ...repository, defaultBranch: '' }, {}), 'main');
assert.strictEqual(getBranchForCommitFetch(repository, { sha: 'release' }), 'release');

const unmatchedCommit = normalizeCommit({
  commit: githubCommit({ sha: 'ghi', authorLogin: 'OtherUser', authorId: 999, authorName: 'Other User', authorEmail: 'other@example.com' }),
  authUser: user,
  repository,
  branch: 'master',
  githubAccount,
});
assert.strictEqual(getCommitUserMatchInfo(unmatchedCommit, githubAccount).matchedBy, 'unmatched');

const legacyEmptyCache = [];
const stale = !legacyEmptyCache.length;
assert.strictEqual(stale, true);

const scope = filterUserContributionCommits([loginCommit, unmatchedCommit], githubAccount);
assert.strictEqual(typeof scope.totalRepoCommits, 'number');
assert.strictEqual(typeof scope.userCommits.length, 'number');
assert.strictEqual(scope.totalRepoCommits, 2);
assert.strictEqual(scope.userCommits.length, 1);

console.log(JSON.stringify({
  owner: 'ToanLkt',
  repo: 'Plantcare_admin_Web',
  repositoryGithubId: repository.githubRepoId,
  defaultBranchFromDb: repository.defaultBranch,
  branchUsedForCommitFetch: getBranchForCommitFetch(repository, {}),
  commitApiUrlWithoutToken: 'https://api.github.com/repos/ToanLkt/Plantcare_admin_Web/commits?sha=master',
  githubStatus: 'mocked_200',
  fetchedCommitCount: 2,
  normalizedCommitCount: 2,
  currentGithubUsername: githubAccount.username,
  matchedUserCommitCount: scope.userCommits.length,
  unmatchedReasons: [getCommitUserMatchInfo(unmatchedCommit, githubAccount).reason],
}, null, 2));

console.log('PASS: GitHub commit analysis flow fixtures');
