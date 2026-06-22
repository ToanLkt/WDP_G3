const { ROLE_SKILL_VECTORS } = require('../constants/roleSkillVectors');
const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
} = require('../utils/skillCanonicalizer');

const NEXT_SKILL_PRIORITY = [
  'Testing',
  'API Testing',
  'Unit Testing',
  'Clean Code',
  'API Security',
  'CI/CD',
  'GitHub Actions',
  'TypeScript',
  'Docker',
  'Swagger',
];

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const toArray = (value) => (Array.isArray(value) ? value : []);

const getLevel = (score, level) => {
  if (['missing', 'weak', 'developing', 'strong'].includes(level)) return level;
  if (score === 0) return 'missing';
  if (score < 0.4) return 'weak';
  if (score < 0.7) return 'developing';
  return 'strong';
};

const buildSkillVectorMap = (skillVector) => {
  const map = new Map();
  for (const item of toArray(skillVector)) {
    if (!item || typeof item !== 'object') continue;
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    const score = clamp01(item.score);
    map.set(canonicalSkillName.toLowerCase(), {
      ...item,
      skill: canonicalSkillName,
      canonicalSkillName,
      score,
      level: getLevel(score, item.level),
    });
  }
  return map;
};

const describeRequirement = (requirement, userSkill) => {
  const canonicalSkillName = canonicalizeSkillName(requirement.canonicalSkillName || requirement.skill);
  const userScore = clamp01(userSkill?.score);
  return {
    skill: canonicalSkillName,
    canonicalSkillName,
    category: userSkill?.category || getCanonicalSkillCategory(canonicalSkillName),
    userScore,
    userPercent: Math.round(userScore * 100),
    requiredMinScore: clamp01(requirement.minScore),
    weight: clamp01(requirement.weight),
    importance: requirement.importance,
    level: getLevel(userScore, userSkill?.level),
  };
};

const weightedAverage = (requirements, skillVectorMap) => {
  const items = toArray(requirements);
  const totalWeight = items.reduce((sum, item) => sum + clamp01(item.weight), 0);
  if (!totalWeight) return 0;
  return items.reduce((sum, item) => {
    const key = canonicalizeSkillName(item.canonicalSkillName || item.skill).toLowerCase();
    return sum + clamp01(skillVectorMap.get(key)?.score) * clamp01(item.weight);
  }, 0) / totalWeight;
};

const calculateRoleMatch = (skillVectorMap, roleVector) => {
  const requiredSkills = toArray(roleVector.requiredSkills);
  const optionalSkills = toArray(roleVector.optionalSkills);
  const allRequirements = [...requiredSkills, ...optionalSkills];
  const matchedSkills = [];
  const weakSkills = [];
  const missingRequiredSkills = [];
  const missingOptionalSkills = [];

  for (const requirement of allRequirements) {
    const canonicalSkillName = canonicalizeSkillName(requirement.canonicalSkillName || requirement.skill);
    const userSkill = skillVectorMap.get(canonicalSkillName.toLowerCase());
    const detail = describeRequirement(requirement, userSkill);
    const isOptional = requirement.importance === 'optional';

    if (detail.userScore >= detail.requiredMinScore) matchedSkills.push(detail);
    else if (detail.userScore > 0) weakSkills.push(detail);
    else if (isOptional) {
      const { userScore, userPercent, level, ...missing } = detail;
      missingOptionalSkills.push(missing);
    } else {
      const { userScore, userPercent, level, ...missing } = detail;
      missingRequiredSkills.push(missing);
    }
  }

  const requiredScoreRaw = weightedAverage(requiredSkills, skillVectorMap);
  const optionalScoreRaw = weightedAverage(optionalSkills, skillVectorMap);
  const coverageRaw = allRequirements.length
    ? matchedSkills.length / allRequirements.length
    : 0;
  const finalMatchRaw = requiredScoreRaw * 0.7 + optionalScoreRaw * 0.15 + coverageRaw * 0.15;

  return {
    matchedSkills,
    weakSkills,
    missingRequiredSkills,
    missingOptionalSkills,
    requiredScore: round(requiredScoreRaw * 100),
    optionalScore: round(optionalScoreRaw * 100),
    coverageScore: round(coverageRaw * 100),
    matchScore: round(finalMatchRaw * 100),
  };
};

