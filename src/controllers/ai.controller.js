const aiService = require('../services/ai.service');
const { successResponse } = require('../utils/response');

const analyzeWithAi = async (req, res, next) => {
  try {
    const result = await aiService.analyzeWithAi({ user: req.user, body: req.body });
    return successResponse(res, result.message, result.data);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeWithAi,
};
