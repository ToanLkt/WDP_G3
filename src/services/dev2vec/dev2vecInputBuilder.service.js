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
const SOURCE_LIMITS = {
  maxFilesTotal: 60,
  maxCharsPerFile: 2000,
  maxTotalSourceChars: 40000,
  maxDocsFiles: 15,
  maxMlServiceFiles: 8,
  maxScriptsFiles: 10,
};
const CATEGORY_QUOTAS = {
  rest_api: { min: 0, max: 15 },
  database: { min: 3, max: 8 },
  authentication: { min: 3, max: 8 },
  docker: { min: 2, max: 4 },
  documentation: { min: 3, max: 8 },
  testing: { min: 2, max: 5 },
  ml_service: { min: 0, max: 8 },
  devops_ci: { min: 0, max: 5 },
  config: { min: 0, max: 5 },
  general_source: { min: 0, max: 10 },
};
const CATEGORY_PRIORITY = [
  'rest_api',
  'database',
  'authentication',
  'docker',
  'testing',
  'documentation',
  'devops_ci',
  'ml_service',
  'config',
  'general_source',
];
const KEYWORDS_BY_CATEGORY = {
  rest_api: ['express', 'Router', 'router.get', 'router.post', 'router.put', 'router.patch', 'router.delete', 'req', 'res', 'status', 'json', 'swagger', 'openapi', 'middleware', 'endpoint', 'controller'],
  database: ['mongoose', 'Schema', 'model', 'connect', 'find', 'findOne', 'findById', 'create', 'save', 'update', 'delete', 'populate', 'aggregate', 'index', 'ObjectId'],
  authentication: ['jwt', 'jsonwebtoken', 'bcrypt', 'hash', 'compare', 'login', 'register', 'auth', 'authenticate', 'authorize', 'token', 'Bearer', 'role', 'admin', 'revoked'],
  docker: ['FROM', 'WORKDIR', 'COPY', 'RUN', 'CMD', 'EXPOSE', 'docker compose', 'services', 'ports', 'environment', 'volumes', 'healthcheck', 'Render', 'DEV2VEC'],
  documentation: ['setup', 'install', 'run', 'deploy', 'API', 'Swagger', 'roadmap', 'Dev2Vec', 'Docker'],
  testing: ['jest', 'supertest', 'vitest', 'mocha', 'describe', 'it', 'test', 'expect', 'request(app)', 'npm test', 'integration', 'e2e'],
  devops_ci: ['workflow', 'actions', 'npm test', 'docker build', 'deploy', 'render'],
  ml_service: ['infer', 'train', 'Doc2Vec', 'classifier', 'vector', 'artifact'],
  config: ['config', 'env', 'PORT', 'MONGO', 'JWT', 'DEV2VEC'],
  general_source: [],
};
const EXCLUDED_SOURCE_PATTERNS = [
  /^node_modules\//i,
  /^\.venv\//i,
  /^venv\//i,
  /^tmp\//i,
  /^temp\//i,
  /^\.git\//i,
  /^ml_service\/artifacts\//i,
  /(^|\/)__pycache__\//i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)\.env$/i,
  /\.model$/i,
  /\.joblib$/i,
  /\.pyc$/i,
];

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
const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').trim();

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

const isExcludedSourcePath = (path) => EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizePath(path)));

const getFileContent = (file = {}) => {
  const content = file.sourceContent || file.content || file.contentPreview || file.parsedData?.content || '';
  return String(content || '').replace(/\0/g, '');
};

const getMatchedKeywords = (content, category, secondaryCategories = []) => {
  const text = String(content || '');
  const lower = text.toLowerCase();
  const keywords = [category, ...secondaryCategories].flatMap((item) => KEYWORDS_BY_CATEGORY[item] || []);
  return uniqueByLower(keywords.filter((keyword) => (
    lower.includes(String(keyword).toLowerCase())
  )));
};

