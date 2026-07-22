const MATCH_LEVEL_LABELS = {
  excellent: 'Rất phù hợp',
  strong: 'Phù hợp cao',
  moderate: 'Tạm phù hợp',
  weak: 'Ít phù hợp',
  low: 'Không phù hợp',
};

const { DEV2VEC_ROLES } = require('../../constants/dev2vecCatalog');

const toArray = (value) => (Array.isArray(value) ? value : []);

const SKILL_SCORE_SCALE = '0-100';
const SKILL_PRESENT_THRESHOLD = 60;
const SKILL_WEAK_THRESHOLD = 20;
const SKILL_MAPPING_VERSION = 'python-skill-gap-direct-v4';

const roundPercent = (probability) => (
  Math.round((Number(probability) || 0) * 10000) / 100
);

const toPercentScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 10000) / 100;
};

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
    score: similarity === null ? 0 : toPercentScore(similarity),
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
  const predictions = toArray(dev2vecOutput.rolePredictions).slice(0, clampLimit(options.limit));
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
  toArray(dev2vecOutput.rolePredictions)[0] || null
);

const getPredictionForRole = (dev2vecOutput = {}, roleId = '') => {
  const target = String(roleId || '').toLowerCase();
  if (!target) return getTopPrediction(dev2vecOutput);
  return toArray(dev2vecOutput.rolePredictions).find((prediction) => (
    String(prediction.roleId || '').toLowerCase() === target
    || String(prediction.roleName || '').toLowerCase() === target
  )) || null;
};

const getUserLevelFromScore = (score) => {
  const value = Number(score) || 0;
  if (value >= 80) return 'advanced';
  if (value >= 45) return 'intermediate';
  return 'beginner';
};

