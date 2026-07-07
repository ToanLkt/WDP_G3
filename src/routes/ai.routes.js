const express = require('express');

const aiController = require('../controllers/ai.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: AI
 *     description: AI/Gemini utility APIs
 */

/**
 * @swagger
 * /api/ai/health:
 *   get:
 *     tags: [AI]
 *     summary: Check AI/Gemini environment configuration without exposing secrets
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI config checked successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/health', authMiddleware, aiController.getAiHealth);

router.post('/analyze', authMiddleware, aiController.analyzeWithAi);

module.exports = router;
