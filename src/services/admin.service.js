const mongoose = require('mongoose');

const AiFeedback = require('../models/AiFeedback');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const AnalysisResult = require('../models/AnalysisResult');
const Repository = require('../models/Repository');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const Report = require('../models/Report');
const ReportStatusLog = require('../models/ReportStatusLog');
const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const User = require('../models/User');
const { roles } = require('../utils/constants');
const { formatGeneratedRoadmapResponse } = require('./roadmap.service');
const analysisSourceService = require('./analysisSource.service');
const { createAutomaticNotification } = require('./notification.service');
const { buildFeedbackResponse, evaluateFeedbackCompatibility } = require('./aiFeedback.service');
const {
  buildCompatibleAnalysisQuery,
  buildCompatibleSnapshotQuery,
  buildCompatibilityMetadata,
} = require('./dev2vec/dev2vecCompatibility.service');

const REPORT_STATUSES = ['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];
const REPORT_TYPES = ['user', 'repository', 'analysis', 'ai_feedback', 'roadmap', 'other'];
const legacyReportStatusMap = {
  pending: 'PENDING',
  reviewing: 'IN_REVIEW',
  in_review: 'IN_REVIEW',
  resolved: 'RESOLVED',
  rejected: 'REJECTED',
};
const reportNotificationByStatus = {
  IN_REVIEW: {
    type: 'REPORT_IN_REVIEW',
    title: 'Report Under Review',
    message: 'Your report is currently being reviewed by our team.',
  },
  RESOLVED: {
    type: 'REPORT_RESOLVED',
    title: 'Report Resolved',
    message: 'Your report has been resolved successfully.',
  },
  REJECTED: {
    type: 'REPORT_REJECTED',
    title: 'Report Rejected',
    message: 'Your report was reviewed but could not be approved.',
  },
};

const createStatusError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureObjectId = (id, resourceName) => {
  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    throw createStatusError(`${resourceName} not found`, 404);
  }
};

const getPagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const normalizeReportStatus = (status) => {
  const rawStatus = String(status || '').trim();
  const upperStatus = rawStatus.toUpperCase();

  if (REPORT_STATUSES.includes(upperStatus)) {
    return upperStatus;
  }

  return legacyReportStatusMap[rawStatus.toLowerCase()] || '';
};

