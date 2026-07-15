const adminService = require('../services/admin.service');
const chatService = require('../services/chat.service');
const dev2vecStatusService = require('../services/dev2vec/dev2vecStatus.service');
const { successResponse } = require('../utils/response');

const handle = (serviceCall) => async (req, res, next) => {
  try {
    const result = await serviceCall(req);
    return successResponse(res, result.message, result.data, result.statusCode);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getDashboard: handle(() => adminService.getDashboard()),
  getUsers: handle((req) => adminService.getUsers(req.query)),
  getUserById: handle((req) => adminService.getUserById(req.params.userId)),
  updateUserStatus: handle((req) => adminService.updateUserStatus(req.params.userId, req.body.status)),
  updateUserRole: handle((req) => adminService.updateUserRole(req.params.userId, req.body.role)),
  getRepositories: handle((req) => adminService.getRepositories(req.query)),
  getRepositoryById: handle((req) => adminService.getRepositoryById(req.params.repoId)),
  getAnalysis: handle((req) => adminService.getAnalysis(req.query)),
  getAnalysisById: handle((req) => adminService.getAnalysisById(req.params.analysisId)),
  getAiFeedback: handle((req) => adminService.getAiFeedback(req.query)),
  getAiFeedbackById: handle((req) => adminService.getAiFeedbackById(req.params.feedbackId)),
  getRoadmaps: handle((req) => adminService.getRoadmaps(req.query)),
  getRoadmapById: handle((req) => adminService.getRoadmapById(req.params.roadmapId)),
  updateRoadmapStatus: handle((req) => adminService.updateRoadmapStatus(req.params.roadmapId, req.body.status)),
  getReports: handle((req) => adminService.getReports(req.query)),
  getReportById: handle((req) => adminService.getReportById(req.params.reportId)),
  updateReportStatus: handle((req) =>
    adminService.updateReportStatus({
      reportId: req.params.reportId,
      status: req.body.status,
      adminNote: req.body.adminNote,
      adminUser: req.user,
    })
  ),
  getDev2VecStatus: handle(() => dev2vecStatusService.getDev2VecStatus()),
  getChatSettings: handle(() => chatService.getChatSettings()),
  updateChatSettings: handle((req) => chatService.updateChatSettings({ user: req.user, body: req.body })),
  getChatSessions: handle((req) => chatService.getAdminChatSessions({ query: req.query })),
  getChatSessionDetail: handle((req) => chatService.getAdminChatSessionDetail({ params: req.params })),
  sendChatSessionMessage: handle((req) =>
    chatService.sendAdminChatMessage({ user: req.user, params: req.params, body: req.body })
  ),
  updateChatSessionMode: handle((req) =>
    chatService.updateAdminChatSessionMode({ user: req.user, params: req.params, body: req.body })
  ),
  useGlobalChatSessionMode: handle((req) => chatService.useGlobalChatSessionMode({ params: req.params })),
  closeChatSession: handle((req) =>
    chatService.closeAdminChatSession({ user: req.user, params: req.params, body: req.body })
  ),
};
