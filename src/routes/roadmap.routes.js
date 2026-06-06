const express = require('express');

const roadmapController = require('../controllers/roadmap.controller');
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
