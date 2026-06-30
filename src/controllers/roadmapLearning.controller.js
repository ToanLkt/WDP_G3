const roadmapLearningService = require('../services/roadmapLearning.service');
const { successResponse } = require('../utils/response');

const getRoadmapLearning = async (req, res, next) => {
  try {
    const result = await roadmapLearningService.getRoadmapLearning(req.user, req.params.roadmapId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRoadmapItemLearning = async (req, res, next) => {
  try {
    const result = await roadmapLearningService.getRoadmapItemLearning(
      req.user,
      req.params.roadmapId,
      req.params.itemId,
      req.query
    );
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const generateRoadmapItemLearning = async (req, res, next) => {
  try {
    const result = await roadmapLearningService.generateRoadmapItemLearning(
      req.user,
      req.params.roadmapId,
      req.params.itemId,
      req.body
    );
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRoadmapLearning,
  getRoadmapItemLearning,
  generateRoadmapItemLearning,
};
