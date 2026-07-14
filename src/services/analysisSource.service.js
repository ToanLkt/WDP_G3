const mongoose = require('mongoose');

const AnalysisResult = require('../models/AnalysisResult');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');
const { createStatusError } = require('./github/github.utils');
const { findRepositoryForUser } = require('./github/github.repository.service');

const SOURCE_MODES = ['single_repo', 'all_analyzed_repos', 'selected_repos'];

const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const roundScore = (value) => Number((Number(value || 0)).toFixed(3));
const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || '')) ? new mongoose.Types.ObjectId(String(value)) : null;

const uniqueStrings = (values, limit = 20) =>
  [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);

const getAnalysisRepositoryKey = (analysis = {}) =>
  String(analysis.repositoryId || analysis.githubRepoId || analysis.fullName || analysis.repoName || '').trim();

const findLatestUserContributionAnalysis = async ({ userId, repository, repoId }) => {
  const repositoryId = repository?._id || toObjectId(repoId);
  const query = {
    userId,
    analysisScope: { $type: 'object' },
    'analysisScope.type': 'user_contribution',
    $or: [],
  };
  if (repositoryId) query.$or.push({ repositoryId });
  if (repository?.githubRepoId) query.$or.push({ githubRepoId: repository.githubRepoId });
  if (!query.$or.length) return null;

  return AnalysisResult.findOne(query).sort({ analyzedAt: -1, createdAt: -1 }).lean();
};

