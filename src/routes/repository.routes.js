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
 *     summary: Get user-contribution snapshot history for one repository
 *     description: Get user-contribution snapshot history for the current user in one repository.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only works with view=detail.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Repository snapshots fetched successfully with compact user-contribution snapshots.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Repository snapshots fetched successfully
 *               data:
 *                 repositoryId: 665f1f000000000000000010
 *                 repoName: WDP_G3
 *                 fullName: ToanLkt/WDP_G3
 *                 analysisScopeType: user_contribution
 *                 snapshots:
 *                   - snapshotId: 665f1f000000000000000001
 *                     analysisScope:
 *                       type: user_contribution
 *                       userCommits: 11
 *                       activeDays: 6
 *                     summary:
 *                       userLevel: intermediate
 *                       userReadinessScore: 66
 *                       careerDirection: Backend Developer
 *                     topSkills: []
 *                     missingSkills: []
 *                     analyzedAt: 2026-06-18T00:00:00.000Z
 *                     createdAt: 2026-06-18T00:00:00.000Z
 *                 pagination:
 *                   total: 2
 *                   limit: 20
 *                   page: 1
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
 *     summary: Compare first and latest user-contribution snapshots for one repository
 *     description: Compare the first and latest user-contribution snapshots for the current user in one repository.
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
 *         description: Returns compact progress comparison, or enoughData=false if there are fewer than two snapshots.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Not enough snapshots to compare yet
 *               data:
 *                 repositoryId: 665f1f000000000000000010
 *                 repoName: WDP_G3
 *                 analysisScopeType: user_contribution
 *                 enoughData: false
 *                 snapshotsCount: 1
 *                 comparison: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/:repoId/progress-comparison', authMiddleware, snapshotController.compareRepositoryProgress);

router.get('/:repoId', authMiddleware, repositoryController.getRepositoryById);

module.exports = router;
