const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');

const STATUS_PRIORITY = {
  new: 0,
  improved: 0,
  regressed: 1,
  still_missing: 2,
  unchanged: 3,
};

const toVector = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);
const clampScore = (value) => {
  const score = Number(value) || 0;
  return Math.min(1, Math.max(0, score > 1 ? score / 100 : score));
};
const round = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
const stringArray = (value) =>
  Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];

const getLevel = (score, level) => {
  if (['missing', 'weak', 'developing', 'strong'].includes(level)) return level;
  if (score === 0) return 'missing';
  if (score < 0.4) return 'weak';
  if (score < 0.7) return 'developing';
  return 'strong';
};

const getSkillVectorMap = (skillVector) => {
  const map = new Map();
  for (const item of toVector(skillVector)) {
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    map.set(canonicalSkillName.toLowerCase(), {
      ...item,
      skill: canonicalSkillName,
      canonicalSkillName,
    });
  }
  return map;
};

const calculateSkillChange = (fromSkill, toSkill) => {
  const source = toSkill || fromSkill || {};
  const canonicalSkillName = canonicalizeSkillName(source.canonicalSkillName || source.skill);
  const beforeScore = clampScore(fromSkill?.score);
  const afterScore = clampScore(toSkill?.score);
  const change = round(afterScore - beforeScore);
  const beforeLevel = getLevel(beforeScore, fromSkill?.level);
  const afterLevel = getLevel(afterScore, toSkill?.level);

  let status = 'unchanged';
  if (beforeScore === 0 && afterScore > 0) status = 'new';
  else if (change >= 0.1) status = 'improved';
  else if (change <= -0.1) status = 'regressed';
  else if (beforeScore === 0 && afterScore === 0) status = 'still_missing';

  return {
    skill: canonicalSkillName,
    canonicalSkillName,
    category: source.category || getCanonicalSkillCategory(canonicalSkillName),
    beforeScore,
    afterScore,
    change,
    beforePercent: Math.round(beforeScore * 100),
    afterPercent: Math.round(afterScore * 100),
    changePercent: Math.round(change * 100),
    beforeLevel,
    afterLevel,
    status,
    beforeEvidence: stringArray(fromSkill?.evidence),
    afterEvidence: stringArray(toSkill?.evidence),
    beforeSources: stringArray(fromSkill?.sources),
    afterSources: stringArray(toSkill?.sources),
  };
};

const summarizeSkillVectorChanges = (skillChanges) => {
  const changes = Array.isArray(skillChanges) ? skillChanges : [];
  const total = changes.length;
  const averageBeforeScore = total
    ? round(changes.reduce((sum, item) => sum + item.beforeScore, 0) / total)
    : 0;
  const averageAfterScore = total
    ? round(changes.reduce((sum, item) => sum + item.afterScore, 0) / total)
    : 0;

  return {
    totalComparedSkills: total,
    improvedCount: changes.filter((item) => item.status === 'improved' || (item.status === 'new' && item.afterScore > 0)).length,
    regressedCount: changes.filter((item) => item.status === 'regressed').length,
    unchangedCount: changes.filter((item) => item.status === 'unchanged').length,
    newSkillCount: changes.filter((item) => item.status === 'new').length,
    resolvedMissingCount: changes.filter(
      (item) => (item.beforeScore === 0 && item.afterScore > 0) || (item.beforeLevel === 'missing' && item.afterLevel !== 'missing')
    ).length,
    remainingMissingCount: changes.filter(
      (item) => (item.beforeScore === 0 && item.afterScore === 0) || (item.beforeLevel === 'missing' && item.afterLevel === 'missing')
    ).length,
    newMissingCount: changes.filter(
      (item) => (item.beforeScore > 0 && item.afterScore === 0) || (item.beforeLevel !== 'missing' && item.afterLevel === 'missing')
    ).length,
    averageBeforeScore,
    averageAfterScore,
    averageChange: round(averageAfterScore - averageBeforeScore),
  };
};

const generateSkillVectorComparisonSummary = (comparison) => {
  const summary = comparison?.skillSummary || {};
  if (!summary.totalComparedSkills) {
    return 'Snapshot cũ chưa có dữ liệu skill vector nên hệ thống chỉ so sánh được scores và checklist.';
  }

  const sentences = [];
  const improvedNames = (comparison.improvedSkills || []).slice(0, 3).map((item) => item.canonicalSkillName);
  const remainingNames = (comparison.remainingMissingSkills || []).slice(0, 3);

  if (summary.improvedCount > 0 && summary.resolvedMissingCount > 0) {
    sentences.push(`Repo đã cải thiện một số kỹ năng, đặc biệt là ${improvedNames.join(', ')}. Một số kỹ năng còn thiếu trước đó đã có tín hiệu mới.`);
  } else if (summary.improvedCount > 0) {
    sentences.push(`Repo có tín hiệu cải thiện ở các kỹ năng như ${improvedNames.join(', ')}.`);
  }
  if (remainingNames.length > 0) {
    sentences.push(`Các kỹ năng vẫn chưa có tín hiệu rõ ràng gồm ${remainingNames.join(', ')}.`);
  }
  if (summary.regressedCount > 0) {
    sentences.push('Một số kỹ năng có tín hiệu giảm so với lần phân tích trước, cần kiểm tra lại thay đổi trong repo.');
  }
  if (sentences.length === 0) {
    sentences.push('Các kỹ năng chưa có thay đổi đáng kể giữa hai lần phân tích.');
  }
  return sentences.join(' ');
};

