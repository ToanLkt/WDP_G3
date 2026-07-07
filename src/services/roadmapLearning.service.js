const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const LearningContent = require('../models/LearningContent');
const { createStatusError } = require('./github/github.utils');
const learningService = require('./learning.service');
const normalizeText = require('../utils/normalizeText');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');

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

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === true || value === 'true';
};

const normalizePriority = (priority) => {
  if (['high', 'medium', 'low'].includes(priority)) return priority;
  const value = Number(priority || 0);
  if (value <= 1) return 'high';
  if (value <= 3) return 'medium';
  return 'low';
};

const slugifySkill = (value) =>
  normalizeText(canonicalizeSkillName(value)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';

const buildTaskItemId = ({ scope = 'main', phaseIndex = 0, taskIndex = 0, canonicalSkillName }) =>
  scope === 'alt'
    ? `alt-${Number(phaseIndex) + 1}-task-${Number(taskIndex) + 1}-${slugifySkill(canonicalSkillName)}`
    : `main-${Number(phaseIndex) + 1}-${Number(taskIndex) + 1}-${slugifySkill(canonicalSkillName)}`;

const getUserRoadmapOrThrow = async (userId, roadmapId) => {
  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }
  return roadmap;
};

const mapTask = (task, { scope, phaseIndex, taskIndex, roadmap, path } = {}) => {
  if (!task || typeof task !== 'object') return null;
  const canonicalSkillName = canonicalizeSkillName(task.canonicalSkillName || task.skillName || task.skill || task.title || '');
  if (!canonicalSkillName) return null;
  const itemId = buildTaskItemId({
    scope,
    phaseIndex,
    taskIndex,
    canonicalSkillName,
  });
  if (!itemId) return null;
  return {
    itemId,
    title: String(task.title || `Task ${Number(taskIndex || 0) + 1}`).trim(),
    description: String(task.description || '').trim(),
    skillName: canonicalSkillName,
    canonicalSkillName,
    category: getCanonicalSkillCategory(canonicalSkillName),
    targetRole: String(task.targetRole || path?.targetRole || roadmap?.targetRole || '').trim(),
    level: String(task.level || roadmap?.effectiveLevel || roadmap?.requestedLevel || 'beginner').trim() || 'beginner',
    week: Number.isFinite(Number(task.week)) ? Number(task.week) : Number(phaseIndex || 0) + 1,
    priority: normalizePriority(task.priority),
    estimatedHours: Number.isFinite(Number(task.estimatedHours)) ? Number(task.estimatedHours) : 0,
    roadmapReason: String(path?.reason || roadmap?.mainRoadmap?.reason || roadmap?.mainPath?.reason || '').trim(),
  };
};

const extractRoadmapTasks = (roadmap) => {
  const items = [];
  const seen = new Set();
  const add = (task) => {
    if (!task || !task.itemId || seen.has(task.itemId)) return;
    seen.add(task.itemId);
    items.push(task);
  };

  const mainPhases = Array.isArray(roadmap?.mainRoadmap?.phases)
    ? roadmap.mainRoadmap.phases
    : Array.isArray(roadmap?.mainPath?.phases)
      ? roadmap.mainPath.phases
      : [];
  mainPhases.forEach((phase, phaseIndex) => {
    (Array.isArray(phase?.tasks) ? phase.tasks : []).forEach((task, taskIndex) =>
      add(mapTask(task, { scope: 'main', phaseIndex, taskIndex, roadmap }))
    );
  });

  (Array.isArray(roadmap?.alternativeRoadmaps) ? roadmap.alternativeRoadmaps : []).forEach((path, pathIndex) => {
    (Array.isArray(path?.tasks) ? path.tasks : []).forEach((task, taskIndex) =>
      add(mapTask(task, { scope: 'alt', phaseIndex: pathIndex, taskIndex, roadmap, path }))
    );
  });

  return items;
};