const inferSourceCategory = (file = {}) => {
  const path = normalizePath(file.path || file.fileName || file.name);
  const lower = path.toLowerCase();

  if (lower === 'dockerfile' || lower.includes('docker-compose') || lower === '.dockerignore') return 'docker';
  if (lower === 'readme.md' || lower.endsWith('.md') || lower.startsWith('docs/')) return 'documentation';
  if (lower === 'src/config/database.js' || lower.startsWith('src/models/')) {
    if (lower === 'src/models/user.js' || lower === 'src/models/revokedtoken.js') return 'authentication';
    return 'database';
  }
  if (
    lower.startsWith('src/middlewares/auth')
    || lower.startsWith('src/middlewares/admin')
    || lower.startsWith('src/services/auth')
    || lower.startsWith('src/routes/auth')
    || lower.startsWith('src/controllers/auth')
    || lower === 'src/utils/generatetoken.js'
  ) return 'authentication';
  if (/(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\.js$/i.test(path) || lower.startsWith('scripts/test')) return 'testing';
  if (lower.startsWith('.github/workflows/')) return 'devops_ci';
  if (lower.startsWith('ml_service/')) return 'ml_service';
  if (lower.endsWith('.env.example') || lower.endsWith('.env.production.example')) return 'config';
  if (lower === 'src/app.js' || lower.startsWith('src/routes/') || lower.startsWith('src/controllers/') || lower === 'src/config/swagger.js') return 'rest_api';
  if (lower.startsWith('src/services/')) return 'database';
  if (lower.startsWith('src/config/') || lower.startsWith('src/utils/')) return 'config';
  return lower.startsWith('src/') || lower === 'server.js' ? 'general_source' : 'config';
};

const inferSecondaryCategories = (file = {}, category) => {
  const path = normalizePath(file.path || file.fileName || file.name);
  const lower = path.toLowerCase();
  const secondary = [];
  const add = (value) => {
    if (value && value !== category && !secondary.includes(value)) secondary.push(value);
  };

  if (lower.startsWith('src/routes/') || lower.startsWith('src/controllers/') || lower === 'src/app.js' || lower === 'src/config/swagger.js') {
    add('rest_api');
  }
  if (lower === 'src/config/database.js' || lower.startsWith('src/models/') || lower.startsWith('src/services/')) {
    add('database');
  }
  if (
    lower.startsWith('src/middlewares/auth')
    || lower.startsWith('src/middlewares/admin')
    || lower.startsWith('src/services/auth')
    || lower.startsWith('src/routes/auth')
    || lower.startsWith('src/controllers/auth')
    || lower === 'src/models/user.js'
    || lower === 'src/models/revokedtoken.js'
    || lower === 'src/utils/generatetoken.js'
  ) {
    add('authentication');
  }
  if (lower === 'dockerfile' || lower.includes('docker-compose') || lower === '.dockerignore') add('docker');
  if (lower === 'readme.md' || lower.endsWith('.md') || lower.startsWith('docs/')) add('documentation');
  if (/(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\.js$/i.test(path) || lower.startsWith('scripts/test')) add('testing');
  if (lower.startsWith('.github/workflows/')) add('devops_ci');
  if (lower.startsWith('ml_service/')) add('ml_service');

  return secondary;
};

const getCategoryReason = (path, category) => {
  if (category === 'rest_api') return 'Express route/controller/app evidence';
  if (category === 'database') return 'Mongoose model/config/service database evidence';
  if (category === 'authentication') return 'Auth route/service/middleware/token evidence';
  if (category === 'docker') return 'Docker/deploy configuration evidence';
  if (category === 'testing') return 'Test file or test script evidence';
  if (category === 'documentation') return 'README/docs markdown evidence';
  if (category === 'devops_ci') return 'CI/devops workflow evidence';
  if (category === 'ml_service') return 'Dev2Vec ML service evidence';
  if (category === 'config') return 'Configuration evidence';
  return `Source evidence from ${path}`;
};

const hasSourceCategory = (file, category) => (
  file.category === category || toArray(file.secondaryCategories).includes(category)
);

const getPrimaryCategoryCount = (files, category) => (
  files.filter((file) => file.category === category).length
);

const getEffectiveCategoryCount = (files, category) => (
  files.filter((file) => hasSourceCategory(file, category)).length
);

const selectRepoEvidenceFilesByQuota = (candidates, limits) => {
  const selected = [];
  const selectedKeys = new Set();
  let totalChars = 0;

  const sortedCandidates = [...candidates].sort((left, right) => (
    CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category)
    || left.path.localeCompare(right.path)
  ));

  const canSelect = (file, quotaCategory = file.category) => {
    if (selectedKeys.has(file.path.toLowerCase())) return false;
    if (selected.length >= limits.maxFilesTotal) return false;
    if (totalChars >= limits.maxTotalSourceChars) return false;

    const quota = CATEGORY_QUOTAS[quotaCategory] || {};
    if (Number.isFinite(quota.max) && getPrimaryCategoryCount(selected, quotaCategory) >= quota.max) {
      return false;
    }

    return true;
  };

  const addFile = (file) => {
    const remaining = limits.maxTotalSourceChars - totalChars;
    if (remaining <= 0) return false;
    const snippet = file.snippet.slice(0, Math.min(limits.maxCharsPerFile, remaining));
    if (!snippet) return false;

    selectedKeys.add(file.path.toLowerCase());
    totalChars += snippet.length;
    selected.push({
      path: file.path,
      category: file.category,
      secondaryCategories: file.secondaryCategories,
      reason: file.reason,
      matchedKeywords: file.matchedKeywords,
      snippetCharCount: snippet.length,
      snippet,
    });
    return true;
  };

  const selectForCategory = (category, targetCount) => {
    const bucket = sortedCandidates.filter((file) => hasSourceCategory(file, category));
    for (const file of bucket) {
      if (getEffectiveCategoryCount(selected, category) >= targetCount) break;
      if (!canSelect(file, file.category)) continue;
      addFile(file);
    }
  };

  for (const category of ['database', 'authentication', 'docker', 'documentation', 'testing']) {
    const bucketCount = sortedCandidates.filter((file) => hasSourceCategory(file, category)).length;
    if (bucketCount === 0) continue;
    const quota = CATEGORY_QUOTAS[category] || {};
    selectForCategory(category, Math.min(bucketCount, quota.min || 0));
  }

  for (const category of ['rest_api', 'database', 'authentication', 'docker', 'testing', 'documentation', 'devops_ci', 'ml_service', 'config']) {
    const quota = CATEGORY_QUOTAS[category] || {};
    const targetCount = Number.isFinite(quota.max) ? quota.max : limits.maxFilesTotal;
    selectForCategory(category, targetCount);
  }

  if (selected.length < limits.maxFilesTotal && totalChars < limits.maxTotalSourceChars) {
    for (const file of sortedCandidates.filter((candidate) => candidate.category === 'general_source')) {
      if (!canSelect(file, 'general_source')) continue;
      addFile(file);
    }
  }

  selected.sort((left, right) => (
    CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category)
    || left.path.localeCompare(right.path)
  ));

  return {
    selected,
    sourceEvidenceCharCount: totalChars,
  };
};