const buildListResult = async ({ model, query, pagination, sort, populate, select }) => {
  let findQuery = model.find(query).sort(sort || { createdAt: -1 }).skip(pagination.skip).limit(pagination.limit);

  if (populate) {
    for (const item of populate) {
      findQuery = findQuery.populate(item);
    }
  }

  if (select) {
    findQuery = findQuery.select(select);
  }

  const [items, total] = await Promise.all([findQuery.lean(), model.countDocuments(query)]);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

const isPopulatedObject = (value) => value && typeof value === 'object' && !mongoose.Types.ObjectId.isValid(String(value));

const stringId = (value) => {
  if (!value) return null;
  if (value._id) return String(value._id);
  return String(value);
};

const formatAdminUser = (user) => {
  if (!isPopulatedObject(user)) return null;
  return {
    id: stringId(user._id),
    name: user.fullName || user.name || user.displayName || '',
    displayName: user.displayName || user.fullName || user.name || '',
    email: user.email || '',
    avatar: user.avatar || user.avatarUrl || user.profilePicture || '',
    status: user.status || '',
    role: user.role || '',
  };
};

const formatAdminRepository = (repository, fallbackId = null) => {
  if (!isPopulatedObject(repository)) {
    return fallbackId ? {
      id: stringId(fallbackId),
      name: '',
      fullName: '',
      htmlUrl: '',
      language: '',
    } : null;
  }

  return {
    id: stringId(repository._id),
    name: repository.name || '',
    fullName: repository.fullName || '',
    htmlUrl: repository.htmlUrl || repository.url || '',
    language: repository.language || '',
  };
};

const sanitizeAdminAnalysis = (analysis = {}) => {
  const compatibility = buildCompatibilityMetadata(analysis);
  const dev2vec = analysis.dev2vec || {};
  const cacheMetadata = dev2vec.cacheMetadata || {};
  return {
    ...analysis,
    rawAnalysis: undefined,
    skillEvidence: undefined,
    dev2vec: {
      modelVersion: dev2vec.modelVersion || null,
      scoringMethod: dev2vec.scoringMethod || '',
      rolePredictions: dev2vec.rolePredictions || [],
      skillGaps: dev2vec.skillGaps || {},
      vectorSources: dev2vec.vectorSources || {},
      sourceStats: dev2vec.sourceStats || {},
      cacheMetadata: {
        analysisPipelineVersion: cacheMetadata.analysisPipelineVersion || null,
        repoDocumentVersion: cacheMetadata.repoDocumentVersion || null,
        issueDocumentVersion: cacheMetadata.issueDocumentVersion || null,
        apiEvidenceVersion: cacheMetadata.apiEvidenceVersion || null,
        evidenceFingerprintPreview: cacheMetadata.evidenceFingerprint ? String(cacheMetadata.evidenceFingerprint).slice(0, 12) : null,
      },
    },
    modelVersion: compatibility.modelVersion,
    pipelineVersion: compatibility.pipelineVersion,
    isCompatible: compatibility.isCompatible,
  };
};

const normalizeProgressStatus = (status) =>
  ['not_started', 'in_progress', 'completed'].includes(status) ? status : 'not_started';

const calculateAdminProgressSummary = (items = []) => {
  const totalItems = items.length;
  const completedItems = items.filter((item) => item.status === 'completed').length;
  const inProgressItems = items.filter((item) => item.status === 'in_progress').length;
  const pendingItems = Math.max(totalItems - completedItems - inProgressItems, 0);
  return {
    totalItems,
    completedItems,
    inProgressItems,
    pendingItems,
    overallProgress: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
  };
};

const normalizeStoredProgressSummary = (summary = {}, fallbackTotal = 0, fallbackOverall = 0) => {
  const totalItems = Math.max(Number(summary.totalItems ?? fallbackTotal) || 0, 0);
  const completedItems = Math.max(Number(summary.completedItems) || 0, 0);
  const inProgressItems = Math.max(Number(summary.inProgressItems) || 0, 0);
  const pendingItems = Math.max(Number(summary.pendingItems ?? (totalItems - completedItems - inProgressItems)) || 0, 0);
  return {
    totalItems,
    completedItems,
    inProgressItems,
    pendingItems,
    overallProgress: Math.max(Number(summary.overallProgress ?? fallbackOverall) || 0, 0),
  };
};

const normalizeTaskMetadata = (task = {}, context = {}) => {
  const itemId = String(task.itemId || task.id || task._id || '').trim();
  if (!itemId) return null;
  return {
    itemId,
    title: String(task.title || task.taskTitle || task.name || '').trim(),
    description: String(task.description || task.goal || task.reason || '').trim(),
    skillName: String(task.skillName || task.skill || task.canonicalSkillName || '').trim(),
    canonicalSkillName: String(task.canonicalSkillName || task.skillName || task.skill || '').trim(),
    category: String(task.category || '').trim(),
    priority: task.priority || 'medium',
    week: Number.isFinite(Number(task.week)) ? Number(task.week) : context.week ?? null,
    phase: String(task.phase || context.phase || '').trim(),
    estimatedHours: Number.isFinite(Number(task.estimatedHours)) ? Number(task.estimatedHours) : 0,
  };
};

const collectTaskMetadata = (roadmap) => {
  const formatted = formatGeneratedRoadmapResponse(roadmap);
  const tasks = [];
  const seen = new Set();
  const addTask = (task, context = {}) => {
    const normalized = normalizeTaskMetadata(task, context);
    if (!normalized || seen.has(normalized.itemId)) return;
    seen.add(normalized.itemId);
    tasks.push(normalized);
  };

  const collectFromPhases = (phases = []) => {
    (Array.isArray(phases) ? phases : []).forEach((phase, phaseIndex) => {
      const phaseName = phase.title || phase.name || `Phase ${phaseIndex + 1}`;
      const week = Number.isFinite(Number(phase.week)) ? Number(phase.week) : phaseIndex + 1;
      (Array.isArray(phase.tasks) ? phase.tasks : []).forEach((task) =>
        addTask(task, { phase: phaseName, week })
      );
      (Array.isArray(phase.items) ? phase.items : []).forEach((task) =>
        addTask(task, { phase: phaseName, week })
      );
      (Array.isArray(phase.weeks) ? phase.weeks : []).forEach((weekNode, weekIndex) => {
        const weekNumber = Number.isFinite(Number(weekNode.week)) ? Number(weekNode.week) : weekIndex + 1;
        (Array.isArray(weekNode.tasks) ? weekNode.tasks : []).forEach((task) =>
          addTask(task, { phase: phaseName, week: weekNumber })
        );
        (Array.isArray(weekNode.items) ? weekNode.items : []).forEach((task) =>
          addTask(task, { phase: phaseName, week: weekNumber })
        );
      });
    });
  };

  collectFromPhases(formatted?.mainRoadmap?.phases || []);
  collectFromPhases(roadmap?.mainRoadmap?.phases || []);
  collectFromPhases(roadmap?.mainPath?.phases || []);

  (Array.isArray(formatted?.alternativeRoadmaps) ? formatted.alternativeRoadmaps : []).forEach((path) => {
    const phase = path.title || path.targetRole || 'Alternative roadmap';
    (Array.isArray(path.tasks) ? path.tasks : []).forEach((task) => addTask(task, { phase, week: task.week ?? null }));
  });
  (Array.isArray(roadmap?.alternativeRoadmaps) ? roadmap.alternativeRoadmaps : []).forEach((path) => {
    const phase = path.title || path.targetRole || path.name || 'Alternative roadmap';
    (Array.isArray(path.tasks) ? path.tasks : []).forEach((task) => addTask(task, { phase, week: task.week ?? null }));
    (Array.isArray(path.items) ? path.items : []).forEach((task) => addTask(task, { phase, week: task.week ?? null }));
  });

  (Array.isArray(roadmap?.tasks) ? roadmap.tasks : []).forEach((task) => addTask(task, { phase: '', week: task.week ?? null }));
  (Array.isArray(roadmap?.items) ? roadmap.items : []).forEach((task) => addTask(task, { phase: '', week: task.week ?? null }));
  (Array.isArray(roadmap?.weeks) ? roadmap.weeks : []).forEach((weekNode, weekIndex) => {
    const weekNumber = Number.isFinite(Number(weekNode.week)) ? Number(weekNode.week) : weekIndex + 1;
    (Array.isArray(weekNode.tasks) ? weekNode.tasks : []).forEach((task) => addTask(task, { phase: '', week: weekNumber }));
    (Array.isArray(weekNode.items) ? weekNode.items : []).forEach((task) => addTask(task, { phase: '', week: weekNumber }));
  });

  return tasks;
};

const mergeRoadmapProgressItems = (roadmap, progress = null) => {
  const taskMetadata = collectTaskMetadata(roadmap);
  const progressByItemId = new Map();
  const orphanProgressItems = [];

  for (const item of progress?.items || []) {
    const itemId = String(item?.itemId || '').trim();
    if (!itemId || progressByItemId.has(itemId)) continue;
    progressByItemId.set(itemId, item);
  }

  const items = taskMetadata.map((task) => {
    const progressItem = progressByItemId.get(task.itemId);
    if (progressItem) progressByItemId.delete(task.itemId);
    const status = normalizeProgressStatus(progressItem?.status);
    return {
      ...task,
      skillName: progressItem?.skillName || task.skillName,
      canonicalSkillName: progressItem?.canonicalSkillName || task.canonicalSkillName || progressItem?.skillName || task.skillName,
      category: progressItem?.category || task.category,
      priority: progressItem?.priority || task.priority,
      status,
      progressPercent: status === 'completed'
        ? 100
        : status === 'in_progress'
          ? Math.min(99, Math.max(1, Math.round(Number(progressItem?.progressPercent || 50))))
          : 0,
      startedAt: progressItem?.startedAt || null,
      completedAt: progressItem?.completedAt || null,
    };
  });

  for (const progressItem of progressByItemId.values()) {
    orphanProgressItems.push({
      itemId: progressItem.itemId,
      title: progressItem.title || '',
      description: '',
      skillName: progressItem.skillName || progressItem.canonicalSkillName || '',
      canonicalSkillName: progressItem.canonicalSkillName || progressItem.skillName || '',
      category: progressItem.category || '',
      priority: progressItem.priority || 'medium',
      week: null,
      phase: '',
      estimatedHours: 0,
      status: normalizeProgressStatus(progressItem.status),
      progressPercent: Number(progressItem.progressPercent || 0),
      startedAt: progressItem.startedAt || null,
      completedAt: progressItem.completedAt || null,
      orphan: true,
    });
  }

  const progressSummary = calculateAdminProgressSummary(items);
  const completedTasks = items.filter((item) => item.status === 'completed');
  const inProgressTasks = items.filter((item) => item.status === 'in_progress');
  const pendingTasks = items.filter((item) => item.status === 'not_started');
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const byPriorityAndWeek = (left, right) => (
    (priorityRank[String(left.priority || '').toLowerCase()] ?? 1)
    - (priorityRank[String(right.priority || '').toLowerCase()] ?? 1)
  ) || Number(left.week || 999) - Number(right.week || 999);
  const recentlyCompleted = [...completedTasks]
    .sort((left, right) => new Date(right.completedAt || 0) - new Date(left.completedAt || 0));
  const recommended = [...inProgressTasks, ...pendingTasks].sort(byPriorityAndWeek);

  return {
    progressSummary,
    learningProgress: {
      currentTask: inProgressTasks.sort(byPriorityAndWeek)[0] || recommended[0] || null,
      recentlyCompleted: recentlyCompleted.slice(0, 5),
      nextRecommendedTask: recommended[0] || null,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      orphanProgressItems,
      items,
    },
  };
};

const formatAdminRoadmapResponse = (roadmap, { progress = null, includeLearningProgress = false } = {}) => {
  const base = formatGeneratedRoadmapResponse(roadmap);
  const mergedProgress = mergeRoadmapProgressItems(roadmap, progress);
  const response = {
    ...base,
    status: roadmap.status || base.status || 'active',
    isDeleted: Boolean(roadmap.isDeleted),
    deletedAt: roadmap.deletedAt || null,
    deletedBy: roadmap.deletedBy || null,
    user: formatAdminUser(roadmap.userId),
    repository: formatAdminRepository(roadmap.repositoryId, roadmap.sourceRepositoryId || roadmap.repositoryId),
    progressSummary: mergedProgress.progressSummary,
  };

  if (includeLearningProgress) {
    response.learningProgress = mergedProgress.learningProgress;
  }

  return response;
};

const attachAdminRoadmapRelations = async (roadmaps = []) => {
  const userIds = [...new Set(roadmaps.map((roadmap) => stringId(roadmap.userId)).filter(Boolean))];
  const repositoryIds = [...new Set(roadmaps.map((roadmap) => stringId(roadmap.repositoryId)).filter(Boolean))];
  const [users, repositories] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select('fullName name displayName email avatar avatarUrl profilePicture role status')
          .lean()
      : [],
    repositoryIds.length
      ? Repository.find({ _id: { $in: repositoryIds } })
          .select('name fullName htmlUrl language')
          .lean()
      : [],
  ]);
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const repositoryMap = new Map(repositories.map((repository) => [String(repository._id), repository]));

  return roadmaps.map((roadmap) => ({
    ...roadmap,
    ownerUserId: roadmap.userId,
    sourceRepositoryId: roadmap.repositoryId,
    userId: userMap.get(String(roadmap.userId)) || null,
    repositoryId: repositoryMap.get(String(roadmap.repositoryId)) || roadmap.repositoryId || null,
  }));
};

