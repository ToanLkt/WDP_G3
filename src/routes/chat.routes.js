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
 *     responses:
 *       201:
 *         description: Chat session created successfully
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
 *         description: Chat sessions fetched successfully
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
 *         description: Chat session fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat session not found
 */
router.get('/sessions/:sessionId', authMiddleware, chatController.getChatSessionDetail);

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
 *     responses:
 *       200:
 *         description: Message sent successfully. In AI_AUTO, the response may include intent, contextSource, and skillScoreSummary outside production for debugging.
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
 *                       description: Safe provenance IDs for the analysis/roadmap/progress used by this answer.
 *       400:
 *         description: Invalid request body
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
