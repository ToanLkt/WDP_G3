const mongoose = require('mongoose');

const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const { findRepositoryForUser } = require('./github/github.repository.service');
const { createStatusError } = require('./github/github.utils');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');

const validateAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    throw createStatusError('Unauthorized', 401);
  }
};

const toObject = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const stringArray = (values) =>
  Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];
const objectArray = (values) =>
  Array.isArray(values)
    ? values
        .filter((value) => value && typeof value === 'object')
        .map((value) => ({ ...(value.toObject ? value.toObject() : value) }))
    : [];

const roundScore = (value) => Number((Number(value || 0)).toFixed(3));
const toDisplaySkillScore = (value) => {
  const score = Number(value) || 0;
  return Number(((score <= 1 ? score * 100 : score)).toFixed(2));
};
const getComparableSkillScore = (value) => {
  const score = Number(value) || 0;
  return score > 1 ? score / 100 : score;
};
const parseBoolean = (value) => value === true || value === 'true';
const normalizeView = (query = {}) => (query.view === 'detail' ? 'detail' : 'summary');
const isUserContributionSnapshot = (snapshot) => snapshot?.analysisScope?.type === 'user_contribution';
const getSnapshotDate = (snapshot) => snapshot.analyzedAt || snapshot.createdAt || null;
const getSnapshotUserCommits = (snapshot) => Number(snapshot.analysisScope?.userCommits || snapshot.commitSummary?.totalCommits || 0);
const getSnapshotActiveDays = (snapshot) => Number(snapshot.analysisScope?.activeDays || snapshot.commitSummary?.activeDays || 0);

const normalizeListMap = (values) => {
  const map = new Map();
  for (const value of stringArray(values)) {
    const canonicalValue = canonicalizeSkillName(value);
    const normalized = canonicalValue.toLowerCase();
    if (normalized && !map.has(normalized)) {
      map.set(normalized, canonicalValue);
    }
  }
  return map;
};

const DEV2VEC_SCORING_METHOD = 'dev2vec_doc2vec_classifier';
const LEGACY_SCORING_METHOD = 'legacy_weighted_scoring';
const SCORING_METHOD_MISMATCH_WARNING = 'Snapshots use different scoring methods, so skill-level comparison is not reliable.';

const hasObjectData = (value) => value && typeof value === 'object' && Object.keys(value).length > 0;

const detectScoringMethod = (snapshot = {}) => {
  const explicitMethod =
    snapshot.dev2vec?.scoringMethod ||
    snapshot.scoreBreakdown?.scoringMethod ||
    snapshot.analysisSummary?.scoringMethod ||
    snapshot.summary?.scoringMethod;
  if (explicitMethod) return String(explicitMethod);

  if (
    hasObjectData(snapshot.dev2vec) &&
    (
      Array.isArray(snapshot.dev2vec.rolePredictions) ||
      hasObjectData(snapshot.dev2vec.skillGaps) ||
      snapshot.dev2vec.modelVersion ||
      hasObjectData(snapshot.dev2vec.vectorSources) ||
      hasObjectData(snapshot.dev2vec.sourceStats)
    )
  ) {
    return DEV2VEC_SCORING_METHOD;
  }

  return LEGACY_SCORING_METHOD;
};

const buildSkillVectorSummary = (skillVector = []) => {
  const skills = objectArray(skillVector);
  const summary = {
    totalSkills: skills.length,
    strongSkills: 0,
    weakSkills: 0,
    developingSkills: 0,
    missingSkills: 0,
  };

  for (const skill of skills) {
    const score = getComparableSkillScore(skill.score);
    const level = String(skill.level || '').toLowerCase();
    if (level === 'missing' || score === 0) {
      summary.missingSkills += 1;
    } else if (level === 'weak' || (score > 0 && score < 0.4)) {
      summary.weakSkills += 1;
    } else if (level === 'developing' || score < 0.7) {
      summary.developingSkills += 1;
    } else {
      summary.strongSkills += 1;
    }
  }

  return summary;
};

