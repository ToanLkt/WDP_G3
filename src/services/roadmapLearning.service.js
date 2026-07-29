const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const LearningContent = require('../models/LearningContent');
const { createStatusError } = require('./github/github.utils');
const learningService = require('./learning.service');
const normalizeText = require('../utils/normalizeText');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');

const generationInFlight = new Map();
const resourceSearchInFlight = new Map();
const resourceSearchCooldown = new Map();
const resourceRegenerationCooldown = new Map();

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

const slugifyText = (value, fallback = 'task') =>
  normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || fallback;

const buildTaskItemId = ({ scope = 'main', phaseIndex = 0, taskIndex = 0, canonicalSkillName, title }) => {
  const taskSlug = slugifyText(`${canonicalSkillName || ''} ${title || ''}`, slugifySkill(canonicalSkillName));
  return (
  scope === 'alt'
    ? `alt-${Number(phaseIndex) + 1}-task-${Number(taskIndex) + 1}-${taskSlug}`
    : `main-${Number(phaseIndex) + 1}-${Number(taskIndex) + 1}-${taskSlug}`
  );
};

const getUserRoadmapOrThrow = async (userId, roadmapId) => {
  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId, isDeleted: { $ne: true } }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }
  return roadmap;
};

const mapTask = (task, { scope, phaseIndex, taskIndex, roadmap, path } = {}) => {
  if (!task || typeof task !== 'object') return null;
  const canonicalSkillName = canonicalizeSkillName(task.canonicalSkillName || task.skillName || task.skill || task.title || '');
  if (!canonicalSkillName) return null;
  const title = String(task.title || `Task ${Number(taskIndex || 0) + 1}`).trim();
  const itemId = String(task.itemId || '').trim() || buildTaskItemId({
    scope,
    phaseIndex,
    taskIndex,
    canonicalSkillName,
    title,
  });
  if (!itemId) return null;
  return {
    itemId,
    title,
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
  const add = (task) => {
    if (!task || !task.itemId) return;
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
  const matches = extractRoadmapTasks(roadmap).filter((task) => task.itemId === normalizedItemId);
  if (matches.length > 1) {
    const error = createStatusError('Roadmap itemId is ambiguous.', 409);
    error.code = 'ROADMAP_ITEM_ID_CONFLICT';
    error.details = { roadmapId: String(roadmap?._id || ''), itemId: normalizedItemId, titles: matches.map((task) => task.title) };
    console.error('[roadmap_item_id_conflict]', error.details);
    throw error;
  }
  return matches[0] || null;
};

const buildLearningQueryFromTask = (roadmap, task) => ({
  taskTitle: task.title || '',
  taskDescription: task.description || '',
  skillName: task.canonicalSkillName,
  canonicalSkillName: task.canonicalSkillName,
  category: task.category || '',
  targetRole: task.targetRole || roadmap.targetRole,
  level: task.level || roadmap.effectiveLevel || 'beginner',
  language: roadmap.language || 'vi',
  roadmapId: String(roadmap._id || ''),
  roadmapItemId: task.itemId,
  contentCacheKey: task.itemId || task.title,
  topicKey: task.title || task.description || task.itemId,
});

const buildResourceQueryFromLearningQuery = (query = {}, task = {}, personalizedContext = {}) => {
  return {
    ...query,
    taskTitle: task.title || '',
    taskDescription: task.description || '',
    projectType: personalizedContext.projectType || '',
  };
};

const getLearningContentDocument = async (query) => {
  const identity = learningService.buildLearningIdentity(query);
  if (!identity.skillName) return null;
  const content = await LearningContent.findOne({
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
    roadmapId: identity.roadmapId,
    roadmapItemId: identity.roadmapItemId,
    isStale: { $ne: true },
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

const getResourcesForLearning = async (query, includeResources, searchIfMissing = false, diagnostics = {}) => {
  if (!includeResources) return [];
  const topicProfile = learningService.buildLearningTopicProfile(query);
  console.info('[roadmap-learning-resource]', {
    reasonCode: 'learning_resources_requested',
    roadmapId: diagnostics.roadmapId,
    itemId: diagnostics.itemId,
    canonicalSkillName: query.canonicalSkillName || query.skillName,
    taskTitle: query.taskTitle,
    targetRole: query.targetRole,
    language: query.language,
    searchIfMissing,
  });
  try {
    const resourcesResult = await learningService.getLearningResources(query);
    if (learningService.hasValidLearningVideo(resourcesResult.data.resources, topicProfile) || !searchIfMissing) {
      console.info('[roadmap-learning-resource]', {
        reasonCode: resourcesResult.data.resources.length ? 'learning_resources_cache_hit' : 'learning_resources_cache_empty',
        roadmapId: diagnostics.roadmapId,
        itemId: diagnostics.itemId,
        canonicalSkillName: query.canonicalSkillName || query.skillName,
        acceptedCount: resourcesResult.data.resources.length,
      });
      return resourcesResult.data.resources;
    }
  } catch (error) {
    console.warn('[roadmap-learning-resource]', {
      reasonCode: 'learning_resources_lookup_error',
      roadmapId: diagnostics.roadmapId,
      itemId: diagnostics.itemId,
      skillName: query.canonicalSkillName || query.skillName,
      level: query.level,
      language: query.language,
      statusCode: error.statusCode || error.response?.status || 500,
    });
    if (!searchIfMissing) return [];
  }

  try {
    const searchKey = `${diagnostics.roadmapId || query.roadmapId}:${diagnostics.itemId || query.roadmapItemId}:${topicProfile.normalizedTopicKey}`;
    const cooldownUntil = resourceSearchCooldown.get(searchKey) || 0;
    if (cooldownUntil > Date.now() && !diagnostics.forceResourceRefresh) return [];
    const existingSearch = resourceSearchInFlight.get(searchKey);
    if (existingSearch) return existingSearch;
    const searchPromise = (async () => {
      const searched = await learningService.searchAndCacheYoutubeResources(query);
      if (!learningService.hasValidLearningVideo(searched.data.resources, topicProfile)) {
        resourceSearchCooldown.set(searchKey, Date.now() + 20 * 60 * 1000);
        diagnostics.searchFailed = true;
        console.warn('[learning-resource]', { reasonCode: 'learning_resource_not_found', roadmapId: diagnostics.roadmapId, itemId: diagnostics.itemId });
        return [];
      }
      resourceSearchCooldown.delete(searchKey);
      return searched.data.resources || [];
    })();
    resourceSearchInFlight.set(searchKey, searchPromise);
    try {
      const resources = await searchPromise;
    console.info('[roadmap-learning-resource]', {
      reasonCode: 'learning_resources_attached',
      roadmapId: diagnostics.roadmapId,
      itemId: diagnostics.itemId,
      canonicalSkillName: query.canonicalSkillName || query.skillName,
      acceptedCount: resources.length,
    });
      return resources;
    } finally {
      resourceSearchInFlight.delete(searchKey);
    }
  } catch (error) {
    const providerStatus = Number(error?.response?.status || error?.statusCode || 0);
    const reasonCode = /YOUTUBE_API_KEY/i.test(error.message || '')
      ? 'youtube_api_key_missing'
      : providerStatus === 403 || providerStatus === 429
        ? 'youtube_quota_exceeded'
        : 'youtube_api_error';
    console.warn('[roadmap-learning-resource]', {
      reasonCode,
      roadmapId: diagnostics.roadmapId,
      itemId: diagnostics.itemId,
      skillName: query.canonicalSkillName || query.skillName,
      taskTitle: query.taskTitle,
      level: query.level,
      language: query.language,
      statusCode: error.statusCode || error.response?.status || 500,
    });
    diagnostics.searchFailed = true;
    diagnostics.providerFailure = reasonCode === 'youtube_api_key_missing' || reasonCode === 'youtube_quota_exceeded' || reasonCode === 'youtube_api_error';
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
  const personalizedContext = buildPersonalizedContext(roadmap, task);
  const resourceDiagnostics = { roadmapId, itemId: task.itemId };
  let resources = await getResourcesForLearning(
    buildResourceQueryFromLearningQuery(query, task, personalizedContext),
    includeResources,
    true,
    resourceDiagnostics
  );

  const regenerationKey = `${userId}:${String(roadmapId)}:${task.itemId}`;
  const canRegenerate = includeResources
    && !resources.length
    && resourceDiagnostics.searchFailed
    && !resourceDiagnostics.providerFailure
    && (resourceRegenerationCooldown.get(regenerationKey) || 0) <= Date.now()
    && options.forceResourceRefresh !== false;
  if (canRegenerate) {
    resourceRegenerationCooldown.set(regenerationKey, Date.now() + 45 * 60 * 1000);
    try {
      const regenerated = await generateRoadmapItemLearning(authUserOrId, roadmapId, itemId, {
        forceRegenerate: true,
        includeResources: true,
        _skipResourceRegeneration: true,
      });
      return regenerated;
    } catch (error) {
      console.warn('[roadmap-learning-resource]', {
        reasonCode: 'learning_regeneration_failed_keep_existing_content',
        roadmapId,
        itemId: task.itemId,
        errorCode: error.errorCode || error.code,
      });
    }
  }

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

  const generationKey = `${userId}:${String(roadmapId)}:${task.itemId}`;
  const existingGeneration = generationInFlight.get(generationKey);
  if (existingGeneration) return existingGeneration;

  const generationPromise = (async () => {
    try {

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
      skillGapType: gap?.gapType || gap?.currentLevel || '',
      learningMode: (gap?.gapType || gap?.currentLevel) === 'missing' ? 'new_learning' : 'reinforcement',
    },
  });
  const includeResources = parseBoolean(body.includeResources, true);
  const resources = await getResourcesForLearning(
    buildResourceQueryFromLearningQuery(query, task, personalizedContext),
    includeResources,
    true,
    { roadmapId, itemId: task.itemId, forceResourceRefresh: body.forceResourceRefresh === true }
  );

      return {
    message: 'Roadmap item learning generated successfully',
    data: await formatRoadmapItemLearningResponse(userId, roadmap, task, learningResult.data, resources),
    statusCode: learningResult.statusCode === 201 ? 201 : 200,
      };
    } finally {
      generationInFlight.delete(generationKey);
    }
  })();
  generationInFlight.set(generationKey, generationPromise);
  return generationPromise;
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
  formatLearning,
  formatRoadmapItemLearningResponse,
};
