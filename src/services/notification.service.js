const mongoose = require('mongoose');

const Notification = require('../models/Notification');

const ensureAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const ensureValidObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }
};

const sanitizeNotification = (notification) => ({
  _id: notification._id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  scheduledAt: notification.scheduledAt,
  createdAt: notification.createdAt,
  readAt: notification.readAt,
  metadata: notification.metadata || {},
});

const getNotifications = async ({ authUser, query }) => {
  ensureAuthUser(authUser);

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {
    user: authUser.userId,
    deletedAt: null,
  };

  if (query.unreadOnly === 'true' || query.unreadOnly === true) {
    filter.isRead = false;
  }

  if (query.type) {
    filter.type = query.type;
  }

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return {
    message: 'Get notifications successfully',
    data: {
      items: items.map(sanitizeNotification),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    },
    statusCode: 200,
  };
};

const createNotification = async ({ authUser, body }) => {
  ensureAuthUser(authUser);

  const notification = await Notification.create({
    user: authUser.userId,
    title: String(body.title).trim(),
    message: String(body.message).trim(),
    type: body.type,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    metadata: body.metadata || {},
  });

  return {
    message: 'Create notification successfully',
    data: sanitizeNotification(notification),
    statusCode: 201,
  };
};

const markNotificationAsRead = async ({ authUser, notificationId }) => {
  ensureAuthUser(authUser);
  ensureValidObjectId(notificationId);

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: authUser.userId, deletedAt: null },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true, runValidators: true }
  );

  if (!notification) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Mark notification as read successfully',
    data: {
      _id: notification._id,
      isRead: notification.isRead,
      readAt: notification.readAt,
    },
    statusCode: 200,
  };
};

const deleteNotification = async ({ authUser, notificationId }) => {
  ensureAuthUser(authUser);
  ensureValidObjectId(notificationId);

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: authUser.userId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Delete notification successfully',
    data: null,
    statusCode: 200,
  };
};

module.exports = {
  createNotification,
  deleteNotification,
  getNotifications,
  markNotificationAsRead,
};