const findRoadmapTaskByItemId = (roadmap, itemId) => {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) {
    throw createStatusError('Invalid itemId', 400);
  }
  return extractRoadmapTasks(roadmap).find((task) => task.itemId === normalizedItemId) || null;
};

const buildLearningQueryFromTask = (roadmap, task) => ({
  skillName: task.canonicalSkillName,
  canonicalSkillName: task.canonicalSkillName,
  targetRole: task.targetRole || roadmap.targetRole,
  level: task.level || roadmap.effectiveLevel || 'beginner',
  language: roadmap.language || 'vi',
});

const getLearningContentDocument = async (query) => {
  const identity = learningService.buildLearningIdentity(query);
  if (!identity.skillName) return null;
  const content = await LearningContent.findOne({
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
  }).lean();
  return content ? { ...content, ...identity } : null;
};

const formatLearning = (learning, resources = []) => ({
  skillName: learning.skillName,
  canonicalSkillName: learning.canonicalSkillName,
  targetRole: learning.targetRole,
  level: learning.level,
  language: learning.language,
  title: learning.title || '',
  overview: learning.overview || '',
  whyLearn: learning.whyLearn || '',
  useCases: learning.useCases || [],
  howToApply: learning.howToApply || '',
  examples: learning.examples || [],
  checklist: learning.checklist || [],
  exercises: learning.exercises || [],
  commonMistakes: learning.commonMistakes || [],
  nextSkills: learning.nextSkills || [],
  resources,
});

const buildPersonalizedContext = (roadmap, task) => {
  const source = roadmap.roadmapSource && typeof roadmap.roadmapSource === 'object' ? roadmap.roadmapSource : {};
  const repositoryNames = Array.isArray(source.repositories)
    ? source.repositories.map((repo) => repo.repoName || repo.fullName).filter(Boolean)
    : [];
  return {
    sourceMode: source.sourceMode || '',
    repoName: source.repoName || repositoryNames[0] || '',
    projectType: source.projectType || '',
    repositoryNames,
    practiceTask: `Ap dung bai hoc nay bang cach hoan thanh task: ${task.title} trong roadmap.`,
    roadmapReason: task.roadmapReason || '',
  };
};

const getProgressForItem = async (userId, roadmapId, itemId) => {
  const progress = await RoadmapProgress.findOne({ userId, roadmapId }).select('items').lean();
  const item = (progress?.items || []).find((progressItem) => progressItem.itemId === itemId);
  return item
    ? {
        status: item.status || 'not_started',
        progressPercent: Number(item.progressPercent || 0),
      }
    : null;
};

const getResourcesForLearning = async (query, includeResources, searchIfMissing = false) => {
  if (!includeResources) return [];
  try {
    const resourcesResult = await learningService.getLearningResources(query);
    if (resourcesResult.data.resources.length || !searchIfMissing) {
      return resourcesResult.data.resources;
    }
  } catch (error) {
    if (!searchIfMissing) return [];
  }

  try {
    const searched = await learningService.searchAndCacheYoutubeResources(query);
    return searched.data.resources || [];
  } catch (error) {
    try {
      const resourcesResult = await learningService.getLearningResources(query);
      return resourcesResult.data.resources || [];
    } catch (fallbackError) {
      return [];
    }
  }
};

const formatRoadmapItemLearningResponse = async (userId, roadmap, task, sharedLearning, resources) => ({
  roadmapId: roadmap._id,
  itemId: task.itemId,
  task: {
    title: task.title,
    description: task.description,
    skillName: task.skillName,
    canonicalSkillName: task.canonicalSkillName,
    category: task.category,
    targetRole: task.targetRole,
    level: task.level,
    week: task.week,
    priority: task.priority,
    estimatedHours: task.estimatedHours,
  },
  learning: formatLearning(sharedLearning, resources),
  personalizedContext: buildPersonalizedContext(roadmap, task),
  progress: await getProgressForItem(userId, roadmap._id, task.itemId),
});

