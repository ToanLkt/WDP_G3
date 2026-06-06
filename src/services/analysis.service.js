const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const RepositoryPackage = require('../models/RepositoryPackage');
const RepositoryCommit = require('../models/RepositoryCommit');

const { findRepositoryForUser } = require('./github/github.repository.service');
const { buildAnalysisPayload, sanitizeAnalysisSnapshot } = require('./analysis/analysis.engine');

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

const analyzeRepository = async ({ user, params }) => {
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

  const snapshot = await AnalysisSnapshot.create({
    userId: user.userId,
    repositoryId: repository._id,
    ...analysisPayload,
  });

  return {
    message: 'Repository analyzed successfully',
    data: {
      analysis: sanitizeAnalysisSnapshot(snapshot, { excludeRawAnalysis: true }),
    },
    statusCode: 200,
  };
};

const getAnalysisResults = async ({ user, params }) => {
  validateAuthUser(user);

  const repository = await findRepositoryForUser(user, params.repoId);
  const analysis = await AnalysisSnapshot.findOne({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  return {
    message: 'Analysis result fetched successfully',
    data: {
      analysis: sanitizeAnalysisSnapshot(analysis, { excludeRawAnalysis: true }),
    },
    statusCode: 200,
  };
};

const getMyAnalysisResults = async ({ user }) => {
  validateAuthUser(user);

  const snapshots = await AnalysisSnapshot.find({ userId: user.userId })
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
    analyses.push(sanitizeAnalysisSnapshot(snapshot, { excludeRawAnalysis: true }));
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

module.exports = {
  analyzeRepository,
  getAnalysisResults,
  getMyAnalysisResults,
};
