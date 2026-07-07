const AnalysisResult = require('../models/AnalysisResult');
const RepositoryPackage = require('../models/RepositoryPackage');
const RepositoryCommit = require('../models/RepositoryCommit');
const GithubAccount = require('../models/GithubAccount');

const { findRepositoryForUser } = require('./github/github.repository.service');
const {
  filterUserContributionCommits,
  sanitizeAnalysisSnapshot,
} = require('./analysis/analysis.engine');
const { createSnapshotFromAnalysisResult } = require('./snapshot.service');
const { createStatusError } = require('./github/github.utils');
const { resolveUserContributionSource } = require('./analysisSource.service');
const {
  buildDev2VecInputFromAnalysisSource,
  buildDev2VecInputFromRepositoryAnalysis,
} = require('./dev2vec/dev2vecInputBuilder.service');
const { runDev2VecInference } = require('./dev2vec/dev2vec.service');
const {
  buildAnalysisSkillsFromDev2Vec,
  buildAnalysisSummaryFromDev2Vec,
  mapDev2VecOutputToRoleMatches,
} = require('./dev2vec/dev2vecRoleMapper.service');
const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
  normalizeSkillText,
} = require('../utils/skillCanonicalizer');
const { buildDocumentationRecommendation } = require('../utils/documentationEvidence');

const shouldIncludeEvidence = (query = {}) => query.includeEvidence === true || query.includeEvidence === 'true';
const getView = (query = {}) => (query.view === 'detail' ? 'detail' : 'summary');

const validateAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const roundVector = (vector = []) => (
  Array.isArray(vector)
    ? vector.map((value) => Math.round((Number(value) || 0) * 10000) / 10000)
    : []
);

const dateOrNull = (value) => (value ? new Date(value) : null);

const buildCommitSummary = (commits = []) => {
  const dates = commits
    .map((commit) => dateOrNull(commit.authorDate || commit.committerDate))
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((left, right) => left - right);
  const activeDays = new Set(dates.map((date) => date.toISOString().slice(0, 10))).size;

  return {
    totalCommits: commits.length,
    activeDays,
    vagueCommitRatio: 0,
    conventionalCommitRatio: 0,
    firstCommitDate: dates[0] || null,
    lastCommitDate: dates[dates.length - 1] || null,
  };
};

const stringArray = (values) => (
  Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : []
);

const uniqueStrings = (values = [], limit = 20) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
};

const buildDev2VecStrengths = (dev2vecInput = {}) => {
  const sourceStats = dev2vecInput.sourceStats || {};
  return [
    `Hệ thống đã phân tích ${Number(sourceStats.commitCount || 0)} commits và ${Number(sourceStats.apiTokenCount || 0)} API/dependency tokens bằng Dev2Vec.`,
  ];
};

const buildDev2VecWeaknesses = (skillMapping = {}) => (
  uniqueStrings([
    ...(skillMapping.weaknesses || []),
    ...(skillMapping.missingSkills || []).map((item) => item.canonicalSkillName),
  ], 10).map((skillName) => `Chưa thấy đóng góp rõ về ${skillName}`)
);

const buildDev2VecRecommendations = (skillMapping = {}) => (
  uniqueStrings(skillMapping.recommendations || [], 10)
    .map((skillName) => `Bạn nên học ${skillName}`)
);

const buildSkillVectorFromDev2VecSkills = ({ topSkills = [], missingSkills = [] }) => {
  const now = new Date();
  const entries = [];

  for (const item of topSkills) {
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    entries.push({
      skill: canonicalSkillName,
      canonicalSkillName,
      normalizedSkillName: normalizeSkillText(canonicalSkillName),
      category: item.category || getCanonicalSkillCategory(canonicalSkillName),
      score: Math.min(1, Math.max(0, Number(item.score || 0) / 100)),
      level: item.level === 'strong' ? 'strong' : 'developing',
      evidence: ['Dev2Vec matched skill prototype'],
      sources: ['dev2vec'],
      lastCalculatedAt: now,
    });
  }

  for (const item of missingSkills) {
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    const key = canonicalSkillName.toLowerCase();
    if (entries.some((entry) => entry.canonicalSkillName.toLowerCase() === key)) continue;
    entries.push({
      skill: canonicalSkillName,
      canonicalSkillName,
      normalizedSkillName: normalizeSkillText(canonicalSkillName),
      category: item.category || getCanonicalSkillCategory(canonicalSkillName),
      score: item.priority === 'medium' ? 0.25 : 0,
      level: item.priority === 'medium' ? 'weak' : 'missing',
      evidence: ['Dev2Vec skill gap prototype'],
      sources: ['dev2vec'],
      lastCalculatedAt: now,
    });
  }

  return entries;
};

