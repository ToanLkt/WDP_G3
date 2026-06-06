const dashboardService = require('../services/dashboard.service');
const { successResponse } = require('../utils/response');

const getMe = async (req, res, next) => {
  try {
    const result = await dashboardService.getDashboardOverview(req.user);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMe,
};
