const {
  DEV2VEC_MODEL_VERSION,
  DEV2VEC_ROLES,
  DEV2VEC_SCORING_METHOD,
} = require('../constants/dev2vecCatalog');
const { successResponse } = require('../utils/response');

const getCatalog = (req, res) => {
  const roles = DEV2VEC_ROLES.map((role) => ({
    roleId: role.roleId,
    roleName: role.roleName,
    description: role.description,
    category: role.category,
    level: role.level,
    requiredSkillCount: role.skills.length,
    optionalSkillCount: 0,
    modelRoleLabel: role.modelRoleLabel,
    modelVersion: DEV2VEC_MODEL_VERSION,
    isSupportedByModel: true,
    scoringMethod: DEV2VEC_SCORING_METHOD,
  }));

  return successResponse(res, 'Role catalog fetched successfully', {
    total: roles.length,
    roles,
  });
};

module.exports = {
  getCatalog,
};
