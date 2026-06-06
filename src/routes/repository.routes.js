const express = require('express');

const repositoryController = require('../controllers/repository.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/:repoId', authMiddleware, repositoryController.getRepositoryById);

module.exports = router;
