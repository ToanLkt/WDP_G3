const mongoose = require('mongoose');

const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const { createStatusError } = require('./github/github.utils');
const { createAutomaticNotification } = require('./notification.service');
const normalizeText = require('../utils/normalizeText');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');

const ALLOWED_STATUSES = ['not_started', 'in_progress', 'completed'];

const getUserId = (authUserOrId) => {
  const userId =
    typeof authUserOrId === 'string'
      ? authUserOrId
      : authUserOrId?.userId || authUserOrId?._id || authUserOrId?.id;

  if (!userId) {
    throw createStatusError('Unauthorized', 401);
  }

  return String(userId);
};

function getItemProgressPercent(status, progressPercent) {
  if (status === 'completed') {
    return 100;
  }

  if (status === 'in_progress') {
    const value = Number(progressPercent);
    if (Number.isFinite(value)) {
      return Math.min(99, Math.max(1, Math.round(value)));
    }
    return 50;
  }

  return 0;
}

const calculateProgressSummary = (items = []) => {
  const validItems = (Array.isArray(items) ? items : []).filter((item) => String(item.itemId || '').trim());
  const totalItems = validItems.length;
  const completedItems = validItems.filter((item) => item.status === 'completed').length;
  const inProgressItems = validItems.filter((item) => item.status === 'in_progress').length;
  return {
    totalItems,
    completedItems,
    inProgressItems,
    overallProgress: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
  };
};

const applyItemStatus = (item, status, progressPercent, now = new Date()) => {
  const wasCompleted = item.status === 'completed';
  item.status = status;
  item.progressPercent = getItemProgressPercent(status, progressPercent);
  if (status === 'in_progress') {
    if (!item.startedAt) item.startedAt = now;
    item.completedAt = null;
  } else if (status === 'completed') {
    if (!item.startedAt) item.startedAt = now;
    if (!wasCompleted || !item.completedAt) item.completedAt = now;
  } else {
    item.startedAt = null;
    item.completedAt = null;
  }
  item.updatedAt = now;
  return item;
};

function calculateOverallProgress(items) {
  return calculateProgressSummary(items).overallProgress;
}

const readSkillName = (item) => {
  if (typeof item === 'string') {
    return item;
  }

  if (!item || typeof item !== 'object') {
    return '';
  }

  return item.canonicalSkillName || item.skillName || item.skill || item.name || item.title || item.label || '';
};

const slugifySkill = (value) =>
  normalizeText(canonicalizeSkillName(value)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';

const buildTaskItemId = ({ scope = 'main', phaseIndex = 0, taskIndex = 0, canonicalSkillName }) =>
  scope === 'alt'
    ? `alt-${Number(phaseIndex) + 1}-task-${Number(taskIndex) + 1}-${slugifySkill(canonicalSkillName)}`
    : `main-${Number(phaseIndex) + 1}-${Number(taskIndex) + 1}-${slugifySkill(canonicalSkillName)}`;

const normalizePriority = (priority) => {
  if (['high', 'medium', 'low'].includes(priority)) return priority;
  const value = Number(priority || 0);
  if (value <= 1) return 'high';
  if (value <= 3) return 'medium';
  return 'low';
};

const mapTaskToProgressItem = (task, { scope, phaseIndex, taskIndex, targetRole, level } = {}) => {
  if (!task || typeof task !== 'object') return null;
  const canonicalSkillName = canonicalizeSkillName(task.canonicalSkillName || task.skillName || task.skill || task.title || '');
  if (!canonicalSkillName) return null;
  const itemId = String(task.itemId || '').trim() || buildTaskItemId({ scope, phaseIndex, taskIndex, canonicalSkillName });
  if (!itemId) return null;
  return {
    itemId,
    title: String(task.title || `Task ${Number(taskIndex || 0) + 1}`).trim(),
    skillName: canonicalSkillName,
    canonicalSkillName,
    normalizedSkillName: normalizeText(canonicalSkillName),
    category: getCanonicalSkillCategory(canonicalSkillName),
    targetRole: String(task.targetRole || targetRole || '').trim(),
    level: String(task.level || level || '').trim(),
    priority: normalizePriority(task.priority),
    status: 'not_started',
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
  };
};

function extractRoadmapSkills(roadmap) {
  const items = [];
  const seen = new Set();
  const addItem = (item) => {
    if (!item || !item.itemId || seen.has(item.itemId)) return;
    seen.add(item.itemId);
    items.push(item);
  };

  const mainPhases = Array.isArray(roadmap?.mainRoadmap?.phases)
    ? roadmap.mainRoadmap.phases
    : Array.isArray(roadmap?.mainPath?.phases)
      ? roadmap.mainPath.phases
      : [];
  mainPhases.forEach((phase, phaseIndex) => {
    (Array.isArray(phase?.tasks) ? phase.tasks : []).forEach((task, taskIndex) =>
      addItem(mapTaskToProgressItem(task, {
        scope: 'main',
        phaseIndex,
        taskIndex,
        targetRole: roadmap?.targetRole,
        level: roadmap?.effectiveLevel,
      }))
    );
  });

  (Array.isArray(roadmap?.alternativeRoadmaps) ? roadmap.alternativeRoadmaps : []).forEach((path, pathIndex) => {
    (Array.isArray(path?.tasks) ? path.tasks : []).forEach((task, taskIndex) =>
      addItem(mapTaskToProgressItem(task, {
        scope: 'alt',
        phaseIndex: pathIndex,
        taskIndex,
        targetRole: path?.targetRole || roadmap?.targetRole,
        level: roadmap?.effectiveLevel,
      }))
    );
  });

  return items;
}

const formatProgress = (progress) => {
  const doc = typeof progress.toObject === 'function' ? progress.toObject() : progress;
  const items = (doc.items || [])
    .filter((item) => String(item.itemId || '').trim())
    .map((item) => ({
      itemId: item.itemId,
      title: item.title || '',
      skillName: item.skillName || item.canonicalSkillName || '',
      canonicalSkillName: item.canonicalSkillName || item.skillName || '',
      category: item.category || getCanonicalSkillCategory(item.canonicalSkillName || item.skillName || ''),
      targetRole: item.targetRole || '',
      level: item.level || '',
      priority: normalizePriority(item.priority),
      status: item.status || 'not_started',
      progressPercent: Number(item.progressPercent || 0),
      startedAt: item.startedAt || null,
      completedAt: item.completedAt || null,
      updatedAt: item.updatedAt || null,
    }));
  const progressSummary = doc.progressSummary || calculateProgressSummary(items);

  return {
    roadmapId: doc.roadmapId,
    progressSummary,
    items,
  };
};

const getOwnedRoadmap = async (userId, roadmapId) => {
  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId, isDeleted: { $ne: true } }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return roadmap;
};

