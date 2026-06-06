const express = require('express');

const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { validateCreateNotificationBody } = require('../validators/notification.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: Notification and reminder APIs
 */

/**
 * @swagger
 * /api/notifications/me:
 *   get:
 *     tags: [Notifications]
 *     summary: Get current user's notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Get notifications successfully
 */
router.get('/me', authMiddleware, notificationController.getMe);

/**
 * @swagger
 * /api/notifications:
 *   post:
 *     tags: [Notifications]
 *     summary: Create a notification for current user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, message, type]
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [GITHUB_ANALYSIS_REMINDER, ROADMAP_TASK_REMINDER, REPOSITORY_IMPROVEMENT, SYSTEM]
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Create notification successfully
 */
router.post('/', authMiddleware, validate(validateCreateNotificationBody), notificationController.create);

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mark notification as read successfully
 */
router.patch('/:notificationId/read', authMiddleware, notificationController.markAsRead);

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delete notification successfully
 */
router.delete('/:notificationId', authMiddleware, notificationController.remove);

module.exports = router;
