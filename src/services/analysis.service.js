const AnalysisResult = require('../models/AnalysisResult');
const RepositoryPackage = require('../models/RepositoryPackage');
const RepositoryCommit = require('../models/RepositoryCommit');
const GithubAccount = require('../models/GithubAccount');

const { findRepositoryForUser } = require('./github/github.repository.service');
const {
  buildAnalysisPayload,
  filterUserContributionCommits,
  sanitizeAnalysisSnapshot,
} = require('./analysis/analysis.engine');
const { createSnapshotFromAnalysisResult } = require('./snapshot.service');
const { matchSkillVectorToRoles } = require('./roleMatching.service');
const { createStatusError } = require('./github/github.utils');
const { resolveUserContributionSource } = require('./analysisSource.service');

const shouldIncludeEvidence = (query = {}) => query.includeEvidence === true || query.includeEvidence === 'true';
const getView = (query = {}) => (query.view === 'detail' ? 'detail' : 'summary');

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
  const [githubAccount, packageRecord, commits] = await Promise.all([
    GithubAccount.findOne({ userId: user.userId }).lean(),
    RepositoryPackage.findOne({ userId: user.userId, repositoryId: repository._id }).lean(),
    RepositoryCommit.find({ userId: user.userId, repositoryId: repository._id }).sort({ authorDate: -1 }).lean(),
  ]);

  if (!githubAccount) {
    const error = new Error('GitHub account is not connected');
    error.statusCode = 400;
    throw error;
  }

  const contributionScope = filterUserContributionCommits(commits, githubAccount);
  const rules = loadAnalysisRules();
  const analysisPayload = buildAnalysisPayload({
    repository,
    packageRecord,
    commits: contributionScope.userCommits,
    rules,
    contributionScope,
  });

  const analysisResult = await AnalysisResult.create({
    userId: user.userId,
    repositoryId: repository._id,
    ...analysisPayload,
  });
  const repoSnapshot = await createSnapshotFromAnalysisResult(analysisResult);

  return {
    message: 'Repository analyzed successfully',
    data: sanitizeAnalysisSnapshot(analysisResult, {
      view: getView(query),
      includeEvidence: shouldIncludeEvidence(query),
      snapshotId: repoSnapshot?._id || null,
    }),
    statusCode: 200,
  };
};

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 5;
  return Math.min(20, Math.floor(parsed));
};

const isTrue = (value) => value === true || value === 'true';

const getUsableSkillVector = ({ analysis, sourceMode }) => {
  if (Array.isArray(analysis?.skillVector) && analysis.skillVector.length > 0) {
    return analysis.skillVector;
  }
  const message =
    sourceMode === 'single_repo'
      ? 'This repository analysis does not have a usable skill vector. Please analyze this repository again.'
      : 'No analyzed repositories have a usable skill vector. Please analyze at least one repository again.';
  throw createStatusError(message, 400);
};

const formatDetailedRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: match.matchScore,
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  matchedSkills: match.matchedSkills || [],
  weakSkills: match.weakSkills || [],
  missingRequiredSkills: match.missingRequiredSkills || [],
  missingOptionalSkills: match.missingOptionalSkills || [],
  recommendedNextSkills: match.recommendedNextSkills || [],
});

const getSkillName = (item) => {
  if (!item || typeof item !== 'object') return String(item || '').trim();
  return String(item.canonicalSkillName || item.skill || item.skillName || '').trim();
};

const uniqueSkillNames = (items = [], limit = 5) => {
  const seen = new Set();
  const names = [];
  for (const item of items || []) {
    const name = getSkillName(item);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
};

const formatCompactRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: Number(Number(match.matchScore || 0).toFixed(2)),
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  matchedSkillNames: uniqueSkillNames(match.matchedSkills, 5),
  weakSkillNames: uniqueSkillNames(match.weakSkills, 5),
  missingSkillNames: uniqueSkillNames(
    [...(match.missingRequiredSkills || []), ...(match.missingOptionalSkills || [])],
    5
  ),
  recommendedNextSkills: uniqueSkillNames(match.recommendedNextSkills || [], 5),
});

const formatAnalysisSourceForRoleMatches = (analysisSource, includeDetails = false) => {
  if (!analysisSource || typeof analysisSource !== 'object') return null;
  if (includeDetails) return analysisSource;

  if (analysisSource.type === 'user_contribution_analysis') {
    return {
      type: analysisSource.type,
      sourceMode: analysisSource.sourceMode,
      repositoryId: analysisSource.repositoryId,
      repoName: analysisSource.repoName,
      fullName: analysisSource.fullName,
      userCommits: analysisSource.userCommits,
      userLevel: analysisSource.userLevel,
      userReadinessScore: analysisSource.userReadinessScore,
    };
  }

  return {
    type: analysisSource.type,
    sourceMode: analysisSource.sourceMode,
    totalRepositories: analysisSource.totalRepositories,
    totalUserCommits: analysisSource.totalUserCommits,
    userLevel: analysisSource.userLevel,
    userReadinessScore: analysisSource.userReadinessScore,
    repositoryNames: (analysisSource.repositories || [])
      .map((repository) => repository.repoName || repository.fullName)
      .filter(Boolean),
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
        view: getView(query),
        includeEvidence: shouldIncludeEvidence(query),
        snapshotId: null,
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
        view: getView(query),
        includeEvidence: shouldIncludeEvidence(query),
        snapshotId: null,
        listItem: true,
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

const generateRoleMatches = async ({ user, body = {}, query = {} }) => {
  validateAuthUser(user);

  const limit = normalizeLimit(body.limit);
  const includeDetails = isTrue(body.includeDetails) || isTrue(query.includeDetails) || body.view === 'detail' || query.view === 'detail';
  const source = await resolveUserContributionSource({
    userId: user.userId,
    sourceMode: body.sourceMode,
    repoId: body.repoId,
    repoIds: body.repoIds,
  });

  if (source.sourceMode === 'single_repo' && !source.analysisForGap) {
    throw createStatusError('Please analyze this repository first before matching roles.', 400);
  }
  if (source.sourceMode === 'all_analyzed_repos' && !source.analyses.length) {
    throw createStatusError('Please analyze at least one repository before matching roles.', 400);
  }

  const skillVector = getUsableSkillVector({
    analysis: source.analysisForGap,
    sourceMode: source.sourceMode,
  });
  const matches = matchSkillVectorToRoles(skillVector, {
    limit,
    includeDetails: true,
  }).map((match) => (includeDetails ? formatDetailedRoleMatch(match) : formatCompactRoleMatch(match)));

  return {
    message: 'Role matches generated successfully',
    data: {
      sourceMode: source.sourceMode,
      analysisSource: formatAnalysisSourceForRoleMatches(source.analysisSource, includeDetails),
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
  generateRoleMatches,
};
