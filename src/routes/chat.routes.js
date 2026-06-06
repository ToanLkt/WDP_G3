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
 *     responses:
 *       200:
 *         description: Message sent successfully
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
