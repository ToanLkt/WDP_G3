const roadmapService = require('../services/roadmap.service');
const { successResponse } = require('../utils/response');

const generateRoadmap = async (req, res, next) => {
  try {
    const result = await roadmapService.generateRoadmap(req.user, req.body);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getMyRoadmaps = async (req, res, next) => {
  try {
    const result = await roadmapService.getMyRoadmaps(req.user, req.query);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRoadmapDetail = async (req, res, next) => {
  try {
    const result = await roadmapService.getRoadmapById(req.user, req.params.roadmapId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const archiveRoadmap = async (req, res, next) => {
  try {
    const result = await roadmapService.archiveRoadmap(req.user, req.params.roadmapId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  generateRoadmap,
  getMyRoadmaps,
  getRoadmapDetail,
  archiveRoadmap,
};
