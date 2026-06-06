const express = require('express');

const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Dashboard
 *     description: Current user dashboard APIs
 */

/**
 * @swagger
 * /api/dashboard/me:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get current user's dashboard overview
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Get dashboard overview successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/me', authMiddleware, dashboardController.getMe);

module.exports = router;