const getMatchLevel = (score) => {
  if (score >= 85) return ['excellent', 'Rất phù hợp'];
  if (score >= 70) return ['good', 'Phù hợp tốt'];
  if (score >= 50) return ['moderate', 'Tạm phù hợp'];
  if (score >= 30) return ['low', 'Phù hợp thấp'];
  return ['very_low', 'Chưa phù hợp'];
};

const getRecommendedNextSkills = (match, options = {}) => {
  const limit = Math.min(7, Math.max(1, Number(options.limit) || 6));
  const candidates = [
    ...toArray(match.missingRequiredSkills),
    ...toArray(match.weakSkills),
    ...toArray(match.missingOptionalSkills),
  ];
  const names = [...new Set(candidates.map((item) => canonicalizeSkillName(item.canonicalSkillName || item.skill)).filter(Boolean))];
  return names
    .sort((left, right) => {
      const leftIndex = NEXT_SKILL_PRIORITY.indexOf(left);
      const rightIndex = NEXT_SKILL_PRIORITY.indexOf(right);
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    })
    .slice(0, limit);
};

const generateRoleMatchSummary = (match) => {
  const strongest = toArray(match.matchedSkills)
    .sort((a, b) => b.userScore - a.userScore)
    .slice(0, 4)
    .map((item) => item.canonicalSkillName);
  const next = toArray(match.recommendedNextSkills).slice(0, 3);
  const fitText = match.matchScore >= 70 ? 'khá phù hợp' : match.matchScore >= 50 ? 'có mức phù hợp vừa phải' : 'mới có một số tín hiệu phù hợp';
  const strengthText = strongest.length ? ` nhờ ${strongest.join(', ')}` : '';
  const nextText = next.length ? ` Cần bổ sung ${next.join(', ')} để tăng độ sẵn sàng.` : '';
  return `Repo hiện ${fitText} với ${match.roleName}${strengthText}.${nextText}`.trim();
};

const matchSkillVectorToRole = (skillVector, roleVector, options = {}) => {
  const skillVectorMap = skillVector instanceof Map ? skillVector : buildSkillVectorMap(skillVector);
  const calculated = calculateRoleMatch(skillVectorMap, roleVector, options);
  const [matchLevel, matchLevelLabel] = getMatchLevel(calculated.matchScore);
  const match = {
    roleId: roleVector.roleId,
    roleName: roleVector.roleName,
    description: roleVector.description,
    category: roleVector.category,
    ...calculated,
    matchLevel,
    matchLevelLabel,
  };
  match.recommendedNextSkills = getRecommendedNextSkills(match, options);
  match.summary = generateRoleMatchSummary(match);
  return match;
};

const compactRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  description: match.description,
  category: match.category,
  matchScore: match.matchScore,
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  requiredScore: match.requiredScore,
  optionalScore: match.optionalScore,
  coverageScore: match.coverageScore,
  matchedSkillCount: match.matchedSkills.length,
  weakSkillCount: match.weakSkills.length,
  missingRequiredSkillCount: match.missingRequiredSkills.length,
  recommendedNextSkills: match.recommendedNextSkills,
  topMatchedSkills: match.matchedSkills
    .sort((a, b) => b.userScore - a.userScore)
    .slice(0, 5)
    .map((item) => item.canonicalSkillName),
  topMissingSkills: match.recommendedNextSkills.slice(0, 5),
  summary: match.summary,
});

const matchSkillVectorToRoles = (skillVector, options = {}) => {
  const skillVectorMap = buildSkillVectorMap(skillVector);
  const target = String(options.targetRole || '').trim().toLowerCase();
  const catalog = target
    ? ROLE_SKILL_VECTORS.filter(
        (role) => role.roleId.toLowerCase() === target || role.roleName.toLowerCase() === target
      )
    : ROLE_SKILL_VECTORS;
  const limit = Math.min(ROLE_SKILL_VECTORS.length, Math.max(1, Number(options.limit) || 5));

  return catalog
    .map((role) => matchSkillVectorToRole(skillVectorMap, role, options))
    .sort((a, b) => b.matchScore - a.matchScore || a.roleName.localeCompare(b.roleName))
    .slice(0, limit)
    .map((match) => (options.includeDetails === true ? match : compactRoleMatch(match)));
};

module.exports = {
  matchSkillVectorToRoles,
  matchSkillVectorToRole,
  buildSkillVectorMap,
  calculateRoleMatch,
  generateRoleMatchSummary,
  getRecommendedNextSkills,
};
