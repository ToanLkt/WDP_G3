const mongoose = require('mongoose');

const AnalysisResult = require('../models/AnalysisResult');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const LegacyAnalysisSnapshot = require('../models/AnalysisSnapshot');
const Repository = require('../models/Repository');
const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const { createStatusError } = require('./github/github.utils');
const { canonicalizeSkillName } = require('../utils/skillCanonicalizer');

const validId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const stringId = (value) => (value ? String(value) : null);

const ownedById = async (Model, userId, id, label) => {
  if (!validId(id)) throw createStatusError(`Invalid ${label}`, 400);
  const document = await Model.findOne({ _id: id, userId }).lean();
  if (!document) throw createStatusError(`${label} not found`, 404);
  return document;
};

const readAnalysisIdFromRoadmap = (roadmap = {}) => {
  const source = roadmap.roadmapSource && typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : {};
  return source.analysisId || source.analysisIds?.[0] || null;
};

const findSnapshot = async (userId, { snapshotId, analysisId } = {}) => {
  if (snapshotId) return ownedById(RepoAnalysisSnapshot, userId, snapshotId, 'Snapshot');
  if (!analysisId) return null;
  return RepoAnalysisSnapshot.findOne({ userId, analysisResultId: analysisId })
    .sort({ createdAt: -1 })
    .lean();
};

const findCurrentAnalysis = async (userId, selectors = {}, roadmap = null) => {
  const pinnedAnalysisId = roadmap ? readAnalysisIdFromRoadmap(roadmap) : null;
  if (pinnedAnalysisId) return ownedById(AnalysisResult, userId, pinnedAnalysisId, 'Analysis');
  if (selectors.repositoryId) {
    const repository = await ownedById(Repository, userId, selectors.repositoryId, 'Repository');
    return AnalysisResult.findOne({ userId, repositoryId: repository._id }).sort({ analyzedAt: -1, createdAt: -1 }).lean();
  }
  if (selectors.analysisId) return ownedById(AnalysisResult, userId, selectors.analysisId, 'Analysis');
  if (selectors.snapshotId) {
    const snapshot = await ownedById(RepoAnalysisSnapshot, userId, selectors.snapshotId, 'Snapshot');
    if (snapshot.analysisResultId) {
      return ownedById(AnalysisResult, userId, snapshot.analysisResultId, 'Analysis');
    }
    return null;
  }
  const query = { userId };
  return AnalysisResult.findOne(query).sort({ analyzedAt: -1, createdAt: -1 }).lean();
};

const getTopSkills = (analysis = {}) => (analysis.skillVector || [])
  .filter((skill) => skill && skill.level !== 'missing' && Number(skill.score || 0) > 0)
  .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
  .slice(0, 10)
  .map((skill) => ({
    skillName: canonicalizeSkillName(skill.canonicalSkillName || skill.skill),
    canonicalSkillName: canonicalizeSkillName(skill.canonicalSkillName || skill.skill),
    score: Number(skill.score || 0),
    level: skill.level || '',
  }));

const getMissingSkills = (analysis = {}) => [...new Set((analysis.missingSkills || [])
  .map((skill) => canonicalizeSkillName(skill.canonicalSkillName || skill.skill || skill))
  .filter(Boolean))].slice(0, 15);

const taskList = (roadmap = {}) => {
  const main = roadmap.mainRoadmap?.phases || roadmap.mainPath?.phases || [];
  const alternatives = roadmap.alternativeRoadmaps || [];
  return [
    ...main.flatMap((phase) => phase.tasks || []),
    ...alternatives.flatMap((path) => path.tasks || []),
  ].map((task) => ({
    itemId: String(task.itemId || ''),
    title: String(task.title || ''),
    canonicalSkillName: canonicalizeSkillName(task.canonicalSkillName || task.skillName || task.title),
  })).filter((task) => task.itemId);
};

const buildProgressContext = (roadmap, progress) => {
  if (!roadmap) return null;
  const statuses = new Map((progress?.items || []).map((item) => [String(item.itemId), item]));
  const tasks = taskList(roadmap).map((task) => ({
    ...task,
    status: statuses.get(task.itemId)?.status || 'not_started',
    completedAt: statuses.get(task.itemId)?.completedAt || null,
  }));
  const summary = progress?.progressSummary || roadmap.progressSummary || {};
  return {
    totalTasks: Number(summary.totalItems ?? tasks.length),
    completedTasks: tasks.filter((task) => task.status === 'completed'),
    inProgressTasks: tasks.filter((task) => task.status === 'in_progress'),
    pendingTasks: tasks.filter((task) => task.status === 'not_started'),
    overallProgress: Number(summary.overallProgress ?? progress?.overallProgress ?? 0),
    recentlyCompletedTask: tasks
      .filter((task) => task.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))[0] || null,
    updatedAt: progress?.updatedAt || null,
  };
};

const resolveCurrentContext = async (userId, selectors = {}) => {
  let roadmap = null;
  if (selectors.roadmapId) roadmap = await ownedById(Roadmap, userId, selectors.roadmapId, 'Roadmap');
  const analysis = await findCurrentAnalysis(userId, selectors, roadmap);
  let legacyFallback = false;
  let resolvedAnalysis = analysis;
  if (!resolvedAnalysis && !selectors.analysisId && !selectors.snapshotId && !roadmap) {
    const legacyQuery = { userId };
    if (selectors.repositoryId) legacyQuery.repositoryId = selectors.repositoryId;
    resolvedAnalysis = await LegacyAnalysisSnapshot.findOne(legacyQuery).sort({ analyzedAt: -1, createdAt: -1 }).lean();
    legacyFallback = Boolean(resolvedAnalysis);
    if (legacyFallback) console.warn('[context-resolver]', { reasonCode: 'legacy_analysis_snapshot_fallback', userId: String(userId), repositoryId: stringId(resolvedAnalysis.repositoryId) });
  }
  if (!resolvedAnalysis) throw createStatusError('Repository analysis not found', 404);

  const source = roadmap?.roadmapSource && typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : {};
  const requestedSnapshotId = roadmap ? source.snapshotId : selectors.snapshotId;
  const snapshot = legacyFallback ? null : await findSnapshot(userId, {
    snapshotId: requestedSnapshotId,
    analysisId: resolvedAnalysis._id,
  });
  const repositoryId = roadmap?.repositoryId || resolvedAnalysis.repositoryId || selectors.repositoryId;
  const repository = repositoryId
    ? await Repository.findOne({ _id: repositoryId, userId }).select('name fullName description language topics pushedAt').lean()
    : null;
  const progress = roadmap
    ? await RoadmapProgress.findOne({ userId, roadmapId: roadmap._id }).lean()
    : null;
  const progressContext = buildProgressContext(roadmap, progress);
  const provenance = {
    repositoryId: stringId(repository?._id || resolvedAnalysis.repositoryId),
    analysisId: legacyFallback ? null : stringId(resolvedAnalysis._id),
    snapshotId: stringId(snapshot?._id),
    roadmapId: stringId(roadmap?._id),
    progressUpdatedAt: progress?.updatedAt || null,
    analysisSource: legacyFallback ? 'legacy_analysis_snapshot' : 'analysis_result',
  };
  return {
    analysis: resolvedAnalysis,
    snapshot,
    repository,
    roadmap,
    progress,
    progressContext,
    topSkills: getTopSkills(resolvedAnalysis),
    missingSkills: getMissingSkills(resolvedAnalysis),
    provenance,
    legacyFallback,
  };
};

module.exports = { resolveCurrentContext, getTopSkills, getMissingSkills, buildProgressContext };
