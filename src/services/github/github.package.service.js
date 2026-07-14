const GithubAccount = require('../../models/GithubAccount');
const RepositoryPackage = require('../../models/RepositoryPackage');

const { fetchGithubContent } = require('./github.api.service');
const { parsePackageJson, parseRequirementsTxt } = require('./github.parser.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError } = require('./github.utils');
const {
  EVIDENCE_BUILDER_VERSION,
  SOURCE_USAGE_PARSER_VERSION,
} = require('../dev2vec/dev2vecPipelineMetadata.service');
const { parseSourceUsageEvidence } = require('../dev2vec/sourceUsageParser.service');

const DOC_DIRECTORIES = ['docs', 'documentation', 'documentations'];
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const MAX_SOURCE_FILES = parsePositiveInteger(process.env.DEV2VEC_SOURCE_MAX_FILES, 60);
const MAX_SOURCE_CONTENT_CHARS = parsePositiveInteger(process.env.DEV2VEC_SOURCE_MAX_CHARS_PER_FILE, 4000);
const SOURCE_FETCH_CONCURRENCY = Math.min(
  12,
  parsePositiveInteger(process.env.DEV2VEC_SOURCE_FETCH_CONCURRENCY, 6)
);
const SOURCE_MAX_FILES_PER_CATEGORY = parsePositiveInteger(process.env.DEV2VEC_SOURCE_MAX_FILES_PER_CATEGORY, 6);
const SOURCE_DIRECTORIES = [
  'src/components',
  'src/pages',
  'src/views',
  'src/hooks',
  'src/context',
  'src/store',
  'src/layouts',
  'src/assets',
  'src/styles',
  'src/screens',
  'src/navigation',
  'src/mobile',
  'src/routes',
  'src/controllers',
  'src/services',
  'src/models',
  'src/entities',
  'src/repositories',
  'src/middlewares',
  'src/guards',
  'src/modules',
  'src/api',
  'src/config',
  'src/utils',
  'public',
  'android',
  'ios',
  'lib',
  'widgets',
  'mobile',
  'notebooks',
  'data',
  'datasets',
  'models',
  'experiments',
  'training',
  'inference',
  'preprocessing',
  'features',
  'pipelines',
  'terraform',
  'ansible',
  'helm',
  'charts',
  'k8s',
  'kubernetes',
  'deployment',
  'infrastructure',
  'monitoring',
  'scripts',
  'ml_service',
];
const SOURCE_ROOT_FILES = [
  'server.js',
  'src/app.js',
  'app.json',
  'app.config.js',
  'app.config.ts',
  'eas.json',
  'angular.json',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'compose.yaml',
  'compose.yml',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  'environment.yml',
  '.dockerignore',
  '.env.production.example',
];
const EXCLUDED_PATH_PATTERNS = [
  /^node_modules\//i,
  /^\.venv\//i,
  /^venv\//i,
  /^tmp\//i,
  /^temp\//i,
  /^\.git\//i,
  /^vendor\//i,
  /(^|\/)(dist|build|coverage|out|target)\//i,
  /^ml_service\/artifacts\//i,
  /^__pycache__\//i,
  /\/__pycache__\//i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)\.env$/i,
  /\.model$/i,
  /\.joblib$/i,
  /\.min\.[a-z0-9]+$/i,
  /\.map$/i,
  /\.pyc$/i,
];
const TEXT_FILE_PATTERN = /\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|css|scss|sass|less|json|md|yml|yaml|txt|py|ipynb|toml|env|example|dockerignore|dart|swift|kt|kts|gradle|xml|plist|properties|java|cs|go|php|rb|sh|bash|ps1|tf)$/i;

const runWithConcurrency = async (items, limit, worker) => {
  const output = new Array(items.length);
  let nextIndex = 0;
  let active = 0;
  let maxActive = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (active < limit && nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        Promise.resolve(worker(items[currentIndex], currentIndex))
          .then((value) => {
            output[currentIndex] = value;
          })
          .catch(() => {
            output[currentIndex] = null;
          })
          .finally(() => {
            active -= 1;
            if (nextIndex >= items.length && active === 0) resolve();
            else launch();
          });
      }
      if (items.length === 0) resolve();
    };
    launch();
  });

  output.maxActive = maxActive;
  return output;
};

const decodeContent = (fileData) => (
  fileData?.content ? Buffer.from(fileData.content, 'base64').toString('utf-8') : ''
);