const getRoadmapSourceAnalysisIds = (roadmapSource) => {
  if (!roadmapSource || typeof roadmapSource !== 'object') return [];
  if (Array.isArray(roadmapSource.analysisIds) && roadmapSource.analysisIds.length) {
    return roadmapSource.analysisIds.filter(Boolean);
  }
  return roadmapSource.analysisId ? [roadmapSource.analysisId] : [];
};

const attachSnapshotProvenanceToRoadmaps = async (roadmaps = []) => {
  const analysisIds = [...new Set(roadmaps.flatMap((roadmap) =>
    getRoadmapSourceAnalysisIds(roadmap.roadmapSource).map(String)
  ))];
  const userIds = [...new Set(roadmaps.map((roadmap) => stringId(roadmap.ownerUserId)).filter(Boolean))];

  if (!analysisIds.length || !userIds.length) return roadmaps;

  const snapshots = await RepoAnalysisSnapshot.find({
    userId: { $in: userIds },
    analysisResultId: { $in: analysisIds },
  })
    .sort({ createdAt: -1 })
    .select('_id userId analysisResultId repositoryId analyzedAt createdAt')
    .lean();
  const snapshotMap = new Map();
  for (const snapshot of snapshots) {
    const key = `${String(snapshot.userId)}:${String(snapshot.analysisResultId)}`;
    if (!snapshotMap.has(key)) snapshotMap.set(key, snapshot);
  }

  return roadmaps.map((roadmap) => {
    const source = roadmap.roadmapSource;
    if (!source || typeof source !== 'object') return roadmap;
    const sourceAnalysisIds = getRoadmapSourceAnalysisIds(source);
    const validSnapshots = sourceAnalysisIds
      .map((analysisId) => snapshotMap.get(`${String(roadmap.ownerUserId)}:${String(analysisId)}`))
      .filter(Boolean);
    const byAnalysisId = new Map(validSnapshots.map((snapshot) => [String(snapshot.analysisResultId), snapshot]));
    const repositories = Array.isArray(source.repositories)
      ? source.repositories.map((repository) => {
          const snapshot = byAnalysisId.get(String(repository.analysisId || ''));
          return {
            ...repository,
            snapshotId: snapshot?._id || repository.snapshotId || null,
            analyzedAt: repository.analyzedAt || snapshot?.analyzedAt || null,
          };
        })
      : source.repositories;
    return {
      ...roadmap,
      roadmapSource: {
        ...source,
        snapshotId: validSnapshots.length === 1 ? validSnapshots[0]._id : source.snapshotId || null,
        snapshotIds: validSnapshots.map((snapshot) => snapshot._id),
        analyzedAt:
          source.analyzedAt ||
          (validSnapshots.length === 1 ? validSnapshots[0].analyzedAt || validSnapshots[0].createdAt : null),
        repositories,
      },
    };
  });
};

