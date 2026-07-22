const express = require("express");

const adminController = require("../controllers/admin.controller");
const adminMiddleware = require("../middlewares/admin.middleware");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Admin management APIs
 */

router.use(authMiddleware, adminMiddleware);

/**
 * @swagger
 * /api/admin/dev2vec/status:
 *   get:
 *     tags: [Admin]
 *     summary: Get Dev2Vec model status
 *     description: Returns the current Dev2Vec artifact and metadata status. This endpoint only reads model metadata and artifact files; it does not run training, extraction, validation, or inference.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dev2Vec model status fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Dev2Vec model status fetched successfully
 *                 errorCode:
 *                   nullable: true
 *                   example: null
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [ready, partial, unavailable]
 *                       example: ready
 *                     modelVersion:
 *                       type: string
 *                       nullable: true
 *                       example: dev2vec-demo-v4
 *                     trainedAt:
 *                       type: string
 *                       nullable: true
 *                       example: 2026-07-06T07:06:34.458Z
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: [Backend, Frontend, Mobile, DevOps, Data Scientist]
 *                     roleIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: [backend, frontend, mobile, devops, data_scientist]
 *                     vectorDims:
 *                       type: object
 *                       properties:
 *                         repo:
 *                           type: integer
 *                           example: 230
 *                         issue:
 *                           type: integer
 *                           example: 150
 *                         api:
 *                           type: integer
 *                           example: 200
 *                         combined:
 *                           type: integer
 *                           example: 580
 *                     dataset:
 *                       type: object
 *                       properties:
 *                         sampleCount:
 *                           type: integer
 *                           example: 75
 *                         samplesPerRole:
 *                           type: object
 *                     artifacts:
 *                       type: object
 *                       properties:
 *                         doc2vecRepo:
 *                           type: boolean
 *                           example: true
 *                         doc2vecIssue:
 *                           type: boolean
 *                           example: true
 *                         doc2vecApi:
 *                           type: boolean
 *                           example: true
 *                         classifier:
 *                           type: boolean
 *                           example: true
 *                         labelEncoder:
 *                           type: boolean
 *                           example: true
 *                         skillVectors:
 *                           type: boolean
 *                           example: true
 *                         metadata:
 *                           type: boolean
 *                           example: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin permission is required
 */
router.get("/dev2vec/status", adminController.getDev2VecStatus);

/**
 * @swagger
 * /api/admin/chat/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Get global chat mode settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat settings fetched successfully. The mode is the global fallback for sessions whose modeSource is GLOBAL.
 *   patch:
 *     tags: [Admin]
 *     summary: Update global chat mode settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [AI_AUTO, MANUAL]
 *     responses:
 *       200:
 *         description: Chat settings updated successfully. Sessions with modeSource GLOBAL resolve effectiveMode from the new setting; SESSION overrides are not changed.
 */
router.get("/chat/settings", adminController.getChatSettings);
router.patch("/chat/settings", adminController.updateChatSettings);

/**
 * @swagger
 * /api/admin/chat/sessions:
 *   get:
 *     tags: [Admin]
 *     summary: Get chat sessions for admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, waiting_admin, answered, closed]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [AI_AUTO, MANUAL]
 *       - in: query
 *         name: modeSource
 *         schema:
 *           type: string
 *           enum: [GLOBAL, SESSION]
 *       - in: query
 *         name: assignedAdminId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat sessions fetched successfully. Each session includes mode, modeSource, effectiveMode, status, closedAt, closedBy, and closeReason.
 */
router.get("/chat/sessions", adminController.getChatSessions);

/**
 * @swagger
 * /api/admin/chat/sessions/{sessionId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get chat session detail for admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat session fetched successfully. Session uses the same effectiveMode serializer as the admin list.
 */
router.get("/chat/sessions/:sessionId", adminController.getChatSessionDetail);

/**
 * @swagger
 * /api/admin/chat/sessions/{sessionId}/messages:
 *   post:
 *     tags: [Admin]
 *     summary: Reply manually to a chat session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin message sent successfully. Closed sessions return CHAT_SESSION_CLOSED; replying does not change modeSource or mode.
 */
router.post("/chat/sessions/:sessionId/messages", adminController.sendChatSessionMessage);