const createDetectedFile = ({ path, content = '', type = 'unknown' }) => ({
  fileName: String(path || '').split('/').pop(),
  path,
  type,
  contentPreview: content.slice(0, 200),
  sourceContent: sanitizeSourceContent(path, content).slice(0, MAX_SOURCE_CONTENT_CHARS),
  parsedData: null,
  detectedPackages: [],
  detectedScripts: [],
  detectedFrameworks: [],
});

const shouldExcludePath = (path) => {
  const normalized = String(path || '').replace(/\\/g, '/');
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isTextEvidencePath = (path) => {
  const normalized = String(path || '').replace(/\\/g, '/');
  if (!normalized || shouldExcludePath(normalized)) return false;
  if (normalized === 'Dockerfile') return true;
  if (normalized.endsWith('.env.example') || normalized.endsWith('.env.production.example')) return true;
  return TEXT_FILE_PATTERN.test(normalized);
};

const sanitizeSourceContent = (path, content = '') => {
  const normalized = String(path || '').toLowerCase();
  const text = String(content || '').replace(/\0/g, '');
  if (!normalized.endsWith('.env.example') && !normalized.endsWith('.env.production.example')) {
    return text;
  }

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;
      const [key] = line.split('=');
      return `${key}=`;
    })
    .join('\n');
};

const addDetectedFile = (detectedFiles, entry) => {
  const key = String(entry?.path || '').toLowerCase();
  if (!key || detectedFiles.some((file) => String(file?.path || '').toLowerCase() === key)) {
    return;
  }
  detectedFiles.push(entry);
};

const getSourceEvidenceCacheKey = (repository = {}) => ({
  defaultBranch: repository.defaultBranch || '',
  latestCommitSha: repository.defaultBranchSha || repository.latestCommitSha || '',
  pushedAt: repository.pushedAt || null,
  updatedAtGithub: repository.updatedAtGithub || null,
  evidenceBuilderVersion: EVIDENCE_BUILDER_VERSION,
  sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
});

const isSourceEvidenceCacheCompatible = (record = {}, repository = {}) => {
  if (!record || !Array.isArray(record.detectedFiles) || !record.detectedFiles.some((file) => file?.sourceContent)) {
    return false;
  }
  const cached = record.rawData?.__sourceEvidenceCache || {};
  const current = getSourceEvidenceCacheKey(repository);
  return cached.evidenceBuilderVersion === current.evidenceBuilderVersion
    && cached.sourceUsageParserVersion === current.sourceUsageParserVersion
    && String(cached.defaultBranch || '') === String(current.defaultBranch || '')
    && String(cached.latestCommitSha || '') === String(current.latestCommitSha || '')
    && String(cached.pushedAt || '') === String(current.pushedAt || '')
    && String(cached.updatedAtGithub || '') === String(current.updatedAtGithub || '');
};

const fetchTextFileEntry = async ({ owner, repo, accessToken, path, type = 'source' }) => {
  if (!isTextEvidencePath(path)) return null;

  const fileData = await fetchGithubContent(owner, repo, path, accessToken);
  if (!fileData || Array.isArray(fileData) || fileData.type !== 'file') return null;

  const content = decodeContent(fileData);
  return createDetectedFile({ path, content, type });
};

const collectDirectoryTextFiles = async ({ owner, repo, accessToken, dirPath, output, depth = 0 }) => {
  if (output.length >= MAX_SOURCE_FILES || depth > 2 || shouldExcludePath(dirPath)) return;

  const listing = await fetchGithubContent(owner, repo, dirPath, accessToken);
  if (!Array.isArray(listing)) return;
  const fileItems = [];

  for (const item of listing) {
    if (output.length >= MAX_SOURCE_FILES) return;
    const itemPath = String(item.path || item.name || '').replace(/\\/g, '/');
    if (!itemPath || shouldExcludePath(itemPath)) continue;

    if (item.type === 'dir') {
      await collectDirectoryTextFiles({ owner, repo, accessToken, dirPath: itemPath, output, depth: depth + 1 });
      continue;
    }

    if (item.type !== 'file' || !isTextEvidencePath(itemPath)) continue;
    fileItems.push(itemPath);
  }

  const entries = await runWithConcurrency(
    fileItems.slice(0, Math.max(0, MAX_SOURCE_FILES - output.length)),
    SOURCE_FETCH_CONCURRENCY,
    (itemPath) => fetchTextFileEntry({
      owner,
      repo,
      accessToken,
      path: itemPath,
      type: itemPath.startsWith('ml_service/') ? 'ml_service' : 'source',
    })
  );

  for (const entry of entries.filter(Boolean)) {
    if (output.length >= MAX_SOURCE_FILES) return;
    output.push(entry);
  }
};