const formatAdminRoadmapListResponse = (roadmap, { progress = null } = {}) => {
  const base = formatGeneratedRoadmapResponse(roadmap);
  const fallbackTaskCount = collectTaskMetadata(roadmap).length;
  return {
    ...base,
    status: roadmap.status || base.status || 'active',
    isDeleted: Boolean(roadmap.isDeleted),
    deletedAt: roadmap.deletedAt || null,
    deletedBy: roadmap.deletedBy || null,
    user: formatAdminUser(roadmap.userId),
    repository: formatAdminRepository(roadmap.repositoryId, roadmap.sourceRepositoryId || roadmap.repositoryId),
    progressSummary: progress
      ? normalizeStoredProgressSummary(progress.progressSummary, fallbackTaskCount, progress.overallProgress)
      : normalizeStoredProgressSummary(roadmap.progressSummary, fallbackTaskCount, roadmap.progressSummary?.overallProgress || 0),
  };
};

const getDashboard = async () => {
  const [
    totalUsers,
    activeUsers,
    bannedUsers,
    totalRepositories,
    totalAnalysis,
    totalAiFeedback,
    activeRoadmaps,
    pendingReports,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'banned' }),
    Repository.countDocuments(),
    AnalysisResult.countDocuments(buildCompatibleAnalysisQuery()),
    AiFeedback.countDocuments(),
    Roadmap.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
    Report.countDocuments({ status: { $in: ['PENDING', 'pending'] } }),
  ]);

  return {
    message: 'Admin dashboard fetched successfully',
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        banned: bannedUsers,
      },
      github: {
        repositories: totalRepositories,
      },
      analysis: {
        total: totalAnalysis,
        currentCompatible: totalAnalysis,
        legacyOrIncompatible: await AnalysisResult.countDocuments({ $nor: [buildCompatibleAnalysisQuery()] }) + await AnalysisSnapshot.countDocuments(),
        currentSnapshots: await RepoAnalysisSnapshot.countDocuments(buildCompatibleSnapshotQuery()),
        legacySnapshots: await RepoAnalysisSnapshot.countDocuments({ $nor: [buildCompatibleSnapshotQuery()] }),
      },
      aiFeedback: {
        total: totalAiFeedback,
      },
      roadmaps: {
        active: activeRoadmaps,
      },
      reports: {
        pending: pendingReports,
      },
    },
    statusCode: 200,
  };
};

