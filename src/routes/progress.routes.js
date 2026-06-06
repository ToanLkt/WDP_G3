const express = require('express');

const progressController = require('../controllers/progress.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/me', authMiddleware, progressController.getMyProgress);

module.exports = router;
