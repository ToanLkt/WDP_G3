const express = require('express');

const roleController = require('../controllers/role.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Roles
 *     description: Dev2Vec supported role catalog
 */

/**
 * @swagger
 * /api/roles/catalog:
 *   get:
 *     tags: [Roles]
 *     summary: Get the Dev2Vec role catalog
 *     description: Role catalog is aligned with Dev2Vec supported roles. Returns compact metadata for backend, frontend, mobile, devops, and data_scientist only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Role catalog fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Role catalog fetched successfully
 *               data:
 *                 total: 5
 *                 roles:
 *                   - roleId: backend
 *                     roleName: Backend Developer
 *                     category: Software Development
 *                     level: entry
 *                     requiredSkillCount: 5
 *                     optionalSkillCount: 0
 *                     modelRoleLabel: Backend
 *                     modelVersion: dev2vec-demo-v1
 *                     isSupportedByModel: true
 *                     scoringMethod: dev2vec_doc2vec_classifier
 *               errorCode: null
 *       401:
 *         description: Unauthorized
 */
router.get('/catalog', authMiddleware, roleController.getCatalog);

module.exports = router;
