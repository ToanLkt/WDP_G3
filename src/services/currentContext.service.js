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
const selectorKeys = ['roadmapId', 'repositoryId', 'analysisId', 'snapshotId'];

const cleanSelectors = (selectors = {}) => selectorKeys.reduce((output, key) => {
  const value = selectors?.[key];
  output[key] = value ? String(value) : null;
  return output;
}, {});

const hasSelectors = (selectors = {}) => selectorKeys.some((key) => Boolean(selectors?.[key]));

const getSelectorReason = (selectors = {}, source = 'body') => {
  if (selectors.roadmapId) return `${source}_roadmap`;
  if (selectors.repositoryId) return `${source}_repository`;
  if (selectors.analysisId || selectors.snapshotId) return `${source}_analysis`;
  return null;
};

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

const selectContextInput = ({ bodySelectors = {}, sessionSelectors = {} } = {}) => {
  const body = cleanSelectors(bodySelectors);
  const session = cleanSelectors(sessionSelectors);
  if (body.roadmapId) return { selectors: { roadmapId: body.roadmapId }, reason: 'body_roadmap', source: 'body' };
  if (body.repositoryId) return { selectors: { repositoryId: body.repositoryId }, reason: 'body_repository', source: 'body' };
  if (body.analysisId || body.snapshotId) {
    return {
      selectors: { analysisId: body.analysisId, snapshotId: body.snapshotId },
      reason: 'body_analysis',
      source: 'body',
    };
  }
  if (session.roadmapId) return { selectors: { roadmapId: session.roadmapId }, reason: 'session_roadmap', source: 'session' };
  if (session.repositoryId) return { selectors: { repositoryId: session.repositoryId }, reason: 'session_repository', source: 'session' };
  if (session.analysisId || session.snapshotId) {
    return {
      selectors: { analysisId: session.analysisId, snapshotId: session.snapshotId },
      reason: 'session_analysis',
      source: 'session',
    };
  }
  return { selectors: {}, reason: 'latest_user_analysis', source: 'latest' };
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
    ...main.flatMap((phase) => (phase.tasks || []).map((task) => ({ ...task, phase: phase.title || phase.name || phase.phase || '' }))),
    ...alternatives.flatMap((path) => (path.tasks || []).map((task) => ({ ...task, phase: path.title || path.name || path.role || '' }))),
  ].map((task) => ({
    itemId: String(task.itemId || ''),
    title: String(task.title || task.taskTitle || ''),
    taskTitle: String(task.taskTitle || task.title || ''),
    skillName: String(task.skillName || ''),
    canonicalSkillName: canonicalizeSkillName(task.canonicalSkillName || task.skillName || task.title),
    week: task.week ?? null,
    phase: task.phase || '',
    priority: task.priority || 'medium',
    estimatedHours: task.estimatedHours ?? null,
    description: String(task.description || '').slice(0, 240),
  })).filter((task) => task.itemId);
};

