const mongoose = require('mongoose');

const AiFeedback = require('../models/AiFeedback');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const Repository = require('../models/Repository');
const Report = require('../models/Report');
const ReportStatusLog = require('../models/ReportStatusLog');
const Roadmap = require('../models/Roadmap');
const User = require('../models/User');
const { roles } = require('../utils/constants');
const { createAutomaticNotification } = require('./notification.service');

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
    AnalysisSnapshot.countDocuments(),
    AiFeedback.countDocuments(),
    Roadmap.countDocuments({ status: 'active' }),
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
  const query = {};
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
    model: AnalysisSnapshot,
    query,
    pagination: getPagination(filters),
    sort: { analyzedAt: -1, createdAt: -1 },
    populate: [
      { path: 'userId', select: 'fullName name email role status' },
      { path: 'repositoryId', select: 'name fullName htmlUrl language' },
    ],
  });

  return {
    message: 'Analysis fetched successfully',
    data,
    statusCode: 200,
  };
};

const getAnalysisById = async (analysisId) => {
  ensureObjectId(analysisId, 'Analysis');

  const analysis = await AnalysisSnapshot.findById(analysisId)
    .populate('userId', 'fullName name email role status')
    .populate('repositoryId', 'name fullName htmlUrl language')
    .lean();

  if (!analysis) {
    throw createStatusError('Analysis not found', 404);
  }

  return {
    message: 'Analysis fetched successfully',
    data: { analysis },
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

  return {
    message: 'AI feedback fetched successfully',
    data: { feedback },
    statusCode: 200,
  };
};

const getRoadmaps = async (filters) => {
  const query = {};
  const search = String(filters.search || '').trim();

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

  const data = await buildListResult({
    model: Roadmap,
    query,
    pagination: getPagination(filters),
    sort: { updatedAt: -1 },
    populate: [{ path: 'userId', select: 'fullName name email role status' }],
  });

  return {
    message: 'Roadmaps fetched successfully',
    data,
    statusCode: 200,
  };
};

const getRoadmapById = async (roadmapId) => {
  ensureObjectId(roadmapId, 'Roadmap');

  const roadmap = await Roadmap.findById(roadmapId).populate('userId', 'fullName name email role status').lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap fetched successfully',
    data: { roadmap },
    statusCode: 200,
  };
};

const updateRoadmapStatus = async (roadmapId, status) => {
  ensureObjectId(roadmapId, 'Roadmap');

  if (!['active', 'archived'].includes(status)) {
    throw createStatusError('status must be one of active, archived', 400);
  }

  const roadmap = await Roadmap.findByIdAndUpdate(roadmapId, { $set: { status } }, { new: true })
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