/**
 * @swagger
 * /api/admin/chat/sessions/{sessionId}/close:
 *   patch:
 *     tags: [Admin]
 *     summary: Close a chat session as admin
 *     description: Marks a chat session as closed without deleting messages. Closed sessions remain visible to admin and block user/admin replies and mode changes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Da xu ly xong yeu cau cua user
 *     responses:
 *       200:
 *         description: Chat session closed successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Chat session closed successfully
 *               data:
 *                 session:
 *                   _id: 665f1f000000000000000001
 *                   status: closed
 *                   closedAt: 2026-07-15T00:00:00.000Z
 *                   closedBy: 665f1f000000000000000002
 *               errorCode: null
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin permission is required
 *       404:
 *         description: Chat session not found
 */
router.patch("/chat/sessions/:sessionId/close", adminController.closeChatSession);

/**
 * @swagger
 * /api/admin/chat/sessions/{sessionId}/mode:
 *   patch:
 *     tags: [Admin]
 *     summary: Override mode for one chat session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [AI_AUTO, MANUAL]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat session mode updated successfully. Sets modeSource to SESSION and returns effectiveMode from the requested mode.
 *       400:
 *         description: CHAT_SESSION_CLOSED when the session is closed
 */
router.patch("/chat/sessions/:sessionId/mode", adminController.updateChatSessionMode);

/**
 * @swagger
 * /api/admin/chat/sessions/{sessionId}/use-global-mode:
 *   patch:
 *     tags: [Admin]
 *     summary: Make one chat session follow the global chat mode
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat session switched to global mode. Sets modeSource to GLOBAL, clears session mode, and returns effectiveMode from global settings.
 *       400:
 *         description: CHAT_SESSION_CLOSED when the session is closed
 */
router.patch("/chat/sessions/:sessionId/use-global-mode", adminController.useGlobalChatSessionMode);

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin]
 *     summary: Get admin dashboard overview
 *     description: Returns high-level system metrics for the admin dashboard, including user counts, repository count, analysis count, AI feedback count, active roadmap count, and pending report count. Requires an authenticated admin account.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin permission is required
 */
router.get("/dashboard", adminController.getDashboard);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Get users
 *     description: Returns a paginated list of users for account management. Admins can filter by role, status, or search by name and email. Password fields are never returned.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [student, mentor, counselor, admin]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, banned]
 *     responses:
 *       200:
 *         description: Users fetched successfully
 */
