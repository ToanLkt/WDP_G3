const roadmapProgressService = require('../services/roadmapProgress.service');
const { successResponse } = require('../utils/response');

const getRoadmapProgress = async (req, res, next) => {
  try {
    const result = await roadmapProgressService.getRoadmapProgress(req.user, req.params.roadmapId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const updateRoadmapItemStatus = async (req, res, next) => {
  try {
    const result = await roadmapProgressService.updateRoadmapItemStatus(req.user, req.params.roadmapId, req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const resetRoadmapProgress = async (req, res, next) => {
  try {
    const result = await roadmapProgressService.resetRoadmapProgress(req.user, req.params.roadmapId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRoadmapProgress,
  updateRoadmapItemStatus,
  resetRoadmapProgress,
};