const buildProgressItemsFromRoadmap = (roadmap, now = new Date()) =>
  extractRoadmapSkills(roadmap).map((task) => ({
    ...task,
    updatedAt: now,
  }));

const syncRoadmapProgressSummary = async (roadmapId, progressSummary) => {
  await Roadmap.updateOne({ _id: roadmapId }, { $set: { progressSummary } });
};

const syncProgressWithRoadmapTasks = async (progress, roadmap) => {
  const now = new Date();
  const taskItems = buildProgressItemsFromRoadmap(roadmap, now);
  const existingByItemId = new Map(
    (progress.items || [])
      .filter((item) => String(item.itemId || '').trim())
      .map((item) => [String(item.itemId), item])
  );
  const signature = (item) =>
    [canonicalizeSkillName(item.canonicalSkillName || item.skillName), String(item.title || '').trim().toLowerCase()]
      .join('|');
  const existingBySignature = new Map(
    (progress.items || [])
      .filter((item) => String(item.itemId || '').trim())
      .map((item) => [signature(item), item])
  );
  const mergedItems = taskItems.map((task) => {
    const existing = existingByItemId.get(task.itemId) || existingBySignature.get(signature(task));
    if (!existing) return task;
    return {
      ...task,
      status: existing.status || 'not_started',
      progressPercent: Number(existing.progressPercent || 0),
      startedAt: existing.startedAt || null,
      completedAt: existing.completedAt || null,
      updatedAt: existing.updatedAt || now,
    };
  });
  const needsSync =
    mergedItems.length !== (progress.items || []).filter((item) => String(item.itemId || '').trim()).length ||
    mergedItems.some((item, index) => item.itemId !== progress.items?.[index]?.itemId);
  const progressSummary = calculateProgressSummary(mergedItems);

  if (needsSync || progress.overallProgress !== progressSummary.overallProgress) {
    progress.items = mergedItems;
    progress.progressSummary = progressSummary;
    progress.overallProgress = progressSummary.overallProgress;
    await progress.save();
  }
  await syncRoadmapProgressSummary(progress.roadmapId, progressSummary);
  return progress;
};