const compactChange = (item) => ({
  skill: item.skill,
  canonicalSkillName: item.canonicalSkillName,
  category: item.category,
  beforePercent: item.beforePercent,
  afterPercent: item.afterPercent,
  changePercent: item.changePercent,
  beforeLevel: item.beforeLevel,
  afterLevel: item.afterLevel,
  status: item.status,
});

const compactNewSkill = (item) => ({
  skill: item.skill,
  canonicalSkillName: item.canonicalSkillName,
  category: item.category,
  afterPercent: item.afterPercent,
  afterLevel: item.afterLevel,
  status: item.status,
});

const removeEvidence = (item) => {
  const {
    beforeEvidence,
    afterEvidence,
    beforeSources,
    afterSources,
    ...withoutEvidence
  } = item;
  return withoutEvidence;
};

const formatSkillVectorComparison = (comparison, options = {}) => {
  const source = comparison || {};
  const includeSkillDetails = options.includeSkillDetails === true;
  const includeEvidence = includeSkillDetails && options.includeEvidence === true;

  const compact = {
    skillSummary: source.skillSummary,
    topImprovedSkills: (source.improvedSkills || []).slice(0, 5).map(compactChange),
    topRegressedSkills: (source.regressedSkills || []).slice(0, 5).map(compactChange),
    newSkills: (source.newSkills || []).slice(0, 5).map(compactNewSkill),
    resolvedMissingSkills: (source.resolvedMissingSkills || []).slice(0, 10),
    remainingMissingSkills: source.remainingMissingSkills || [],
    newMissingSkills: source.newMissingSkills || [],
    summary: source.summary,
  };

  if (!includeSkillDetails) return compact;

  const formatDetails = (items) =>
    (items || []).map((item) => (includeEvidence ? { ...item } : removeEvidence(item)));

  return {
    ...compact,
    skillChanges: formatDetails(source.skillChanges),
    improvedSkills: formatDetails(source.improvedSkills),
    regressedSkills: formatDetails(source.regressedSkills),
    unchangedSkills: formatDetails(source.unchangedSkills),
    newSkills: formatDetails(source.newSkills),
  };
};

const compareSkillVectors = (fromSkillVector, toSkillVector) => {
  const fromMap = getSkillVectorMap(fromSkillVector);
  const toMap = getSkillVectorMap(toSkillVector);
  const keys = new Set([...fromMap.keys(), ...toMap.keys()]);

  const skillChanges = [...keys]
    .map((key) => calculateSkillChange(fromMap.get(key), toMap.get(key)))
    .sort(
      (left, right) =>
        STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
        Math.abs(right.change) - Math.abs(left.change) ||
        left.canonicalSkillName.localeCompare(right.canonicalSkillName)
    );

  const result = {
    skillChanges,
    improvedSkills: skillChanges.filter((item) => item.status === 'improved' || (item.status === 'new' && item.afterScore > 0)),
    regressedSkills: skillChanges.filter((item) => item.status === 'regressed'),
    unchangedSkills: skillChanges.filter((item) => item.status === 'unchanged'),
    newSkills: skillChanges.filter((item) => item.status === 'new'),
    resolvedMissingSkills: skillChanges
      .filter((item) => (item.beforeScore === 0 && item.afterScore > 0) || (item.beforeLevel === 'missing' && item.afterLevel !== 'missing'))
      .map((item) => item.canonicalSkillName),
    remainingMissingSkills: skillChanges
      .filter((item) => (item.beforeScore === 0 && item.afterScore === 0) || (item.beforeLevel === 'missing' && item.afterLevel === 'missing'))
      .map((item) => item.canonicalSkillName),
    newMissingSkills: skillChanges
      .filter((item) => (item.beforeScore > 0 && item.afterScore === 0) || (item.beforeLevel !== 'missing' && item.afterLevel === 'missing'))
      .map((item) => item.canonicalSkillName),
  };
  result.skillSummary = summarizeSkillVectorChanges(skillChanges);
  result.summary = generateSkillVectorComparisonSummary(result);
  return result;
};

module.exports = {
  compareSkillVectors,
  getSkillVectorMap,
  calculateSkillChange,
  summarizeSkillVectorChanges,
  generateSkillVectorComparisonSummary,
  formatSkillVectorComparison,
};
