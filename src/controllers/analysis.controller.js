const analysisService = require('../services/analysis.service');
const { successResponse } = require('../utils/response');

const analyzeRepository = async (req, res, next) => {
  try {
    const result = await analysisService.analyzeRepository({
      user: req.user,
      params: req.params,
      body: req.body,
      query: req.query,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getAnalysisResults = async (req, res, next) => {
  try {
    const result = await analysisService.getAnalysisResults({
      user: req.user,
      params: req.params,
      query: req.query,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getMyAnalysisResults = async (req, res, next) => {
  try {
    const result = await analysisService.getMyAnalysisResults({
      user: req.user,
      query: req.query,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRepositoryRoleMatches = async (req, res, next) => {
  try {
    const result = await analysisService.getRepositoryRoleMatches({
      user: req.user,
      params: req.params,
      query: req.query,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const generateRoleMatches = async (req, res, next) => {
  try {
    const result = await analysisService.generateRoleMatches({
      user: req.user,
      body: req.body,
      query: req.query,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeRepository,
  getAnalysisResults,
  getMyAnalysisResults,
  getRepositoryRoleMatches,
  generateRoleMatches,
};
