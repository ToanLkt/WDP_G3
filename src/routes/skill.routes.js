const express = require('express');

const skillController = require('../controllers/skill.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Skills
 *     description: Canonical skill catalog APIs
 */

/**
 * @swagger
 * /api/skills/catalog:
 *   get:
 *     tags: [Skills]
 *     summary: Get the canonical skill catalog
 *     description: Returns standardized skills for canonical skill list, filters, admin, or debug. The main FE roadmap flow does not need to call this if backend responses already include canonicalSkillName and category.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Canonical skill catalog fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/catalog', authMiddleware, skillController.getCatalog);

module.exports = router;
