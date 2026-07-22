const { getCommitUserMatchInfo } = require('../analysis/analysis.engine');

const CONTRIBUTION_THRESHOLD = 5;
const MAX_EVIDENCE_COMMITS = 15;
const MAX_CHANGED_PATHS_PER_CONTRIBUTION = 20;

const ATTRIBUTION_METHODS = {
  author_login: 'github_login',
  committer_login: 'github_login',
  author_github_id: 'github_user_id',
  verified_email: 'verified_email',
  fallback_name: 'username_name_fallback',
};

const finiteNonNegative = (value) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

const changedPaths = (item = {}) => {
  const files = Array.isArray(item.files) ? item.files : [];
  const paths = files
    .slice(0, MAX_CHANGED_PATHS_PER_CONTRIBUTION)
    .map((file) => (typeof file === 'string' ? file : file?.filename || file?.path || file?.fileName || ''))
    .filter(Boolean);
  return [...new Set(paths.map((path) => String(path).replace(/\\/g, '/')))];
};

const verifiedStats = (item = {}) => {
  const additions = finiteNonNegative(item.additions);
  const deletions = finiteNonNegative(item.deletions);
  if (additions === null || deletions === null) return null;
  return { additions, deletions, changedLines: additions + deletions };
};

const selectCommitEvidence = (commits = [], githubAccount = {}) => {
  const seen = new Set();
  return (Array.isArray(commits) ? commits : [])
    .filter((commit) => getCommitUserMatchInfo(commit, githubAccount).matched)
    .filter((commit) => {
      const sha = String(commit?.sha || '');
      if (!sha || seen.has(sha)) return false;
      seen.add(sha);
      return true;
    })
    .slice(0, MAX_EVIDENCE_COMMITS)
    .map((commit) => ({
      ...commit,
      files: (Array.isArray(commit.files) ? commit.files : []).slice(0, MAX_CHANGED_PATHS_PER_CONTRIBUTION),
      changedFiles: Array.isArray(commit.changedFiles)
        ? commit.changedFiles.slice(0, MAX_CHANGED_PATHS_PER_CONTRIBUTION)
        : commit.changedFiles,
    }));
};

const buildContributionSummary = ({ commits = [], pullRequests = [], githubAccount = {} } = {}) => {
  const identityAvailable = Boolean(githubAccount?.username || githubAccount?.githubId || githubAccount?.githubUserId);
  const acceptedCommits = [];
  const methods = new Set();

  for (const commit of selectCommitEvidence(commits, githubAccount)) {
    const match = getCommitUserMatchInfo(commit, githubAccount);
    acceptedCommits.push(commit);
    if (ATTRIBUTION_METHODS[match.matchedBy]) methods.add(ATTRIBUTION_METHODS[match.matchedBy]);
  }

  const acceptedPullRequests = (Array.isArray(pullRequests) ? pullRequests : [])
    .filter((pull) => pull?.relation === 'authored' && pull?.identityVerified !== false
      && String(pull?.authorLogin || '').trim().toLowerCase() === String(githubAccount?.username || '').trim().toLowerCase())
    .slice(0, 5);
  if (acceptedPullRequests.length) methods.add('github_login');

  let additions = 0;
  let deletions = 0;
  let evidenceWithStatsCount = 0;
  const paths = new Set();
  for (const item of [...acceptedCommits, ...acceptedPullRequests]) {
    const stats = verifiedStats(item);
    if (stats) {
      additions += stats.additions;
      deletions += stats.deletions;
      evidenceWithStatsCount += 1;
    }
    changedPaths(item).forEach((path) => paths.add(path));
    (Array.isArray(item.changedPaths) ? item.changedPaths : [])
      .slice(0, MAX_CHANGED_PATHS_PER_CONTRIBUTION)
      .filter(Boolean)
      .forEach((path) => paths.add(String(path).replace(/\\/g, '/')));
  }

  const verifiedChangedLines = additions + deletions;
  const verified = identityAvailable && evidenceWithStatsCount > 0;
  const accepted = verified && verifiedChangedLines >= CONTRIBUTION_THRESHOLD;
  return {
    verified,
    accepted,
    status: accepted ? 'available' : (verified ? 'insufficient_contribution' : 'contribution_unverified'),
    threshold: CONTRIBUTION_THRESHOLD,
    verifiedChangedLines,
    additions,
    deletions,
    userCommitCount: acceptedCommits.length,
    userPullRequestCount: acceptedPullRequests.length,
    changedPathCount: paths.size,
    changedPaths: [...paths].sort(),
    attributionMethods: [...methods].sort(),
    missingStatsCount: acceptedCommits.length + acceptedPullRequests.length - evidenceWithStatsCount,
    selectedCommitShas: acceptedCommits.map((commit) => commit.sha).filter(Boolean),
    selectedPullRequests: acceptedPullRequests.map((pull) => ({ number: pull.number, updatedAt: pull.updatedAt || null })),
  };
};

module.exports = {
  CONTRIBUTION_THRESHOLD,
  MAX_EVIDENCE_COMMITS,
  MAX_CHANGED_PATHS_PER_CONTRIBUTION,
  buildContributionSummary,
  selectCommitEvidence,
  verifiedStats,
};
