const express = require('express');

const snapshotController = require('../controllers/snapshot.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Snapshots
 *     description: Repository analysis snapshot history and deterministic progress comparison APIs
 */

/**
 * @swagger
 * /api/snapshots/compare:
 *   post:
 *     tags: [Snapshots]
 *     summary: Compare two repository analysis snapshots
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *               toSnapshotId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns compact skillVectorComparison by default. Full skill changes require includeSkillDetails=true; evidence additionally requires includeEvidence=true.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Snapshots compared successfully
 *               data:
 *                 repoName: WDP_G3
 *                 overallBefore: 45
 *                 overallAfter: 67
 *                 overallChange: 22
 *                 improvedChecklist: [Docker, Testing]
 *                 resolvedMissingSkills: [Testing]
 *                 remainingMissingSkills: [CI/CD]
 *                 summary: Repo da cai thien tong the +22 diem so voi lan phan tich truoc.
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
 *     summary: Get one repository analysis snapshot
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
 *         description: Include raw skillEvidence together with the snapshot skillVector
 *     responses:
 *       200:
 *         description: Snapshot fetched successfully. skillVector represents skills at analysis time; skillEvidence is included only when includeEvidence=true.
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Snapshot not found
 */
router.get('/:snapshotId', authMiddleware, snapshotController.getSnapshotById);

module.exports = router;
