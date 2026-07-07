const MATCH_LEVEL_LABELS = {
  excellent: 'Rất phù hợp',
  strong: 'Phù hợp cao',
  moderate: 'Tạm phù hợp',
  weak: 'Ít phù hợp',
  low: 'Không phù hợp',
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const roundPercent = (probability) => (
  Math.round((Number(probability) || 0) * 10000) / 100
);

const getDev2VecMatchLevel = (matchScore) => {
  const score = Number(matchScore) || 0;
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'weak';
  return 'low';
};

const getDev2VecMatchLevelLabel = (matchLevel) => (
  MATCH_LEVEL_LABELS[matchLevel] || MATCH_LEVEL_LABELS.low
);

const clampLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(Math.floor(parsed), 3);
};

const normalizeSkillDetail = (detail = {}) => {
  const similarity = Number.isFinite(Number(detail.similarity))
    ? Number(detail.similarity)
    : null;
  const skillName = detail.skillName || detail.canonicalSkillName || detail.skill || '';

  return {
    skill: skillName,
    skillName,
    canonicalSkillName: detail.canonicalSkillName || skillName,
    similarity,
    status: detail.status || '',
    score: similarity,
  };
};

const mapSkillGapDetails = (skillGap = {}, status) => (
  toArray(skillGap.details)
    .filter((detail) => !status || detail?.status === status)
    .map(normalizeSkillDetail)
);

const getSkillGapForPrediction = (dev2vecOutput = {}, prediction = {}) => {
  const skillGaps = dev2vecOutput.skillGaps || {};
  return skillGaps[prediction.roleId] || {};
};

const mapPredictionToRoleMatch = (prediction = {}, skillGap = {}, dev2vecOutput = {}, options = {}) => {
  const matchScore = roundPercent(prediction.probability);
  const matchLevel = getDev2VecMatchLevel(matchScore);
  const roleMatch = {
    roleId: prediction.roleId || '',
    roleName: prediction.roleName || prediction.modelLabel || '',
    matchScore,
    matchLevel,
    matchLevelLabel: getDev2VecMatchLevelLabel(matchLevel),
    matchedSkillNames: toArray(skillGap.matchedSkillNames),
    weakSkillNames: toArray(skillGap.weakSkillNames),
    missingSkillNames: toArray(skillGap.missingSkillNames),
    recommendedNextSkills: toArray(skillGap.recommendedNextSkills),
    probability: Number(prediction.probability) || 0,
    rank: Number(prediction.rank) || null,
    modelLabel: prediction.modelLabel || '',
    modelVersion: dev2vecOutput.modelVersion || null,
    scoringMethod: 'dev2vec_doc2vec_classifier',
    vectorSources: dev2vecOutput.vectorSources || {},
    sourceStats: dev2vecOutput.sourceStats || {},
  };

  if (options.includeDetails === true) {
    roleMatch.matchedSkills = mapSkillGapDetails(skillGap, 'matched');
    roleMatch.weakSkills = mapSkillGapDetails(skillGap, 'weak');
    roleMatch.missingRequiredSkills = mapSkillGapDetails(skillGap, 'missing');
    roleMatch.missingOptionalSkills = [];
  }

  return roleMatch;
};

const mapDev2VecOutputToRoleMatches = (dev2vecOutput = {}, options = {}) => {
  const predictions = [...toArray(dev2vecOutput.rolePredictions)]
    .sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))
    .slice(0, clampLimit(options.limit));
  const matches = predictions.map((prediction) => (
    mapPredictionToRoleMatch(
      prediction,
      getSkillGapForPrediction(dev2vecOutput, prediction),
      dev2vecOutput,
      options,
    )
  ));

  return {
    matches,
    modelVersion: dev2vecOutput.modelVersion || null,
    scoringMethod: 'dev2vec_doc2vec_classifier',
    vectorDims: dev2vecOutput.vectorDims || {},
    vectorSources: dev2vecOutput.vectorSources || {},
    sourceStats: dev2vecOutput.sourceStats || {},
  };
};

const getTopPrediction = (dev2vecOutput = {}) => (
  [...toArray(dev2vecOutput.rolePredictions)]
    .sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))[0] || null
);

const buildAnalysisSummaryFromDev2Vec = (dev2vecOutput = {}, options = {}) => {
  const topPrediction = getTopPrediction(dev2vecOutput);
  if (!topPrediction) {
    return {
      careerDirection: '',
      userLevel: 'novice',
      userReadinessScore: 0,
      overallScore: 0,
      projectType: '',
      confidence: 0,
    };
  }

  const matchScore = roundPercent(topPrediction.probability);
  const userLevel = matchScore >= 70
    ? 'intermediate'
    : matchScore >= 40
      ? 'beginner'
      : 'novice';

  return {
    careerDirection: topPrediction.roleName || '',
    userLevel,
    userReadinessScore: matchScore,
    overallScore: matchScore,
    projectType: topPrediction.modelLabel || topPrediction.roleName || '',
    confidence: Number(topPrediction.probability) || 0,
  };
};

const findDetailBySkill = (skillGap = {}, skillName) => {
  const key = String(skillName || '').toLowerCase();
  return toArray(skillGap.details).find((detail) => (
    String(detail?.skillName || detail?.canonicalSkillName || '').toLowerCase() === key
  ));
};

const buildSkillItem = ({ skillName, skillGap, category, status }) => {
  const detail = findDetailBySkill(skillGap, skillName);
  const similarity = Number.isFinite(Number(detail?.similarity))
    ? Number(detail.similarity)
    : null;

  return {
    skill: skillName,
    canonicalSkillName: detail?.canonicalSkillName || skillName,
    category,
    score: similarity === null ? null : Math.round(similarity * 10000) / 100,
    level: status === 'matched' ? 'strong' : 'basic',
  };
};

const buildMissingSkillItem = ({ skillName, skillGap, category, priority }) => {
  const detail = findDetailBySkill(skillGap, skillName);
  return {
    skill: skillName,
    canonicalSkillName: detail?.canonicalSkillName || skillName,
    category,
    priority,
  };
};

const buildAnalysisSkillsFromDev2Vec = (dev2vecOutput = {}, options = {}) => {
  const topPrediction = getTopPrediction(dev2vecOutput);
  const roleId = topPrediction?.roleId || '';
  const category = options.category || roleId;
  const skillGap = topPrediction ? getSkillGapForPrediction(dev2vecOutput, topPrediction) : {};

  const topSkills = toArray(skillGap.matchedSkillNames).map((skillName) => (
    buildSkillItem({ skillName, skillGap, category, status: 'matched' })
  ));
  const weakSkills = toArray(skillGap.weakSkillNames);
  const missingSkills = [
    ...toArray(skillGap.missingSkillNames).map((skillName) => (
      buildMissingSkillItem({ skillName, skillGap, category, priority: 'high' })
    )),
    ...weakSkills.map((skillName) => (
      buildMissingSkillItem({ skillName, skillGap, category, priority: 'medium' })
    )),
  ];

  return {
    topSkills,
    missingSkills,
    strengths: topSkills.map((item) => item.canonicalSkillName),
    weaknesses: weakSkills,
    recommendations: toArray(skillGap.recommendedNextSkills),
  };
};

module.exports = {
  mapDev2VecOutputToRoleMatches,
  mapPredictionToRoleMatch,
  getDev2VecMatchLevel,
  getDev2VecMatchLevelLabel,
  mapSkillGapDetails,
  buildAnalysisSummaryFromDev2Vec,
  buildAnalysisSkillsFromDev2Vec,
};