const getUsers = async (filters) => {
  const query = { isDeleted: { $ne: true } };
  const search = String(filters.search || '').trim();

  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  if (roles.includes(filters.role)) {
    query.role = filters.role;
  }

  if (['active', 'inactive', 'banned'].includes(filters.status)) {
    query.status = filters.status;
  }

  const data = await buildListResult({
    model: User,
    query,
    pagination: getPagination(filters),
    sort: { createdAt: -1 },
    select: '-password',
  });

  return {
    message: 'Users fetched successfully',
    data,
    statusCode: 200,
  };
};

const getUserById = async (userId) => {
  ensureObjectId(userId, 'User');

  const user = await User.findById(userId).select('-password').lean();
  if (!user) {
    throw createStatusError('User not found', 404);
  }

  return {
    message: 'User fetched successfully',
    data: { user },
    statusCode: 200,
  };
};

const updateUserStatus = async (userId, status) => {
  ensureObjectId(userId, 'User');

  if (!['active', 'inactive', 'banned'].includes(status)) {
    throw createStatusError('status must be one of active, inactive, banned', 400);
  }

  const user = await User.findByIdAndUpdate(userId, { $set: { status } }, { new: true }).select('-password').lean();
  if (!user) {
    throw createStatusError('User not found', 404);
  }

  return {
    message: 'User status updated successfully',
    data: { user },
    statusCode: 200,
  };
};

