const express = require('express');

const profileController = require('../controllers/profile.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  validateCreateProfileBody,
  validateProfileBody,
} = require('../validators/profile.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Profiles
 *     description: Student profile APIs
 */

/**
 * @swagger
 * /api/profiles:
 *   post:
 *     tags: [Profiles]
 *     summary: Create profile for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               university:
 *                 type: string
 *                 example: FPT University
 *               major:
 *                 type: string
 *                 example: Software Engineering
 *               year:
 *                 type: number
 *                 example: 3
 *               targetCareer:
 *                 type: string
 *                 example: Backend Developer
 *               currentSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [JavaScript, Node.js, MongoDB]
 *               githubUsername:
 *                 type: string
 *                 example: student-dev
 *     responses:
 *       201:
 *         description: Profile created successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Profile already exists
 */
router.post('/', authMiddleware, validate(validateCreateProfileBody), profileController.create);

/**
 * @swagger
 * /api/profiles/me:
 *   get:
 *     tags: [Profiles]
 *     summary: Get profile of current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/me', authMiddleware, profileController.getMe);

/**
 * @swagger
 * /api/profiles/me:
 *   patch:
 *     tags: [Profiles]
 *     summary: Update profile of current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyen Van A
 *               university:
 *                 type: string
 *                 example: FPT University
 *               major:
 *                 type: string
 *                 example: Software Engineering
 *               year:
 *                 type: number
 *                 example: 3
 *               targetCareer:
 *                 type: string
 *                 example: Fullstack Developer
 *               currentSkills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [JavaScript, Express, React]
 *               githubUsername:
 *                 type: string
 *                 example: student-dev
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch('/me', authMiddleware, validate(validateProfileBody), profileController.updateMe);

module.exports = router;
