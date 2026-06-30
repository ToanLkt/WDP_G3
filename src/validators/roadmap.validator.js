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
  const { repoId, repoIds, sourceMode, roleId, level, durationWeeks, language, useRoleMatching } = req.body || {};

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
  if (repoId !== undefined && typeof repoId !== 'string') errors.push('repoId must be a string');
  if (
    sourceMode !== undefined &&
    !['single_repo', 'all_analyzed_repos', 'selected_repos'].includes(sourceMode)
  ) {
    errors.push('sourceMode must be one of: single_repo, all_analyzed_repos, selected_repos');
  }
  if (repoIds !== undefined && !Array.isArray(repoIds)) {
    errors.push('repoIds must be an array');
  }
  if (Array.isArray(repoIds) && repoIds.some((id) => typeof id !== 'string' || !id.trim())) {
    errors.push('repoIds must contain non-empty strings');
  }
  const effectiveSourceMode = sourceMode || (repoId ? 'single_repo' : 'all_analyzed_repos');
  if (effectiveSourceMode === 'single_repo' && (!repoId || typeof repoId !== 'string' || !repoId.trim())) {
    errors.push('repoId is required when sourceMode is single_repo');
  }
  if (effectiveSourceMode === 'selected_repos' && (!Array.isArray(repoIds) || repoIds.length < 1)) {
    errors.push('repoIds is required when sourceMode is selected_repos');
  }
  if (roleId !== undefined && typeof roleId !== 'string') errors.push('roleId must be a string');
  if (level !== undefined && typeof level !== 'string') errors.push('level must be a string');
  if (language !== undefined && typeof language !== 'string') errors.push('language must be a string');
  if (
    durationWeeks !== undefined &&
    (!Number.isInteger(Number(durationWeeks)) || Number(durationWeeks) < 1)
  ) {
    errors.push('durationWeeks must be a positive integer');
  }
  if (useRoleMatching !== undefined && typeof useRoleMatching !== 'boolean') {
    errors.push('useRoleMatching must be a boolean');
  }

  return buildValidationResult(errors);
};

module.exports = {
  validateGenerateRoadmapBody,
};
