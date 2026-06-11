const githubService = require('../services/github.service');
const { successResponse } = require('../utils/response');

const startOAuth = async (req, res, next) => {
  try {
    const result = await githubService.startOAuth(req.user, {
      redirectUrl: req.query.redirectUrl,
      origin: req.get('origin'),
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const handleOAuthCallback = async (req, res, next) => {
  try {
    const redirectUrl = await githubService.handleOAuthCallback(req.query);
    return res.redirect(302, redirectUrl);
  } catch (error) {
    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await githubService.getGithubAccount(req.user);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const disconnect = async (req, res, next) => {
  try {
    const result = await githubService.disconnectGithubAccount(req.user);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRepositories = async (req, res, next) => {
  try {
    const result = await githubService.getRepositories(req.user, req.query);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getCachedRepositories = async (req, res, next) => {
  try {
    const query = { ...req.query, sync: 'false' };
    const result = await githubService.getRepositories(req.user, query);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRepositoryById = async (req, res, next) => {
  try {
    const result = await githubService.getRepositoryById(req.user, req.params.repoId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getPackages = async (req, res, next) => {
  try {
    const result = await githubService.fetchRepositoryPackages(req.user, req.params.repoId);
    return successResponse(res, 'Repository package/config files fetched successfully', result, 200);
  } catch (error) {
    return next(error);
  }
};

const getCachedPackages = async (req, res, next) => {
  try {
    const result = await githubService.getRepositoryPackagesCached(req.user, req.params.repoId);
    return successResponse(res, 'Repository package/config files fetched successfully', result, 200);
  } catch (error) {
    return next(error);
  }
};

const getCommits = async (req, res, next) => {
  try {
    const result = await githubService.getRepositoryCommits(req.user, req.params.repoId, req.query);
    return successResponse(res, 'Repository commits fetched successfully', result, 200);
  } catch (error) {
    return next(error);
  }
};

const getCachedCommits = async (req, res, next) => {
  try {
    const result = await githubService.getRepositoryCommitsCached(req.user, req.params.repoId, req.query);
    return successResponse(res, 'Repository commits fetched successfully', result, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  startOAuth,
  handleOAuthCallback,
  getMe,
  disconnect,
  getRepositories,
  getCachedRepositories,
  getRepositoryById,
  getPackages,
  getCachedPackages,
  getCommits,
  getCachedCommits,
};
