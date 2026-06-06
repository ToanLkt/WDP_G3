const notificationService = require('../services/notification.service');
const { successResponse } = require('../utils/response');

const getMe = async (req, res, next) => {
  try {
    const result = await notificationService.getNotifications({ authUser: req.user, query: req.query });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const result = await notificationService.createNotification({ authUser: req.user, body: req.body });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markNotificationAsRead({
      authUser: req.user,
      notificationId: req.params.notificationId,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const result = await notificationService.deleteNotification({
      authUser: req.user,
      notificationId: req.params.notificationId,
    });
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  create,
  getMe,
  markAsRead,
  remove,
};
