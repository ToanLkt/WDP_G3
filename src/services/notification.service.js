const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');

const notificationTypeSettingMap = {
  GITHUB_ANALYSIS_REMINDER: 'githubAnalysisReminder',
  ROADMAP_TASK_REMINDER: 'roadmapTaskReminder',
  REPOSITORY_IMPROVEMENT: 'repositoryImprovementReminder',
};

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
  userId: notification.user,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  reportId: notification.reportId || null,
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

const createAutomaticNotification = async ({
  userId,
  title,
  message,
  type = 'SYSTEM',
  scheduledAt = null,
  metadata = {},
  reportId = null,
  respectUserSettings = true,
  throwOnError = false,
}) => {
  try {
    if (!userId || !title || !message) {
      return null;
    }

    if (respectUserSettings) {
      const settings = await UserSettings.findOne({ user: userId }).lean();
      const typeSettingKey = notificationTypeSettingMap[type];

      if (settings?.notificationEnabled === false || (typeSettingKey && settings?.[typeSettingKey] === false)) {
        return null;
      }
    }

    const notification = await Notification.create({
      user: userId,
      title: String(title).trim(),
      message: String(message).trim(),
      type,
      reportId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      metadata,
    });

    return sanitizeNotification(notification);
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    console.error('Create automatic notification failed:', error.message);
    return null;
  }
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
  createAutomaticNotification,
  deleteNotification,
  getNotifications,
  markNotificationAsRead,
};