const createDev2VecStatusError = (error) => {
  const statusError = createStatusError(error.message || 'Dev2Vec inference failed', error.statusCode || 503);
  statusError.errorCode = error.errorCode || 'DEV2VEC_INFERENCE_FAILED';
  return statusError;
};

const buildDev2VecAnalysisPayload = ({
  repository,
  packageRecord,
  commits,
  contributionScope,
  githubAccount,
  dev2vecInput,
  dev2vecOutput,
}) => {
  const summary = buildAnalysisSummaryFromDev2Vec(dev2vecOutput);
  const skillMapping = buildAnalysisSkillsFromDev2Vec(dev2vecOutput);
  const skillVector = buildSkillVectorFromDev2VecSkills(skillMapping);
  const commitSummary = buildCommitSummary(commits);
  const packages = uniqueStrings([
    ...stringArray(packageRecord?.packages),
    ...dev2vecInput.apiTokens,
  ], 100);
  const frameworks = uniqueStrings(stringArray(packageRecord?.frameworks), 50);
  const languages = uniqueStrings([
    repository.language,
    ...stringArray(repository.languages),
    ...stringArray(packageRecord?.languages),
  ], 50);
  const configs = uniqueStrings([
    ...stringArray(packageRecord?.configs),
    ...stringArray(packageRecord?.packageFiles),
  ], 50);
  const topProbability = Number(dev2vecOutput.rolePredictions?.[0]?.probability || 0);
  const docsEvidence = dev2vecInput.evidencePreview?.docs || {};
  const docsRecommendation = buildDocumentationRecommendation(docsEvidence);
  const recommendations = buildDev2VecRecommendations(skillMapping);
  if (
    docsRecommendation
    && docsEvidence.documentationStatus !== 'no_markdown_docs'
    && !recommendations.includes(docsRecommendation)
  ) {
    recommendations.push(docsRecommendation);
  }
  const hasReadme = Boolean(
    docsEvidence.readmeRootExists
    || repository.readme
    || repository.readmeContent
    || repository.contentPreview
  );

  return {
    githubRepoId: repository.githubRepoId,
    repoName: repository.name || repository.repoName || '',
    fullName: repository.fullName || '',
    analyzedAt: new Date(),
    projectType: summary.projectType || 'Unknown',
    languages,
    frameworks,
    packages,
    configs,
    skillSignals: skillMapping.topSkills.map((item) => item.canonicalSkillName),
    careerSignals: [summary.careerDirection].filter(Boolean),
    careerDirection: summary.careerDirection || 'Generalist Software Engineer',
    strengths: buildDev2VecStrengths(dev2vecInput),
    weaknesses: buildDev2VecWeaknesses(skillMapping),
    missingSkills: uniqueStrings(skillMapping.missingSkills.map((item) => item.canonicalSkillName), 20),
    recommendations,
    scores: {
      techStackScore: summary.overallScore,
      documentationScore: hasReadme || Number(docsEvidence.markdownFileCount || 0) > 0 ? 70 : 0,
      commitQualityScore: 0,
      deploymentScore: 0,
      testingScore: 0,
      portfolioReadinessScore: summary.overallScore,
      overallScore: summary.overallScore,
    },
    summary,
    analysisScope: {
      type: 'user_contribution',
      githubUsername: githubAccount?.username || '',
      totalRepoCommits: Number(contributionScope?.totalRepoCommits || commits.length),
      userCommits: commits.length,
      activeDays: commitSummary.activeDays,
      firstCommitDate: commitSummary.firstCommitDate,
      lastCommitDate: commitSummary.lastCommitDate,
      analyzedCommitShas: commits.map((commit) => commit.sha).filter(Boolean),
      source: 'dev2vec',
    },
    scoreBreakdown: {
      scoringMethod: 'dev2vec_doc2vec_classifier',
      modelVersion: dev2vecOutput.modelVersion || null,
      topRoleProbability: topProbability,
      vectorSources: dev2vecOutput.vectorSources || {},
      sourceStats: {
        ...dev2vecInput.sourceStats,
        ...(dev2vecOutput.sourceStats || {}),
      },
      skillScore: summary.overallScore,
      contributionScore: 0,
      commitQualityScore: 0,
      projectCompletenessScore: 0,
      missingCriticalPenalty: 0,
      confidence: topProbability,
    },
    commitSummary,
    checklist: {
      hasReadme,
      hasEnvExample: configs.some((item) => item.toLowerCase().includes('.env.example')),
      hasDocker: configs.some((item) => item.toLowerCase().includes('dockerfile') || item.toLowerCase().includes('docker')),
      hasDockerCompose: configs.some((item) => item.toLowerCase().includes('docker-compose')),
      hasCICD: configs.some((item) => item.toLowerCase().includes('.github/workflows')),
      hasTesting: packages.some((item) => /jest|vitest|mocha|pytest|junit|playwright|cypress/i.test(item)),
      hasLinting: packages.some((item) => /eslint|ruff|pylint/i.test(item)),
      hasFormatter: packages.some((item) => /prettier|black|formatter/i.test(item)),
      hasPackageFile: Boolean(dev2vecInput.sourceStats.packageFileCount),
    },
    rawAnalysis: {
      scoringMethod: 'dev2vec_doc2vec_classifier',
      requestId: dev2vecInput.requestId,
    },
    skillEvidence: [],
    skillVector,
    dev2vec: {
      modelVersion: dev2vecOutput.modelVersion || null,
      vectorDims: dev2vecOutput.vectorDims || {},
      repoVector: roundVector(dev2vecOutput.vectors?.repoVector),
      issueVector: roundVector(dev2vecOutput.vectors?.issueVector),
      apiVector: roundVector(dev2vecOutput.vectors?.apiVector),
      combinedVector: roundVector(dev2vecOutput.vectors?.combinedVector),
      vectorSources: dev2vecOutput.vectorSources || {},
      sourceStats: {
        ...dev2vecInput.sourceStats,
        ...(dev2vecOutput.sourceStats || {}),
      },
      evidencePreview: dev2vecInput.evidencePreview || {},
      rolePredictions: dev2vecOutput.rolePredictions || [],
      skillGaps: dev2vecOutput.skillGaps || {},
      scoringMethod: 'dev2vec_doc2vec_classifier',
    },
  };
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
  const userCommits = contributionScope.userCommits;
  const dev2vecInput = buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages: packageRecord ? [packageRecord] : [],
    commits: userCommits,
    issues: [],
    topN: 3,
    requestId: `analysis-${user.userId}-${repository._id}-${Date.now()}`,
  });

  let dev2vecOutput;
  try {
    dev2vecOutput = await runDev2VecInference(dev2vecInput);
  } catch (error) {
    console.error('[dev2vec] analysis inference failed:', {
      errorCode: error.errorCode,
      message: error.message,
      repositoryId: String(repository._id),
      userId: String(user.userId),
    });
    throw createDev2VecStatusError(error);
  }

  const analysisPayload = buildDev2VecAnalysisPayload({
    repository,
    packageRecord,
    commits: userCommits,
    contributionScope,
    githubAccount,
    dev2vecInput,
    dev2vecOutput,
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

const isTrue = (value) => value === true || value === 'true';

const getTopN = (limit) => Math.min(Number(limit) || 3, 3);

const hasCachedDev2VecResult = (analysis = {}) => (
  Array.isArray(analysis?.dev2vec?.rolePredictions)
  && analysis.dev2vec.rolePredictions.length > 0
  && analysis.dev2vec.skillGaps
  && typeof analysis.dev2vec.skillGaps === 'object'
);

const buildDev2VecOutputFromAnalysis = (analysis = {}) => ({
  success: true,
  modelVersion: analysis.dev2vec?.modelVersion || null,
  vectorDims: analysis.dev2vec?.vectorDims || {},
  vectors: analysis.dev2vec?.vectors || {},
  rolePredictions: analysis.dev2vec?.rolePredictions || [],
  skillGaps: analysis.dev2vec?.skillGaps || {},
  vectorSources: analysis.dev2vec?.vectorSources || {},
  sourceStats: analysis.dev2vec?.sourceStats || {},
  scoringMethod: analysis.dev2vec?.scoringMethod || 'dev2vec_doc2vec_classifier',
});

const createDev2VecRoleMatchError = (error) => {
  const statusError = createStatusError(error.message || 'Dev2Vec role matching failed', error.statusCode || 503);
  statusError.errorCode = error.errorCode || 'DEV2VEC_INFERENCE_FAILED';
  return statusError;
};

const filterMatchesByTargetRole = (matches = [], targetRole) => {
  const target = String(targetRole || '').trim().toLowerCase();
  if (!target) return matches;
  return matches.filter((match) => (
    String(match.roleId || '').toLowerCase() === target
    || String(match.roleName || '').toLowerCase() === target
    || String(match.modelLabel || '').toLowerCase() === target
  ));
};

const mapRoleMatchesFromDev2Vec = (dev2vecOutput, { includeDetails = false, limit = 3, targetRole } = {}) => {
  const mapped = mapDev2VecOutputToRoleMatches(dev2vecOutput, { includeDetails, limit });
  return filterMatchesByTargetRole(mapped.matches || [], targetRole).slice(0, limit);
};

const buildRepositoryDev2VecInput = async ({ userId, repository, topN }) => {
  const [githubAccount, packageRecord, commits] = await Promise.all([
    GithubAccount.findOne({ userId }).lean(),
    RepositoryPackage.findOne({ userId, repositoryId: repository._id }).lean(),
    RepositoryCommit.find({ userId, repositoryId: repository._id }).sort({ authorDate: -1 }).lean(),
  ]);
  const contributionScope = githubAccount
    ? filterUserContributionCommits(commits, githubAccount)
    : { userCommits: commits };

  return buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages: packageRecord ? [packageRecord] : [],
    commits: contributionScope.userCommits,
    issues: [],
    topN,
    requestId: `role-matches-${userId}-${repository._id}-${Date.now()}`,
  });
};

