const express = require('express');

const roadmapController = require('../controllers/roadmap.controller');
const roadmapProgressController = require('../controllers/roadmapProgress.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { validateGenerateRoadmapBody } = require('../validators/roadmap.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Roadmaps
 *     description: Personalized roadmap generation APIs
 */

/**
 * @swagger
 * /api/roadmaps/generate:
 *   post:
 *     tags: [Roadmaps]
 *     summary: Generate a personalized roadmap for the current user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetRole
 *             properties:
 *               targetRole:
 *                 type: string
 *                 example: Backend Developer
 *               forceRegenerate:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Roadmap generated successfully
 *       200:
 *         description: Existing roadmap fetched successfully
 *       400:
 *         description: Invalid target role
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/generate',
  authMiddleware,
  validate(validateGenerateRoadmapBody),
  roadmapController.generateRoadmap
);

/**
 * @swagger
 * /api/roadmaps/me:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmaps of the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived]
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *           example: Backend Developer
 *     responses:
 *       200:
 *         description: Roadmaps fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, roadmapController.getMyRoadmaps);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap learning progress
 *     description: Fetches the current user's progress for a roadmap. If no progress record exists, it is initialized from the roadmap skills.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap progress fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap progress fetched successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 overallProgress: 0
 *                 items:
 *                   - skillName: HTML
 *                     normalizedSkillName: html
 *                     status: not_started
 *                     progressPercent: 0
 *                     startedAt: null
 *                     completedAt: null
 *                     updatedAt: 2026-06-18T00:00:00.000Z
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.get('/:roadmapId/progress', authMiddleware, roadmapProgressController.getRoadmapProgress);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress/items:
 *   patch:
 *     tags: [Roadmaps]
 *     summary: Update one roadmap skill progress status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skillName
 *               - status
 *             properties:
 *               skillName:
 *                 type: string
 *                 example: HTML
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *                 example: completed
 *     responses:
 *       200:
 *         description: Roadmap item progress updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap item progress updated successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 overallProgress: 63
 *                 items:
 *                   - skillName: HTML
 *                     normalizedSkillName: html
 *                     status: completed
 *                     progressPercent: 100
 *                     startedAt: 2026-06-18T00:00:00.000Z
 *                     completedAt: 2026-06-18T00:00:00.000Z
 *       400:
 *         description: Invalid status or missing skillName
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Invalid roadmap progress status
 *               data: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap progress item not found
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Roadmap progress item not found
 *               data: null
 */
router.patch('/:roadmapId/progress/items', authMiddleware, roadmapProgressController.updateRoadmapItemStatus);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress/reset:
 *   post:
 *     tags: [Roadmaps]
 *     summary: Reset roadmap progress
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap progress reset successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap progress reset successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 overallProgress: 0
 *                 items:
 *                   - skillName: HTML
 *                     normalizedSkillName: html
 *                     status: not_started
 *                     progressPercent: 0
 *                     startedAt: null
 *                     completedAt: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.post('/:roadmapId/progress/reset', authMiddleware, roadmapProgressController.resetRoadmapProgress);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap detail
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.get('/:roadmapId', authMiddleware, roadmapController.getRoadmapDetail);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/archive:
 *   patch:
 *     tags: [Roadmaps]
 *     summary: Archive a roadmap
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap archived successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.patch('/:roadmapId/archive', authMiddleware, roadmapController.archiveRoadmap);

module.exports = router;
