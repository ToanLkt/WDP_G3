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

const getRepoFeatureForSkill = (repoFeatureEvidence = {}, skillName) => {
  const normalized = String(skillName || '').toLowerCase();
  const aliases = [
    ['REST API', ['rest api', 'express.js', 'express', 'swagger', 'api documentation']],
    ['Database', ['database', 'mongodb', 'mongoose', 'mongodb crud', 'mongodb aggregation']],
    ['Authentication', ['authentication', 'jwt authentication', 'jwt auth', 'security']],
    ['Docker Basics', ['docker basics', 'docker', 'deployment']],
    ['API Testing', ['api testing', 'testing', 'jest']],
    ['Documentation', ['documentation']],
  ];

  const match = aliases.find(([, names]) => names.some((name) => normalized === name));
  if (!match) return null;
  const feature = repoFeatureEvidence[match[0]];
  return feature?.detected ? feature : null;
};

const roundScore = (value) => Math.round((Number(value) || 0) * 10000) / 100;

const getLevelFromScore = (score, evidenceDetected) => {
  const displayScore = Number(score) || 0;
  if (displayScore >= 45) return 'strong';
  if (displayScore >= 20 || evidenceDetected) return 'weak';
  return 'missing';
};

const getEvidencePaths = (feature = {}) => toArray(feature?.evidence)
  .map((item) => item.path)
  .filter(Boolean);

const buildDev2VecSkillItem = ({ skillName, skillGap, category, dev2vecStatus, priority, repoFeatureEvidence }) => {
  const detail = findDetailBySkill(skillGap, skillName);
  const canonicalSkillName = detail?.canonicalSkillName || skillName;
  const similarity = Number.isFinite(Number(detail?.similarity)) ? Number(detail.similarity) : 0;
  const feature = getRepoFeatureForSkill(repoFeatureEvidence, canonicalSkillName);
  const evidenceDetected = Boolean(feature);
  const evidenceStatus = feature
    ? (dev2vecStatus === 'missing' || dev2vecStatus === 'weak' ? 'detected_but_low_similarity' : 'detected')
    : 'not_detected';
  const score = (dev2vecStatus === 'matched' || dev2vecStatus === 'weak' || evidenceDetected)
    ? similarity
    : 0;
  const displayScore = roundScore(score);

  return {
    skill: skillName,
    canonicalSkillName,
    category,
    priority,
    score: displayScore,
    level: getLevelFromScore(displayScore, evidenceDetected),
    similarity,
    dev2vecStatus,
    evidenceDetected,
    evidenceStatus,
    evidence: getEvidencePaths(feature),
    evidenceDetails: feature?.evidence || [],
    reason: feature
      ? 'Repo có evidence về skill này, nhưng Dev2Vec similarity còn thấp.'
      : 'Chưa thấy đủ source evidence rõ cho skill này.',
  };
};

const buildSkillItem = ({ skillName, skillGap, category, status, repoFeatureEvidence }) => {
  return buildDev2VecSkillItem({ skillName, skillGap, category, dev2vecStatus: status, priority: 'matched', repoFeatureEvidence });
};

const buildMissingSkillItem = ({ skillName, skillGap, category, priority, repoFeatureEvidence }) => {
  return buildDev2VecSkillItem({ skillName, skillGap, category, dev2vecStatus: 'missing', priority, repoFeatureEvidence });
};

const buildAnalysisSkillsFromDev2Vec = (dev2vecOutput = {}, options = {}) => {
  const topPrediction = getTopPrediction(dev2vecOutput);
  const roleId = topPrediction?.roleId || '';
  const category = options.category || roleId;
  const repoFeatureEvidence = options.repoFeatureEvidence || dev2vecOutput.repoFeatureEvidence || dev2vecOutput.evidencePreview?.repoFeatures || {};
  const skillGap = topPrediction ? getSkillGapForPrediction(dev2vecOutput, topPrediction) : {};

  const matchedSkills = toArray(skillGap.matchedSkillNames).map((skillName) => (
    buildSkillItem({ skillName, skillGap, category, status: 'matched', repoFeatureEvidence })
  ));
  const weakSkills = toArray(skillGap.weakSkillNames).map((skillName) => (
    buildSkillItem({ skillName, skillGap, category, status: 'weak', repoFeatureEvidence })
  ));
  const missingCandidates = toArray(skillGap.missingSkillNames).map((skillName) => (
    buildMissingSkillItem({ skillName, skillGap, category, priority: 'medium', repoFeatureEvidence })
  ));
  const topSkills = [...matchedSkills, ...weakSkills];
  const missingSkills = [];

  for (const item of missingCandidates) {
    if (item.evidenceDetected) {
      topSkills.push({ ...item, priority: 'matched' });
    } else {
      missingSkills.push(item);
    }
  }

  return {
    topSkills,
    missingSkills,
    strengths: topSkills.map((item) => item.canonicalSkillName),
    weaknesses: topSkills.filter((item) => item.level === 'weak'),
    recommendations: [
      ...missingSkills.map((item) => item.canonicalSkillName),
      ...topSkills.filter((item) => item.level === 'weak').map((item) => item.canonicalSkillName),
    ],
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