const updateUserRole = async (userId, role) => {
  ensureObjectId(userId, 'User');

  if (!roles.includes(role)) {
    throw createStatusError(`role must be one of ${roles.join(', ')}`, 400);
  }

  const user = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true }).select('-password').lean();
  if (!user) {
    throw createStatusError('User not found', 404);
  }

  return {
    message: 'User role updated successfully',
    data: { user },
    statusCode: 200,
  };
};

const getRepositories = async (filters) => {
  const query = {};
  const search = String(filters.search || '').trim();

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { language: { $regex: search, $options: 'i' } },
    ];
  }

  const data = await buildListResult({
    model: Repository,
    query,
    pagination: getPagination(filters),
    sort: { updatedAt: -1 },
    populate: [{ path: 'userId', select: 'fullName name email role status' }],
  });

  return {
    message: 'Repositories fetched successfully',
    data,
    statusCode: 200,
  };
};

const getRepositoryById = async (repoId) => {
  ensureObjectId(repoId, 'Repository');

  const repository = await Repository.findById(repoId)
    .populate('userId', 'fullName name email role status')
    .populate('githubAccountId', 'username displayName avatarUrl profileUrl connectedAt')
    .lean();

  if (!repository) {
    throw createStatusError('Repository not found', 404);
  }

  return {
    message: 'Repository fetched successfully',
    data: { repository },
    statusCode: 200,
  };
};