const getRoadmapLearning = async (authUserOrId, roadmapId) => {
  const userId = getUserId(authUserOrId);
  const roadmap = await getUserRoadmapOrThrow(userId, roadmapId);
  const items = await Promise.all(
    extractRoadmapTasks(roadmap).map(async (task) => {
      const query = buildLearningQueryFromTask(roadmap, task);
      const learning = await getLearningContentDocument(query);
      return {
        itemId: task.itemId,
        taskTitle: task.title,
        canonicalSkillName: task.canonicalSkillName,
        skillName: task.skillName,
        targetRole: query.targetRole,
        level: query.level,
        week: task.week,
        priority: task.priority,
        learningStatus: learning ? 'available' : 'missing',
      };
    })
  );

  return {
    message: 'Roadmap learning fetched successfully',
    data: {
      roadmapId: roadmap._id,
      sourceMode:
        roadmap.roadmapSource && typeof roadmap.roadmapSource === 'object'
          ? roadmap.roadmapSource.sourceMode || ''
          : '',
      language: roadmap.language || 'vi',
      items,
    },
    statusCode: 200,
  };
};

const getRoadmapItemLearning = async (authUserOrId, roadmapId, itemId, options = {}) => {
  const userId = getUserId(authUserOrId);
  const roadmap = await getUserRoadmapOrThrow(userId, roadmapId);
  const task = findRoadmapTaskByItemId(roadmap, itemId);
  if (!task) {
    throw createStatusError('Roadmap task not found.', 404);
  }

  const query = buildLearningQueryFromTask(roadmap, task);
  const learningResult = await learningService.getLearningContent(query);
  const includeResources = parseBoolean(options.includeResources, true);
  const resources = await getResourcesForLearning(query, includeResources, false);

  return {
    message: 'Roadmap item learning found',
    data: await formatRoadmapItemLearningResponse(userId, roadmap, task, learningResult.data, resources),
    statusCode: 200,
  };
};

const generateRoadmapItemLearning = async (authUserOrId, roadmapId, itemId, body = {}) => {
  const userId = getUserId(authUserOrId);
  const roadmap = await getUserRoadmapOrThrow(userId, roadmapId);
  const task = findRoadmapTaskByItemId(roadmap, itemId);
  if (!task) {
    throw createStatusError('Roadmap task not found.', 404);
  }

  const query = buildLearningQueryFromTask(roadmap, task);
  const personalizedContext = buildPersonalizedContext(roadmap, task);
  const gapItems = Array.isArray(roadmap.skillGapSummary?.items)
    ? roadmap.skillGapSummary.items
    : Array.isArray(roadmap.skillGapSummary)
      ? roadmap.skillGapSummary
      : [];
  const gap = gapItems.find(
    (item) => canonicalizeSkillName(item.canonicalSkillName || item.skillName) === task.canonicalSkillName
  );
  const learningResult = await learningService.generateLearningContent({
    ...query,
    forceRegenerate: body.forceRegenerate === true,
    context: {
      taskTitle: task.title,
      taskDescription: task.description,
      targetRole: query.targetRole,
      level: query.level,
      week: task.week,
      sourceMode: personalizedContext.sourceMode,
      repoName: personalizedContext.repoName,
      projectType: personalizedContext.projectType,
      repositoryNames: personalizedContext.repositoryNames,
      skillGapReason: gap?.reason || '',
    },
  });
  const includeResources = parseBoolean(body.includeResources, true);
  const resources = await getResourcesForLearning(query, includeResources, true);

  return {
    message: 'Roadmap item learning generated successfully',
    data: await formatRoadmapItemLearningResponse(userId, roadmap, task, learningResult.data, resources),
    statusCode: learningResult.statusCode === 201 ? 201 : 200,
  };
};

module.exports = {
  getRoadmapLearning,
  getRoadmapItemLearning,
  generateRoadmapItemLearning,
  getUserRoadmapOrThrow,
  extractRoadmapTasks,
  findRoadmapTaskByItemId,
  buildLearningQueryFromTask,
  buildPersonalizedContext,
  formatRoadmapItemLearningResponse,
};