router.get("/users", adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get user detail
 *     description: Returns full profile and account metadata for one user, excluding the password. Use this endpoint before changing a user's status or role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User fetched successfully
 *       404:
 *         description: User not found
 */
router.get("/users/:userId", adminController.getUserById);

/**
 * @swagger
 * /api/admin/users/{userId}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user status
 *     description: Changes whether a user account is active, inactive, or banned. Banned and inactive accounts can be blocked by protected admin flows and can be used by the frontend to restrict access.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, banned]
 *                 example: active
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       400:
 *         description: Invalid status
 *       404:
 *         description: User not found
 */
router.patch("/users/:userId/status", adminController.updateUserStatus);

/**
 * @swagger
 * /api/admin/users/{userId}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Update user role
 *     description: Changes a user's authorization role, such as student, mentor, counselor, or admin. This affects which protected APIs the user can access after their next authenticated request.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [student, mentor, counselor, admin]
 *                 example: admin
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       400:
 *         description: Invalid role
 *       404:
 *         description: User not found
 */
router.patch("/users/:userId/role", adminController.updateUserRole);

/**
 * @swagger
 * /api/admin/github/repositories:
 *   get:
 *     tags: [Admin]
 *     summary: Get GitHub repositories
 *     description: Returns a paginated list of GitHub repositories synced into the system across all users. Supports search by repository name, full name, or language.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repositories fetched successfully
 */
router.get("/github/repositories", adminController.getRepositories);

/**
 * @swagger
 * /api/admin/github/repositories/{repoId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get GitHub repository detail
 *     description: Returns detailed repository metadata, owner user information, and connected GitHub account information for one repository.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository fetched successfully
 *       404:
 *         description: Repository not found
 */
router.get("/github/repositories/:repoId", adminController.getRepositoryById);

/**
 * @swagger
 * /api/admin/analysis:
 *   get:
 *     tags: [Admin]
 *     summary: Get analysis snapshots
 *     description: Returns a paginated list of repository analysis snapshots across all users. Use this to audit detected languages, frameworks, skills, career direction, and scoring output.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis fetched successfully
 */
router.get("/analysis", adminController.getAnalysis);

/**
 * @swagger
 * /api/admin/analysis/{analysisId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get analysis detail
 *     description: Returns the full stored analysis snapshot for one repository analysis, including skills, strengths, weaknesses, recommendations, scores, checklist, and raw analysis data.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis fetched successfully
 *       404:
 *         description: Analysis not found
 */
router.get("/analysis/:analysisId", adminController.getAnalysisById);

/**
 * @swagger
 * /api/admin/ai-feedback:
 *   get:
 *     tags: [Admin]
 *     summary: Get AI feedback records
 *     description: Returns a paginated list of AI feedback records generated from repository analyses. Supports search by repository name, summary, and career direction.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI feedback fetched successfully
 */
router.get("/ai-feedback", adminController.getAiFeedback);

/**
 * @swagger
 * /api/admin/ai-feedback/{feedbackId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get AI feedback detail
 *     description: Returns the full AI feedback record for one generated feedback item, including summary, learning advice, next steps, career suggestion, portfolio advice, and raw AI response.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AI feedback fetched successfully
 *       404:
 *         description: AI feedback not found
 */
router.get("/ai-feedback/:feedbackId", adminController.getAiFeedbackById);

/**
 * @swagger
 * /api/admin/roadmaps:
 *   get:
 *     tags: [Admin]
 *     summary: Get roadmaps
 *     description: Returns a paginated list of generated career roadmaps across all users. Admins can filter by active or archived status and search by target role, current direction, or summary.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived]
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *         description: Defaults to false. When true, includes soft-deleted roadmaps in the admin list.
 *     responses:
 *       200:
 *         description: Roadmaps fetched successfully
 */
router.get("/roadmaps", adminController.getRoadmaps);

/**
 * @swagger
 * /api/admin/roadmaps/{roadmapId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get roadmap detail
 *     description: Returns one full roadmap, including target role, main path, phases, tasks, supporting paths, source context summary, owner user, and roadmap status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *         description: Defaults to false. When true, allows viewing a soft-deleted roadmap detail.
 *     responses:
 *       200:
 *         description: Roadmap fetched successfully
 *       404:
 *         description: Roadmap not found
 */
router.get("/roadmaps/:roadmapId", adminController.getRoadmapById);

/**
 * @swagger
 * /api/admin/roadmaps/{roadmapId}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update roadmap status
 *     description: Changes a roadmap status between active and archived. Use this when admins need to hide, restore, or moderate generated roadmaps.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, archived]
 *                 example: archived
 *     responses:
 *       200:
 *         description: Roadmap status updated successfully
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Roadmap not found
 */
router.patch(
  "/roadmaps/:roadmapId/status",
  adminController.updateRoadmapStatus,
);

/**
 * @swagger
 * /api/admin/reports:
 *   get:
 *     tags: [Admin]
 *     summary: Get reports
 *     description: Returns a paginated list of user-submitted reports. Admins can filter by report status or target type to review abuse, incorrect content, or moderation issues.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_REVIEW, RESOLVED, REJECTED]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [user, repository, analysis, ai_feedback, roadmap, other]
 *     responses:
 *       200:
 *         description: Reports fetched successfully
 */
router.get("/reports", adminController.getReports);

/**
 * @swagger
 * /api/admin/reports/{reportId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get report detail
 *     description: Returns one report with reporter information, target metadata, reason, description, moderation status, admin note, and resolution metadata.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report fetched successfully
 *       404:
 *         description: Report not found
 */
router.get("/reports/:reportId", adminController.getReportById);

/**
 * @swagger
 * /api/admin/reports/{reportId}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Update report status
 *     description: Updates the moderation status of a report, logs the status change, and creates a notification for the report owner.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [IN_REVIEW, RESOLVED, REJECTED]
 *                 example: RESOLVED
 *               adminNote:
 *                 type: string
 *                 example: The incorrect roadmap recommendation has been updated.
 *     responses:
 *       200:
 *         description: Report status updated successfully
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Report not found
 */
router.patch("/reports/:reportId/status", adminController.updateReportStatus);

module.exports = router;
