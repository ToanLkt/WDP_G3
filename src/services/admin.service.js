const mongoose = require('mongoose');

const AiFeedback = require('../models/AiFeedback');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const Repository = require('../models/Repository');
const Report = require('../models/Report');
const Roadmap = require('../models/Roadmap');
const User = require('../models/User');
const { roles } = require('../utils/constants');
const { createAutomaticNotification } = require('./notification.service');

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
    Report.countDocuments({ status: 'pending' }),
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

  if (['pending', 'reviewing', 'resolved', 'rejected'].includes(filters.status)) {
    query.status = filters.status;
  }

  if (['user', 'repository', 'analysis', 'ai_feedback', 'roadmap', 'other'].includes(filters.targetType)) {
    query.targetType = filters.targetType;
  }

  const data = await buildListResult({
    model: Report,
    query,
    pagination: getPagination(filters),
    sort: { createdAt: -1 },
    populate: [
      { path: 'reporterId', select: 'fullName name email role status' },
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
    .populate('reporterId', 'fullName name email role status')
    .populate('resolvedBy', 'fullName name email role status')
    .lean();

  if (!report) {
    throw createStatusError('Report not found', 404);
  }

  return {
    message: 'Report fetched successfully',
    data: { report },
    statusCode: 200,
  };
};

const updateReportStatus = async ({ reportId, status, adminNote, adminUser }) => {
  ensureObjectId(reportId, 'Report');

  if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(status)) {
    throw createStatusError('status must be one of pending, reviewing, resolved, rejected', 400);
  }

  const userId = adminUser && (adminUser.userId || adminUser.id);
  const update = {
    status,
    adminNote: String(adminNote || '').trim(),
  };

  if (['resolved', 'rejected'].includes(status)) {
    update.resolvedBy = userId || null;
    update.resolvedAt = new Date();
  } else {
    update.resolvedBy = null;
    update.resolvedAt = null;
  }

  const report = await Report.findByIdAndUpdate(reportId, { $set: update }, { new: true })
    .populate('reporterId', 'fullName name email role status')
    .populate('resolvedBy', 'fullName name email role status')
    .lean();

  if (!report) {
    throw createStatusError('Report not found', 404);
  }

  if (['reviewing', 'resolved', 'rejected'].includes(status)) {
    const statusLabels = {
      reviewing: 'đang được xem xét',
      resolved: 'đã được xử lý',
      rejected: 'đã bị từ chối',
    };

    await createAutomaticNotification({
      userId: report.reporterId?._id || report.reporterId,
      title: 'Phản hồi báo cáo từ quản trị viên',
      message: `Báo cáo của bạn ${statusLabels[status]}.`,
      type: 'SYSTEM',
      metadata: {
        event: 'report_status_updated',
        reportId: report._id,
        status: report.status,
        targetType: report.targetType,
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
