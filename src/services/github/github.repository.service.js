const mongoose = require('mongoose');

const GithubAccount = require('../../models/GithubAccount');
const Repository = require('../../models/Repository');

const { fetchGithubRepositories } = require('./github.api.service');
const { createStatusError, ensureAuthorizedUser, parseBooleanQuery } = require('./github.utils');

const buildRepositoryResponse = (repository) => {
  if (!repository) {
    return null;
  }

  return {
    _id: repository._id,
    githubRepoId: repository.githubRepoId,
    name: repository.name,
    fullName: repository.fullName,
    description: repository.description,
    htmlUrl: repository.htmlUrl,
    private: repository.private,
    fork: repository.fork,
    language: repository.language,
    topics: repository.topics || [],
    defaultBranch: repository.defaultBranch,
    size: repository.size,
    stargazersCount: repository.stargazersCount,
    forksCount: repository.forksCount,
    openIssuesCount: repository.openIssuesCount,
    pushedAt: repository.pushedAt,
    updatedAtGithub: repository.updatedAtGithub,
    lastSyncedAt: repository.lastSyncedAt,
  };
};

const buildRepositoryBulkOps = (repos, userId, githubAccountId) =>
  repos.map((repo) => ({
    updateOne: {
      filter: { userId, githubRepoId: repo.id },
      update: {
        $set: {
          userId,
          githubAccountId,
          githubRepoId: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description || '',
          htmlUrl: repo.html_url,
          private: repo.private,
          fork: repo.fork,
          language: repo.language || '',
          topics: repo.topics || [],
          defaultBranch: repo.default_branch || 'main',
          size: repo.size || 0,
          stargazersCount: repo.stargazers_count || 0,
          forksCount: repo.forks_count || 0,
          openIssuesCount: repo.open_issues_count || 0,
          pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
          updatedAtGithub: repo.updated_at ? new Date(repo.updated_at) : null,
          rawData: repo,
          lastSyncedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

const buildRepositoryLookupQuery = (authUser, repoId) => {
  const normalizedRepoId = String(repoId || '').trim();
  const query = { userId: authUser.userId };
  const repoCriteria = [];

  if (mongoose.Types.ObjectId.isValid(normalizedRepoId)) {
    repoCriteria.push({ _id: normalizedRepoId });
  }

  const numericRepoId = Number(normalizedRepoId);
  if (!Number.isNaN(numericRepoId)) {
    repoCriteria.push({ githubRepoId: numericRepoId });
  }

  if (normalizedRepoId) {
    repoCriteria.push({ fullName: normalizedRepoId });
  }

  if (repoCriteria.length === 0) {
    query._id = normalizedRepoId;
  } else if (repoCriteria.length === 1) {
    Object.assign(query, repoCriteria[0]);
  } else {
    query.$or = repoCriteria;
  }

  return query;
};

const getRepositories = async (authUser, query = {}) => {
  ensureAuthorizedUser(authUser);

  const includeForks = parseBooleanQuery(query.includeForks, false);
  const sync = parseBooleanQuery(query.sync, true);

  const githubAccount = await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken');
  if (!githubAccount) {
    throw createStatusError('GitHub account is not connected', 400);
  }

  let repositories = [];

  if (sync) {
    const githubRepos = await fetchGithubRepositories(githubAccount.accessToken);
    const filteredRepos = includeForks ? githubRepos : githubRepos.filter((repo) => !repo.fork);
    const bulkOps = buildRepositoryBulkOps(filteredRepos, authUser.userId, githubAccount._id);

    if (bulkOps.length > 0) {
      await Repository.bulkWrite(bulkOps, { ordered: false });
    }

    repositories = await Repository.find({ userId: authUser.userId, fork: includeForks ? { $in: [true, false] } : false })
      .sort({ updatedAtGithub: -1, lastSyncedAt: -1 })
      .lean();
  } else {
    const filter = { userId: authUser.userId };
    if (!includeForks) {
      filter.fork = false;
    }

    repositories = await Repository.find(filter).sort({ updatedAtGithub: -1, lastSyncedAt: -1 }).lean();
  }

  const sanitizedRepositories = repositories.map((repository) => buildRepositoryResponse(repository));

  return {
    message: 'Repositories fetched successfully',
    data: {
      total: sanitizedRepositories.length,
      repositories: sanitizedRepositories,
    },
    statusCode: 200,
  };
};

const getRepositoryById = async (authUser, repoId) => {
  ensureAuthorizedUser(authUser);

  const repository = await Repository.findOne(buildRepositoryLookupQuery(authUser, repoId)).lean();
  if (!repository) {
    throw createStatusError('Repository not found', 404);
  }

  return {
    message: 'Repository fetched successfully',
    data: {
      repository: buildRepositoryResponse(repository),
    },
    statusCode: 200,
  };
};

const findRepositoryForUser = async (authUser, repoId) => {
  ensureAuthorizedUser(authUser);

  const repository = await Repository.findOne(buildRepositoryLookupQuery(authUser, repoId)).lean();
  if (!repository) {
    throw createStatusError('Repository not found', 404);
  }

  return repository;
};

module.exports = {
  getRepositories,
  getRepositoryById,
  findRepositoryForUser,
};
