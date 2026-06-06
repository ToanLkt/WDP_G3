const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const buildValidationResult = (errors, message = 'Validation failed') => ({
  isValid: errors.length === 0,
  message: errors.length > 0 ? message : undefined,
  errors,
});

const validateCreateChatSessionBody = (req) => {
  const errors = [];
  const title = req.body && req.body.title;

  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      errors.push('title must be a string');
    } else if (normalizeOptionalString(title).length > 100) {
      errors.push('title must not exceed 100 characters');
    }
  }

  return buildValidationResult(errors);
};

const validateSendChatMessageBody = (req) => {
  const errors = [];
  const message = req.body && req.body.message;

  if (message === undefined || message === null || !String(message).trim()) {
    errors.push('message is required');
    return buildValidationResult(errors, 'Message is required');
  }

  if (typeof message !== 'string') {
    errors.push('message must be a string');
  } else {
    const normalizedMessage = normalizeOptionalString(message);

    if (normalizedMessage.length < 1) {
      errors.push('message is required');
      return buildValidationResult(errors, 'Message is required');
    }

    if (normalizedMessage.length > 2000) {
      errors.push('message must not exceed 2000 characters');
    }
  }

  return buildValidationResult(errors);
};

module.exports = {
  validateCreateChatSessionBody,
  validateSendChatMessageBody,
};