const findLatestUserContributionAnalysesForUser = async (userId) => {
  const analyses = await AnalysisResult.find({
    userId,
    analysisScope: { $type: 'object' },
    'analysisScope.type': 'user_contribution',
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();
  const latestByRepository = new Map();
  for (const analysis of analyses) {
    const key = getAnalysisRepositoryKey(analysis);
    if (key && !latestByRepository.has(key)) latestByRepository.set(key, analysis);
  }
  return [...latestByRepository.values()];
};

const findLatestUserContributionAnalysesByRepoIds = async (userId, repoIds = []) => {
  const analyses = [];
  const missingRepoIds = [];
  for (const repoId of repoIds) {
    let repository = null;
    try {
      repository = await findRepositoryForUser({ userId }, repoId);
    } catch (error) {
      missingRepoIds.push(String(repoId));
      continue;
    }
    const analysis = await findLatestUserContributionAnalysis({ userId, repository, repoId });
    if (analysis) analyses.push({ analysis, repository });
    else missingRepoIds.push(String(repoId));
  }
  return { analyses, missingRepoIds };
};

const buildAnalysisSourceSummary = ({ analysis, repository, sourceMode = 'single_repo' }) => {
  const summary = analysis?.summary || {};
  const scope = analysis?.analysisScope || {};
  return {
    type: 'user_contribution_analysis',
    sourceMode,
    analysisId: analysis?._id || null,
    snapshotId: analysis?.snapshotId || null,
    repositoryId: analysis?.repositoryId || repository?._id || null,
    repoName: analysis?.repoName || repository?.name || '',
    fullName: analysis?.fullName || repository?.fullName || '',
    githubUsername: scope.githubUsername || '',
    totalRepoCommits: Number(scope.totalRepoCommits || 0),
    userCommits: Number(scope.userCommits || analysis?.commitSummary?.totalCommits || 0),
    activeDays: Number(scope.activeDays || analysis?.commitSummary?.activeDays || 0),
    firstCommitDate: scope.firstCommitDate || analysis?.commitSummary?.firstCommitDate || null,
    lastCommitDate: scope.lastCommitDate || analysis?.commitSummary?.lastCommitDate || null,
    userLevel: summary.userLevel || scope.userLevel || '',
    userReadinessScore: Number(summary.userReadinessScore || 0),
    careerDirection: summary.careerDirection || analysis?.careerDirection || '',
    projectType: summary.projectType || analysis?.projectType || '',
    analyzedAt: analysis?.analyzedAt || analysis?.createdAt || null,
    modelVersion: analysis?.dev2vec?.modelVersion || null,
    evidenceVersion:
      analysis?.dev2vec?.cacheMetadata?.analysisPipelineVersion ||
      analysis?.rawAnalysis?.dev2vecCacheMetadata?.analysisPipelineVersion ||
      null,
  };
};

const findSnapshotForAnalysis = async (userId, analysisId) => {
  if (!analysisId || !mongoose.Types.ObjectId.isValid(String(analysisId))) return null;
  return RepoAnalysisSnapshot.findOne({ userId, analysisResultId: analysisId })
    .sort({ createdAt: -1 })
    .select('_id analysisResultId repositoryId analyzedAt createdAt dev2vec.cacheMetadata')
    .lean();
};

const attachSnapshotProvenance = async ({ userId, roadmapSource }) => {
  if (!roadmapSource || typeof roadmapSource !== 'object') return roadmapSource;
  const analysisIds = roadmapSource.analysisIds?.length
    ? roadmapSource.analysisIds
    : roadmapSource.analysisId
      ? [roadmapSource.analysisId]
      : [];
  const snapshots = await Promise.all(analysisIds.map((analysisId) => findSnapshotForAnalysis(userId, analysisId)));
  const validSnapshots = snapshots.filter(Boolean);
  const byAnalysisId = new Map(validSnapshots.map((snapshot) => [String(snapshot.analysisResultId), snapshot]));
  const repositories = Array.isArray(roadmapSource.repositories)
    ? roadmapSource.repositories.map((repository) => {
        const snapshot = byAnalysisId.get(String(repository.analysisId || ''));
        return {
          ...repository,
          snapshotId: snapshot?._id || repository.snapshotId || null,
          analyzedAt: repository.analyzedAt || snapshot?.analyzedAt || null,
        };
      })
    : roadmapSource.repositories;
  return {
    ...roadmapSource,
    snapshotId: validSnapshots.length === 1 ? validSnapshots[0]._id : roadmapSource.snapshotId || null,
    snapshotIds: validSnapshots.map((snapshot) => snapshot._id),
    analyzedAt:
      roadmapSource.analyzedAt ||
      (validSnapshots.length === 1 ? validSnapshots[0].analyzedAt || validSnapshots[0].createdAt : null),
    repositories,
  };
};

const getWeightedAverageReadinessScore = (analyses) => {
  const validScores = analyses
    .map((analysis) => ({
      score: Number(analysis.summary?.userReadinessScore ?? analysis.analysisScope?.userReadinessScore),
      weight: Math.max(1, Number(analysis.analysisScope?.userCommits || analysis.commitSummary?.totalCommits || 0)),
    }))
    .filter((item) => Number.isFinite(item.score));
  if (!validScores.length) return 0;
  const totalWeight = validScores.reduce((sum, item) => sum + item.weight, 0);
  return Math.round(validScores.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
};

const getUserLevelFromScore = (score) => {
  if (score >= 80) return 'advanced';
  if (score >= 45) return 'intermediate';
  return 'beginner';
};

const mergeUserContributionAnalyses = (analyses) => {
  const grouped = new Map();
  for (const analysis of analyses || []) {
    if (!Array.isArray(analysis?.skillVector) || !analysis.skillVector.length) continue;
    for (const skill of analysis.skillVector) {
      const canonicalSkillName = canonicalizeSkillName(skill.canonicalSkillName || skill.skill);
      if (!canonicalSkillName) continue;
      const key = normalizeKey(canonicalSkillName);
      const score = Number(skill.score || 0);
      const group = grouped.get(key) || {
        skill: canonicalSkillName,
        canonicalSkillName,
        normalizedSkillName: key,
        category: getCanonicalSkillCategory(canonicalSkillName),
        scores: [],
        levels: [],
        sources: [],
      };
      group.scores.push(score);
      group.levels.push(skill.level || 'missing');
      group.sources.push({
        repoName: analysis.repoName || '',
        analysisId: analysis._id,
        score,
        level: skill.level || 'missing',
      });
      grouped.set(key, group);
    }
  }

  const levelRank = { missing: 0, weak: 1, developing: 2, strong: 3 };
  return [...grouped.values()]
    .map((group) => {
      const maxScore = Math.max(...group.scores);
      const averageScore = group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length;
      const level = [...group.levels].sort((a, b) => (levelRank[b] || 0) - (levelRank[a] || 0))[0] || 'missing';
      return {
        skill: group.skill,
        canonicalSkillName: group.canonicalSkillName,
        normalizedSkillName: group.normalizedSkillName,
        category: group.category,
        score: roundScore(maxScore * 0.6 + averageScore * 0.4),
        level,
        evidence: group.sources.slice(0, 5),
        sources: group.sources.slice(0, 5).map((source) => source.repoName).filter(Boolean),
      };
    })
    .sort((a, b) => b.score - a.score);
};

const dedupeText = (values, limit = 12) => {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    const key = normalizeKey(text);
    if (text && !seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
    if (result.length >= limit) break;
  }
  return result;
};

const mergeMultiRepoAnalysisContext = ({ analyses, targetRole, sourceMode = 'all_analyzed_repos' }) => {
  const sources = (analyses || []).map((item) => (item.analysis ? item.analysis : item));
  const firstCommitDates = sources.map((analysis) => analysis.analysisScope?.firstCommitDate).filter(Boolean);
  const lastCommitDates = sources.map((analysis) => analysis.analysisScope?.lastCommitDate).filter(Boolean);
  const userReadinessScore = getWeightedAverageReadinessScore(sources);
  const userLevel = getUserLevelFromScore(userReadinessScore);
  const careerDirection = targetRole || sources[0]?.summary?.careerDirection || sources[0]?.careerDirection || '';
  const repositories = (analyses || []).map((item) => {
    const analysis = item.analysis || item;
    const repository = item.repository || null;
    const source = buildAnalysisSourceSummary({ analysis, repository, sourceMode: 'single_repo' });
    return {
      repositoryId: source.repositoryId,
      repoName: source.repoName,
      fullName: source.fullName,
      analysisId: source.analysisId,
      githubUsername: source.githubUsername,
      totalRepoCommits: source.totalRepoCommits,
      userCommits: source.userCommits,
      activeDays: source.activeDays,
      userLevel: source.userLevel,
      userReadinessScore: source.userReadinessScore,
      careerDirection: source.careerDirection,
      projectType: source.projectType,
    };
  });
  const analysisSource = {
    type: 'multi_repo_user_contribution_analysis',
    sourceMode,
    analysisIds: sources.map((analysis) => analysis._id),
    repositoryIds: sources.map((analysis) => analysis.repositoryId).filter(Boolean),
    repositories,
    githubUsername: repositories.find((repo) => repo.githubUsername)?.githubUsername || '',
    totalRepositories: sources.length,
    totalRepoCommits: sources.reduce((sum, analysis) => sum + Number(analysis.analysisScope?.totalRepoCommits || 0), 0),
    totalUserCommits: sources.reduce(
      (sum, analysis) => sum + Number(analysis.analysisScope?.userCommits || analysis.commitSummary?.totalCommits || 0),
      0
    ),
    activeDays: sources.reduce(
      (sum, analysis) => sum + Number(analysis.analysisScope?.activeDays || analysis.commitSummary?.activeDays || 0),
      0
    ),
    firstCommitDate: firstCommitDates.length ? firstCommitDates.sort()[0] : null,
    lastCommitDate: lastCommitDates.length ? lastCommitDates.sort().slice(-1)[0] : null,
    userLevel,
    userReadinessScore,
    careerDirection,
    projectType: 'Multi-repo portfolio',
  };
  const mergedSkillVector = mergeUserContributionAnalyses(sources);
  const detectedSkillSet = new Set(
    mergedSkillVector
      .filter((skill) => skill.level !== 'missing' && Number(skill.score || 0) > 0)
      .map((skill) => canonicalizeSkillName(skill.canonicalSkillName || skill.skill).toLowerCase())
  );
  const mergedAnalysis = {
    _id: null,
    userId: sources[0]?.userId,
    repoName: 'Multi-repo portfolio',
    fullName: 'Multi-repo portfolio',
    projectType: 'Multi-repo portfolio',
    careerDirection,
    summary: {
      careerDirection,
      userLevel,
      userReadinessScore,
      projectType: 'Multi-repo portfolio',
    },
    analysisScope: analysisSource,
    skillVector: mergedSkillVector,
    strengths: dedupeText(sources.flatMap((analysis) => analysis.strengths || []), 12),
    weaknesses: dedupeText(sources.flatMap((analysis) => analysis.weaknesses || []), 12),
    missingSkills: uniqueStrings(
      sources
        .flatMap((analysis) => analysis.missingSkills || [])
        .map(canonicalizeSkillName)
        .filter((skill) => !detectedSkillSet.has(skill.toLowerCase())),
      20
    ),
    recommendations: dedupeText(sources.flatMap((analysis) => analysis.recommendations || []), 12),
  };
  return { mergedAnalysis, analysisSource, roadmapSource: analysisSource };
};

const resolveUserContributionSource = async ({ userId, sourceMode, repoId, repoIds, targetRole }) => {
  const normalizedSourceMode = sourceMode || (repoId ? 'single_repo' : 'all_analyzed_repos');
  if (!SOURCE_MODES.includes(normalizedSourceMode)) {
    throw createStatusError('sourceMode must be one of: single_repo, all_analyzed_repos, selected_repos.', 400);
  }

  if (normalizedSourceMode === 'single_repo') {
    if (!repoId) throw createStatusError('repoId is required when sourceMode is single_repo.', 400);
    const repository = await findRepositoryForUser({ userId }, repoId);
    const analysis = await findLatestUserContributionAnalysis({ userId, repository, repoId });
    return {
      sourceMode: normalizedSourceMode,
      repository,
      analysis,
      analysisForGap: analysis,
      analysisSource: analysis ? buildAnalysisSourceSummary({ analysis, repository }) : null,
      selectedAnalysisIds: analysis ? [String(analysis._id)] : [],
      selectedRepositoryIds: [String(repository._id)],
    };
  }

  if (normalizedSourceMode === 'all_analyzed_repos') {
    const analyses = await findLatestUserContributionAnalysesForUser(userId);
    const merged = mergeMultiRepoAnalysisContext({ analyses, targetRole, sourceMode: normalizedSourceMode });
    return {
      sourceMode: normalizedSourceMode,
      analyses,
      analysisForGap: merged.mergedAnalysis,
      analysisSource: merged.analysisSource,
      mergedAnalysis: merged.mergedAnalysis,
      selectedAnalysisIds: merged.analysisSource.analysisIds.map(String),
      selectedRepositoryIds: merged.analysisSource.repositoryIds.map(String),
    };
  }

  if (!Array.isArray(repoIds) || repoIds.length < 1) {
    throw createStatusError('repoIds is required when sourceMode is selected_repos.', 400);
  }
  const selected = await findLatestUserContributionAnalysesByRepoIds(userId, repoIds);
  if (selected.missingRepoIds.length) {
    const error = createStatusError('Some selected repositories have not been analyzed yet.', 400);
    error.errors = [{ missingRepoIds: selected.missingRepoIds }];
    error.missingRepoIds = selected.missingRepoIds;
    throw error;
  }
  const merged = mergeMultiRepoAnalysisContext({
    analyses: selected.analyses,
    targetRole,
    sourceMode: normalizedSourceMode,
  });
  merged.analysisSource.repositoryIds = repoIds.map(String);
  return {
    sourceMode: normalizedSourceMode,
    analyses: selected.analyses,
    analysisForGap: merged.mergedAnalysis,
    analysisSource: merged.analysisSource,
    mergedAnalysis: merged.mergedAnalysis,
    selectedAnalysisIds: merged.analysisSource.analysisIds.map(String),
    selectedRepositoryIds: repoIds.map(String),
  };
};

module.exports = {
  buildAnalysisSourceSummary,
  findLatestUserContributionAnalysis,
  findLatestUserContributionAnalysesForUser,
  findLatestUserContributionAnalysesByRepoIds,
  mergeUserContributionAnalyses,
  mergeMultiRepoAnalysisContext,
  resolveUserContributionSource,
  findSnapshotForAnalysis,
  attachSnapshotProvenance,
};
