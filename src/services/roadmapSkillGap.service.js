const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
} = require('../utils/skillCanonicalizer');

const DEV2VEC_ROLES = {
  backend: 'Backend Developer',
  frontend: 'Frontend Developer',
  mobile: 'Mobile Developer',
  devops: 'DevOps Engineer',
  data_scientist: 'Data Scientist',
};

const ROLE_ALIASES = {
  backend: 'backend',
  'backend developer': 'backend',
  'backend-developer': 'backend',
  frontend: 'frontend',
  'frontend developer': 'frontend',
  'frontend-developer': 'frontend',
  mobile: 'mobile',
  'mobile developer': 'mobile',
  'mobile-developer': 'mobile',
  devops: 'devops',
  'devops engineer': 'devops',
  'devops-engineer': 'devops',
  'devops beginner': 'devops',
  data_scientist: 'data_scientist',
  'data scientist': 'data_scientist',
  'data-scientist': 'data_scientist',
};

const normalizeRoadmapSkillName = (skillName) => canonicalizeSkillName(skillName);

const uniqueStrings = (values, limit = 20) =>
  [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);

const normalizeDev2VecRoleId = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, ' ');
  return ROLE_ALIASES[key] || ROLE_ALIASES[key.replace(/\s+/g, '-')] || '';
};

const getDev2VecRoleName = (roleId) => DEV2VEC_ROLES[normalizeDev2VecRoleId(roleId) || roleId] || '';

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
  const roleId = normalizeDev2VecRoleId(options.roleId);
  const targetRole = normalizeDev2VecRoleId(options.targetRole);
  return (
    (roleId && matches.find((match) => normalizeDev2VecRoleId(match.roleId || match.roleName) === roleId)) ||
    (targetRole && matches.find((match) => normalizeDev2VecRoleId(match.roleId || match.roleName) === targetRole)) ||
    [...matches].sort((a, b) => b.matchScore - a.matchScore)[0]
  );
};

const getSkillGapDetail = (skillGap = {}, skillName, status) => {
  const key = normalizeRoadmapSkillName(skillName).toLowerCase();
  return (Array.isArray(skillGap.details) ? skillGap.details : []).find((detail) => {
    const detailKey = normalizeRoadmapSkillName(detail?.canonicalSkillName || detail?.skillName || detail?.skill).toLowerCase();
    return detailKey === key && (!status || detail?.status === status);
  });
};

const priorityForGapType = (gapType) => {
  if (gapType === 'missing') return 'high';
  if (gapType === 'weak') return 'medium';
  if (gapType === 'recommended') return 'medium';
  return 'low';
};

const buildDev2VecGapItem = ({ skillName, roleId, gapType, skillGap = {}, reason = '' }) => {
  const canonicalSkillName = normalizeRoadmapSkillName(skillName);
  if (!canonicalSkillName) return null;
  const detail = getSkillGapDetail(skillGap, canonicalSkillName, gapType === 'recommended' ? null : gapType);
  const similarity = Number.isFinite(Number(detail?.similarity)) ? Number(detail.similarity) : null;
  return {
    skillName: canonicalSkillName,
    canonicalSkillName,
    category: roleId || getCanonicalSkillCategory(canonicalSkillName),
    gapType,
    priority: priorityForGapType(gapType),
    similarity,
    source: 'dev2vec',
    currentLevel: gapType === 'matched' ? 'strong' : gapType === 'weak' ? 'weak' : 'missing',
    targetLevel: 'strong',
    currentScore: similarity === null ? 0 : similarity,
    requiredScore: gapType === 'matched' ? similarity || 0.7 : 0.7,
    gap: gapType === 'matched' ? 0 : Math.max(0, 0.7 - (similarity || 0)),
    reason,
  };
};

