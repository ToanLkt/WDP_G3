const express = require('express');

const roadmapController = require('../controllers/roadmap.controller');
const roadmapLearningController = require('../controllers/roadmapLearning.controller');
const roadmapProgressController = require('../controllers/roadmapProgress.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { validateGenerateRoadmapBody } = require('../validators/roadmap.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Roadmaps
 *     description: Personalized roadmap generation APIs
 */

/**
 * @swagger
 * /api/roadmaps/generate:
 *   post:
 *     tags: [Roadmaps]
 *     summary: Generate a personalized roadmap for the current user
 *     description: Uses the latest user-contribution analysis and Dev2Vec role match/skill gap output to generate a personalized roadmap. Roadmap skill gaps are derived from Dev2Vec skill prototype similarity, and roleMatch.matchScore is classifier probability * 100.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetRole
 *             properties:
 *               targetRole:
 *                 type: string
 *                 example: Backend Developer
 *               sourceMode:
 *                 type: string
 *                 enum: [single_repo, all_analyzed_repos, selected_repos]
 *                 default: single_repo
 *                 description: Choose roadmap source. If omitted with repoId, single_repo is used. If omitted without repoId, all_analyzed_repos is used.
 *               repoId:
 *                 type: string
 *                 nullable: true
 *                 description: Required when sourceMode is single_repo.
 *               repoIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: []
 *                 description: Required when sourceMode is selected_repos.
 *               roleId:
 *                 type: string
 *                 example: backend
 *               level:
 *                 type: string
 *                 description: Requested level fallback. If Analysis has summary.userLevel, that value becomes effectiveLevel.
 *                 example: beginner
 *               durationWeeks:
 *                 type: integer
 *                 example: 6
 *               language:
 *                 type: string
 *                 example: vi
 *               useRoleMatching:
 *                 type: boolean
 *                 default: true
 *               forceRegenerate:
 *                 type: boolean
 *                 example: false
 *           examples:
 *             singleRepo:
 *               summary: Single repo
 *               value:
 *                 targetRole: Backend Developer
 *                 roleId: backend
 *                 level: beginner
 *                 durationWeeks: 6
 *                 language: vi
 *                 useRoleMatching: true
 *                 forceRegenerate: true
 *                 sourceMode: single_repo
 *                 repoId: 6a2556b67f43e4403f22d27c
 *             allAnalyzedRepos:
 *               summary: All analyzed repos
 *               value:
 *                 targetRole: Backend Developer
 *                 roleId: backend
 *                 level: beginner
 *                 durationWeeks: 6
 *                 language: vi
 *                 useRoleMatching: true
 *                 forceRegenerate: true
 *                 sourceMode: all_analyzed_repos
 *             selectedRepos:
 *               summary: Selected repos
 *               value:
 *                 targetRole: Backend Developer
 *                 roleId: backend
 *                 level: beginner
 *                 durationWeeks: 6
 *                 language: vi
 *                 useRoleMatching: true
 *                 forceRegenerate: true
 *                 sourceMode: selected_repos
 *                 repoIds:
 *                   - 6a2556b67f43e4403f22d27c
 *                   - anotherRepoId
 *     responses:
 *       201:
 *         description: Roadmap generated successfully with compact response contract.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/GeneratedRoadmapResponse'
 *       200:
 *         description: Roadmap fetched successfully with compact response contract.
 *       400:
 *         description: Invalid target role
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/generate',
  authMiddleware,
  validate(validateGenerateRoadmapBody),
  roadmapController.generateRoadmap
);

/**
 * @swagger
 * components:
 *   schemas:
 *     RoadmapSource:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [user_contribution_analysis, multi_repo_user_contribution_analysis]
 *         sourceMode:
 *           type: string
 *           enum: [single_repo, all_analyzed_repos, selected_repos]
 *         analysisId:
 *           type: string
 *           nullable: true
 *         analysisIds:
 *           type: array
 *           items:
 *             type: string
 *         repositoryIds:
 *           type: array
 *           items:
 *             type: string
 *         repositories:
 *           type: array
 *           items:
 *             type: object
 *         totalRepositories:
 *           type: integer
 *         snapshotId:
 *           type: string
 *           nullable: true
 *         snapshotIds:
 *           type: array
 *           items:
 *             type: string
 *         analyzedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         evidenceVersion:
 *           type: string
 *           nullable: true
 *         repositoryId:
 *           type: string
 *         repoName:
 *           type: string
 *         fullName:
 *           type: string
 *         githubUsername:
 *           type: string
 *         totalRepoCommits:
 *           type: integer
 *         userCommits:
 *           type: integer
 *         activeDays:
 *           type: integer
 *         firstCommitDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastCommitDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         userLevel:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *         userReadinessScore:
 *           type: number
 *         careerDirection:
 *           type: string
 *         projectType:
 *           type: string
 *         modelVersion:
 *           type: string
 *           nullable: true
 *         scoringMethod:
 *           type: string
 *           example: dev2vec_doc2vec_classifier
 *         vectorSources:
 *           type: object
 *         sourceStats:
 *           type: object
 *         requestedRoleId:
 *           type: string
 *         resolvedRoleId:
 *           type: string
 *     RoadmapSkillGap:
 *       type: object
 *       properties:
 *         skillName:
 *           type: string
 *         canonicalSkillName:
 *           type: string
 *         category:
 *           type: string
 *         gapType:
 *           type: string
 *           enum: [missing, weak, recommended, matched]
 *         similarity:
 *           type: number
 *           nullable: true
 *         source:
 *           type: string
 *           example: dev2vec
 *         currentLevel:
 *           type: string
 *         targetLevel:
 *           type: string
 *         currentScore:
 *           type: number
 *         requiredScore:
 *           type: number
 *         gap:
 *           type: number
 *         priority:
 *           type: string
 *           enum: [high, medium, low]
 *         reason:
 *           type: string
 *     RoadmapTask:
 *       type: object
 *       properties:
 *         itemId:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         skillName:
 *           type: string
 *         canonicalSkillName:
 *           type: string
 *         category:
 *           type: string
 *         targetRole:
 *           type: string
 *         level:
 *           type: string
 *         priority:
 *           type: string
 *         week:
 *           type: integer
 *         estimatedHours:
 *           type: number
 *         status:
 *           type: string
 *     RoadmapLearningListResponse:
 *       type: object
 *       properties:
 *         roadmapId:
 *           type: string
 *         sourceMode:
 *           type: string
 *         language:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               itemId:
 *                 type: string
 *                 example: main-2-2-api-testing
 *               taskTitle:
 *                 type: string
 *               canonicalSkillName:
 *                 type: string
 *                 example: API Testing
 *               skillName:
 *                 type: string
 *               targetRole:
 *                 type: string
 *               level:
 *                 type: string
 *               week:
 *                 type: integer
 *               priority:
 *                 type: string
 *               learningStatus:
 *                 type: string
 *                 enum: [available, missing]
 *     RoadmapItemLearningGenerateBody:
 *       type: object
 *       properties:
 *         forceRegenerate:
 *           type: boolean
 *           default: false
 *         includeResources:
 *           type: boolean
 *           default: true
 *     RoadmapItemLearningResponse:
 *       type: object
 *       properties:
 *         roadmapId:
 *           type: string
 *         itemId:
 *           type: string
 *           example: main-2-2-api-testing
 *         task:
 *           $ref: '#/components/schemas/RoadmapTask'
 *         learning:
 *           type: object
 *           properties:
 *             skillName:
 *               type: string
 *             canonicalSkillName:
 *               type: string
 *             targetRole:
 *               type: string
 *             level:
 *               type: string
 *             language:
 *               type: string
 *             title:
 *               type: string
 *             overview:
 *               type: string
 *             whyLearn:
 *               type: string
 *             useCases:
 *               type: array
 *               items:
 *                 type: string
 *             howToApply:
 *               type: string
 *             examples:
 *               type: array
 *               items:
 *                 type: object
 *             checklist:
 *               type: array
 *               items:
 *                 type: string
 *             exercises:
 *               type: array
 *               items:
 *                 type: object
 *             commonMistakes:
 *               type: array
 *               items:
 *                 type: string
 *             nextSkills:
 *               type: array
 *               items:
 *                 type: string
 *             resources:
 *               type: array
 *               items:
 *                 type: object
 *         personalizedContext:
 *           type: object
 *         progress:
 *           type: object
 *           nullable: true
 *     GeneratedRoadmapResponse:
 *       type: object
 *       properties:
 *         roadmapId:
 *           type: string
 *         title:
 *           type: string
 *         targetRole:
 *           type: string
 *         roleId:
 *           type: string
 *         requestedLevel:
 *           type: string
 *           nullable: true
 *         effectiveLevel:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *         durationWeeks:
 *           type: integer
 *         language:
 *           type: string
 *         roadmapSource:
 *           $ref: '#/components/schemas/RoadmapSource'
 *         roleMatch:
 *           type: object
 *         skillGapSummary:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RoadmapSkillGap'
 *         mainRoadmap:
 *           type: object
 *         alternativeRoadmaps:
 *           type: array
 *           items:
 *             type: object
 *         progressSummary:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/roadmaps/me:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmaps of the current user
 *     description: Returns compact roadmap response objects only; raw DB fields such as mainPath, supportingPaths, sourceContextSummary, and resources are omitted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived]
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *           example: Backend Developer
 *     responses:
 *       200:
 *         description: Roadmaps fetched successfully with compact response contract.
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, roadmapController.getMyRoadmaps);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap learning progress
 *     description: Fetches task-level progress for a roadmap. Progress is tracked by itemId, not by skillName.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap progress fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap progress fetched successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 progressSummary:
 *                   totalItems: 1
 *                   completedItems: 0
 *                   inProgressItems: 0
 *                   overallProgress: 0
 *                 items:
 *                   - itemId: main-1-1-clean-code
 *                     title: Refactor service layer
 *                     skillName: Clean Code
 *                     canonicalSkillName: Clean Code
 *                     category: Code Quality
 *                     status: not_started
 *                     progressPercent: 0
 *                     startedAt: null
 *                     completedAt: null
 *                     updatedAt: 2026-06-18T00:00:00.000Z
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.get('/:roadmapId/progress', authMiddleware, roadmapProgressController.getRoadmapProgress);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress/items:
 *   patch:
 *     tags: [Roadmaps]
 *     summary: Update one roadmap task progress status
 *     description: Update one roadmap task progress by itemId.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             completed:
 *               value:
 *                 itemId: main-1-1-clean-code
 *                 status: completed
 *             inProgress:
 *               value:
 *                 itemId: main-2-1-api-testing
 *                 status: in_progress
 *                 progressPercent: 50
 *           schema:
 *             type: object
 *             description: skillName is a backward-compatible fallback only. It is not recommended for FE; if it matches multiple items, the API returns 400 and asks for itemId.
 *             required:
 *               - itemId
 *               - status
 *             properties:
 *               itemId:
 *                 type: string
 *                 example: main-2-1-api-testing
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *                 example: completed
 *               progressPercent:
 *                 type: integer
 *                 example: 100
 *     responses:
 *       200:
 *         description: Roadmap item progress updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap item progress updated successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 progressSummary:
 *                   totalItems: 1
 *                   completedItems: 1
 *                   inProgressItems: 0
 *                   overallProgress: 100
 *                 items:
 *                   - itemId: main-2-1-api-testing
 *                     title: Add API integration tests
 *                     skillName: API Testing
 *                     canonicalSkillName: API Testing
 *                     category: Testing
 *                     status: completed
 *                     progressPercent: 100
 *                     startedAt: 2026-06-18T00:00:00.000Z
 *                     completedAt: 2026-06-18T00:00:00.000Z
 *       400:
 *         description: Invalid status or missing itemId
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Invalid roadmap progress status
 *               data: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap progress item not found
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Roadmap progress item not found
 *               data: null
 */
router.patch('/:roadmapId/progress/items', authMiddleware, roadmapProgressController.updateRoadmapItemStatus);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/progress/reset:
 *   post:
 *     tags: [Roadmaps]
 *     summary: Reset roadmap progress
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap progress reset successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Roadmap progress reset successfully
 *               data:
 *                 roadmapId: 665f1f000000000000000001
 *                 progressSummary:
 *                   totalItems: 1
 *                   completedItems: 0
 *                   inProgressItems: 0
 *                   overallProgress: 0
 *                 items:
 *                   - itemId: main-1-1-clean-code
 *                     title: Refactor service layer
 *                     skillName: Clean Code
 *                     canonicalSkillName: Clean Code
 *                     category: Code Quality
 *                     status: not_started
 *                     progressPercent: 0
 *                     startedAt: null
 *                     completedAt: null
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.post('/:roadmapId/progress/reset', authMiddleware, roadmapProgressController.resetRoadmapProgress);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/learning:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap learning availability
 *     description: Get learning availability for all tasks in a roadmap. Uses shared skill learning cache and maps it to roadmap itemId.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap learning fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/RoadmapLearningListResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.get('/:roadmapId/learning', authMiddleware, roadmapLearningController.getRoadmapLearning);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/learning/items/{itemId}:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap task learning content
 *     description: Get learning content for one roadmap task by itemId. Roadmap clients should use this instead of calling shared skill learning directly.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           example: main-2-2-api-testing
 *       - in: query
 *         name: includeResources
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Roadmap item learning found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/RoadmapItemLearningResponse'
 *       400:
 *         description: Invalid itemId
 *       404:
 *         description: Roadmap task or learning content not found
 */
router.get('/:roadmapId/learning/items/:itemId', authMiddleware, roadmapLearningController.getRoadmapItemLearning);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate:
 *   post:
 *     tags: [Roadmaps]
 *     summary: Generate roadmap task learning content
 *     description: Generate or fetch shared learning content for the skill behind a roadmap task, using roadmap/task context.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           example: main-2-2-api-testing
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoadmapItemLearningGenerateBody'
 *           example:
 *             forceRegenerate: false
 *             includeResources: true
 *     responses:
 *       201:
 *         description: Roadmap item learning generated successfully
 *       200:
 *         description: Roadmap item learning already existed
 *       400:
 *         description: Invalid itemId
 *       404:
 *         description: Roadmap task not found
 */
router.post(
  '/:roadmapId/learning/items/:itemId/generate',
  authMiddleware,
  roadmapLearningController.generateRoadmapItemLearning
);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}:
 *   get:
 *     tags: [Roadmaps]
 *     summary: Get roadmap detail
 *     description: Returns one compact roadmap response object. Raw DB fields are omitted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap fetched successfully with compact response contract.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     roadmap:
 *                       $ref: '#/components/schemas/GeneratedRoadmapResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.get('/:roadmapId', authMiddleware, roadmapController.getRoadmapDetail);

/**
 * @swagger
 * /api/roadmaps/{roadmapId}/archive:
 *   patch:
 *     tags: [Roadmaps]
 *     summary: Archive a roadmap
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roadmapId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Roadmap archived successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Roadmap not found
 */
router.patch('/:roadmapId/archive', authMiddleware, roadmapController.archiveRoadmap);

module.exports = router;
