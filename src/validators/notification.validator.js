const notificationTypes = ['GITHUB_ANALYSIS_REMINDER', 'ROADMAP_TASK_REMINDER', 'REPOSITORY_IMPROVEMENT', 'SYSTEM'];

const isPlainObject = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const validateCreateNotificationBody = (req) => {
  const errors = [];
  const body = req.body || {};
  const allowedFields = ['title', 'message', 'type', 'scheduledAt', 'metadata'];
  const unknownFields = Object.keys(body).filter((key) => !allowedFields.includes(key));

  if (unknownFields.length) {
    errors.push(`Unknown fields are not allowed: ${unknownFields.join(', ')}`);
  }

  if (typeof body.title !== 'string' || !body.title.trim()) {
    errors.push('title is required');
  }

  if (typeof body.message !== 'string' || !body.message.trim()) {
    errors.push('message is required');
  }

  if (body.type === undefined) {
    errors.push('type is required');
  } else if (!notificationTypes.includes(body.type)) {
    errors.push(`type must be one of: ${notificationTypes.join(', ')}`);
  }

  if (body.scheduledAt !== undefined && body.scheduledAt !== null && Number.isNaN(Date.parse(body.scheduledAt))) {
    errors.push('scheduledAt must be a valid datetime');
  }

  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    errors.push('metadata must be an object');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  notificationTypes,
  validateCreateNotificationBody,
};
