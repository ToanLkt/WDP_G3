const GithubAccount = require('../../models/GithubAccount');
const RepositoryPackage = require('../../models/RepositoryPackage');

const { fetchGithubContent } = require('./github.api.service');
const { parsePackageJson, parseRequirementsTxt } = require('./github.parser.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError } = require('./github.utils');

const DOC_DIRECTORIES = ['docs', 'documentation', 'documentations'];
const MAX_SOURCE_FILES = 60;
const MAX_SOURCE_CONTENT_CHARS = 4000;
const SOURCE_DIRECTORIES = [
  'src/routes',
  'src/controllers',
  'src/services',
  'src/models',
  'src/middlewares',
  'src/config',
  'src/utils',
  'scripts',
  'ml_service',
];
const SOURCE_ROOT_FILES = [
  'server.js',
  'src/app.js',
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
  /^ml_service\/artifacts\//i,
  /^__pycache__\//i,
  /\/__pycache__\//i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)\.env$/i,
  /\.model$/i,
  /\.joblib$/i,
  /\.pyc$/i,
];
const TEXT_FILE_PATTERN = /\.(js|mjs|cjs|json|md|yml|yaml|txt|py|toml|env|example|dockerignore)$/i;

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

  for (const item of listing) {
    if (output.length >= MAX_SOURCE_FILES) return;
    const itemPath = String(item.path || item.name || '').replace(/\\/g, '/');
    if (!itemPath || shouldExcludePath(itemPath)) continue;

    if (item.type === 'dir') {
      await collectDirectoryTextFiles({ owner, repo, accessToken, dirPath: itemPath, output, depth: depth + 1 });
      continue;
    }

    if (item.type !== 'file' || !isTextEvidencePath(itemPath)) continue;
    const entry = await fetchTextFileEntry({ owner, repo, accessToken, path: itemPath, type: itemPath.startsWith('ml_service/') ? 'ml_service' : 'source' });
    if (entry) output.push(entry);
  }
};

const addControlledSourceEvidenceFiles = async ({ owner, repo, accessToken, detectedFiles, packageFiles, rawData }) => {
  const sourceFiles = [];

  for (const path of SOURCE_ROOT_FILES) {
    if (sourceFiles.length >= MAX_SOURCE_FILES) break;
    const entry = await fetchTextFileEntry({ owner, repo, accessToken, path, type: 'source' });
    if (entry) sourceFiles.push(entry);
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
    'pyproject.toml',
    'Pipfile',
    'pom.xml',
    'build.gradle',
    'pubspec.yaml',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
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

  for (const path of candidatePaths) {
    const data = await fetchGithubContent(owner, repo, path, githubAccount.accessToken);
    if (!data) {
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
    } else if (path.toLowerCase().includes('docker')) {
      fileEntry.type = 'docker';
      configsSet.add('Docker');
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
};
