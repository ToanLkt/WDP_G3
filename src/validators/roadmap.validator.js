const { TARGET_ROLES } = require('../utils/roadmap.constant');

const buildValidationResult = (errors, message = 'Validation failed') => ({
  isValid: errors.length === 0,
  message: errors.length > 0 ? message : undefined,
  errors,
});

const validateGenerateRoadmapBody = (req) => {
  const errors = [];
  const targetRole = req.body && req.body.targetRole;
  const forceRegenerate = req.body && req.body.forceRegenerate;

  if (!targetRole || typeof targetRole !== 'string' || !targetRole.trim()) {
    errors.push('targetRole is required');
    return buildValidationResult(errors, 'Invalid target role');
  }

  if (!TARGET_ROLES.includes(targetRole.trim())) {
    errors.push(`targetRole must be one of: ${TARGET_ROLES.join(', ')}`);
    return buildValidationResult(errors, 'Invalid target role');
  }

  if (forceRegenerate !== undefined && typeof forceRegenerate !== 'boolean') {
    errors.push('forceRegenerate must be a boolean');
  }

  return buildValidationResult(errors);
};

module.exports = {
  validateGenerateRoadmapBody,
};
