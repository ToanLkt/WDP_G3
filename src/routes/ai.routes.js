const express = require('express');

const aiController = require('../controllers/ai.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/analyze', authMiddleware, aiController.analyzeWithAi);

module.exports = router;
