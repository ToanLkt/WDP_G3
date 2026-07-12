const express = require('express');

const snapshotController = require('../controllers/snapshot.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Snapshots
 *     description: User-contribution analysis snapshot history and deterministic progress comparison APIs.
 */

/**
 * @swagger
 * /api/snapshots/compare:
 *   post:
 *     tags: [Snapshots]
 *     summary: Compare two user-contribution snapshots
 *     description: Compare two user-contribution snapshots owned by the current user. Skill-level comparison is only reliable when both snapshots use the same scoring method. snapshotAId/snapshotBId are deprecated aliases for backward compatibility.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromSnapshotId
 *               - toSnapshotId
 *             properties:
 *               fromSnapshotId:
 *                 type: string
 *                 example: 665f1f000000000000000001
 *               toSnapshotId:
 *                 type: string
 *                 example: 665f1f000000000000000002
 *               snapshotAId:
 *                 type: string
 *                 description: Deprecated alias for fromSnapshotId.
 *                 example: 665f1f000000000000000001
 *               snapshotBId:
 *                 type: string
 *                 description: Deprecated alias for toSnapshotId.
 *                 example: 665f1f000000000000000002
 *           example:
 *             fromSnapshotId: 665f1f000000000000000001
 *             toSnapshotId: 665f1f000000000000000002
 *     responses:
 *       200:
 *         description: Snapshots compared successfully with compact user-contribution comparison.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Snapshots compared successfully
 *               data:
 *                 repoName: WDP_G3
 *                 analysisScopeType: user_contribution
 *                 enoughData: true
 *                 comparisonMode: score_only
 *                 comparableSkillScores: false
 *                 fromSnapshot:
 *                   snapshotId: 665f1f000000000000000001
 *                   userReadinessScore: 66
 *                   userLevel: intermediate
 *                   scoringMethod: legacy_weighted_scoring
 *                 toSnapshot:
 *                   snapshotId: 665f1f000000000000000002
 *                   userReadinessScore: 78.14
 *                   userLevel: intermediate
 *                   scoringMethod: dev2vec_doc2vec_classifier
 *                 delta:
 *                   userReadinessScore: 12.14
 *                   levelChanged: false
 *                   fromLevel: intermediate
 *                   toLevel: intermediate
 *                 skillChanges: []
 *                 newSkills: []
 *                 improvedSkills: []
 *                 weakerSkills: []
 *                 resolvedMissingSkills: []
 *                 newMissingSkills: []
 *                 warnings:
 *                   - Snapshots use different scoring methods, so skill-level comparison is not reliable.
 *       400:
 *         description: Invalid request or snapshots belong to different repositories
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Snapshot not found
 */
router.post('/compare', authMiddleware, snapshotController.compareSnapshots);

/**
 * @swagger
 * /api/snapshots/{snapshotId}:
 *   get:
 *     tags: [Snapshots]
 *     summary: Get one user-contribution analysis snapshot
 *     description: Get one user-contribution analysis snapshot owned by the current user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: snapshotId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only works with view=detail. Includes debug skillVector evidence.
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *     responses:
 *       200:
 *         description: Snapshot fetched successfully with compact response contract.
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Snapshot not found
 */
router.get('/:snapshotId', authMiddleware, snapshotController.getSnapshotById);

module.exports = router;
