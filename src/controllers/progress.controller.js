const progressService = require('../services/progress.service');
const { successResponse } = require('../utils/response');

const getMyProgress = async (req, res, next) => {
  try {
    const result = await progressService.getMyProgress(req.user);
    return successResponse(res, result.message, result.data);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyProgress,
};
