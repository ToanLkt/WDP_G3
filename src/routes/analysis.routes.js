const express = require('express');

const analysisController = require('../controllers/analysis.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Analysis
 *     description: Repository analysis APIs. skillVector is the canonical dev2vec-inspired skill representation; strengths, weaknesses, missingSkills, and recommendations are derived from it.
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
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include raw skillEvidence in addition to skillVector
 *     responses:
 *       200:
 *         description: Repository analyzed successfully. skillVector is always returned; skillEvidence is returned when includeEvidence=true.
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
 * /api/analysis/repositories/{repoId}/role-matches:
 *   get:
 *     tags: [Roles]
 *     summary: Match the latest repository skillVector to career role vectors
 *     description: Returns compact role matches by default. includeDetails=true adds full matched, weak, and missing skill arrays.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *         description: Filter by role name or roleId
 *       - in: query
 *         name: includeDetails
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Role matches calculated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository or analysis result not found
 */
router.get('/repositories/:repoId/role-matches', authMiddleware, analysisController.getRepositoryRoleMatches);

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
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include raw skillEvidence in addition to skillVector
 *     responses:
 *       200:
 *         description: Analysis result fetched successfully. skillEvidence is returned when includeEvidence=true.
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
 *     parameters:
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include raw skillEvidence in addition to skillVector
 *     responses:
 *       200:
 *         description: My analysis results fetched successfully. skillEvidence is returned when includeEvidence=true.
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, analysisController.getMyAnalysisResults);

module.exports = router;
