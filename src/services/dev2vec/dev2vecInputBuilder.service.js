const crypto = require('crypto');
const { detectDocumentationEvidence } = require('../../utils/documentationEvidence');

const DEFAULT_TOP_N = 3;
const DEFAULT_REPO_TEXT_LIMIT = 50000;
const DEFAULT_ISSUE_TEXT_LIMIT = 30000;
const DEFAULT_TOKEN_LIMIT = 100;
const PREVIEW_LIMITS = {
  commits: 10,
  issues: 10,
  apiTokens: 30,
  changedFilesPerCommit: 10,
};

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && !(value instanceof Date)
);

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const compactString = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const uniqueByLower = (values) => {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const text = compactString(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }

  return output;
};

const clampTopN = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TOP_N;
  return Math.max(1, Math.min(parsed, 3));
};

const normalizeRequestId = (requestId) => {
  const normalized = compactString(requestId);
  return normalized || crypto.randomUUID();
};

const collectTextParts = (value, output, depth = 0) => {
  if (value === undefined || value === null || depth > 4) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = compactString(value);
    if (text) output.push(text);
    return;
  }

  if (value instanceof Date) {
    output.push(value.toISOString());
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextParts(item, output, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  const preferredKeys = [
    'name',
    'repoName',
    'fullName',
    'description',
    'title',
    'message',
    'body',
    'content',
    'contentPreview',
    'path',
    'filename',
    'fileName',
    'language',
    'defaultBranch',
    'careerDirection',
    'projectType',
    'skill',
    'canonicalSkillName',
    'sourceValue',
    'label',
    'state',
  ];

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      collectTextParts(value[key], output, depth + 1);
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    if (typeof nestedValue === 'string' || typeof nestedValue === 'number') {
      collectTextParts(nestedValue, output, depth + 1);
    } else if (Array.isArray(nestedValue) && depth < 3) {
      collectTextParts(nestedValue, output, depth + 1);
    }
  }
};

const normalizeTextParts = (parts, options = {}) => {
  const maxLength = Number(options.maxLength || DEFAULT_REPO_TEXT_LIMIT);
  const collected = [];
  collectTextParts(parts, collected);

  const text = collected
    .map(compactString)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
};

