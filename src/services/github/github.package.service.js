const GithubAccount = require('../../models/GithubAccount');
const RepositoryPackage = require('../../models/RepositoryPackage');

const { fetchGithubContent } = require('./github.api.service');
const { parsePackageJson, parseRequirementsTxt } = require('./github.parser.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError } = require('./github.utils');

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
  const packageFiles = [];
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

    const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    rawData[path] = data;
    packageFiles.push(path);

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

    detectedFiles.push(fileEntry);
  }

  const packageFilesArr = Array.from(new Set(packageFiles));
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
