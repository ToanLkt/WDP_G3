const express = require('express');

const skillController = require('../controllers/skill.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Skills
 *     description: Dev2Vec skill prototype catalog APIs
 */

/**
 * @swagger
 * /api/skills/catalog:
 *   get:
 *     tags: [Skills]
 *     summary: Get the Dev2Vec skill catalog
 *     description: Skill catalog is aligned with Dev2Vec skill prototypes. Legacy aliases are kept internally for canonicalization, but this endpoint returns the compact Dev2Vec prototype catalog.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dev2Vec skill catalog fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Dev2Vec skill catalog fetched successfully
 *               data:
 *                 total: 25
 *                 skills:
 *                   - name: REST API
 *                     category: backend
 *                     aliases:
 *                       - REST
 *                       - RESTful API
 *                       - API
 *                       - Endpoint
 *                       - Swagger
 *                       - OpenAPI
 *                     defaultLevel: intermediate
 *                     tags:
 *                       - backend
 *                       - api
 *                       - rest
 *                       - dev2vec
 *               errorCode: null
 *       401:
 *         description: Unauthorized
 */
router.get('/catalog', authMiddleware, skillController.getCatalog);

module.exports = router;
