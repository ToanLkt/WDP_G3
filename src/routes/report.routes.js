const express = require('express');

const reportController = require('../controllers/report.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Reports
 *     description: User report APIs
 */

/**
 * @swagger
 * /api/reports:
 *   post:
 *     tags: [Reports]
 *     summary: Create a report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [user, repository, analysis, ai_feedback, roadmap, other]
 *                 example: repository
 *               targetId:
 *                 type: string
 *                 nullable: true
 *                 example: 665f0b7f25f83e61eac5c001
 *               reason:
 *                 type: string
 *                 example: Inappropriate content
 *               description:
 *                 type: string
 *                 example: This repository contains invalid or abusive content.
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/', authMiddleware, reportController.createReport);

module.exports = router;
