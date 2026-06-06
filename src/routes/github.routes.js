const express = require('express');

const githubController = require('../controllers/github.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();
const attachFullNameRepoId = (req, res, next) => {
  req.params.repoId = `${req.params.owner}/${req.params.repo}`;
  return next();
};

/**
 * @swagger
 * tags:
 *   - name: GitHub
 *     description: GitHub OAuth and repository APIs
 */

/**
 * @swagger
 * /api/github/oauth:
 *   get:
 *     tags: [GitHub]
 *     summary: Start GitHub OAuth flow
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OAuth URL generated successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/oauth', authMiddleware, githubController.startOAuth);
router.get('/oauth/callback', githubController.handleOAuthCallback);

/**
 * @swagger
 * /api/github/me:
 *   get:
 *     tags: [GitHub]
 *     summary: Get connected GitHub account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub account retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: GitHub account not found
 */
router.get('/me', authMiddleware, githubController.getMe);

/**
 * @swagger
 * /api/github/disconnect:
 *   delete:
 *     tags: [GitHub]
 *     summary: Disconnect current GitHub account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub account disconnected successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/disconnect', authMiddleware, githubController.disconnect);

/**
 * @swagger
 * /api/github/repositories:
 *   get:
 *     tags: [GitHub]
 *     summary: Fetch repositories from GitHub and sync to database
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Repositories fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/repositories', authMiddleware, githubController.getRepositories);

/**
 * @swagger
 * /api/github/repositories/cached:
 *   get:
 *     tags: [GitHub]
 *     summary: Get cached repositories from database
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cached repositories fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/repositories/cached', authMiddleware, githubController.getCachedRepositories);
// package/config endpoints (cached before live)

/**
 * @swagger
 * /api/github/repositories/{repoId}/packages/cached:
 *   get:
 *     tags: [GitHub]
 *     summary: Get cached package and config files for a repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: Cached packages fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/repositories/:owner/:repo/packages/cached', authMiddleware, attachFullNameRepoId, githubController.getCachedPackages);
router.get('/repositories/:repoId/packages/cached', authMiddleware, githubController.getCachedPackages);

/**
 * @swagger
 * /api/github/repositories/{repoId}/packages:
 *   get:
 *     tags: [GitHub]
 *     summary: Fetch package and config files for a repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: Packages fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/repositories/:owner/:repo/packages', authMiddleware, attachFullNameRepoId, githubController.getPackages);
router.get('/repositories/:repoId/packages', authMiddleware, githubController.getPackages);
// commits endpoints (cached before live)

/**
 * @swagger
 * /api/github/repositories/{repoId}/commits/cached:
 *   get:
 *     tags: [GitHub]
 *     summary: Get cached commit history for a repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: Cached commits fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/repositories/:owner/:repo/commits/cached', authMiddleware, attachFullNameRepoId, githubController.getCachedCommits);
router.get('/repositories/:repoId/commits/cached', authMiddleware, githubController.getCachedCommits);

/**
 * @swagger
 * /api/github/repositories/{repoId}/commits:
 *   get:
 *     tags: [GitHub]
 *     summary: Fetch commit history for a repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: Commits fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/repositories/:owner/:repo/commits', authMiddleware, attachFullNameRepoId, githubController.getCommits);
router.get('/repositories/:repoId/commits', authMiddleware, githubController.getCommits);

/**
 * @swagger
 * /api/github/repositories/{repoId}:
 *   get:
 *     tags: [GitHub]
 *     summary: Get repository details by repo id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *     responses:
 *       200:
 *         description: Repository fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/repositories/:owner/:repo', authMiddleware, attachFullNameRepoId, githubController.getRepositoryById);
router.get('/repositories/:repoId', authMiddleware, githubController.getRepositoryById);

module.exports = router;
