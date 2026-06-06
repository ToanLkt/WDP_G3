const express = require('express');

const analysisController = require('../controllers/analysis.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Analysis
 *     description: Repository analysis APIs
 */

/**
 * @swagger
 * /api/analysis/repositories/{repoId}:
 *   post:
 *     tags: [Analysis]
 *     summary: Analyze a repository and create a new analysis snapshot
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
 *         description: Repository analyzed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.post('/repositories/:repoId', authMiddleware, analysisController.analyzeRepository);

/**
 * @swagger
 * /api/analysis/results/{repoId}:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest analysis result for a repository
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
 *         description: Analysis result fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/results/:repoId', authMiddleware, analysisController.getAnalysisResults);

/**
 * @swagger
 * /api/analysis/me:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest analysis results for all repositories of current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My analysis results fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, analysisController.getMyAnalysisResults);

module.exports = router;
