const { cleanTrainingText } = require('./trainingTextCleaner');
const REPO_DOCUMENT_VERSION = 'dev2vec-repo-document-v3-python-cleaner-parity';
const MAX_REPO_CHARS = 50000;
const MAX_CONTEXT_CHARS = 12000;
const MAX_CONTRIBUTION_CHARS = 38000;
const MAX_SOURCE_FILES = 10;

const clean = (value) => String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
const safeSlice = (value, max) => Array.from(String(value || '')).slice(0, max).join('').trim();
const uniqueSorted = (values) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const filePath = (file) => clean(file?.filename || file?.path || file?.fileName);

const collectAttributedFiles = ({ commits = [], pullRequests = [], contributionSummary = {} } = {}) => {
  const allowedShas = new Set(contributionSummary.selectedCommitShas || []);
  const allowedPrs = new Set((contributionSummary.selectedPullRequests || []).map((item) => Number(item.number)));
  const candidates = [];
  for (const commit of commits.slice(0, 15)) {
    if (!allowedShas.has(commit.sha)) continue;
    const files = (commit.normalizedFiles?.length ? commit.normalizedFiles : commit.files || []).slice(0, 20);
    files.forEach((file) => candidates.push({
      path: filePath(file), sourceType: 'commit', sourceId: commit.sha, touchedByUser: true,
      evidenceContent: String(file.evidenceContent || file.sourceContent || file.content || file.patch || ''),
      additions: Number(file.additions || 0), deletions: Number(file.deletions || 0), evidenceVersion: file.evidenceVersion || '',
    }));
  }
  for (const pull of pullRequests.slice(0, 5)) {
    if (pull.relation !== 'authored' || !allowedPrs.has(Number(pull.number))) continue;
    (pull.files || []).slice(0, 20).forEach((file) => candidates.push({
      path: filePath(file), sourceType: 'pull_request', sourceId: String(pull.number), touchedByUser: true,
      evidenceContent: String(file.evidenceContent || file.content || file.patch || ''),
      additions: Number(file.additions || 0), deletions: Number(file.deletions || 0), evidenceVersion: file.evidenceVersion || '',
    }));
  }
  const byPath = new Map();
  candidates.filter((file) => file.path).forEach((file) => {
    const key = file.path.replace(/\\/g, '/').toLowerCase();
    const current = byPath.get(key);
    if (!current || file.evidenceContent.length > current.evidenceContent.length
      || (file.evidenceContent.length === current.evidenceContent.length && `${file.sourceType}:${file.sourceId}` > `${current.sourceType}:${current.sourceId}`)) {
      byPath.set(key, { ...file, path: file.path.replace(/\\/g, '/') });
    }
  });
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, MAX_SOURCE_FILES);
};

const buildRepoDocument = ({ repository = {}, commits = [], pullRequests = [], contributionSummary = {} } = {}) => {
  if (contributionSummary.accepted !== true) return { repoDocument: '', attributedFiles: [], diagnostics: { repoDocumentVersion: REPO_DOCUMENT_VERSION, truncatedChars: 0 } };
  const selectedShas = new Set(contributionSummary.selectedCommitShas || []);
  const selectedPrs = new Set((contributionSummary.selectedPullRequests || []).map((item) => Number(item.number)));
  const selectedCommits = commits.filter((commit) => selectedShas.has(commit.sha)).slice(0, 15)
    .sort((a, b) => String(a.sha || '').localeCompare(String(b.sha || '')));
  const selectedPulls = pullRequests.filter((pull) => pull.relation === 'authored' && selectedPrs.has(Number(pull.number)))
    .slice(0, 5).sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  const attributedFiles = collectAttributedFiles({ commits: selectedCommits, pullRequests: selectedPulls, contributionSummary });
  const changedPaths = uniqueSorted([
    ...selectedCommits.flatMap((commit) => (commit.files || commit.changedFiles || []).slice(0, 20).map(filePath)),
    ...selectedPulls.flatMap((pull) => (pull.changedPaths || []).slice(0, 20)),
  ]);
  const context = [
    `repository: ${clean(repository.name || repository.repoName)}`,
    `full name: ${clean(repository.fullName)}`,
    `description: ${clean(repository.description || repository.rawData?.description)}`,
    `topics: ${uniqueSorted([...(repository.topics || []), ...(repository.rawData?.topics || [])]).join(' ')}`,
    `primary language: ${clean(repository.language || repository.rawData?.language)}`,
    `languages: ${uniqueSorted(Array.isArray(repository.languages) ? repository.languages : Object.keys(repository.languages || {})).join(' ')}`,
    `readme: ${clean(repository.readmeContent || repository.readme || repository.rawData?.readmeContent || repository.rawData?.readme)}`,
  ].filter((line) => !/:\s*$/.test(line)).join('\n');
  const contribution = [
    'user commits:',
    ...selectedCommits.map((commit) => `- ${clean(commit.message)}`).filter((line) => line !== '-'),
    'user pull requests:',
    ...selectedPulls.flatMap((pull) => [`- title: ${clean(pull.title)}`, `  body: ${clean(pull.body)}`]).filter((line) => !/:\s*$/.test(line)),
    'user changed paths:',
    ...changedPaths.map((path) => `- ${path}`),
  ].join('\n');
  const boundedContext = safeSlice(context, MAX_CONTEXT_CHARS);
  const boundedContribution = safeSlice(contribution, MAX_CONTRIBUTION_CHARS);
  const final = cleanTrainingText(`${boundedContext}\n\n${boundedContribution}`);
  const repoDocument = safeSlice(final, MAX_REPO_CHARS);
  return {
    repoDocument,
    attributedFiles,
    diagnostics: {
      repoDocumentVersion: REPO_DOCUMENT_VERSION,
      repositoryContextChars: boundedContext.length,
      userContributionChars: boundedContribution.length,
      userTouchedSourceChars: 0,
      droppedWholeRepoSourceCount: 0,
      truncatedChars: Math.max(0, context.length - boundedContext.length) + Math.max(0, contribution.length - boundedContribution.length),
    },
  };
};

module.exports = { REPO_DOCUMENT_VERSION, MAX_REPO_CHARS, collectAttributedFiles, buildRepoDocument };
