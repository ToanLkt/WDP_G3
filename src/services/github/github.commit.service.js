const axios = require('axios');

const GithubAccount = require('../../models/GithubAccount');
const RepositoryCommit = require('../../models/RepositoryCommit');

const { getGithubHeaders, handleGithubApiError } = require('./github.api.service');
const { findRepositoryForUser } = require('./github.repository.service');
const { createStatusError, parseBooleanQuery } = require('./github.utils');

const mapCommitResponse = (commit) => ({
  _id: commit._id,
  sha: commit.sha,
  message: commit.message,
  authorName: commit.authorName,
  authorDate: commit.authorDate,
  htmlUrl: commit.htmlUrl,
  additions: commit.additions,
  deletions: commit.deletions,
  changedFiles: commit.changedFiles,
});

const getRepositoryCommits = async (authUser, repoId, query = {}) => {
  const perPage = Math.min(Number(query.perPage) || 100, 100);
  const includeStats = parseBooleanQuery(query.includeStats, false);

  const repository = await findRepositoryForUser(authUser, repoId);
  const githubAccount = await GithubAccount.findOne({ userId: authUser.userId }).select('+accessToken');
  if (!githubAccount) {
    throw createStatusError('GitHub account is not connected', 400);
  }

  const [owner, repo] = (repository.fullName || '').split('/');
  if (!owner || !repo) {
    throw createStatusError('Repository fullName is invalid', 400);
  }

  const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits`;

  let commits = [];

  try {
    const commitsResponse = await axios.get(commitsUrl, {
      params: { per_page: perPage },
      headers: getGithubHeaders(githubAccount.accessToken),
    });

    commits = commitsResponse.data || [];
  } catch (error) {
    handleGithubApiError(error, 'Failed to fetch repository commits');
  }

  const bulkOps = [];

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index];
    const base = {
      userId: authUser.userId,
      repositoryId: repository._id,
      githubRepoId: repository.githubRepoId,
      fullName: repository.fullName,
      sha: commit.sha,
      message: (commit.commit && commit.commit.message) || '',
      authorName: (commit.commit && commit.commit.author && commit.commit.author.name) || '',
      authorEmail: (commit.commit && commit.commit.author && commit.commit.author.email) || '',
      authorDate: commit.commit && commit.commit.author && commit.commit.author.date ? new Date(commit.commit.author.date) : null,
      committerName: (commit.commit && commit.commit.committer && commit.commit.committer.name) || '',
      committerDate:
        commit.commit && commit.commit.committer && commit.commit.committer.date ? new Date(commit.commit.committer.date) : null,
      htmlUrl: commit.html_url || '',
      rawData: commit,
      lastFetchedAt: new Date(),
    };

    if (includeStats && index < 30) {
      try {
        const detailResponse = await axios.get(`${commitsUrl}/${commit.sha}`, {
          headers: getGithubHeaders(githubAccount.accessToken),
        });
        const detail = detailResponse.data;

        base.additions = (detail.stats && detail.stats.additions) || 0;
        base.deletions = (detail.stats && detail.stats.deletions) || 0;
        base.changedFiles = detail.files ? detail.files.length : 0;
        base.files = (detail.files || []).map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
        }));
        base.rawData = detail;
      } catch (error) {
        // Keep current behavior: ignore detail fetch errors for individual commits.
      }
    }

    bulkOps.push({
      updateOne: {
        filter: { userId: authUser.userId, repositoryId: repository._id, sha: base.sha },
        update: { $set: base },
        upsert: true,
      },
    });
  }

  if (bulkOps.length > 0) {
    await RepositoryCommit.bulkWrite(bulkOps, { ordered: false });
  }

  const saved = await RepositoryCommit.find({ userId: authUser.userId, repositoryId: repository._id })
    .sort({ authorDate: -1 })
    .limit(perPage)
    .lean();

  const mapped = saved.map(mapCommitResponse);

  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    total: mapped.length,
    commits: mapped,
  };
};

const getRepositoryCommitsCached = async (authUser, repoId, query = {}) => {
  const limit = Math.min(Number(query.limit) || 100, 100);
  const repository = await findRepositoryForUser(authUser, repoId);
  const saved = await RepositoryCommit.find({ userId: authUser.userId, repositoryId: repository._id })
    .sort({ authorDate: -1 })
    .limit(limit)
    .lean();

  const mapped = saved.map(mapCommitResponse);

  return {
    repository: { _id: repository._id, name: repository.name, fullName: repository.fullName },
    total: mapped.length,
    commits: mapped,
  };
};

module.exports = {
  getRepositoryCommits,
  getRepositoryCommitsCached,
};
