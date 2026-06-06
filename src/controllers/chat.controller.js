const chatService = require('../services/chat.service');
const { successResponse } = require('../utils/response');

const createChatSession = async (req, res, next) => {
  try {
    const result = await chatService.createSession({ user: req.user, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getChatSessions = async (req, res, next) => {
  try {
    const result = await chatService.getSessions({ user: req.user });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const getChatSessionDetail = async (req, res, next) => {
  try {
    const result = await chatService.getSessionDetail({ user: req.user, params: req.params });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const sendChatMessage = async (req, res, next) => {
  try {
    const result = await chatService.sendMessage({ user: req.user, params: req.params, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createChatSession,
  getChatSessions,
  getChatSessionDetail,
  sendChatMessage,
};