const collectRepoEvidenceFiles = (fileTreeOrAvailableFiles = [], options = {}) => {
  const limits = { ...SOURCE_LIMITS, ...(options.sourceLimits || {}) };
  const seen = new Set();
  const candidates = [];
  let excludedFileCount = 0;

  for (const rawFile of toArray(fileTreeOrAvailableFiles)) {
    const path = normalizePath(rawFile?.path || rawFile?.fileName || rawFile?.name);
    if (!path || seen.has(path.toLowerCase()) || isExcludedSourcePath(path)) {
      if (path) excludedFileCount += 1;
      continue;
    }

    const content = getFileContent(rawFile);
    if (!content) continue;

    const category = inferSourceCategory({ ...rawFile, path });
    const secondaryCategories = inferSecondaryCategories({ ...rawFile, path }, category);

    seen.add(path.toLowerCase());

    candidates.push({
      path,
      category,
      secondaryCategories,
      reason: getCategoryReason(path, category),
      matchedKeywords: getMatchedKeywords(content, category, secondaryCategories),
      snippet: content.slice(0, limits.maxCharsPerFile),
    });
  }

  const selection = selectRepoEvidenceFilesByQuota(candidates, limits);

  return {
    sourceFiles: selection.selected,
    excludedFileCount: excludedFileCount + Math.max(0, candidates.length - selection.selected.length),
    sourceEvidenceCharCount: selection.sourceEvidenceCharCount,
  };
};

const formatSourceSection = (title, files) => {
  const parts = [`## ${title}`];
  if (!files.length) {
    parts.push('No source evidence found.');
    return parts.join('\n');
  }

  for (const file of files) {
    parts.push(
      `FILE: ${file.path}`,
      `CATEGORY: ${file.category}`,
      `SECONDARY_CATEGORIES: ${(file.secondaryCategories || []).join(', ') || 'none'}`,
      `KEYWORDS: ${file.matchedKeywords.join(', ') || 'none'}`,
      'SNIPPET:',
      file.snippet,
      '',
    );
  }
  return parts.join('\n');
};

