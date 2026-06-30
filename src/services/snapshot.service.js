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
const parseBoolean = (value) => value === true || value === 'true';
const normalizeView = (query = {}) => (query.view === 'detail' ? 'detail' : 'summary');
const isUserContributionSnapshot = (snapshot) => snapshot?.analysisScope?.type === 'user_contribution';
const getSnapshotDate = (snapshot) => snapshot.analyzedAt || snapshot.createdAt || null;

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
        score: roundScore(skill.score),
        level: skill.level || 'weak',
      };
    });

const mapMissingSkills = (snapshot) => {
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
      if (!key || seen.has(key)) return false;
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
            score: roundScore(skill.score),
            level: skill.level || 'missing',
            evidence: skill.evidence || [],
            sources: skill.sources || [],
            lastCalculatedAt: skill.lastCalculatedAt || null,
          };
        }),
      };
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
        score: roundScore(skill.score),
      });
    }
  }
  return map;
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
  const fromScope = fromSnapshot.analysisScope || {};
  const toScope = toSnapshot.analysisScope || {};
  const fromScore = Number(fromSummary.userReadinessScore || 0);
  const toScore = Number(toSummary.userReadinessScore || 0);
  const fromSkills = mapSkillVectorByCanonical(fromSnapshot.skillVector);
  const toSkills = mapSkillVectorByCanonical(toSnapshot.skillVector);
  const skillChanges = [...new Set([...fromSkills.keys(), ...toSkills.keys()])]
    .map((key) => {
      const fromSkill = fromSkills.get(key) || { score: 0, canonicalSkillName: toSkills.get(key)?.canonicalSkillName || '', category: toSkills.get(key)?.category || 'General' };
      const toSkill = toSkills.get(key) || { score: 0, canonicalSkillName: fromSkill.canonicalSkillName, category: fromSkill.category };
      const delta = roundScore(Number(toSkill.score || 0) - Number(fromSkill.score || 0));
      return {
        skillName: toSkill.canonicalSkillName || fromSkill.canonicalSkillName,
        canonicalSkillName: toSkill.canonicalSkillName || fromSkill.canonicalSkillName,
        category: toSkill.category || fromSkill.category,
        fromScore: roundScore(fromSkill.score),
        toScore: roundScore(toSkill.score),
        delta,
        trend: delta > 0.05 ? 'improved' : delta < -0.05 ? 'weaker' : 'unchanged',
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const missingSkillComparison = compareMissingSkills(fromSnapshot, toSnapshot);

  return {
    repositoryId: toSnapshot.repositoryId,
    repoName: toSnapshot.repoName,
    fullName: toSnapshot.fullName,
    analysisScopeType: 'user_contribution',
    enoughData: true,
    fromSnapshot: {
      snapshotId: fromSnapshot._id,
      createdAt: getSnapshotDate(fromSnapshot),
      userReadinessScore: fromScore,
      userLevel: fromSummary.userLevel || '',
    },
    toSnapshot: {
      snapshotId: toSnapshot._id,
      createdAt: getSnapshotDate(toSnapshot),
      userReadinessScore: toScore,
      userLevel: toSummary.userLevel || '',
    },
    delta: {
      userReadinessScore: roundScore(toScore - fromScore),
      levelChanged: (fromSummary.userLevel || '') !== (toSummary.userLevel || ''),
      fromLevel: fromSummary.userLevel || '',
      toLevel: toSummary.userLevel || '',
      userCommitsDelta: Number(toScope.userCommits || 0) - Number(fromScope.userCommits || 0),
      activeDaysDelta: Number(toScope.activeDays || 0) - Number(fromScope.activeDays || 0),
    },
    skillChanges,
    newSkills: skillChanges.filter((item) => item.fromScore === 0 && item.toScore > 0),
    improvedSkills: skillChanges.filter((item) => item.trend === 'improved'),
    weakerSkills: skillChanges.filter((item) => item.trend === 'weaker'),
    resolvedMissingSkills: missingSkillComparison.resolvedMissingSkills,
    newMissingSkills: missingSkillComparison.newMissingSkills,
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
  formatSnapshotResponse,
};
