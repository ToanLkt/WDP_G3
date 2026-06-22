const express = require('express');

const roleController = require('../controllers/role.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Roles
 *     description: Canonical role vector catalog and skill-based career matching
 */

/**
 * @swagger
 * /api/roles/catalog:
 *   get:
 *     tags: [Roles]
 *     summary: Get the role vector catalog
 *     description: Returns compact metadata for roles used by dev2vec-inspired role matching.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role catalog fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/catalog', authMiddleware, roleController.getCatalog);

module.exports = router;
