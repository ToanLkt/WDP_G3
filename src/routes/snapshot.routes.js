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
 *     description: Compare two user-contribution snapshots owned by the current user. snapshotAId/snapshotBId are deprecated aliases for backward compatibility.
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
 *                 delta:
 *                   userReadinessScore: 21
 *                   levelChanged: true
 *                   fromLevel: beginner
 *                   toLevel: intermediate
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