const buildRepoDocumentWithSourceEvidence = ({ metadataText, apiTokens, commits, sourceFiles }) => {
  const commitLines = toArray(commits).slice(0, PREVIEW_LIMITS.commits).map((commit) => (
    `- ${commit.sha ? String(commit.sha).slice(0, 12) : 'commit'} ${compactString(commit.message)} ${getCommitChangedFiles(commit).join(', ')}`
  ));
  const hasCategory = (file, category) => file.category === category || toArray(file.secondaryCategories).includes(category);
  const filesByCategory = (category) => sourceFiles.filter((file) => hasCategory(file, category));
  const docFiles = filesByCategory('documentation');
  const mlFiles = filesByCategory('ml_service');

  return [
    '## Repository metadata',
    metadataText || 'No repository metadata.',
    '## API/dependency tokens',
    apiTokens.join(' ') || 'No API/dependency tokens.',
    '## Commit summaries',
    commitLines.join('\n') || 'No commit summaries.',
    formatSourceSection('Source evidence: REST API', filesByCategory('rest_api')),
    formatSourceSection('Source evidence: Database', filesByCategory('database')),
    formatSourceSection('Source evidence: Authentication', filesByCategory('authentication')),
    formatSourceSection('Source evidence: Docker/Deploy', filesByCategory('docker')),
    formatSourceSection('Source evidence: Testing', filesByCategory('testing')),
    formatSourceSection('Documentation evidence', docFiles),
    formatSourceSection('ML service evidence', mlFiles),
    formatSourceSection('Additional source/config evidence', sourceFiles.filter((file) => (
      !['rest_api', 'database', 'authentication', 'docker', 'testing', 'documentation', 'ml_service'].some((category) => hasCategory(file, category))
    ))),
  ].join('\n\n').slice(0, DEFAULT_REPO_TEXT_LIMIT);
};

const hasAnyKeyword = (files, keywords) => {
  const normalized = keywords.map((keyword) => String(keyword).toLowerCase());
  return files.some((file) => {
    const path = file.path.toLowerCase();
    const content = `${file.matchedKeywords.join(' ')} ${file.snippet}`.toLowerCase();
    return normalized.some((keyword) => path.includes(keyword) || content.includes(keyword));
  });
};

const buildFeature = (detected, evidenceFiles) => ({
  detected,
  evidence: evidenceFiles.slice(0, 10).map((file) => ({
    path: file.path,
    category: file.category,
    secondaryCategories: file.secondaryCategories || [],
    matchedKeywords: file.matchedKeywords,
    snippetCharCount: file.snippetCharCount,
  })),
});

