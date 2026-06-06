const aiFeedbackService = require('../services/aiFeedback.service');
const { successResponse } = require('../utils/response');

const generateRepositoryFeedback = async (req, res, next) => {
  try {
    const result = await aiFeedbackService.generateRepositoryFeedback(req.user, req.params.repoId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getRepositoryFeedback = async (req, res, next) => {
  try {
    const result = await aiFeedbackService.getRepositoryFeedback(req.user, req.params.repoId);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getMyFeedbacks = async (req, res, next) => {
  try {
    const result = await aiFeedbackService.getMyFeedbacks(req.user);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  generateRepositoryFeedback,
  getRepositoryFeedback,
  getMyFeedbacks,
};
