const express = require('express');

const aiFeedbackController = require('../controllers/aiFeedback.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: AI Feedback
 *     description: AI feedback APIs generated from latest Dev2Vec analysis snapshots
 */

/**
 * @swagger
 * /api/ai-feedback/me:
 *   get:
 *     tags: [AI Feedback]
 *     summary: Get latest AI feedback results for all repositories of current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My AI feedback results fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, aiFeedbackController.getMyFeedbacks);

/**
 * @swagger
 * /api/ai-feedback/repositories/{repoId}:
 *   post:
 *     tags: [AI Feedback]
 *     summary: Generate AI feedback from latest Dev2Vec analysis snapshot of a repository
 *     description: Requires running POST /api/analysis/repositories/{repoId} first. Feedback is based on Dev2Vec role prediction, skill gaps, source stats, and evidence preview.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       201:
 *         description: AI feedback generated successfully
 *       400:
 *         description: Dev2Vec analysis is required before generating AI feedback
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.post('/repositories/:repoId', authMiddleware, aiFeedbackController.generateRepositoryFeedback);

/**
 * @swagger
 * /api/ai-feedback/results/{repoId}:
 *   get:
 *     tags: [AI Feedback]
 *     summary: Get latest AI feedback result for a repository
 *     description: Returns the latest saved feedback. Does not regenerate AI feedback or run Dev2Vec inference.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: AI feedback result fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/results/:repoId', authMiddleware, aiFeedbackController.getRepositoryFeedback);

module.exports = router;