const normalizeToken = (value, maxLength = DEFAULT_TOKEN_LIMIT) => {
  const token = compactString(value)
    .toLowerCase()
    .replace(/^["'`]+|["'`,;]+$/g, '');

  if (!token || token.length > maxLength) return '';
  return /^[a-z0-9@._+/#:-]+$/.test(token) ? token : '';
};

const collectTokenCandidates = (value, output, depth = 0) => {
  if (value === undefined || value === null || depth > 5) return;

  if (typeof value === 'string' || typeof value === 'number') {
    const token = normalizeToken(value);
    if (token) output.push(token);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTokenCandidates(item, output, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  const tokenKeys = [
    'packages',
    'frameworks',
    'detectedFrameworks',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'configs',
    'packageFiles',
    'languages',
  ];

  for (const key of tokenKeys) {
    const nestedValue = value[key];
    if (!nestedValue) continue;

    if (isPlainObject(nestedValue)) {
      for (const dependencyName of Object.keys(nestedValue)) {
        collectTokenCandidates(dependencyName, output, depth + 1);
      }
    } else {
      collectTokenCandidates(nestedValue, output, depth + 1);
    }
  }

  for (const file of toArray(value.detectedFiles)) {
    collectTokenCandidates(file?.name || file?.path || file?.fileName, output, depth + 1);
  }

  const rawData = value.rawData;
  if (rawData && depth < 2) {
    collectTokenCandidates(rawData.packageJson, output, depth + 1);
    collectTokenCandidates(rawData.dependencies, output, depth + 1);
    collectTokenCandidates(rawData.devDependencies, output, depth + 1);
    collectTokenCandidates(rawData.frameworks, output, depth + 1);
    collectTokenCandidates(rawData.configs, output, depth + 1);
  }
};

const normalizeApiTokens = (tokens, options = {}) => {
  const maxTokenLength = Number(options.maxTokenLength || DEFAULT_TOKEN_LIMIT);
  const candidates = [];
  collectTokenCandidates(tokens, candidates);

  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const token = normalizeToken(candidate, maxTokenLength);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }

  return output;
};

const getRepositoryReadmeParts = (repository = {}) => [
  repository.readme,
  repository.readmeContent,
  repository.contentPreview,
  repository.readme?.contentPreview,
  repository.rawData?.readme,
  repository.rawData?.readmeContent,
  repository.rawData?.contentPreview,
];

const objectKeys = (value) => (isPlainObject(value) ? Object.keys(value) : []);

const getChangedFilePath = (file) => {
  if (typeof file === 'string') return file;
  return file?.filename || file?.path || file?.fileName || file?.name || '';
};

const getCommitChangedFiles = (commit) => {
  const fromFiles = toArray(commit?.files).map(getChangedFilePath).filter(Boolean);
  const fromChangedFiles = toArray(commit?.changedFiles)
    .map(getChangedFilePath)
    .filter(Boolean);

  return uniqueByLower([...fromFiles, ...fromChangedFiles]);
};

const getIssueLabels = (issue) => toArray(issue?.labels)
  .map((label) => {
    if (typeof label === 'string') return label;
    return label?.name || label?.label || '';
  })
  .filter(Boolean);

const getIssueComments = (issue) => toArray(issue?.comments)
  .map((comment) => (typeof comment === 'string' ? comment : comment?.body || comment?.message || comment?.content || ''))
  .filter(Boolean);

const extractAnalysisParts = (analysisSource) => {
  const sources = [
    analysisSource,
    analysisSource?.analysis,
    analysisSource?.latestAnalysis,
    analysisSource?.summary,
  ].filter(Boolean);

  const parts = [];
  for (const source of sources) {
    parts.push(
      source.summary?.careerDirection,
      source.summary?.projectType,
      source.careerDirection,
      source.projectType,
      source.skillVector,
      source.topSkills,
      source.skills,
      source.skillSignals,
      source.packages,
      source.frameworks,
      source.languages,
      source.configs,
    );
  }

  return parts;
};

const buildRepositoryEvidence = (payload = {}, options = {}) => {
  const repository = payload.repository || {};
  const packageRecords = toArray(payload.packages || payload.packageRecord).filter(Boolean);
  const commits = toArray(payload.commits).filter(Boolean);
  const issues = toArray(payload.issues).filter(Boolean);
  const analysisSource = payload.analysisSource || {};

  const repoParts = [
    repository.name,
    repository.repoName,
    repository.fullName,
    repository.description,
    repository.topics,
    repository.language,
    repository.languages,
    repository.defaultBranch,
    repository.rawData?.name,
    repository.rawData?.full_name,
    repository.rawData?.description,
    repository.rawData?.topics,
    repository.rawData?.language,
    getRepositoryReadmeParts(repository),
  ];

  for (const packageRecord of packageRecords) {
    repoParts.push(
      typeof packageRecord === 'string' ? packageRecord : '',
      packageRecord.name,
      packageRecord.packageName,
      packageRecord.packages,
      objectKeys(packageRecord.dependencies),
      packageRecord.dependencies,
      objectKeys(packageRecord.devDependencies),
      packageRecord.devDependencies,
      objectKeys(packageRecord.peerDependencies),
      packageRecord.peerDependencies,
      packageRecord.scripts,
      packageRecord.frameworks,
      packageRecord.configs,
      packageRecord.detectedFrameworks,
      packageRecord.packageFiles,
      packageRecord.detectedFiles,
      packageRecord.languages,
      packageRecord.rawData?.packageJson,
      objectKeys(packageRecord.rawData?.dependencies),
      packageRecord.rawData?.dependencies,
      objectKeys(packageRecord.rawData?.devDependencies),
      packageRecord.rawData?.devDependencies,
      packageRecord.rawData?.scripts,
    );
  }

  for (const commit of commits) {
    repoParts.push(
      commit.sha ? String(commit.sha).slice(0, 12) : '',
      commit.message,
      getCommitChangedFiles(commit),
    );
  }

  repoParts.push(extractAnalysisParts(analysisSource));

  const issueParts = [];
  for (const issue of issues) {
    issueParts.push(
      issue.title,
      issue.body,
      getIssueLabels(issue),
      getIssueComments(issue),
    );
  }

  const apiTokens = normalizeApiTokens([
    packageRecords,
    analysisSource?.packages,
    analysisSource?.frameworks,
    analysisSource?.detectedFrameworks,
    analysisSource?.languages,
    analysisSource?.configs,
    analysisSource?.analysis?.packages,
    analysisSource?.analysis?.frameworks,
    analysisSource?.latestAnalysis?.packages,
    analysisSource?.latestAnalysis?.frameworks,
  ], options);

  return {
    repoDocument: normalizeTextParts(repoParts, {
      maxLength: options.repoMaxLength || DEFAULT_REPO_TEXT_LIMIT,
    }),
    issueDocument: normalizeTextParts(issueParts, {
      maxLength: options.issueMaxLength || DEFAULT_ISSUE_TEXT_LIMIT,
    }),
    apiTokens,
    commits,
    issues,
    packageRecords,
  };
};

const buildEvidencePreview = (payload = {}, options = {}) => {
  const limits = {
    ...PREVIEW_LIMITS,
    ...(options.previewLimits || {}),
  };
  const commits = toArray(payload.commits)
    .filter(Boolean)
    .slice(0, limits.commits)
    .map((commit) => ({
      sha: commit.sha || '',
      message: compactString(commit.message).slice(0, 300),
      date: commit.authorDate || commit.committerDate || commit.date || null,
      changedFiles: getCommitChangedFiles(commit).slice(0, limits.changedFilesPerCommit),
    }));

  const issues = toArray(payload.issues)
    .filter(Boolean)
    .slice(0, limits.issues)
    .map((issue) => ({
      number: issue.number || issue.id || null,
      title: compactString(issue.title).slice(0, 300),
      labels: getIssueLabels(issue).slice(0, 20),
      state: issue.state || '',
      url: issue.url || issue.htmlUrl || issue.html_url || '',
    }));

  return {
    commits,
    issues,
    apiTokens: normalizeApiTokens(payload.apiTokens || [], options).slice(0, limits.apiTokens),
    docs: payload.docs || detectDocumentationEvidence([]),
  };
};

const countChangedFiles = (commits) => {
  const files = new Set();
  for (const commit of toArray(commits)) {
    for (const file of getCommitChangedFiles(commit)) {
      files.add(file.toLowerCase());
    }
  }
  return files.size;
};

const countPackageFiles = (packageRecords) => {
  const files = new Set();
  for (const packageRecord of toArray(packageRecords)) {
    for (const file of toArray(packageRecord?.packageFiles)) {
      const text = compactString(file);
      if (text) files.add(text.toLowerCase());
    }
    for (const file of toArray(packageRecord?.detectedFiles)) {
      const text = compactString(getChangedFilePath(file));
      if (text) files.add(text.toLowerCase());
    }
  }
  return files.size;
};

const collectDocumentationFilePaths = ({ packageRecords, commits }) => {
  const paths = [];
  for (const packageRecord of toArray(packageRecords)) {
    paths.push(...toArray(packageRecord?.packageFiles));
    paths.push(...toArray(packageRecord?.detectedFiles));
  }
  for (const commit of toArray(commits)) {
    paths.push(...getCommitChangedFiles(commit));
  }
  return paths;
};

const buildDev2VecInputFromRepositoryAnalysis = (payload = {}, options = {}) => {
  const evidence = buildRepositoryEvidence(payload, options);
  const topN = clampTopN(payload.topN ?? options.topN);
  const requestId = normalizeRequestId(payload.requestId || options.requestId);
  const evidencePayload = {
    commits: evidence.commits,
    issues: evidence.issues,
    apiTokens: evidence.apiTokens,
    docs: detectDocumentationEvidence(collectDocumentationFilePaths({
      packageRecords: evidence.packageRecords,
      commits: evidence.commits,
    })),
  };
  const docsEvidence = evidencePayload.docs;

  return {
    requestId,
    repoDocument: evidence.repoDocument,
    issueDocument: evidence.issueDocument,
    apiTokens: evidence.apiTokens,
    topN,
    sourceStats: {
      repoTextLength: evidence.repoDocument.length,
      issueTextLength: evidence.issueDocument.length,
      apiTokenCount: evidence.apiTokens.length,
      commitCount: evidence.commits.length,
      changedFileCount: countChangedFiles(evidence.commits),
      issueCount: evidence.issues.length,
      packageFileCount: countPackageFiles(evidence.packageRecords),
      markdownFileCount: docsEvidence.markdownFileCount,
      readmeRootExists: docsEvidence.readmeRootExists,
      hasDocsDirectory: docsEvidence.hasDocsDirectory,
      documentationStatus: docsEvidence.documentationStatus,
    },
    evidencePreview: buildEvidencePreview(evidencePayload, options),
  };
};

const buildDev2VecInputFromAnalysisSource = (analysisSource = {}, options = {}) => {
  const source = analysisSource || {};
  const repositories = toArray(source.repositories || source.repository).filter(Boolean);
  const repository = source.repository || repositories[0] || {
    name: source.repoName,
    repoName: source.repoName,
    fullName: source.fullName,
  };

  const packages = [
    source.packages,
    source.packageRecord,
    source.packageRecords,
    source.analysis?.packages,
    source.latestAnalysis?.packages,
  ].flatMap(toArray).filter(Boolean);

  const commits = [
    source.commits,
    source.commitSnapshot?.commits,
    source.analysis?.commits,
    source.latestAnalysis?.commits,
  ].flatMap(toArray).filter(Boolean);

  const issues = [
    source.issues,
    source.issueSnapshot?.issues,
    source.analysis?.issues,
    source.latestAnalysis?.issues,
  ].flatMap(toArray).filter(Boolean);

  return buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages,
    commits,
    issues,
    analysisSource: source,
    topN: source.topN ?? options.topN,
    requestId: source.requestId || options.requestId,
  }, options);
};

module.exports = {
  buildDev2VecInputFromRepositoryAnalysis,
  buildDev2VecInputFromAnalysisSource,
  buildRepositoryEvidence,
  normalizeTextParts,
  normalizeApiTokens,
  buildEvidencePreview,
};
