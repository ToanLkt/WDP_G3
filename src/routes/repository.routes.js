const express = require('express');

const repositoryController = require('../controllers/repository.controller');
const snapshotController = require('../controllers/snapshot.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/repositories/{repoId}/snapshots:
 *   get:
 *     tags: [Snapshots]
 *     summary: Get snapshot history for one repository
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
 *         description: Repository snapshots fetched successfully. Each item includes a compact skillVectorSummary.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Repository snapshots fetched successfully
 *               data:
 *                 total: 2
 *                 snapshots:
 *                   - _id: 665f1f000000000000000001
 *                     repositoryId: 665f1f000000000000000010
 *                     repoName: WDP_G3
 *                     fullName: ToanLkt/WDP_G3
 *                     careerDirection: Backend Developer
 *                     overallScore: 67
 *                     missingSkills: [Testing, CI/CD]
 *                     skillVectorSummary:
 *                       totalSkills: 18
 *                       strongSkills: 13
 *                       developingSkills: 2
 *                       weakSkills: 0
 *                       missingSkills: 3
 *                     analyzedAt: 2026-06-18T00:00:00.000Z
 *                     createdAt: 2026-06-18T00:00:00.000Z
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/:repoId/snapshots', authMiddleware, snapshotController.getRepositorySnapshots);

/**
 * @swagger
 * /api/repositories/{repoId}/progress-comparison:
 *   get:
 *     tags: [Snapshots]
 *     summary: Compare first and latest snapshots for one repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeSkillDetails
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include full per-skill comparison arrays
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include evidence and sources when includeSkillDetails=true
 *     responses:
 *       200:
 *         description: Returns compact skillVectorComparison between the first and latest snapshot by default.
 *       400:
 *         description: At least two snapshots are required for comparison
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: At least two snapshots are required for comparison
 *               data: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/:repoId/progress-comparison', authMiddleware, snapshotController.compareRepositoryProgress);

router.get('/:repoId', authMiddleware, repositoryController.getRepositoryById);

module.exports = router;