const buildSnapshotPayload = (analysisResult) => {
  const source = toObject(analysisResult);

  return {
    userId: source.userId,
    repositoryId: source.repositoryId,
    githubRepoId: source.githubRepoId,
    repoName: source.repoName,
    fullName: source.fullName,
    analysisResultId: source._id,
    projectType: source.projectType,
    careerDirection: source.careerDirection,
    languages: stringArray(source.languages),
    frameworks: stringArray(source.frameworks),
    packages: stringArray(source.packages),
    configs: stringArray(source.configs),
    skillSignals: stringArray(source.skillSignals),
    careerSignals: stringArray(source.careerSignals),
    strengths: stringArray(source.strengths),
    weaknesses: stringArray(source.weaknesses),
    missingSkills: stringArray(source.missingSkills),
    recommendations: stringArray(source.recommendations),
    scores: source.scores || {},
    summary: source.summary || {},
    analysisScope: source.analysisScope || {},
    scoreBreakdown: source.scoreBreakdown || {},
    commitSummary: source.commitSummary || {},
    checklist: source.checklist || {},
    skillEvidence: objectArray(source.skillEvidence),
    skillVector: objectArray(source.skillVector),
    dev2vec: {
      modelVersion: source.dev2vec?.modelVersion || null,
      vectorDims: source.dev2vec?.vectorDims || {},
      repoVector: [],
      issueVector: [],
      apiVector: [],
      combinedVector: [],
      vectorSources: source.dev2vec?.vectorSources || {},
      sourceStats: source.dev2vec?.sourceStats || {},
      rolePredictions: objectArray(source.dev2vec?.rolePredictions),
      skillGaps: source.dev2vec?.skillGaps || {},
      evidencePreview: source.dev2vec?.evidencePreview || {},
      scoringMethod: source.dev2vec?.scoringMethod || source.scoreBreakdown?.scoringMethod || '',
      cacheMetadata: source.dev2vec?.cacheMetadata || source.rawAnalysis?.dev2vecCacheMetadata || {},
    },
    analyzedAt: source.analyzedAt || source.createdAt || new Date(),
    snapshotType: 'after_analysis',
    source: 'github',
  };
};

const createSnapshotFromAnalysisResult = async (analysisResult) => {
  if (!analysisResult) {
    return null;
  }

  return RepoAnalysisSnapshot.create(buildSnapshotPayload(analysisResult));
};

const mapTopSkills = (skillVector) =>
  objectArray(skillVector)
    .filter((skill) => skill.level !== 'missing')
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 5)
    .map((skill) => {
      const canonicalSkillName = canonicalizeSkillName(skill.canonicalSkillName || skill.skill);
      return {
        skillName: canonicalSkillName,
        canonicalSkillName,
        category: getCanonicalSkillCategory(canonicalSkillName),
        score: toDisplaySkillScore(skill.score),
        level: skill.level || 'weak',
      };
    });

