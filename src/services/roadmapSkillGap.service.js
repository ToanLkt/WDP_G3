const { matchSkillVectorToRoles } = require('./roleMatching.service');
const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
} = require('../utils/skillCanonicalizer');

const normalizeRoadmapSkillName = (skillName) => canonicalizeSkillName(skillName);

const dedupeRoadmapSkills = (skills) => {
  const seen = new Set();
  return (Array.isArray(skills) ? skills : []).filter((item) => {
    const name = normalizeRoadmapSkillName(
      typeof item === 'string' ? item : item?.canonicalSkillName || item?.skillName || item?.skill
    );
    const key = name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const selectRoleMatchForRoadmap = (roleMatches, options = {}) => {
  const matches = Array.isArray(roleMatches) ? roleMatches : [];
  if (!matches.length) return null;
  const roleId = String(options.roleId || '').trim().toLowerCase();
  const targetRole = String(options.targetRole || '').trim().toLowerCase();
  const roleAliases = {
    'devops beginner': 'devops-engineer',
    'ai / machine learning beginner': 'ai-engineer',
  };
  const targetRoleAlias = roleAliases[targetRole];
  return (
    (roleId && matches.find((match) => String(match.roleId).toLowerCase() === roleId)) ||
    (targetRole &&
      matches.find(
        (match) =>
          String(match.roleName).toLowerCase() === targetRole ||
          String(match.roleId).toLowerCase() === targetRole ||
          String(match.roleId).toLowerCase() === targetRoleAlias
      )) ||
    [...matches].sort((a, b) => b.matchScore - a.matchScore)[0]
  );
};

const buildRoadmapSkillPriorities = (roleMatch, analysis = {}) => {
  if (!roleMatch) return [];
  const vectorMap = new Map(
    (Array.isArray(analysis.skillVector) ? analysis.skillVector : []).map((item) => [
      normalizeRoadmapSkillName(item.canonicalSkillName || item.skill).toLowerCase(),
      item,
    ])
  );
  const candidates = [];

  const add = (item, priority, reasonVi, source = 'role_matching') => {
    const canonicalSkillName = normalizeRoadmapSkillName(
      typeof item === 'string' ? item : item?.canonicalSkillName || item?.skill
    );
    if (!canonicalSkillName) return;
    const vectorSkill = vectorMap.get(canonicalSkillName.toLowerCase());
    if (Number(vectorSkill?.score || 0) >= 0.7) return;
    candidates.push({
      skillName: canonicalSkillName,
      canonicalSkillName,
      category: item?.category || vectorSkill?.category || getCanonicalSkillCategory(canonicalSkillName),
      priority,
      reasonVi,
      currentScore: Number(item?.userScore ?? vectorSkill?.score ?? 0),
      currentLevel: item?.level || vectorSkill?.level || 'missing',
      targetMinScore: Number(item?.requiredMinScore || 0),
      importance: item?.importance || (priority === 1 ? 'required' : 'important'),
      source,
    });
  };

  roleMatch.missingRequiredSkills.forEach((item) =>
    add(item, 1, `Kỹ năng bắt buộc còn thiếu cho ${roleMatch.roleName}.`)
  );
  roleMatch.weakSkills.forEach((item) =>
    add(item, 2, `Kỹ năng đã có tín hiệu nhưng chưa đạt mức yêu cầu cho ${roleMatch.roleName}.`)
  );
  roleMatch.recommendedNextSkills.forEach((name) =>
    add(name, 3, `Kỹ năng nên ưu tiên tiếp theo để tăng mức phù hợp với ${roleMatch.roleName}.`)
  );
  (analysis.missingSkills || []).forEach((name) =>
    add(name, 4, 'Kỹ năng còn thiếu trong kết quả phân tích repository.', 'analysis')
  );

  return dedupeRoadmapSkills(candidates)
    .map((item) => ({
      ...item,
      skillName: normalizeRoadmapSkillName(item.skillName),
      canonicalSkillName: normalizeRoadmapSkillName(item.canonicalSkillName),
    }))
    .sort((a, b) => a.priority - b.priority);
};

const buildFallbackGap = (analysis = {}, options = {}) => {
  const missingSkills = dedupeRoadmapSkills(analysis.missingSkills || []).map(normalizeRoadmapSkillName);
  const skillGaps = missingSkills.map((name) => ({
    skillName: name,
    canonicalSkillName: name,
    category: getCanonicalSkillCategory(name),
    priority: 4,
    reasonVi: 'Kỹ năng còn thiếu trong kết quả phân tích repository.',
    currentScore: 0,
    currentLevel: 'missing',
    targetMinScore: 0,
    importance: 'important',
    source: 'analysis',
  }));
  return {
    source: 'fallback_analysis',
    targetRole: analysis.careerDirection || options.targetRole || '',
    selectedRoleMatch: null,
    skillGaps,
    prioritySkills: missingSkills,
    alreadyStrongSkills: [],
    weakSkills: [],
    missingSkills,
    recommendedNextSkills: missingSkills,
  };
};

const buildRoadmapSkillGapFromAnalysis = (analysis, options = {}) => {
  const source = analysis && typeof analysis === 'object' ? analysis : {};
  const skillVector = Array.isArray(source.skillVector) ? source.skillVector : [];
  if (!skillVector.length || options.useRoleMatching === false) return buildFallbackGap(source, options);

  try {
    const roleMatches = matchSkillVectorToRoles(skillVector, {
      limit: 6,
      includeDetails: true,
    });
    const selectedRole = selectRoleMatchForRoadmap(roleMatches, options);
    if (!selectedRole) return buildFallbackGap(source, options);

    const skillGaps = buildRoadmapSkillPriorities(selectedRole, source, options);
    const prioritySkills = skillGaps.map((item) => item.canonicalSkillName);
    return {
      source: 'role_matching',
      targetRole: selectedRole.roleName,
      selectedRoleMatch: {
        roleId: selectedRole.roleId,
        roleName: selectedRole.roleName,
        matchScore: selectedRole.matchScore,
        matchLevel: selectedRole.matchLevel,
        matchLevelLabel: selectedRole.matchLevelLabel,
      },
      skillGaps,
      prioritySkills,
      alreadyStrongSkills: selectedRole.matchedSkills
        .filter((item) => item.userScore >= 0.7)
        .map((item) => item.canonicalSkillName),
      weakSkills: selectedRole.weakSkills.map((item) => item.canonicalSkillName),
      missingSkills: selectedRole.missingRequiredSkills.map((item) => item.canonicalSkillName),
      recommendedNextSkills: selectedRole.recommendedNextSkills,
    };
  } catch (error) {
    return buildFallbackGap(source, options);
  }
};

module.exports = {
  buildRoadmapSkillGapFromAnalysis,
  selectRoleMatchForRoadmap,
  buildRoadmapSkillPriorities,
  normalizeRoadmapSkillName,
  dedupeRoadmapSkills,
};