const getDev2VecOutputForSingleRepo = async ({ userId, repository, analysis, topN }) => {
  if (hasCachedDev2VecResult(analysis)) {
    return buildDev2VecOutputFromAnalysis(analysis);
  }

  const dev2vecInput = await buildRepositoryDev2VecInput({ userId, repository, topN });
  const dev2vecOutput = await runDev2VecInference(dev2vecInput);

  if (analysis?._id) {
    await AnalysisResult.findByIdAndUpdate(analysis._id, {
      $set: {
        dev2vec: {
          modelVersion: dev2vecOutput.modelVersion || null,
          vectorDims: dev2vecOutput.vectorDims || {},
          vectors: dev2vecOutput.vectors || {},
          vectorSources: dev2vecOutput.vectorSources || {},
          sourceStats: {
            ...dev2vecInput.sourceStats,
            ...(dev2vecOutput.sourceStats || {}),
          },
          evidencePreview: dev2vecInput.evidencePreview || {},
          rolePredictions: dev2vecOutput.rolePredictions || [],
          skillGaps: dev2vecOutput.skillGaps || {},
          scoringMethod: 'dev2vec_doc2vec_classifier',
        },
      },
    });
  }

  return dev2vecOutput;
};

const getDev2VecOutputForAnalysisSource = async ({ analysisSource, topN, userId }) => {
  const dev2vecInput = buildDev2VecInputFromAnalysisSource({
    ...analysisSource,
    topN,
    requestId: `role-matches-${userId}-${analysisSource?.sourceMode || 'multi'}-${Date.now()}`,
  });
  return runDev2VecInference(dev2vecInput);
};

const formatDetailedRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: match.matchScore,
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  matchedSkillNames: match.matchedSkillNames || [],
  weakSkillNames: match.weakSkillNames || [],
  missingSkillNames: match.missingSkillNames || [],
  recommendedNextSkills: match.recommendedNextSkills || [],
  matchedSkills: match.matchedSkills || [],
  weakSkills: match.weakSkills || [],
  missingRequiredSkills: match.missingRequiredSkills || [],
  missingOptionalSkills: match.missingOptionalSkills || [],
  probability: match.probability,
  rank: match.rank,
  modelLabel: match.modelLabel,
  modelVersion: match.modelVersion,
  scoringMethod: match.scoringMethod,
  vectorSources: match.vectorSources || {},
  sourceStats: match.sourceStats || {},
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
  matchedSkillNames: uniqueSkillNames(match.matchedSkillNames || match.matchedSkills, 5),
  weakSkillNames: uniqueSkillNames(match.weakSkillNames || match.weakSkills, 5),
  missingSkillNames: uniqueSkillNames(match.missingSkillNames || [
    ...(match.missingRequiredSkills || []),
    ...(match.missingOptionalSkills || []),
  ], 5),
  recommendedNextSkills: uniqueSkillNames(match.recommendedNextSkills || [], 5),
  probability: match.probability,
  rank: match.rank,
  modelLabel: match.modelLabel,
  modelVersion: match.modelVersion,
  scoringMethod: match.scoringMethod,
  vectorSources: match.vectorSources || {},
  sourceStats: match.sourceStats || {},
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
    $or: [
      { repositoryId: repository._id },
      { githubRepoId: repository.githubRepoId },
    ],
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  const limit = getTopN(query.limit);
  const includeDetails = isTrue(query.includeDetails);
  let dev2vecOutput;
  try {
    dev2vecOutput = await getDev2VecOutputForSingleRepo({
      userId: user.userId,
      repository,
      analysis,
      topN: limit,
    });
  } catch (error) {
    throw createDev2VecRoleMatchError(error);
  }

  const matches = mapRoleMatchesFromDev2Vec(dev2vecOutput, {
    includeDetails,
    limit,
    targetRole: query.targetRole,
  }).map((match) => (includeDetails ? formatDetailedRoleMatch(match) : formatCompactRoleMatch(match)));

  return {
    message: 'Role matches calculated successfully',
    data: {
      repositoryId: analysis?.repositoryId || repository._id,
      repoName: analysis?.repoName || repository.name || repository.repoName || '',
      fullName: analysis?.fullName || repository.fullName || '',
      analyzedAt: analysis?.analyzedAt || null,
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

  const limit = getTopN(body.limit);
  const includeDetails = isTrue(body.includeDetails) || isTrue(query.includeDetails) || body.view === 'detail' || query.view === 'detail';
  const source = await resolveUserContributionSource({
    userId: user.userId,
    sourceMode: body.sourceMode,
    repoId: body.repoId,
    repoIds: body.repoIds,
  });

  if (source.sourceMode === 'single_repo' && !source.analysisForGap) {
    source.analysisSource = source.analysisSource || {
      type: 'user_contribution_analysis',
      sourceMode: source.sourceMode,
      repositoryId: source.repository?._id || null,
      repoName: source.repository?.name || source.repository?.repoName || '',
      fullName: source.repository?.fullName || '',
    };
  }
  if (source.sourceMode === 'all_analyzed_repos' && !source.analyses.length) {
    throw createStatusError('Please analyze at least one repository before matching roles.', 400);
  }

  let dev2vecOutput;
  try {
    if (source.sourceMode === 'single_repo') {
      dev2vecOutput = await getDev2VecOutputForSingleRepo({
        userId: user.userId,
        repository: source.repository,
        analysis: source.analysisForGap,
        topN: limit,
      });
    } else {
      dev2vecOutput = await getDev2VecOutputForAnalysisSource({
        analysisSource: {
          ...source.analysisSource,
          analysis: source.analysisForGap,
          repositories: source.analysisSource?.repositories || source.analyses || [],
        },
        topN: limit,
        userId: user.userId,
      });
    }
  } catch (error) {
    throw createDev2VecRoleMatchError(error);
  }

  const matches = mapRoleMatchesFromDev2Vec(dev2vecOutput, {
    includeDetails,
    limit,
    targetRole: body.targetRole || query.targetRole,
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