const mapMissingSkills = (snapshot) => {
  const detectedSet = new Set(
    objectArray(snapshot.skillVector)
      .filter((skill) => skill.level !== 'missing' && Number(skill.score || 0) > 0)
      .map((skill) => canonicalizeSkillName(skill.canonicalSkillName || skill.skill).toLowerCase())
  );
  const vectorMissing = objectArray(snapshot.skillVector)
    .filter((skill) => skill.level === 'missing')
    .map((skill) => ({ skillName: canonicalizeSkillName(skill.canonicalSkillName || skill.skill), priority: 'medium' }));
  const legacyMissing = stringArray(snapshot.missingSkills).map((skill) => ({
    skillName: canonicalizeSkillName(skill),
    priority: 'medium',
  }));
  const seen = new Set();
  return [...vectorMissing, ...legacyMissing]
    .filter((item) => {
      const key = item.skillName.toLowerCase();
      if (!key || seen.has(key) || detectedSet.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((item) => ({
      skillName: item.skillName,
      canonicalSkillName: item.skillName,
      category: getCanonicalSkillCategory(item.skillName),
      priority: item.priority,
      reason: '',
    }));
};

const formatSnapshotResponse = (snapshotInput, options = {}) => {
  const snapshot = toObject(snapshotInput);
  const summary = snapshot.summary || {};
  const scope = snapshot.analysisScope || {};
  const response = {
    snapshotId: snapshot._id,
    analysisId: snapshot.analysisResultId || null,
    repository: {
      repositoryId: snapshot.repositoryId,
      repoName: snapshot.repoName || '',
      fullName: snapshot.fullName || '',
    },
    analysisScope: {
      type: scope.type || 'user_contribution',
      githubUsername: scope.githubUsername || '',
      totalRepoCommits: Number(scope.totalRepoCommits || 0),
      userCommits: Number(scope.userCommits || snapshot.commitSummary?.totalCommits || 0),
      activeDays: Number(scope.activeDays || snapshot.commitSummary?.activeDays || 0),
      firstCommitDate: scope.firstCommitDate || snapshot.commitSummary?.firstCommitDate || null,
      lastCommitDate: scope.lastCommitDate || snapshot.commitSummary?.lastCommitDate || null,
    },
    summary: {
      userLevel: summary.userLevel || scope.userLevel || '',
      userReadinessScore: Number(summary.userReadinessScore || 0),
      careerDirection: summary.careerDirection || snapshot.careerDirection || '',
      projectType: summary.projectType || snapshot.projectType || '',
      confidence: summary.confidence || snapshot.scoreBreakdown?.confidence || '',
    },
    topSkills: mapTopSkills(snapshot.skillVector),
    missingSkills: mapMissingSkills(snapshot),
    createdAt: snapshot.createdAt,
    analyzedAt: snapshot.analyzedAt,
  };

  if (options.view === 'detail') {
    response.scoreBreakdown = snapshot.scoreBreakdown || {};
    response.recommendationSummary = stringArray(snapshot.recommendations).slice(0, 5);
    if (Array.isArray(scope.analyzedCommitShas)) {
      response.analysisScope.analyzedCommitShas = scope.analyzedCommitShas;
    }
    if (options.includeEvidence) {
      response.debug = {
        skillVector: objectArray(snapshot.skillVector).map((skill) => {
          const canonicalSkillName = canonicalizeSkillName(skill.canonicalSkillName || skill.skill);
          return {
            skill: canonicalSkillName,
            canonicalSkillName,
            normalizedSkillName: skill.normalizedSkillName || canonicalSkillName.toLowerCase(),
            category: getCanonicalSkillCategory(canonicalSkillName),
            score: toDisplaySkillScore(skill.score),
            rawSimilarity: Number.isFinite(Number(skill.similarity)) ? Number(skill.similarity) : Number(skill.score || 0),
            dev2vecStatus: skill.dev2vecStatus || '',
            evidenceDetected: skill.evidenceDetected,
            evidenceStatus: skill.evidenceStatus || '',
            level: skill.level || 'missing',
            evidence: skill.evidence || [],
            sources: skill.sources || [],
            lastCalculatedAt: skill.lastCalculatedAt || null,
          };
        }),
      };
      if (snapshot.dev2vec) {
        response.debug.dev2vec = {
          modelVersion: snapshot.dev2vec.modelVersion || null,
          vectorDims: snapshot.dev2vec.vectorDims || {},
          vectorSources: snapshot.dev2vec.vectorSources || {},
          sourceStats: snapshot.dev2vec.sourceStats || {},
          rolePredictions: snapshot.dev2vec.rolePredictions || [],
          skillGaps: snapshot.dev2vec.skillGaps || {},
          evidencePreview: snapshot.dev2vec.evidencePreview || {},
          scoringMethod: detectScoringMethod(snapshot),
        };
      }
    }
  }

  return response;
};

const buildRepositorySnapshotQuery = (user, repository) => {
  const query = {
    userId: user.userId,
    analysisScope: { $type: 'object' },
    'analysisScope.type': 'user_contribution',
    $or: [{ repositoryId: repository._id }],
  };
  if (repository.githubRepoId) query.$or.push({ githubRepoId: repository.githubRepoId });
  return query;
};

const getRepositorySnapshots = async (user, repoId, query = {}) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, repoId);
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const view = normalizeView(query);
  const includeEvidence = view === 'detail' && parseBoolean(query.includeEvidence);
  const snapshotQuery = buildRepositorySnapshotQuery(user, repository);
  const [total, snapshots] = await Promise.all([
    RepoAnalysisSnapshot.countDocuments(snapshotQuery),
    RepoAnalysisSnapshot.find(snapshotQuery)
      .sort({ analyzedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    message: 'Repository snapshots fetched successfully',
    data: {
      repositoryId: repository._id,
      repoName: repository.name || '',
      fullName: repository.fullName || '',
      analysisScopeType: 'user_contribution',
      snapshots: snapshots.map((snapshot) => formatSnapshotResponse(snapshot, { view, includeEvidence })),
      pagination: { total, limit, page },
    },
    statusCode: 200,
  };
};

const getSnapshotById = async (user, snapshotId, query = {}) => {
  validateAuthUser(user);

  if (!mongoose.Types.ObjectId.isValid(String(snapshotId || ''))) {
    throw createStatusError('Snapshot not found', 404);
  }

  const snapshot = await RepoAnalysisSnapshot.findOne({
    _id: snapshotId,
    userId: user.userId,
    analysisScope: { $type: 'object' },
    'analysisScope.type': 'user_contribution',
  }).lean();
  if (!snapshot) {
    throw createStatusError('Snapshot not found', 404);
  }

  const view = normalizeView(query);
  return {
    message: 'Snapshot fetched successfully',
    data: {
      snapshot: formatSnapshotResponse(snapshot, {
        view,
        includeEvidence: view === 'detail' && parseBoolean(query.includeEvidence),
      }),
    },
    statusCode: 200,
  };
};

const compareMissingSkills = (fromSnapshot, toSnapshot) => {
  const fromMap = normalizeListMap(fromSnapshot.missingSkills);
  const toMap = normalizeListMap(toSnapshot.missingSkills);

  return {
    resolvedMissingSkills: [...fromMap.entries()].filter(([normalized]) => !toMap.has(normalized)).map(([, value]) => value),
    newMissingSkills: [...toMap.entries()].filter(([normalized]) => !fromMap.has(normalized)).map(([, value]) => value),
  };
};

const mapSkillVectorByCanonical = (skillVector = []) => {
  const map = new Map();
  for (const skill of objectArray(skillVector)) {
    const canonicalSkillName = canonicalizeSkillName(skill.canonicalSkillName || skill.skill);
    const key = canonicalSkillName.toLowerCase();
    if (!key) continue;
    const current = map.get(key);
    if (!current || Number(skill.score || 0) > Number(current.score || 0)) {
      map.set(key, {
        skillName: canonicalSkillName,
        canonicalSkillName,
        category: getCanonicalSkillCategory(canonicalSkillName),
        score: toDisplaySkillScore(skill.score),
      });
    }
  }
  return map;
};

const getTopDev2VecRoleId = (snapshot = {}) => {
  const predictions = Array.isArray(snapshot.dev2vec?.rolePredictions) ? snapshot.dev2vec.rolePredictions : [];
  const topPrediction = [...predictions].sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))[0];
  return topPrediction?.roleId || Object.keys(snapshot.dev2vec?.skillGaps || {})[0] || '';
};

const findDev2VecSkillDetail = (skillGap = {}, skillName, status) => {
  const key = canonicalizeSkillName(skillName).toLowerCase();
  return objectArray(skillGap.details).find((detail) => {
    const detailKey = canonicalizeSkillName(detail.canonicalSkillName || detail.skillName || detail.skill).toLowerCase();
    return detailKey === key && (!status || detail.status === status);
  });
};

const scoreDev2VecSkill = (detail, status) => {
  if (Number.isFinite(Number(detail?.similarity))) {
    const similarity = Number(detail.similarity);
    return Math.min(100, Math.max(0, similarity <= 1 ? similarity * 100 : similarity));
  }
  if (status === 'matched') return 100;
  if (status === 'weak') return 50;
  return 0;
};

const mapDev2VecSkillsByCanonical = (snapshot = {}) => {
  const roleId = getTopDev2VecRoleId(snapshot);
  const skillGap = snapshot.dev2vec?.skillGaps?.[roleId] || {};
  const map = new Map();
  const addSkills = (names, status) => {
    for (const name of stringArray(names)) {
      const detail = findDev2VecSkillDetail(skillGap, name, status);
      const canonicalSkillName = canonicalizeSkillName(detail?.canonicalSkillName || detail?.skillName || name);
      const key = canonicalSkillName.toLowerCase();
      if (!key) continue;
      const score = scoreDev2VecSkill(detail, status);
      const current = map.get(key);
      if (!current || score > current.score) {
        map.set(key, {
          skillName: canonicalSkillName,
          canonicalSkillName,
          category: roleId || getCanonicalSkillCategory(canonicalSkillName),
          score: roundScore(score),
          status,
        });
      }
    }
  };

  addSkills(skillGap.matchedSkillNames, 'matched');
  addSkills(skillGap.weakSkillNames, 'weak');
  addSkills(skillGap.missingSkillNames, 'missing');
  return map;
};

const compareSkillScoreMaps = (fromSkills, toSkills, { commonOnly = false } = {}) => {
  const keys = commonOnly
    ? [...fromSkills.keys()].filter((key) => toSkills.has(key))
    : [...new Set([...fromSkills.keys(), ...toSkills.keys()])];

  return keys
    .map((key) => {
      const fromSkill = fromSkills.get(key) || { score: 0, canonicalSkillName: toSkills.get(key)?.canonicalSkillName || '', category: toSkills.get(key)?.category || 'General' };
      const toSkill = toSkills.get(key) || { score: 0, canonicalSkillName: fromSkill.canonicalSkillName, category: fromSkill.category };
      const delta = roundScore(Number(toSkill.score || 0) - Number(fromSkill.score || 0));
      const trendThreshold = Math.max(Number(fromSkill.score || 0), Number(toSkill.score || 0)) > 1 ? 5 : 0.05;
      return {
        skillName: toSkill.canonicalSkillName || fromSkill.canonicalSkillName,
        canonicalSkillName: toSkill.canonicalSkillName || fromSkill.canonicalSkillName,
        category: toSkill.category || fromSkill.category,
        fromScore: roundScore(fromSkill.score),
        toScore: roundScore(toSkill.score),
        delta,
        trend: delta > trendThreshold ? 'improved' : delta < -trendThreshold ? 'weaker' : 'unchanged',
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
};

const buildSkillComparison = (fromSnapshot, toSnapshot, fromScoringMethod, toScoringMethod) => {
  if (fromScoringMethod !== toScoringMethod) {
    return {
      comparisonMode: 'score_only',
      comparableSkillScores: false,
      skillChanges: [],
      newSkills: [],
      improvedSkills: [],
      weakerSkills: [],
      resolvedMissingSkills: [],
      newMissingSkills: [],
      warnings: [SCORING_METHOD_MISMATCH_WARNING],
    };
  }

  if (fromScoringMethod === DEV2VEC_SCORING_METHOD) {
    const skillChanges = compareSkillScoreMaps(
      mapSkillVectorByCanonical(fromSnapshot.skillVector),
      mapSkillVectorByCanonical(toSnapshot.skillVector),
      { commonOnly: true }
    );
    return {
      comparisonMode: 'dev2vec_skill_similarity',
      comparableSkillScores: true,
      skillChanges,
      newSkills: skillChanges.filter((item) => item.fromScore === 0 && item.toScore > 0),
      improvedSkills: skillChanges.filter((item) => item.trend === 'improved'),
      weakerSkills: skillChanges.filter((item) => item.trend === 'weaker'),
      resolvedMissingSkills: [],
      newMissingSkills: [],
      warnings: [],
    };
  }

  const skillChanges = compareSkillScoreMaps(
    mapSkillVectorByCanonical(fromSnapshot.skillVector),
    mapSkillVectorByCanonical(toSnapshot.skillVector)
  );
  const missingSkillComparison = compareMissingSkills(fromSnapshot, toSnapshot);
  return {
    comparisonMode: 'legacy_skill_score',
    comparableSkillScores: true,
    skillChanges,
    newSkills: skillChanges.filter((item) => item.fromScore === 0 && item.toScore > 0),
    improvedSkills: skillChanges.filter((item) => item.trend === 'improved'),
    weakerSkills: skillChanges.filter((item) => item.trend === 'weaker'),
    resolvedMissingSkills: missingSkillComparison.resolvedMissingSkills,
    newMissingSkills: missingSkillComparison.newMissingSkills,
    warnings: [],
  };
};

const buildComparisonResult = (fromSnapshotInput, toSnapshotInput) => {
  const fromSnapshot = toObject(fromSnapshotInput);
  const toSnapshot = toObject(toSnapshotInput);
  const fromRepositoryId = String(fromSnapshot.repositoryId || '');
  const toRepositoryId = String(toSnapshot.repositoryId || '');

  if (fromRepositoryId !== toRepositoryId) {
    throw createStatusError('Snapshots must belong to the same repository.', 400);
  }
  if (!isUserContributionSnapshot(fromSnapshot) || !isUserContributionSnapshot(toSnapshot)) {
    throw createStatusError('Snapshot not found', 404);
  }

  const fromSummary = fromSnapshot.summary || {};
  const toSummary = toSnapshot.summary || {};
  const fromScore = Number(fromSummary.userReadinessScore || 0);
  const toScore = Number(toSummary.userReadinessScore || 0);
  const fromScoringMethod = detectScoringMethod(fromSnapshot);
  const toScoringMethod = detectScoringMethod(toSnapshot);
  const skillComparison = buildSkillComparison(fromSnapshot, toSnapshot, fromScoringMethod, toScoringMethod);

  return {
    repositoryId: toSnapshot.repositoryId,
    repoName: toSnapshot.repoName,
    fullName: toSnapshot.fullName,
    analysisScopeType: 'user_contribution',
    enoughData: true,
    comparisonMode: skillComparison.comparisonMode,
    comparableSkillScores: skillComparison.comparableSkillScores,
    fromSnapshot: {
      snapshotId: fromSnapshot._id,
      createdAt: getSnapshotDate(fromSnapshot),
      userReadinessScore: fromScore,
      userLevel: fromSummary.userLevel || '',
      scoringMethod: fromScoringMethod,
    },
    toSnapshot: {
      snapshotId: toSnapshot._id,
      createdAt: getSnapshotDate(toSnapshot),
      userReadinessScore: toScore,
      userLevel: toSummary.userLevel || '',
      scoringMethod: toScoringMethod,
    },
    delta: {
      userReadinessScore: roundScore(toScore - fromScore),
      levelChanged: (fromSummary.userLevel || '') !== (toSummary.userLevel || ''),
      fromLevel: fromSummary.userLevel || '',
      toLevel: toSummary.userLevel || '',
      userCommitsDelta: getSnapshotUserCommits(toSnapshot) - getSnapshotUserCommits(fromSnapshot),
      activeDaysDelta: getSnapshotActiveDays(toSnapshot) - getSnapshotActiveDays(fromSnapshot),
    },
    skillChanges: skillComparison.skillChanges,
    newSkills: skillComparison.newSkills,
    improvedSkills: skillComparison.improvedSkills,
    weakerSkills: skillComparison.weakerSkills,
    resolvedMissingSkills: skillComparison.resolvedMissingSkills,
    newMissingSkills: skillComparison.newMissingSkills,
    warnings: skillComparison.warnings,
  };
};

const compareSnapshots = async (user, { fromSnapshotId, toSnapshotId, snapshotAId, snapshotBId } = {}) => {
  validateAuthUser(user);
  const fromId = fromSnapshotId || snapshotAId;
  const toId = toSnapshotId || snapshotBId;

  if (!mongoose.Types.ObjectId.isValid(String(fromId || '')) || !mongoose.Types.ObjectId.isValid(String(toId || ''))) {
    throw createStatusError('fromSnapshotId and toSnapshotId are required.', 400);
  }

  const [fromSnapshot, toSnapshot] = await Promise.all([
    RepoAnalysisSnapshot.findOne({ _id: fromId, userId: user.userId, 'analysisScope.type': 'user_contribution' }).lean(),
    RepoAnalysisSnapshot.findOne({ _id: toId, userId: user.userId, 'analysisScope.type': 'user_contribution' }).lean(),
  ]);

  if (!fromSnapshot || !toSnapshot) {
    throw createStatusError('Snapshot not found', 404);
  }

  return {
    message: 'Snapshots compared successfully',
    data: buildComparisonResult(fromSnapshot, toSnapshot),
    statusCode: 200,
  };
};

const compareRepositoryProgress = async (user, repoId) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, repoId);
  const snapshots = await RepoAnalysisSnapshot.find(buildRepositorySnapshotQuery(user, repository))
    .sort({ createdAt: 1, analyzedAt: 1 })
    .lean();

  if (snapshots.length < 2) {
    return {
      message: 'Not enough snapshots to compare yet',
      data: {
        repositoryId: repository._id,
        repoName: repository.name || '',
        analysisScopeType: 'user_contribution',
        enoughData: false,
        snapshotsCount: snapshots.length,
        comparison: null,
      },
      statusCode: 200,
    };
  }

  return {
    message: 'Repository progress comparison fetched successfully',
    data: buildComparisonResult(snapshots[0], snapshots[snapshots.length - 1]),
    statusCode: 200,
  };
};

module.exports = {
  createSnapshotFromAnalysisResult,
  getRepositorySnapshots,
  getSnapshotById,
  compareSnapshots,
  compareRepositoryProgress,
  buildComparisonResult,
  buildSnapshotPayload,
  buildSkillVectorSummary,
  formatSnapshotResponse,
  detectScoringMethod,
};
