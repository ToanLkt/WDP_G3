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
 * /api/admin/chat/settings:
 *   get:
 *     tags: [Admin]
 *     summary: Get global chat mode settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat settings fetched successfully
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
 *         description: Chat settings updated successfully
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
 *         description: Chat sessions fetched successfully
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
 *         description: Chat session fetched successfully
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
 *         description: Admin message sent successfully
 */
router.post("/chat/sessions/:sessionId/messages", adminController.sendChatSessionMessage);

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
 *         description: Chat session mode updated successfully
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
 *         description: Chat session switched to global mode
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