const getOrCreateRoadmapProgress = async (authUserOrId, roadmapId) => {
  const userId = getUserId(authUserOrId);
  const roadmap = await getOwnedRoadmap(userId, roadmapId);

  const existing = await RoadmapProgress.findOne({ userId, roadmapId });
  if (existing) {
    return syncProgressWithRoadmapTasks(existing, roadmap);
  }

  const now = new Date();
  const items = buildProgressItemsFromRoadmap(roadmap, now);
  const progressSummary = calculateProgressSummary(items);

  const progress = await RoadmapProgress.create({
    userId,
    roadmapId,
    items,
    progressSummary,
    overallProgress: progressSummary.overallProgress,
  });
  await syncRoadmapProgressSummary(roadmapId, progressSummary);
  return progress;
};

const getRoadmapProgress = async (authUserOrId, roadmapId) => {
  const progress = await getOrCreateRoadmapProgress(authUserOrId, roadmapId);

  return {
    message: 'Roadmap progress fetched successfully',
    data: formatProgress(progress),
    statusCode: 200,
  };
};

const updateRoadmapItemStatus = async (authUserOrId, roadmapId, { itemId, skillName, status, progressPercent } = {}) => {
  if (!String(itemId || skillName || '').trim()) {
    throw createStatusError('itemId or skillName is required', 400);
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createStatusError('Invalid roadmap progress status', 400);
  }

  const progress = await getOrCreateRoadmapProgress(authUserOrId, roadmapId);
  const normalizedSkillName = normalizeText(skillName);
  const canonicalNormalizedSkillName = normalizeText(canonicalizeSkillName(skillName));
  const normalizedItemId = String(itemId || '').trim();
  let item = normalizedItemId
    ? progress.items.find((progressItem) => progressItem.itemId === normalizedItemId)
    : null;

  if (!item && !normalizedItemId && normalizedSkillName) {
    const matches = progress.items.filter(
      (progressItem) =>
        progressItem.normalizedSkillName === normalizedSkillName ||
        progressItem.normalizedSkillName === canonicalNormalizedSkillName
    );
    if (matches.length > 1) {
      throw createStatusError('Multiple roadmap items match this skillName. Please use itemId.', 400);
    }
    item = matches[0] || null;
  }

  if (!item) {
    throw createStatusError('Roadmap progress item not found', 404);
  }

  const now = new Date();
  const previousOverallProgress = Number(progress.overallProgress || 0);
  applyItemStatus(item, status, progressPercent, now);
  progress.items = progress.items.filter((progressItem) => String(progressItem.itemId || '').trim());
  const progressSummary = calculateProgressSummary(progress.items);
  progress.progressSummary = progressSummary;
  progress.overallProgress = progressSummary.overallProgress;
  await progress.save();
  await syncRoadmapProgressSummary(roadmapId, progressSummary);

  if (previousOverallProgress < 100 && progress.overallProgress === 100) {
    const roadmap = await Roadmap.findOne({ _id: roadmapId, userId: progress.userId })
      .select('targetRole mainPath.title')
      .lean();
    const roadmapTitle = roadmap?.mainPath?.title || roadmap?.targetRole || 'roadmap';

    await createAutomaticNotification({
      userId: progress.userId,
      title: 'Roadmap đã hoàn thành',
      message: `Bạn đã hoàn thành 100% roadmap ${roadmapTitle}.`,
      type: 'ROADMAP_TASK_REMINDER',
      metadata: {
        event: 'roadmap_completed',
        roadmapId: progress.roadmapId,
        targetRole: roadmap?.targetRole || '',
        completedSkillName: item.skillName,
        overallProgress: progress.overallProgress,
      },
    });
  }

  return {
    message: 'Roadmap item progress updated successfully',
    data: formatProgress(progress),
    statusCode: 200,
  };
};

const resetRoadmapProgress = async (authUserOrId, roadmapId) => {
  const progress = await getOrCreateRoadmapProgress(authUserOrId, roadmapId);
  const now = new Date();

  for (const item of progress.items) {
    item.status = 'not_started';
    item.progressPercent = 0;
    item.startedAt = null;
    item.completedAt = null;
    item.updatedAt = now;
  }

  progress.items = progress.items.filter((item) => String(item.itemId || '').trim());
  const progressSummary = calculateProgressSummary(progress.items);
  progress.progressSummary = progressSummary;
  progress.overallProgress = progressSummary.overallProgress;
  await progress.save();
  await syncRoadmapProgressSummary(roadmapId, progressSummary);

  return {
    message: 'Roadmap progress reset successfully',
    data: formatProgress(progress),
    statusCode: 200,
  };
};

module.exports = {
  getItemProgressPercent,
  calculateOverallProgress,
  applyItemStatus,
  extractRoadmapSkills,
  getOrCreateRoadmapProgress,
  getRoadmapProgress,
  updateRoadmapItemStatus,
  resetRoadmapProgress,
};
