const AnalysisResult = require('../models/AnalysisResult');
const RepositoryPackage = require('../models/RepositoryPackage');
const RepositoryCommit = require('../models/RepositoryCommit');

const { findRepositoryForUser } = require('./github/github.repository.service');
const { buildAnalysisPayload, sanitizeAnalysisSnapshot } = require('./analysis/analysis.engine');
const { createSnapshotFromAnalysisResult } = require('./snapshot.service');
const { matchSkillVectorToRoles } = require('./roleMatching.service');

const shouldIncludeEvidence = (query = {}) => query.includeEvidence === 'true';

const validateAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const loadAnalysisRules = () => {
  try {
    const rules = require('./analysis/analysis.rules');

    if (!rules || typeof rules !== 'object' || !rules.packageSkillMap || !rules.commitRules) {
      const error = new Error('Analysis rules are invalid or incomplete');
      error.statusCode = 500;
      throw error;
    }

    return rules;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const ruleError = new Error('Failed to load analysis rules');
    ruleError.statusCode = 500;
    throw ruleError;
  }
};

const analyzeRepository = async ({ user, params, query }) => {
  validateAuthUser(user);

  const repository = await findRepositoryForUser(user, params.repoId);
  const [packageRecord, commits] = await Promise.all([
    RepositoryPackage.findOne({ userId: user.userId, repositoryId: repository._id }).lean(),
    RepositoryCommit.find({ userId: user.userId, repositoryId: repository._id }).sort({ authorDate: -1 }).lean(),
  ]);
  const rules = loadAnalysisRules();
  const analysisPayload = buildAnalysisPayload({
    repository,
    packageRecord,
    commits,
    rules,
  });

  const analysisResult = await AnalysisResult.create({
    userId: user.userId,
    repositoryId: repository._id,
    ...analysisPayload,
  });
  const repoSnapshot = await createSnapshotFromAnalysisResult(analysisResult);

  return {
    message: 'Repository analyzed successfully',
    data: {
      analysis: sanitizeAnalysisSnapshot(analysisResult, {
        excludeRawAnalysis: true,
        includeEvidence: shouldIncludeEvidence(query),
      }),
      snapshotId: repoSnapshot?._id || null,
    },
    statusCode: 200,
  };
};

const getAnalysisResults = async ({ user, params, query }) => {
  validateAuthUser(user);

  const repository = await findRepositoryForUser(user, params.repoId);
  const analysis = await AnalysisResult.findOne({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  return {
    message: 'Analysis result fetched successfully',
    data: {
      analysis: sanitizeAnalysisSnapshot(analysis, {
        excludeRawAnalysis: true,
        includeEvidence: shouldIncludeEvidence(query),
      }),
    },
    statusCode: 200,
  };
};

const getMyAnalysisResults = async ({ user, query }) => {
  validateAuthUser(user);

  const snapshots = await AnalysisResult.find({ userId: user.userId })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .select('-rawAnalysis')
    .lean();

  const seenRepositoryIds = new Set();
  const analyses = [];

  for (const snapshot of snapshots) {
    const repositoryId = String(snapshot.repositoryId || '');
    if (!repositoryId || seenRepositoryIds.has(repositoryId)) {
      continue;
    }

    seenRepositoryIds.add(repositoryId);
    analyses.push(
      sanitizeAnalysisSnapshot(snapshot, {
        excludeRawAnalysis: true,
        includeEvidence: shouldIncludeEvidence(query),
      })
    );
  }

  return {
    message: 'My analysis results fetched successfully',
    data: {
      total: analyses.length,
      analyses,
    },
    statusCode: 200,
  };
};

const getRepositoryRoleMatches = async ({ user, params, query = {} }) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, params.repoId);
  const analysis = await AnalysisResult.findOne({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .select('repositoryId repoName fullName analyzedAt skillVector')
    .lean();

  if (!analysis) {
    const error = new Error('Analysis result not found');
    error.statusCode = 404;
    throw error;
  }

  const matches = matchSkillVectorToRoles(analysis.skillVector, {
    limit: query.limit,
    targetRole: query.targetRole,
    includeDetails: query.includeDetails === 'true',
  });

  return {
    message: 'Role matches calculated successfully',
    data: {
      repositoryId: analysis.repositoryId,
      repoName: analysis.repoName,
      fullName: analysis.fullName,
      analyzedAt: analysis.analyzedAt,
      topRole: matches.length
        ? {
            roleId: matches[0].roleId,
            roleName: matches[0].roleName,
            matchScore: matches[0].matchScore,
            matchLevel: matches[0].matchLevel,
            matchLevelLabel: matches[0].matchLevelLabel,
          }
        : null,
      matches,
    },
    statusCode: 200,
  };
};

module.exports = {
  analyzeRepository,
  getAnalysisResults,
  getMyAnalysisResults,
  getRepositoryRoleMatches,
};
