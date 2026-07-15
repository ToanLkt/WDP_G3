const express = require('express');

const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  validateCreateChatSessionBody,
  validateSendChatMessageBody,
} = require('../validators/chat.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Chat
 *     description: GitHub-aware mentor chat APIs
 */

/**
 * @swagger
 * /api/chat/sessions:
 *   post:
 *     tags: [Chat]
 *     summary: Create a new chat session
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Tu van GitHub cua toi
 *               repositoryId:
 *                 type: string
 *                 description: Optional repository context to pin to this chat session.
 *               roadmapId:
 *                 type: string
 *                 description: Optional roadmap context to pin to this chat session. Highest priority when present.
 *               analysisId:
 *                 type: string
 *                 description: Optional AnalysisResult context to pin to this chat session.
 *               snapshotId:
 *                 type: string
 *                 description: Optional RepoAnalysisSnapshot context to pin to this chat session.
 *           examples:
 *             repositoryScoped:
 *               summary: Create a session pinned to a repository
 *               value:
 *                 title: Tu van repo WDP_G3
 *                 repositoryId: 665f1f000000000000000001
 *             roadmapScoped:
 *               summary: Create a session pinned to a roadmap
 *               value:
 *                 title: Tu van roadmap Backend
 *                 roadmapId: 665f1f000000000000000002
 *     responses:
 *       201:
 *         description: Chat session created successfully. Session includes mode, modeSource, effectiveMode, status, closedAt, closedBy, and closeReason.
 *       401:
 *         description: Unauthorized
 */
router.post('/sessions', authMiddleware, validate(validateCreateChatSessionBody), chatController.createChatSession);

/**
 * @swagger
 * /api/chat/sessions:
 *   get:
 *     tags: [Chat]
 *     summary: Get chat sessions of current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat sessions fetched successfully. Each session includes mode, modeSource, effectiveMode, status, closedAt, closedBy, and closeReason.
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions', authMiddleware, chatController.getChatSessions);

/**
 * @swagger
 * /api/chat/sessions/{sessionId}:
 *   get:
 *     tags: [Chat]
 *     summary: Get one chat session with messages
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
 *         description: Chat session fetched successfully. Session includes mode, modeSource, effectiveMode, status, closedAt, closedBy, and closeReason.
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat session not found
 */
router.get('/sessions/:sessionId', authMiddleware, chatController.getChatSessionDetail);

/**
 * @swagger
 * /api/chat/sessions/{sessionId}:
 *   delete:
 *     tags: [Chat]
 *     summary: Delete current user's chat session
 *     description: Soft-hides the session from the current user's chat list. Messages are kept for audit/support history.
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
 *         description: Chat session deleted successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Chat session deleted successfully
 *               data:
 *                 sessionId: 665f1f000000000000000001
 *                 deleted: true
 *               errorCode: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat session not found
 */
router.delete('/sessions/:sessionId', authMiddleware, chatController.deleteChatSession);

/**
 * @swagger
 * /api/chat/sessions/{sessionId}/messages:
 *   post:
 *     tags: [Chat]
 *     summary: Send a message to a chat session
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
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: Dua tren GitHub cua toi, toi phu hop Backend hay Fullstack hon?
 *               repositoryId:
 *                 type: string
 *                 description: Optional repository-scoped context. Used when roadmapId is absent.
 *               roadmapId:
 *                 type: string
 *                 description: Optional roadmap-scoped context; highest priority and includes current progress.
 *               analysisId:
 *                 type: string
 *                 description: Optional owned AnalysisResult selector when repositoryId/roadmapId are absent.
 *               snapshotId:
 *                 type: string
 *                 description: Optional owned RepoAnalysisSnapshot selector when repositoryId/roadmapId are absent.
 *           examples:
 *             noSelector:
 *               summary: Use pinned session context or latest analysis fallback
 *               value:
 *                 message: Toi phu hop Backend hay Fullstack hon?
 *             repositoryOverride:
 *               summary: Override and pin session context to a repository
 *               value:
 *                 message: Danh gia repo nay giup toi
 *                 repositoryId: 665f1f000000000000000001
 *     responses:
 *       200:
 *         description: Message sent successfully. The backend resolves effectiveMode from session modeSource plus global settings; AI_AUTO returns aiMessage and MANUAL leaves aiMessage null. CHAT_SESSION_CLOSED is returned when the session is closed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     mode:
 *                       type: string
 *                       enum: [AI_AUTO, MANUAL]
 *                     effectiveMode:
 *                       type: string
 *                       enum: [AI_AUTO, MANUAL]
 *                     modeSource:
 *                       type: string
 *                       enum: [GLOBAL, SESSION]
 *                     status:
 *                       type: string
 *                       enum: [active, waiting_admin, answered, closed]
 *                     userMessage:
 *                       type: object
 *                     aiMessage:
 *                       type: object
 *                       nullable: true
 *                     adminMessage:
 *                       type: object
 *                       nullable: true
 *                     intent:
 *                       type: string
 *                       enum: [WEAK_SKILLS, STRONG_SKILLS, NEXT_SKILLS, ROLE_FIT, REPO_REVIEW, GENERAL, DETAIL_REQUEST]
 *                       description: Present only when NODE_ENV is not production.
 *                     contextSource:
 *                       type: string
 *                       example: skillVector
 *                       description: Present only when NODE_ENV is not production.
 *                     skillScoreSummary:
 *                       type: object
 *                       description: Present only when NODE_ENV is not production.
 *                     context:
 *                       type: object
 *                       description: Safe provenance IDs for the analysis/roadmap/progress used by this answer, including repoName, contextSelectionReason, and contextPinned.
 *       400:
 *         description: Invalid request body or CHAT_SESSION_CLOSED when the session is closed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat session not found
 */
router.post(
  '/sessions/:sessionId/messages',
  authMiddleware,
  validate(validateSendChatMessageBody),
  chatController.sendChatMessage
);

module.exports = router;