const buildDev2VecSkillGapContext = ({ roleMatch, skillGap = {}, requestedRoleId, requestedTargetRole } = {}) => {
  if (!roleMatch) {
    return {
      source: 'dev2vec',
      targetRole: getDev2VecRoleName(requestedRoleId) || requestedTargetRole || '',
      selectedRoleMatch: null,
      skillGaps: [],
      prioritySkills: [],
      alreadyStrongSkills: [],
      weakSkills: [],
      missingSkills: [],
      recommendedNextSkills: [],
    };
  }

  const roleId = normalizeDev2VecRoleId(roleMatch.roleId) || roleMatch.roleId;
  const seen = new Set();
  const addItems = (names, gapType, reason) => (Array.isArray(names) ? names : [])
    .map((name) => buildDev2VecGapItem({ skillName: name, roleId, gapType, skillGap, reason }))
    .filter((item) => {
      const key = item?.canonicalSkillName?.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const missing = addItems(
    roleMatch.missingSkillNames || skillGap.missingSkillNames,
    'missing',
    `Kỹ năng còn thiếu theo Dev2Vec cho ${roleMatch.roleName}.`
  );
  const weak = addItems(
    roleMatch.weakSkillNames || skillGap.weakSkillNames,
    'weak',
    `Kỹ năng đã có tín hiệu nhưng còn yếu theo Dev2Vec cho ${roleMatch.roleName}.`
  );
  const recommended = addItems(
    roleMatch.recommendedNextSkills || skillGap.recommendedNextSkills,
    'recommended',
    `Kỹ năng Dev2Vec đề xuất học tiếp cho ${roleMatch.roleName}.`
  );
  const matched = addItems(
    roleMatch.matchedSkillNames || skillGap.matchedSkillNames,
    'matched',
    `Kỹ năng đã có tín hiệu phù hợp theo Dev2Vec cho ${roleMatch.roleName}.`
  );

  const skillGaps = [...missing, ...weak, ...recommended, ...matched];
  const prioritySkills = skillGaps
    .filter((item) => item.gapType !== 'matched')
    .map((item) => item.canonicalSkillName);

  return {
    source: 'dev2vec',
    targetRole: roleMatch.roleName,
    selectedRoleMatch: roleMatch,
    skillGaps,
    prioritySkills,
    alreadyStrongSkills: matched.map((item) => item.canonicalSkillName),
    weakSkills: weak.map((item) => item.canonicalSkillName),
    missingSkills: missing.map((item) => item.canonicalSkillName),
    recommendedNextSkills: uniqueStrings([
      ...recommended.map((item) => item.canonicalSkillName),
      ...(roleMatch.recommendedNextSkills || []),
    ].map(normalizeRoadmapSkillName), 12),
    requestedRoleId: normalizeDev2VecRoleId(requestedRoleId),
    resolvedRoleId: roleId,
  };
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
      reason: reasonVi,
      reasonVi,
      currentScore: Number(item?.userScore ?? vectorSkill?.score ?? 0),
      currentLevel: item?.level || vectorSkill?.level || 'missing',
      requiredScore: Number(item?.requiredMinScore || 0),
      targetLevel: 'strong',
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
      gap: Math.max(0, Number(item.requiredScore || 0) - Number(item.currentScore || 0)),
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
    reason: 'Kỹ năng còn thiếu trong kết quả phân tích repository.',
    reasonVi: 'Kỹ năng còn thiếu trong kết quả phân tích repository.',
    currentScore: 0,
    currentLevel: 'missing',
    requiredScore: 0.4,
    targetLevel: 'strong',
    gap: 0.4,
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
  if (options.useRoleMatching === false) {
    return buildDev2VecSkillGapContext({
      roleMatch: null,
      requestedRoleId: options.roleId,
      requestedTargetRole: options.targetRole || source.careerDirection,
    });
  }

  const roleMatches = Array.isArray(options.roleMatches) ? options.roleMatches : [];
  const selectedRole = options.selectedRoleMatch || selectRoleMatchForRoadmap(roleMatches, options);
  if (!selectedRole) {
    return buildDev2VecSkillGapContext({
      roleMatch: null,
      requestedRoleId: options.roleId,
      requestedTargetRole: options.targetRole || source.careerDirection,
    });
  }

  const roleId = normalizeDev2VecRoleId(selectedRole.roleId) || selectedRole.roleId;
  const skillGap = options.dev2vecOutput?.skillGaps?.[roleId] || options.skillGaps?.[roleId] || {};
  return buildDev2VecSkillGapContext({
    roleMatch: selectedRole,
    skillGap,
    requestedRoleId: options.roleId,
    requestedTargetRole: options.targetRole,
  });
};

module.exports = {
  buildRoadmapSkillGapFromAnalysis,
  selectRoleMatchForRoadmap,
  buildRoadmapSkillPriorities,
  buildDev2VecSkillGapContext,
  normalizeDev2VecRoleId,
  getDev2VecRoleName,
  normalizeRoadmapSkillName,
  dedupeRoadmapSkills,
};
