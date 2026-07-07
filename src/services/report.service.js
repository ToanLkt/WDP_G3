const mongoose = require('mongoose');

const Report = require('../models/Report');

const REPORT_TYPES = ['user', 'repository', 'analysis', 'ai_feedback', 'roadmap', 'other'];

const createStatusError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createReport = async ({ authUser, body }) => {
  const reporterId = authUser && (authUser.userId || authUser.id);

  if (!reporterId) {
    throw createStatusError('Unauthorized', 401);
  }

  const type = String(body.type || body.targetType || 'other').trim();
  const targetId = body.targetId ? String(body.targetId).trim() : null;
  const reason = String(body.reason || '').trim();
  const description = String(body.description || '').trim();

  if (!REPORT_TYPES.includes(type)) {
    throw createStatusError(`type must be one of ${REPORT_TYPES.join(', ')}`, 400);
  }

  if (targetId && !mongoose.Types.ObjectId.isValid(targetId)) {
    throw createStatusError('targetId is invalid', 400);
  }

  if (!reason) {
    throw createStatusError('reason is required', 400);
  }

  const report = await Report.create({
    userId: reporterId,
    type,
    targetId: targetId || null,
    reason,
    description,
    status: 'PENDING',
  });

  return {
    message: 'Report created successfully',
    data: { report: report.toObject() },
    statusCode: 201,
  };
};

module.exports = {
  createReport,
};
