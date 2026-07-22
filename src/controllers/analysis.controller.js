const analysisService = require('../services/analysis.service');
const { successResponse } = require('../utils/response');
const crypto = require('crypto');

const logAnalysisStage = (req, stage, extra = {}) => console.info('[analysis-request]', JSON.stringify({
  requestId: req.analysisRequestId,
  userId: req.user?.userId || req.user?.id || null,
  repoId: req.params?.repoId || null,
  view: req.query?.view || 'summary',
  includeEvidence: req.query?.includeEvidence === 'true',
  forceRegenerate: req.query?.forceRegenerate === 'true',
  stage,
  durationMs: Date.now() - (req.analysisRequestStartedAt || Date.now()),
  ...extra,
}));

const logAnalysisRequestReceived = (req, res, next) => {
  req.analysisRequestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 120);
  req.analysisRequestStartedAt = Date.now();
  logAnalysisStage(req, 'request_received');
  return next();
};

const analyzeRepository = async (req, res, next) => {
  try {
    logAnalysisStage(req, 'auth_passed');
    const result = await analysisService.analyzeRepository({
      user: req.user,
      params: req.params,
      body: req.body,
      query: req.query,
      requestId: req.analysisRequestId,
    });
    const response = successResponse(res, result.message, result.data, result.statusCode);
    logAnalysisStage(req, 'response_sent');
    return response;
  } catch (error) {
    logAnalysisStage(req, 'request_failed', { errorCode: error.errorCode || 'ANALYSIS_REQUEST_FAILED' });
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
  logAnalysisRequestReceived,
  getAnalysisResults,
  getMyAnalysisResults,
  getRepositoryRoleMatches,
  generateRoleMatches,
};