const buildProgressContext = (roadmap, progress) => {
  if (!roadmap) return null;
  const statuses = new Map((progress?.items || []).map((item) => [String(item.itemId), item]));
  const tasks = taskList(roadmap).map((task) => ({
    ...task,
    status: statuses.get(task.itemId)?.status || 'not_started',
    progressPercent: Number(statuses.get(task.itemId)?.progressPercent || 0),
    startedAt: statuses.get(task.itemId)?.startedAt || null,
    completedAt: statuses.get(task.itemId)?.completedAt || null,
  }));
  const summary = progress?.progressSummary || roadmap.progressSummary || {};
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const byPriorityAndWeek = (left, right) => (
    (priorityRank[String(left.priority || '').toLowerCase()] ?? 1)
    - (priorityRank[String(right.priority || '').toLowerCase()] ?? 1)
  ) || Number(left.week || 999) - Number(right.week || 999);
  const inProgressTasks = tasks.filter((task) => task.status === 'in_progress').sort(byPriorityAndWeek).slice(0, 8);
  const pendingTasks = tasks.filter((task) => task.status === 'not_started').sort(byPriorityAndWeek).slice(0, 12);
  const completedTasks = tasks
    .filter((task) => task.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .slice(0, 8);
  return {
    roadmapId: stringId(roadmap._id),
    targetRole: roadmap.targetRole || '',
    durationWeeks: roadmap.durationWeeks || null,
    totalTasks: Number(summary.totalItems ?? tasks.length),
    completedTasks,
    inProgressTasks,
    pendingTasks,
    nextRecommendedTasks: [...inProgressTasks, ...pendingTasks].slice(0, 8),
    overallProgress: Number(summary.overallProgress ?? progress?.overallProgress ?? 0),
    recentlyCompletedTasks: completedTasks.slice(0, 5),
    recentlyCompletedTask: completedTasks[0] || null,
    updatedAt: progress?.updatedAt || null,
  };
};

const resolveCurrentContext = async (userId, selectors = {}) => {
  const input = selectors && (selectors.bodySelectors || selectors.sessionSelectors)
    ? selectContextInput(selectors)
    : {
        selectors: cleanSelectors(selectors),
        reason: getSelectorReason(cleanSelectors(selectors), 'body') || 'latest_user_analysis',
        source: hasSelectors(selectors) ? 'body' : 'latest',
      };
  const selectedSelectors = input.selectors;
  let roadmap = null;
  if (selectedSelectors.roadmapId) {
    if (!validId(selectedSelectors.roadmapId)) throw createStatusError('Invalid Roadmap', 400);
    roadmap = await Roadmap.findOne({ _id: selectedSelectors.roadmapId, userId, isDeleted: { $ne: true } }).lean();
    if (!roadmap) throw createStatusError('Roadmap not found', 404);
  }
  const analysis = await findCurrentAnalysis(userId, selectedSelectors, roadmap);
  let legacyFallback = false;
  let resolvedAnalysis = analysis;
  let contextSelectionReason = input.reason;
  if (!resolvedAnalysis && !selectedSelectors.analysisId && !selectedSelectors.snapshotId && !roadmap) {
    const legacyQuery = { userId };
    if (selectedSelectors.repositoryId) legacyQuery.repositoryId = selectedSelectors.repositoryId;
    resolvedAnalysis = await LegacyAnalysisSnapshot.findOne(legacyQuery).sort({ analyzedAt: -1, createdAt: -1 }).lean();
    legacyFallback = Boolean(resolvedAnalysis);
    if (legacyFallback) contextSelectionReason = 'legacy_snapshot';
    if (legacyFallback) console.warn('[context-resolver]', { reasonCode: 'legacy_analysis_snapshot_fallback', userId: String(userId), repositoryId: stringId(resolvedAnalysis.repositoryId) });
  }
  if (!resolvedAnalysis) throw createStatusError('Repository analysis not found', 404);

  const source = roadmap?.roadmapSource && typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : {};
  const requestedSnapshotId = roadmap ? source.snapshotId : selectedSelectors.snapshotId;
  const snapshot = legacyFallback ? null : await findSnapshot(userId, {
    snapshotId: requestedSnapshotId,
    analysisId: resolvedAnalysis._id,
  });
  const repositoryId = roadmap?.repositoryId || resolvedAnalysis.repositoryId || selectedSelectors.repositoryId;
  const repository = repositoryId
    ? await Repository.findOne({ _id: repositoryId, userId }).select('name fullName description language topics pushedAt').lean()
    : null;
  const progress = roadmap
    ? await RoadmapProgress.findOne({ userId, roadmapId: roadmap._id }).lean()
    : null;
  const progressContext = buildProgressContext(roadmap, progress);
  const provenance = {
    repositoryId: stringId(repository?._id || resolvedAnalysis.repositoryId),
    repoName: repository?.name || resolvedAnalysis.repoName || '',
    analysisId: legacyFallback ? null : stringId(resolvedAnalysis._id),
    snapshotId: stringId(snapshot?._id),
    roadmapId: stringId(roadmap?._id),
    progressUpdatedAt: progress?.updatedAt || null,
    analysisSource: legacyFallback ? 'legacy_analysis_snapshot' : 'analysis_result',
    contextSelectionReason,
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
    contextSelectionReason,
    legacyFallback,
  };
};

module.exports = { resolveCurrentContext, getTopSkills, getMissingSkills, buildProgressContext };
