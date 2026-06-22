const analysisService = require('../services/analysis.service');
const { successResponse } = require('../utils/response');

const analyzeRepository = async (req, res, next) => {
  try {
    const result = await analysisService.analyzeRepository({ user: req.user, params: req.params, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getAnalysisResults = async (req, res, next) => {
  try {
    const result = await analysisService.getAnalysisResults({ user: req.user, params: req.params });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getMyAnalysisResults = async (req, res, next) => {
  try {
    const result = await analysisService.getMyAnalysisResults({ user: req.user });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeRepository,
  getAnalysisResults,
  getMyAnalysisResults,
};