const addControlledSourceEvidenceFiles = async ({ owner, repo, accessToken, detectedFiles, packageFiles, rawData }) => {
  const sourceFiles = [];
  const fetchStats = { maxActive: 0, requested: 0 };

  const rootEntries = await runWithConcurrency(
    SOURCE_ROOT_FILES.slice(0, MAX_SOURCE_FILES),
    SOURCE_FETCH_CONCURRENCY,
    (path) => fetchTextFileEntry({ owner, repo, accessToken, path, type: 'source' })
  );
  fetchStats.maxActive = Math.max(fetchStats.maxActive, rootEntries.maxActive || 0);
  fetchStats.requested += SOURCE_ROOT_FILES.length;
  for (const entry of rootEntries.filter(Boolean)) {
    if (sourceFiles.length >= MAX_SOURCE_FILES) break;
    sourceFiles.push(entry);
  }

  for (const dirPath of SOURCE_DIRECTORIES) {
    if (sourceFiles.length >= MAX_SOURCE_FILES) break;
    await collectDirectoryTextFiles({ owner, repo, accessToken, dirPath, output: sourceFiles });
  }

  rawData.__sourceEvidenceFiles = sourceFiles.map((file) => ({
    path: file.path,
    type: file.type,
    contentLength: String(file.sourceContent || '').length,
  }));
  rawData.__sourceFetchStats = {
    concurrencyLimit: SOURCE_FETCH_CONCURRENCY,
    maxActive: fetchStats.maxActive,
    maxFiles: MAX_SOURCE_FILES,
    maxFilesPerCategory: SOURCE_MAX_FILES_PER_CATEGORY,
  };
  const sourceUsage = parseSourceUsageEvidence(sourceFiles);
  const parsedSourceUsageFiles = Array.isArray(sourceUsage.files) ? sourceUsage.files : [];
  const skippedSourceUsageFiles = Array.isArray(sourceUsage.skipped) ? sourceUsage.skipped : [];
  rawData.__sourceUsageCache = {
    tokens: sourceUsage.tokens,
    parsedFileCount: parsedSourceUsageFiles.length,
    skippedFileCount: skippedSourceUsageFiles.length,
    totalChars: Number(sourceUsage.totalChars || 0),
    sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
    generatedAt: new Date(),
  };

  for (const file of sourceFiles) {
    addDetectedFile(detectedFiles, file);
    packageFiles.add(file.path);
  }
};

const addMarkdownDocumentationFiles = async ({ owner, repo, accessToken, detectedFiles, packageFiles, rawData, configsSet }) => {
  const rootContent = await fetchGithubContent(owner, repo, '', accessToken);
  if (!Array.isArray(rootContent)) {
    return;
  }

  rawData.__rootListing = rootContent.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
  }));

  for (const item of rootContent) {
    const itemPath = String(item.path || item.name || '').trim();
    if (!itemPath) continue;

    if (item.type === 'file' && /\.md$/i.test(item.name || itemPath)) {
      const fileData = await fetchGithubContent(owner, repo, itemPath, accessToken);
      const content = fileData && !Array.isArray(fileData) ? decodeContent(fileData) : '';
      addDetectedFile(detectedFiles, createDetectedFile({ path: itemPath, content, type: 'doc' }));
      packageFiles.add(itemPath);
    }

    if (item.type === 'dir' && DOC_DIRECTORIES.includes(String(item.name || '').toLowerCase())) {
      configsSet.add('Documentation');
      const docsContent = await fetchGithubContent(owner, repo, itemPath, accessToken);
      if (!Array.isArray(docsContent)) continue;

      rawData[`__${itemPath}Listing`] = docsContent.map((docItem) => ({
        name: docItem.name,
        path: docItem.path,
        type: docItem.type,
      }));

      for (const docItem of docsContent) {
        if (docItem.type !== 'file' || !/\.md$/i.test(docItem.name || docItem.path || '')) continue;
        const fileData = await fetchGithubContent(owner, repo, docItem.path, accessToken);
        const content = fileData && !Array.isArray(fileData) ? decodeContent(fileData) : '';
        addDetectedFile(detectedFiles, createDetectedFile({ path: docItem.path, content, type: 'doc' }));
        packageFiles.add(docItem.path);
      }
    }
  }
};

