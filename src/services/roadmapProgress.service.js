const mongoose = require('mongoose');

const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const { createStatusError } = require('./github/github.utils');
const normalizeText = require('../utils/normalizeText');

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

function getItemProgressPercent(status) {
  if (status === 'completed') {
    return 100;
  }

  if (status === 'in_progress') {
    return 50;
  }

  return 0;
}

function calculateOverallProgress(items) {
  if (!items || items.length === 0) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + Number(item.progressPercent || 0), 0);
  return Math.round(total / items.length);
}

const readSkillName = (item) => {
  if (typeof item === 'string') {
    return item;
  }

  if (!item || typeof item !== 'object') {
    return '';
  }

  return item.skillName || item.skill || item.name || item.title || item.label || '';
};

const addSkill = (skills, seen, value) => {
  const skillName = String(readSkillName(value) || '').trim();
  const normalizedSkillName = normalizeText(skillName);

  if (!skillName || !normalizedSkillName || seen.has(normalizedSkillName)) {
    return;
  }

  seen.add(normalizedSkillName);
  skills.push({ skillName, normalizedSkillName });
};

const addList = (skills, seen, values) => {
  if (!Array.isArray(values)) {
    return;
  }

  for (const value of values) {
    addSkill(skills, seen, value);
  }
};

function extractRoadmapSkills(roadmap) {
  const skills = [];
  const seen = new Set();

  addList(skills, seen, roadmap?.items);
  addList(skills, seen, roadmap?.skills);
  addList(skills, seen, roadmap?.steps);
  addList(skills, seen, roadmap?.roadmapItems);
  addList(skills, seen, roadmap?.data?.items);

  const phases = [
    ...(Array.isArray(roadmap?.phases) ? roadmap.phases : []),
    ...(Array.isArray(roadmap?.mainPath?.phases) ? roadmap.mainPath.phases : []),
  ];

  for (const phase of phases) {
    addList(skills, seen, phase?.skills);
    addList(skills, seen, phase?.items);
    addList(skills, seen, phase?.steps);

    if (Array.isArray(phase?.tasks)) {
      for (const task of phase.tasks) {
        addList(skills, seen, task?.skillTags);
        addList(skills, seen, task?.skills);
      }
    }
  }

  if (Array.isArray(roadmap?.supportingPaths)) {
    for (const path of roadmap.supportingPaths) {
      addList(skills, seen, path?.skills);
    }
  }

  return skills;
}

const formatProgress = (progress) => {
  const doc = typeof progress.toObject === 'function' ? progress.toObject() : progress;

  return {
    _id: doc._id,
    userId: doc.userId,
    roadmapId: doc.roadmapId,
    overallProgress: doc.overallProgress || 0,
    items: doc.items || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const getOwnedRoadmap = async (userId, roadmapId) => {
  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return roadmap;
};

const getOrCreateRoadmapProgress = async (authUserOrId, roadmapId) => {
  const userId = getUserId(authUserOrId);
  const roadmap = await getOwnedRoadmap(userId, roadmapId);

  const existing = await RoadmapProgress.findOne({ userId, roadmapId });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const items = extractRoadmapSkills(roadmap).map((skill) => ({
    skillName: skill.skillName,
    normalizedSkillName: skill.normalizedSkillName,
    status: 'not_started',
    progressPercent: 0,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }));

  return RoadmapProgress.create({
    userId,
    roadmapId,
    items,
    overallProgress: 0,
  });
};

const getRoadmapProgress = async (authUserOrId, roadmapId) => {
  const progress = await getOrCreateRoadmapProgress(authUserOrId, roadmapId);

  return {
    message: 'Roadmap progress fetched successfully',
    data: formatProgress(progress),
    statusCode: 200,
  };
};

const updateRoadmapItemStatus = async (authUserOrId, roadmapId, { skillName, status } = {}) => {
  if (!String(skillName || '').trim()) {
    throw createStatusError('skillName is required', 400);
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createStatusError('Invalid roadmap progress status', 400);
  }

  const progress = await getOrCreateRoadmapProgress(authUserOrId, roadmapId);
  const normalizedSkillName = normalizeText(skillName);
  const item = progress.items.find((progressItem) => progressItem.normalizedSkillName === normalizedSkillName);

  if (!item) {
    throw createStatusError('Roadmap progress item not found', 404);
  }

  const now = new Date();
  item.status = status;
  item.progressPercent = getItemProgressPercent(status);

  if (status === 'in_progress') {
    if (!item.startedAt) {
      item.startedAt = now;
    }
    item.completedAt = null;
  } else if (status === 'completed') {
    if (!item.startedAt) {
      item.startedAt = now;
    }
    item.completedAt = now;
  } else {
    item.startedAt = null;
    item.completedAt = null;
  }

  item.updatedAt = now;
  progress.overallProgress = calculateOverallProgress(progress.items);
  await progress.save();

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

  progress.overallProgress = 0;
  await progress.save();

  return {
    message: 'Roadmap progress reset successfully',
    data: formatProgress(progress),
    statusCode: 200,
  };
};

module.exports = {
  getItemProgressPercent,
  calculateOverallProgress,
  extractRoadmapSkills,
  getOrCreateRoadmapProgress,
  getRoadmapProgress,
  updateRoadmapItemStatus,
  resetRoadmapProgress,
};
