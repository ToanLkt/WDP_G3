const { ROLE_SKILL_VECTORS } = require('../constants/roleSkillVectors');
const { successResponse } = require('../utils/response');

const getCatalog = (req, res) => {
  const roles = ROLE_SKILL_VECTORS.map((role) => ({
    roleId: role.roleId,
    roleName: role.roleName,
    description: role.description,
    category: role.category,
    level: role.level,
    requiredSkillCount: role.requiredSkills.length,
    optionalSkillCount: role.optionalSkills.length,
  }));

  return successResponse(res, 'Role catalog fetched successfully', {
    total: roles.length,
    roles,
  });
};

module.exports = {
  getCatalog,
};