const fetchRepositoryPackages = async (authUser, repoId) => {
  const repository = await findRepositoryForUser(authUser, repoId);
  const existing = await RepositoryPackage.findOne({ userId: authUser.userId, repositoryId: repository._id }).lean();
  if (isSourceEvidenceCacheCompatible(existing, repository)) {
    return {
      repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
      packageAnalysis: {
        ...existing,
        cacheHit: true,
        cacheReason: 'source_evidence_cache_compatible',
      },
    };
  }

  const githubAccount = await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken');
  if (!githubAccount) {
    throw createStatusError('GitHub account is not connected', 400);
  }

  const [owner, repo] = (repository.fullName || '').split('/');
  if (!owner || !repo) {
    throw createStatusError('Repository fullName is invalid', 400);
  }

  const candidatePaths = [
    'package.json',
    'requirements.txt',
    'environment.yml',
    'pyproject.toml',
    'Pipfile',
    'pom.xml',
    'build.gradle',
    'settings.gradle',
    'pubspec.yaml',
    'schema.prisma',
    'app.json',
    'app.config.js',
    'app.config.ts',
    'eas.json',
    'angular.json',
    'vite.config.js',
    'vite.config.ts',
    'next.config.js',
    'nuxt.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yaml',
    'compose.yml',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    '.env.example',
    'README.md',
    '.github/workflows',
  ];

  const detectedFiles = [];
  const packageFiles = new Set();
  const packagesSet = new Set();
  const frameworksSet = new Set();
  const configsSet = new Set();
  const languagesSet = new Set();
  const rawData = {};

  const uniqueCandidatePaths = [...new Map(candidatePaths.map((path) => [path.toLowerCase(), path])).values()];
  const negativeCache = existing?.rawData?.__negativePathCache || {};
  const fingerprintKey = JSON.stringify(getSourceEvidenceCacheKey(repository));
  const cachedMissing = negativeCache.fingerprintKey === fingerprintKey
    ? new Set(negativeCache.paths || [])
    : new Set();
  const candidateResults = await runWithConcurrency(
    uniqueCandidatePaths.filter((path) => !cachedMissing.has(path)),
    SOURCE_FETCH_CONCURRENCY,
    async (path) => ({ path, data: await fetchGithubContent(owner, repo, path, githubAccount.accessToken) })
  );
  const missingPaths = new Set(cachedMissing);

  for (const result of candidateResults.filter(Boolean)) {
    const { path, data } = result;
    if (!data) {
      missingPaths.add(path);
      continue;
    }

    if (Array.isArray(data)) {
      configsSet.add(path === '.github/workflows' ? 'GitHub Actions' : path);
      rawData[path] = data;

      for (const item of data) {
        if (item.type !== 'file') {
          continue;
        }

        const fileData = await fetchGithubContent(owner, repo, item.path, githubAccount.accessToken);
        if (!fileData) {
          continue;
        }

        const content = fileData.content ? Buffer.from(fileData.content, 'base64').toString('utf-8') : '';
        detectedFiles.push({
          fileName: item.name,
          path: item.path,
          type: 'unknown',
          contentPreview: content.slice(0, 200),
          parsedData: null,
          detectedPackages: [],
          detectedScripts: [],
          detectedFrameworks: [],
        });
      }

      continue;
    }

    const content = decodeContent(data);
    rawData[path] = data;
    packageFiles.add(path);

    const fileEntry = {
      fileName: path.split('/').pop(),
      path,
      type: 'unknown',
      contentPreview: content.slice(0, 200),
      sourceContent: sanitizeSourceContent(path, content).slice(0, MAX_SOURCE_CONTENT_CHARS),
      parsedData: null,
      detectedPackages: [],
      detectedScripts: [],
      detectedFrameworks: [],
    };

    if (path === 'package.json') {
      const parsed = parsePackageJson(content);
      fileEntry.type = 'node';
      fileEntry.parsedData = parsed.parsed;
      fileEntry.detectedPackages = parsed.packages;
      fileEntry.detectedScripts = parsed.scripts;
      fileEntry.detectedFrameworks = parsed.frameworks;
      parsed.packages.forEach((pkg) => packagesSet.add(pkg));
      parsed.frameworks.forEach((framework) => frameworksSet.add(framework));
      languagesSet.add('javascript');
    } else if (path === 'requirements.txt') {
      const packages = parseRequirementsTxt(content);
      fileEntry.type = 'python';
      fileEntry.parsedData = { packages };
      fileEntry.detectedPackages = packages;
      packages.forEach((pkg) => packagesSet.add(pkg.split(/[=<>~]/)[0]));
      languagesSet.add('python');

      packages.forEach((pkg) => {
        if (/django/i.test(pkg)) frameworksSet.add('Django');
        if (/flask/i.test(pkg)) frameworksSet.add('Flask');
        if (/fastapi/i.test(pkg)) frameworksSet.add('FastAPI');
      });
    } else if (path === 'pyproject.toml' || path === 'Pipfile') {
      fileEntry.type = 'python';
      fileEntry.parsedData = { content: content.slice(0, 10000) };
      languagesSet.add('python');
    } else if (path === 'pom.xml' || path === 'build.gradle') {
      fileEntry.type = 'java';
      fileEntry.parsedData = { content: content.slice(0, 2000) };
      if (/spring-boot/i.test(content)) frameworksSet.add('Spring Boot');
      languagesSet.add('java');
    } else if (path === 'pubspec.yaml') {
      fileEntry.type = 'dart';
      fileEntry.parsedData = { content: content.slice(0, 2000) };
      if (/flutter/i.test(content)) frameworksSet.add('Flutter');
      languagesSet.add('dart');
    } else if (/^(app\.json|app\.config\.(js|ts)|eas\.json)$/i.test(path)) {
      fileEntry.type = 'mobile_config';
      configsSet.add(path);
      frameworksSet.add('Expo');
    } else if (/^(vite|next|nuxt|tailwind|postcss)\.config\./i.test(path) || path === 'angular.json') {
      fileEntry.type = 'frontend_config';
      configsSet.add(path);
    } else if (path.toLowerCase().includes('docker')) {
      fileEntry.type = 'docker';
      configsSet.add('Docker');
    } else if (/(\.gitlab-ci\.yml|jenkinsfile|compose\.ya?ml)$/i.test(path)) {
      fileEntry.type = 'devops_config';
      configsSet.add(path);
    } else if (/^(schema\.prisma|settings\.gradle|environment\.yml)$/i.test(path)) {
      fileEntry.type = 'config';
      configsSet.add(path);
    } else if (path === '.env.example') {
      fileEntry.type = 'env';
    } else if (path === 'README.md') {
      fileEntry.type = 'doc';
    }

    addDetectedFile(detectedFiles, fileEntry);
  }

  await addMarkdownDocumentationFiles({
    owner,
    repo,
    accessToken: githubAccount.accessToken,
    detectedFiles,
    packageFiles,
    rawData,
    configsSet,
  });

  await addControlledSourceEvidenceFiles({
    owner,
    repo,
    accessToken: githubAccount.accessToken,
    detectedFiles,
    packageFiles,
    rawData,
  });

  const packageFilesArr = Array.from(packageFiles);
  const packagesArr = Array.from(packagesSet);
  const frameworksArr = Array.from(frameworksSet);
  const configsArr = Array.from(configsSet);
  const languagesArr = Array.from(languagesSet);
  const lastFetchedAt = new Date();

  const upsert = {
    userId: authUser.userId,
    repositoryId: repository._id,
    githubRepoId: repository.githubRepoId,
    fullName: repository.fullName,
    detectedFiles,
    packageFiles: packageFilesArr,
    packages: packagesArr,
    frameworks: frameworksArr,
    languages: languagesArr,
    configs: configsArr,
    rawData,
    lastFetchedAt,
  };
  upsert.rawData.__sourceEvidenceCache = {
    ...getSourceEvidenceCacheKey(repository),
    generatedAt: lastFetchedAt,
  };
  upsert.rawData.__negativePathCache = {
    fingerprintKey,
    paths: [...missingPaths],
    generatedAt: lastFetchedAt,
  };

  await RepositoryPackage.findOneAndUpdate(
    { userId: authUser.userId, repositoryId: repository._id },
    { $set: upsert },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    packageAnalysis: {
      packageFiles: packageFilesArr,
      packages: packagesArr,
      frameworks: frameworksArr,
      configs: configsArr,
      detectedFiles,
      lastFetchedAt,
    },
  };
};

const getRepositoryPackagesCached = async (authUser, repoId) => {
  const repository = await findRepositoryForUser(authUser, repoId);
  const record = await RepositoryPackage.findOne({ userId: authUser.userId, repositoryId: repository._id }).lean();

  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    packageAnalysis: record || null,
  };
};

module.exports = {
  fetchRepositoryPackages,
  getRepositoryPackagesCached,
  isSourceEvidenceCacheCompatible,
  runWithConcurrency,
};
