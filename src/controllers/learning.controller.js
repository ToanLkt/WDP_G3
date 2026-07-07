const learningService = require('../services/learning.service');
const { successResponse } = require('../utils/response');

const getLearningContent = async (req, res, next) => {
  try {
    const result = await learningService.getLearningContent({
      skillName: req.params.skillName,
      targetRole: req.query.targetRole,
      level: req.query.level,
      language: req.query.language,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const generateLearningContent = async (req, res, next) => {
  try {
    const result = await learningService.generateLearningContent(req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getLearningResources = async (req, res, next) => {
  try {
    const result = await learningService.getLearningResources({
      skillName: req.params.skillName,
      targetRole: req.query.targetRole,
      level: req.query.level,
      language: req.query.language,
      type: req.query.type,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const saveLearningResource = async (req, res, next) => {
  try {
    const result = await learningService.saveLearningResource({
      skillName: req.params.skillName,
      body: req.body,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const searchAndCacheYoutubeResources = async (req, res, next) => {
  try {
    const result = await learningService.searchAndCacheYoutubeResources({
      skillName: req.params.skillName,
      targetRole: req.body.targetRole,
      level: req.body.level,
      language: req.body.language,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getLearningContent,
  generateLearningContent,
  getLearningResources,
  saveLearningResource,
  searchAndCacheYoutubeResources,
};