const buildAnalysisSummaryFromDev2Vec = (dev2vecOutput = {}, options = {}) => {
  if (Object.prototype.hasOwnProperty.call(options, 'roleId') && !options.roleId) {
    return {
      careerDirection: '',
      userLevel: 'beginner',
      userReadinessScore: 0,
      overallScore: 0,
      projectType: '',
      confidence: 0,
    };
  }
  const topPrediction = getPredictionForRole(dev2vecOutput, options.roleId);
  if (!topPrediction) {
    return {
      careerDirection: '',
      userLevel: 'beginner',
      userReadinessScore: 0,
      overallScore: 0,
      projectType: '',
      confidence: 0,
    };
  }

  const matchScore = roundPercent(topPrediction.probability);
  const userLevel = getUserLevelFromScore(matchScore);

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

const roundScore = (value) => toPercentScore(value);

const getLevelFromScore = (score) => {
  const displayScore = Number(score) || 0;
  if (displayScore >= SKILL_PRESENT_THRESHOLD) return 'strong';
  if (displayScore > 0 || displayScore >= SKILL_WEAK_THRESHOLD) return 'weak';
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
  const displayScore = roundScore(similarity);

  return {
    skill: skillName,
    canonicalSkillName,
    category,
    priority,
    score: displayScore,
    level: getLevelFromScore(displayScore),
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

const getRoleCatalogSkills = (roleId = '') => (
  DEV2VEC_ROLES.find((role) => String(role.roleId || '').toLowerCase() === String(roleId || '').toLowerCase())?.skills || []
);

const getEmbeddingScoreForSkill = (skillGap = {}, skillName) => {
  const detail = findDetailBySkill(skillGap, skillName);
  return Number.isFinite(Number(detail?.similarity)) ? toPercentScore(detail.similarity) : 0;
};

const buildCanonicalRoleSkillItems = ({ roleId = '', category = '', skillGap = {} } = {}) => {
  const roleSkills = getRoleCatalogSkills(roleId);
  const items = [];
  for (const skillName of roleSkills) {
    const embeddingScore = getEmbeddingScoreForSkill(skillGap, skillName);
    const finalScore = embeddingScore;
    const finalState = finalScore > 0
      ? (finalScore >= SKILL_PRESENT_THRESHOLD ? 'present' : 'weak')
      : 'missing';
    const level = finalState === 'present' ? 'strong' : finalState;
    const dev2vecStatus = toArray(skillGap.matchedSkillNames).includes(skillName)
      ? 'matched'
      : toArray(skillGap.weakSkillNames).includes(skillName)
        ? 'weak'
        : toArray(skillGap.missingSkillNames).includes(skillName)
          ? 'missing'
          : '';
    items.push({
      skill: skillName,
      canonicalSkillName: skillName,
      category,
      priority: finalState === 'missing' ? 'medium' : 'matched',
      score: finalScore,
      level,
      similarity: (() => {
        const detail = findDetailBySkill(skillGap, skillName);
        return Number.isFinite(Number(detail?.similarity)) ? Number(detail.similarity) : null;
      })(),
      dev2vecStatus,
      evidenceDetected: finalScore > 0,
      evidenceStatus: finalScore > 0 ? 'dev2vec_score_present' : 'not_detected',
      evidence: [],
      evidenceDetails: [],
      reason: finalScore > 0
        ? 'Dev2Vec returned a non-zero skill score.'
        : 'Dev2Vec returned zero or missing skill score.',
      deterministicEvidenceCount: 0,
      matchedSignals: [],
      sourceTypes: [],
      embeddingScore,
      finalScore,
      scoreScale: SKILL_SCORE_SCALE,
      weakThreshold: SKILL_WEAK_THRESHOLD,
      presentThreshold: SKILL_PRESENT_THRESHOLD,
      finalState,
    });
  }
  return items;
};

const buildSkillItem = ({ skillName, skillGap, category, status, repoFeatureEvidence }) => {
  return buildDev2VecSkillItem({ skillName, skillGap, category, dev2vecStatus: status, priority: 'matched', repoFeatureEvidence });
};

const buildMissingSkillItem = ({ skillName, skillGap, category, priority, repoFeatureEvidence }) => {
  return buildDev2VecSkillItem({ skillName, skillGap, category, dev2vecStatus: 'missing', priority, repoFeatureEvidence });
};

const buildAnalysisSkillsFromDev2Vec = (dev2vecOutput = {}, options = {}) => {
  if (Object.prototype.hasOwnProperty.call(options, 'roleId') && !options.roleId) {
    return {
      topSkills: [],
      missingSkills: [],
      strengths: [],
      weaknesses: [],
      recommendations: [],
      debug: {
        skillMappingVersion: SKILL_MAPPING_VERSION,
        scoreScale: SKILL_SCORE_SCALE,
        weakThreshold: SKILL_WEAK_THRESHOLD,
        presentThreshold: SKILL_PRESENT_THRESHOLD,
        evidenceRecordCount: 0,
        canonicalSkills: [],
      },
    };
  }
  const topPrediction = getPredictionForRole(dev2vecOutput, options.roleId);
  const roleId = topPrediction?.roleId || '';
  const category = options.category || roleId;
  const repoFeatureEvidence = options.repoFeatureEvidence || dev2vecOutput.repoFeatureEvidence || dev2vecOutput.evidencePreview?.repoFeatures || {};
  const skillGap = topPrediction ? getSkillGapForPrediction(dev2vecOutput, topPrediction) : {};
  if (topPrediction) {
    const details = new Map(toArray(skillGap.details).map((detail) => [
      String(detail?.skillName || detail?.canonicalSkillName || '').toLowerCase(), detail,
    ]));
    const makeItem = (skillName, status) => {
      const detail = details.get(String(skillName || '').toLowerCase()) || {};
      const canonicalSkillName = detail.canonicalSkillName || detail.skillName || skillName;
      const similarity = Number.isFinite(Number(detail.similarity)) ? Number(detail.similarity) : null;
      return {
        skill: canonicalSkillName,
        canonicalSkillName,
        category,
        priority: status === 'missing' ? 'high' : status === 'weak' ? 'medium' : 'low',
        score: similarity === null ? 0 : toPercentScore(similarity),
        level: status === 'matched' ? 'strong' : status,
        similarity,
        dev2vecStatus: status,
        evidenceDetected: false,
        evidenceStatus: 'python_skill_gap',
        evidence: [],
        evidenceDetails: [],
        reason: 'Dev2Vec skill-gap status is used directly as recommendation evidence.',
      };
    };
    const matched = toArray(skillGap.matchedSkillNames).map((name) => makeItem(name, 'matched'));
    const weak = toArray(skillGap.weakSkillNames).map((name) => makeItem(name, 'weak'));
    const missing = toArray(skillGap.missingSkillNames).map((name) => makeItem(name, 'missing'));
    return {
      topSkills: [...matched, ...weak],
      missingSkills: missing,
      strengths: matched.map((item) => item.canonicalSkillName),
      weaknesses: weak,
      recommendations: toArray(skillGap.recommendedNextSkills),
      debug: {
        skillMappingVersion: SKILL_MAPPING_VERSION,
        scoreScale: SKILL_SCORE_SCALE,
        evidenceRecordCount: toArray(skillGap.details).length,
        statusSource: 'python_skill_gaps',
      },
    };
  }
  const canonicalRoleSkillItems = buildCanonicalRoleSkillItems({
    roleId,
    category,
    skillGap,
  });

  if (canonicalRoleSkillItems.length > 0) {
    const topSkills = canonicalRoleSkillItems.filter((item) => item.finalState !== 'missing');
    const missingSkills = canonicalRoleSkillItems.filter((item) => item.finalState === 'missing');
    return {
      topSkills,
      missingSkills,
      strengths: topSkills.map((item) => item.canonicalSkillName),
      weaknesses: topSkills.filter((item) => item.level === 'weak'),
      recommendations: [
        ...missingSkills.map((item) => item.canonicalSkillName),
        ...topSkills.filter((item) => item.level === 'weak').map((item) => item.canonicalSkillName),
      ],
      debug: {
        skillMappingVersion: SKILL_MAPPING_VERSION,
        scoreScale: SKILL_SCORE_SCALE,
        weakThreshold: SKILL_WEAK_THRESHOLD,
        presentThreshold: SKILL_PRESENT_THRESHOLD,
        evidenceRecordCount: 0,
        canonicalSkills: canonicalRoleSkillItems.map((item) => ({
          skillId: item.canonicalSkillName,
          skillName: item.canonicalSkillName,
          matchedSignals: item.matchedSignals,
          matchedFiles: item.evidence,
          sourceTypes: item.sourceTypes,
          deterministicEvidenceCount: item.deterministicEvidenceCount,
          embeddingScore: item.embeddingScore,
          finalScore: item.finalScore,
          scoreScale: item.scoreScale,
          weakThreshold: item.weakThreshold,
          presentThreshold: item.presentThreshold,
          finalState: item.finalState,
        })),
      },
    };
  }

  const bySkill = new Map();
  const addSkill = (skillName, status, priority = status === 'missing' ? 'medium' : 'matched') => {
    const key = String(skillName || '').toLowerCase();
    if (!key || bySkill.has(key)) return;
    const item = status === 'missing'
      ? buildMissingSkillItem({ skillName, skillGap, category, priority, repoFeatureEvidence })
      : buildSkillItem({ skillName, skillGap, category, status, repoFeatureEvidence });
    bySkill.set(key, {
      ...item,
      priority: item.score > 0 ? 'matched' : 'medium',
      level: getLevelFromScore(item.score),
    });
  };

  toArray(skillGap.matchedSkillNames).forEach((skillName) => addSkill(skillName, 'matched'));
  toArray(skillGap.weakSkillNames).forEach((skillName) => addSkill(skillName, 'weak'));
  toArray(skillGap.missingSkillNames).forEach((skillName) => addSkill(skillName, 'missing'));
  const allSkills = [...bySkill.values()];
  const topSkills = allSkills.filter((item) => Number(item.score || 0) > 0);
  const missingSkills = allSkills.filter((item) => Number(item.score || 0) === 0);

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
  SKILL_MAPPING_VERSION,
  SKILL_PRESENT_THRESHOLD,
  SKILL_WEAK_THRESHOLD,
  buildCanonicalRoleSkillItems,
  mapDev2VecOutputToRoleMatches,
  mapPredictionToRoleMatch,
  getDev2VecMatchLevel,
  getDev2VecMatchLevelLabel,
  getUserLevelFromScore,
  mapSkillGapDetails,
  buildAnalysisSummaryFromDev2Vec,
  buildAnalysisSkillsFromDev2Vec,
};