const getAnalysis = async (filters) => {
  const query = {};
  const search = String(filters.search || '').trim();

  if (search) {
    query.$or = [
      { repoName: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { projectType: { $regex: search, $options: 'i' } },
      { careerDirection: { $regex: search, $options: 'i' } },
    ];
  }

  const data = await buildListResult({
    model: AnalysisResult,
    query,
    pagination: getPagination(filters),
    sort: { analyzedAt: -1, createdAt: -1 },
    populate: [
      { path: 'userId', select: 'fullName name email role status' },
      { path: 'repositoryId', select: 'name fullName htmlUrl language' },
    ],
  });
  data.items = data.items.map(sanitizeAdminAnalysis);

  return {
    message: 'Analysis fetched successfully',
    data,
    statusCode: 200,
  };
};

const getAnalysisById = async (analysisId) => {
  ensureObjectId(analysisId, 'Analysis');

  const analysis = await AnalysisResult.findById(analysisId)
    .populate('userId', 'fullName name email role status')
    .populate('repositoryId', 'name fullName htmlUrl language')
    .lean();

  if (!analysis) {
    throw createStatusError('Analysis not found', 404);
  }

  return {
    message: 'Analysis fetched successfully',
    data: { analysis: sanitizeAdminAnalysis(analysis) },
    statusCode: 200,
  };
};

const getAiFeedback = async (filters) => {
  const query = {};
  const search = String(filters.search || '').trim();

  if (search) {
    query.$or = [
      { repoName: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
      { careerDirection: { $regex: search, $options: 'i' } },
    ];
  }

  const data = await buildListResult({
    model: AiFeedback,
    query,
    pagination: getPagination(filters),
    sort: { generatedAt: -1, createdAt: -1 },
    populate: [
      { path: 'userId', select: 'fullName name email role status' },
      { path: 'repositoryId', select: 'name fullName htmlUrl language' },
      { path: 'analysisSnapshotId', select: 'repoName projectType careerDirection analyzedAt' },
    ],
  });
  data.items = await Promise.all(data.items.map(async (feedback) => ({
    ...feedback,
    ...buildFeedbackResponse({
      ...feedback,
      ...(await evaluateFeedbackCompatibility(stringId(feedback.userId), feedback)),
    }),
  })));

  return {
    message: 'AI feedback fetched successfully',
    data,
    statusCode: 200,
  };
};

const getAiFeedbackById = async (feedbackId) => {
  ensureObjectId(feedbackId, 'AI feedback');

  const feedback = await AiFeedback.findById(feedbackId)
    .populate('userId', 'fullName name email role status')
    .populate('repositoryId', 'name fullName htmlUrl language')
    .populate('analysisSnapshotId', 'repoName projectType careerDirection analyzedAt')
    .lean();

  if (!feedback) {
    throw createStatusError('AI feedback not found', 404);
  }

  const compatibility = await evaluateFeedbackCompatibility(stringId(feedback.userId), feedback);

  return {
    message: 'AI feedback fetched successfully',
    data: { feedback: { ...feedback, ...buildFeedbackResponse({ ...feedback, ...compatibility }) } },
    statusCode: 200,
  };
};

const getRoadmaps = async (filters) => {
  const query = {};
  const search = String(filters.search || '').trim();
  const includeDeleted = ['true', '1', true].includes(filters.includeDeleted);

  if (!includeDeleted) {
    query.isDeleted = { $ne: true };
  }

  if (search) {
    query.$or = [
      { targetRole: { $regex: search, $options: 'i' } },
      { currentGithubDirection: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
    ];
  }

  if (['active', 'archived'].includes(filters.status)) {
    query.status = filters.status;
  }

  const pagination = getPagination(filters);
  const [roadmaps, total] = await Promise.all([
    Roadmap.find(query)
      .sort({ updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Roadmap.countDocuments(query),
  ]);
  const roadmapsWithRelations = await attachSnapshotProvenanceToRoadmaps(
    await attachAdminRoadmapRelations(roadmaps)
  );

  const progressRecords = roadmapsWithRelations.length
    ? await RoadmapProgress.find({
        roadmapId: { $in: roadmapsWithRelations.map((roadmap) => roadmap._id) },
        userId: { $in: roadmapsWithRelations.map((roadmap) => roadmap.ownerUserId).filter(Boolean) },
      })
        .select('roadmapId userId progressSummary overallProgress')
        .lean()
    : [];
  const progressMap = new Map(progressRecords.map((progress) => [
    `${String(progress.roadmapId)}:${String(progress.userId)}`,
    progress,
  ]));
  const items = roadmapsWithRelations.map((roadmap) => formatAdminRoadmapListResponse(roadmap, {
    progress: progressMap.get(`${String(roadmap._id)}:${String(roadmap.ownerUserId)}`) || null,
  }));

  const data = {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };

  return {
    message: 'Roadmaps fetched successfully',
    data,
    statusCode: 200,
  };
};

const getRoadmapById = async (roadmapId, options = {}) => {
  ensureObjectId(roadmapId, 'Roadmap');
  const includeDeleted = ['true', '1', true].includes(options.includeDeleted);

  const roadmap = await Roadmap.findOne({
    _id: roadmapId,
    ...(includeDeleted ? {} : { isDeleted: { $ne: true } }),
  })
    .lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }
  const [roadmapWithRelations] = await attachAdminRoadmapRelations([roadmap]);
  roadmapWithRelations.roadmapSource = await analysisSourceService.attachSnapshotProvenance({
    userId: roadmapWithRelations.ownerUserId,
    roadmapSource: roadmapWithRelations.roadmapSource,
  });
  const progress = await RoadmapProgress.findOne({
    roadmapId: roadmapWithRelations._id,
    userId: roadmapWithRelations.ownerUserId,
  }).lean();

  return {
    message: 'Roadmap fetched successfully',
    data: {
      roadmap: formatAdminRoadmapResponse(roadmapWithRelations, {
        progress,
        includeLearningProgress: true,
      }),
    },
    statusCode: 200,
  };
};

const updateRoadmapStatus = async (roadmapId, status) => {
  ensureObjectId(roadmapId, 'Roadmap');

  if (!['active', 'archived'].includes(status)) {
    throw createStatusError('status must be one of active, archived', 400);
  }

  const roadmap = await Roadmap.findOneAndUpdate(
    { _id: roadmapId, isDeleted: { $ne: true } },
    { $set: { status } },
    { new: true }
  )
    .populate('userId', 'fullName name email role status')
    .lean();

  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap status updated successfully',
    data: { roadmap },
    statusCode: 200,
  };
};

const getReports = async (filters) => {
  const query = {};
  const status = normalizeReportStatus(filters.status);

  if (status) {
    query.status = status;
  }

  if (REPORT_TYPES.includes(filters.type)) {
    query.type = filters.type;
  } else if (REPORT_TYPES.includes(filters.targetType)) {
    query.type = filters.targetType;
  }

  const data = await buildListResult({
    model: Report,
    query,
    pagination: getPagination(filters),
    sort: { createdAt: -1 },
    populate: [
      { path: 'userId', select: 'fullName name email role status' },
      { path: 'resolvedBy', select: 'fullName name email role status' },
    ],
  });

  return {
    message: 'Reports fetched successfully',
    data,
    statusCode: 200,
  };
};

const getReportById = async (reportId) => {
  ensureObjectId(reportId, 'Report');

  const report = await Report.findById(reportId)
    .populate('userId', 'fullName name email role status')
    .populate('resolvedBy', 'fullName name email role status')
    .lean();

  if (!report) {
    throw createStatusError('Report not found', 404);
  }

  const statusLogs = await ReportStatusLog.find({ reportId })
    .sort({ createdAt: -1 })
    .populate('changedBy', 'fullName name email role status')
    .lean();

  return {
    message: 'Report fetched successfully',
    data: { report, statusLogs },
    statusCode: 200,
  };
};

const updateReportStatus = async ({ reportId, status, adminNote, adminUser }) => {
  ensureObjectId(reportId, 'Report');

  const normalizedStatus = normalizeReportStatus(status);

  if (!REPORT_STATUSES.includes(normalizedStatus) || normalizedStatus === 'PENDING') {
    throw createStatusError('status must be one of IN_REVIEW, RESOLVED, REJECTED', 400);
  }

  const userId = adminUser && (adminUser.userId || adminUser.id);
  if (!userId) {
    throw createStatusError('Unauthorized', 401);
  }

  const existingReport = await Report.findById(reportId).lean();
  if (!existingReport) {
    throw createStatusError('Report not found', 404);
  }

  const update = {
    status: normalizedStatus,
    adminNote: String(adminNote || '').trim(),
  };

  if (['RESOLVED', 'REJECTED'].includes(normalizedStatus)) {
    update.resolvedBy = userId || null;
    update.resolvedAt = new Date();
  } else {
    update.resolvedBy = null;
    update.resolvedAt = null;
  }

  const report = await Report.findByIdAndUpdate(reportId, { $set: update }, { new: true })
    .populate('userId', 'fullName name email role status')
    .populate('resolvedBy', 'fullName name email role status')
    .lean();

  await ReportStatusLog.create({
    reportId,
    changedBy: userId,
    fromStatus: normalizeReportStatus(existingReport.status) || 'PENDING',
    toStatus: normalizedStatus,
    adminNote: update.adminNote,
  });

  const notificationPayload = reportNotificationByStatus[normalizedStatus];
  if (notificationPayload) {
    await createAutomaticNotification({
      userId: report.userId?._id || report.userId,
      title: notificationPayload.title,
      message: update.adminNote || notificationPayload.message,
      type: notificationPayload.type,
      reportId: report._id,
      respectUserSettings: false,
      throwOnError: true,
      metadata: {
        event: 'report_status_updated',
        reportId: report._id,
        status: report.status,
        type: report.type,
        targetId: report.targetId,
        adminNote: report.adminNote || '',
        resolvedAt: report.resolvedAt || null,
      },
    });
  }

  return {
    message: 'Report status updated successfully',
    data: { report },
    statusCode: 200,
  };
};

module.exports = {
  getDashboard,
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  getRepositories,
  getRepositoryById,
  getAnalysis,
  getAnalysisById,
  getAiFeedback,
  getAiFeedbackById,
  getRoadmaps,
  getRoadmapById,
  updateRoadmapStatus,
  getReports,
  getReportById,
  updateReportStatus,
};