const detectRepoFeatureEvidence = ({ apiTokens = [], sourceFiles = [], docsEvidence = {} } = {}) => {
  const tokenText = apiTokens.join(' ').toLowerCase();
  const hasCategory = (file, category) => file.category === category || toArray(file.secondaryCategories).includes(category);
  const byCategory = (category) => sourceFiles.filter((file) => hasCategory(file, category));
  const restFiles = sourceFiles.filter((file) => ['rest_api', 'general_source', 'config'].some((category) => hasCategory(file, category)));
  const databaseFiles = sourceFiles.filter((file) => ['database', 'general_source'].some((category) => hasCategory(file, category)));
  const authFiles = sourceFiles.filter((file) => ['authentication', 'general_source'].some((category) => hasCategory(file, category)));
  const dockerFiles = byCategory('docker');
  const testingFiles = byCategory('testing');
  const docFiles = byCategory('documentation');

  return {
    'REST API': buildFeature(
      /express|router|swagger|openapi/.test(tokenText) || hasAnyKeyword(restFiles, ['express', 'router.', 'controller', 'swagger', 'openapi', 'endpoint']),
      restFiles,
    ),
    Database: buildFeature(
      /mongoose|mongodb/.test(tokenText) || hasAnyKeyword(databaseFiles, ['mongoose', 'schema', 'findone', 'findbyid', 'create', 'populate', 'aggregate']),
      databaseFiles,
    ),
    Authentication: buildFeature(
      /jsonwebtoken|bcrypt|bcryptjs|jwt/.test(tokenText) || hasAnyKeyword(authFiles, ['jwt', 'bcrypt', 'login', 'register', 'bearer', 'adminmiddleware', 'revoked']),
      authFiles,
    ),
    'Docker Basics': buildFeature(
      /docker|dockerfile|docker-compose/.test(tokenText) || dockerFiles.length > 0,
      dockerFiles,
    ),
    'API Testing': buildFeature(
      /jest|supertest|vitest|mocha|chai/.test(tokenText) || hasAnyKeyword(testingFiles, ['jest', 'supertest', 'request(app)', 'describe(', 'expect(', 'npm test']),
      testingFiles,
    ),
    Documentation: buildFeature(
      Boolean(docsEvidence.readmeRootExists || docsEvidence.markdownFileCount > 0 || docsEvidence.hasDocsDirectory || docFiles.length > 0),
      docFiles,
    ),
  };
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
  const availableFiles = packageRecords.flatMap((packageRecord) => toArray(packageRecord?.detectedFiles));
  const sourceEvidence = collectRepoEvidenceFiles(availableFiles, options);
  const metadataDocument = normalizeTextParts(repoParts, {
    maxLength: Math.max(1000, Math.floor((options.repoMaxLength || DEFAULT_REPO_TEXT_LIMIT) / 3)),
  });
  const repoDocument = buildRepoDocumentWithSourceEvidence({
    metadataText: metadataDocument,
    apiTokens,
    commits,
    sourceFiles: sourceEvidence.sourceFiles,
  });

  return {
    repoDocument,
    issueDocument: normalizeTextParts(issueParts, {
      maxLength: options.issueMaxLength || DEFAULT_ISSUE_TEXT_LIMIT,
    }),
    apiTokens,
    commits,
    issues,
    packageRecords,
    sourceFiles: sourceEvidence.sourceFiles,
    excludedSourceFileCount: sourceEvidence.excludedFileCount,
    sourceEvidenceCharCount: sourceEvidence.sourceEvidenceCharCount,
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
    sourceFiles: toArray(payload.sourceFiles).map((file) => ({
      path: file.path,
      category: file.category,
      secondaryCategories: file.secondaryCategories || [],
      matchedKeywords: file.matchedKeywords || [],
      snippetCharCount: file.snippetCharCount || 0,
    })),
    repoFeatures: payload.repoFeatureEvidence || {},
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

const countSourceFilesByCategory = (sourceFiles, category) => (
  toArray(sourceFiles).filter((file) => file.category === category || toArray(file.secondaryCategories).includes(category)).length
);

const buildDev2VecInputFromRepositoryAnalysis = (payload = {}, options = {}) => {
  const evidence = buildRepositoryEvidence(payload, options);
  const topN = clampTopN(payload.topN ?? options.topN);
  const requestId = normalizeRequestId(payload.requestId || options.requestId);
  const evidencePayload = {
    commits: evidence.commits,
    issues: evidence.issues,
    apiTokens: evidence.apiTokens,
    sourceFiles: evidence.sourceFiles,
    docs: detectDocumentationEvidence(collectDocumentationFilePaths({
      packageRecords: evidence.packageRecords,
      commits: evidence.commits,
    })),
  };
  const docsEvidence = evidencePayload.docs;
  const repoFeatureEvidence = detectRepoFeatureEvidence({
    apiTokens: evidence.apiTokens,
    sourceFiles: evidence.sourceFiles,
    docsEvidence,
  });
  evidencePayload.repoFeatureEvidence = repoFeatureEvidence;

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
      sourceFileCount: evidence.sourceFiles.length,
      sourceEvidenceCharCount: evidence.sourceEvidenceCharCount,
      restApiFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'rest_api'),
      databaseFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'database'),
      authFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'authentication'),
      dockerFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'docker'),
      documentationFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'documentation'),
      testingFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'testing'),
      devopsCiFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'devops_ci'),
      mlServiceFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'ml_service'),
      excludedFileCount: evidence.excludedSourceFileCount,
    },
    repoFeatureEvidence,
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
  collectRepoEvidenceFiles,
  buildRepoDocumentWithSourceEvidence,
  detectRepoFeatureEvidence,
  normalizeTextParts,
  normalizeApiTokens,
  buildEvidencePreview,
};
