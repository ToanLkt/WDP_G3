const reportService = require('../services/report.service');
const { successResponse } = require('../utils/response');

const createReport = async (req, res, next) => {
  try {
    const result = await reportService.createReport({ authUser: req.user, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createReport,
};
