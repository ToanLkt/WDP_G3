const GithubAccount = require('../../models/GithubAccount');
const RepositoryPackage = require('../../models/RepositoryPackage');

const { fetchGithubContent } = require('./github.api.service');
const { parsePackageJson, parseRequirementsTxt } = require('./github.parser.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError } = require('./github.utils');

const DOC_DIRECTORIES = ['docs', 'documentation', 'documentations'];

const decodeContent = (fileData) => (
  fileData?.content ? Buffer.from(fileData.content, 'base64').toString('utf-8') : ''
);

const createDetectedFile = ({ path, content = '', type = 'unknown' }) => ({
  fileName: String(path || '').split('/').pop(),
  path,
  type,
  contentPreview: content.slice(0, 200),
  parsedData: null,
  detectedPackages: [],
  detectedScripts: [],
  detectedFrameworks: [],
});

const addDetectedFile = (detectedFiles, entry) => {
  const key = String(entry?.path || '').toLowerCase();
  if (!key || detectedFiles.some((file) => String(file?.path || '').toLowerCase() === key)) {
    return;
  }
  detectedFiles.push(entry);
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
      addDetectedFile(detectedFiles, createDetectedFile({ path: itemPath, type: 'doc' }));
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
        addDetectedFile(detectedFiles, createDetectedFile({ path: docItem.path, type: 'doc' }));
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
