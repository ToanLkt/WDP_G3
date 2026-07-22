const express = require('express');

const analysisController = require('../controllers/analysis.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Analysis
 *     description: Repository analysis APIs. skillVector is the canonical dev2vec-inspired skill representation; strengths, weaknesses, missingSkills, and recommendations are derived from it.
 */

/**
 * @swagger
 * /api/analysis/repositories/{repoId}:
 *   post:
 *     tags: [Analysis]
 *     summary: Analyze a repository and create a new analysis snapshot
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *           example: {}
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *         description: summary returns compact user-contribution analysis; detail adds analyzedAt, analyzedCommitShas, and scoreBreakdown.
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only works with view=detail. Includes debug skillVector evidence for admin/debug.
 *       - in: query
 *         name: forceRegenerate
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Bypass exact and incremental caches; public response remains unchanged.
 *     responses:
 *       200:
 *         description: Repository analyzed successfully. Default response is compact and scoped to current user's contribution.
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
 *                   $ref: '#/components/schemas/AnalysisResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 *       502:
 *         description: Dev2Vec local process failed or returned invalid output
 *       503:
 *         description: Dev2Vec Python executable or model process is unavailable
 *       504:
 *         description: Dev2Vec local process timed out
 */
router.post(
  '/repositories/:repoId',
  analysisController.logAnalysisRequestReceived,
  authMiddleware,
  analysisController.analyzeRepository,
);

/**
 * @swagger
 * /api/analysis/role-matches:
 *   post:
 *     tags: [Roles]
 *     summary: Generate role matches from analyzed repository sources
 *     description: |
 *       Match the current user's repository evidence with Dev2Vec classifier output using one repository, all analyzed repositories, or selected repositories.
 *       matchScore is Dev2Vec classifier probability * 100. Skill arrays are derived from Dev2Vec skill prototype similarity gaps.
 *       Single-repo mode reuses cached AnalysisResult.dev2vec when available; multi-repo mode builds one combined Dev2Vec input.
 *       Default response is compact for FE role selection. Use view=detail or includeDetails=true for full skill breakdown.
 *
 *       FE flow:
 *       1. POST /api/analysis/role-matches with chosen sourceMode.
 *       2. User selects a role.
 *       3. POST /api/roadmaps/generate with the same sourceMode and selected roleId/targetRole.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceMode:
 *                 type: string
 *                 enum: [single_repo, all_analyzed_repos, selected_repos]
 *                 default: all_analyzed_repos
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
 *               limit:
 *                 type: number
 *                 default: 3
 *                 maximum: 3
 *               view:
 *                 type: string
 *                 enum: [summary, detail]
 *                 default: summary
 *               includeDetails:
 *                 type: boolean
 *                 default: false
 *               forceRegenerate:
 *                 type: boolean
 *                 default: false
 *                 description: Optional internal cache bypass for single_repo mode. Response schema is unchanged.
 *           examples:
 *             singleRepo:
 *               summary: Single repo
 *               value:
 *                 sourceMode: single_repo
 *                 repoId: 6a2556b67f43e4403f22d27c
 *                 limit: 3
 *             allAnalyzedRepos:
 *               summary: All analyzed repos
 *               value:
 *                 sourceMode: all_analyzed_repos
 *                 limit: 3
 *             selectedRepos:
 *               summary: Selected repos
 *               value:
 *                 sourceMode: selected_repos
 *                 repoIds:
 *                   - 6a2556b67f43e4403f22d27c
 *                   - anotherRepoId
 *                 limit: 3
 *                 view: summary
 *     parameters:
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *         description: summary returns compact FE role cards. detail returns full skill breakdown.
 *       - in: query
 *         name: includeDetails
 *         schema:
 *           type: boolean
 *           default: false
 *         description: When true, returns full skill breakdown and full analysisSource fields.
 *     responses:
 *       200:
 *         description: Role matches generated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Role matches generated successfully
 *               data:
 *                 sourceMode: selected_repos
 *                 analysisSource:
 *                   type: multi_repo_user_contribution_analysis
 *                   sourceMode: selected_repos
 *                   totalRepositories: 3
 *                   totalUserCommits: 11
 *                   userLevel: intermediate
 *                   userReadinessScore: 61
 *                   repositoryNames:
 *                     - HCM-City-Rain-Map---Mua-Sai-Gon
 *                     - marxist-ai-chronicles
 *                     - WDP_G3
 *                 matches:
 *                   - roleId: backend
 *                     roleName: Backend Developer
 *                     matchScore: 78.13
 *                     matchLevel: strong
 *                     matchLevelLabel: Tạm phù hợp
 *                     matchedSkillNames:
 *                       - Express.js
 *                       - REST API
 *                       - Authentication
 *                       - MongoDB
 *                     weakSkillNames:
 *                       - Node.js
 *                     missingSkillNames:
 *                       - API Security
 *                       - Testing
 *                       - API Testing
 *                       - Clean Code
 *                     recommendedNextSkills:
 *                       - Testing
 *                       - API Testing
 *                       - Clean Code
 *                       - API Security
 *                       - CI/CD
 *                     probability: 0.781326
 *                     rank: 1
 *                     modelVersion: dev2vec-demo-v4
 *                     scoringMethod: dev2vec_doc2vec_classifier
 *               errorCode: null
 *       400:
 *         description: Missing analysis source or invalid source selection
 *       401:
 *         description: Unauthorized
 */
router.post('/role-matches', authMiddleware, analysisController.generateRoleMatches);

/**
 * @swagger
 * /api/analysis/repositories/{repoId}/role-matches:
 *   get:
 *     tags: [Roles]
 *     summary: Legacy single-repo role matching
 *     description: Legacy single-repo role matching powered by Dev2Vec. Reuses cached AnalysisResult.dev2vec when available; otherwise runs Dev2Vec inference from repository package/commit evidence. matchScore is classifier probability * 100, and skill arrays come from Dev2Vec skill prototype similarity gaps. FE should prefer POST /api/analysis/role-matches for single_repo, all_analyzed_repos, or selected_repos flows. Returns compact role matches by default. includeDetails=true adds full matched, weak, and missing skill arrays plus optional Dev2Vec metadata.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 3
 *           minimum: 1
 *           maximum: 3
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *         description: Filter by role name or roleId
 *       - in: query
 *         name: includeDetails
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Role matches calculated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository or analysis result not found
 */
router.get('/repositories/:repoId/role-matches', authMiddleware, analysisController.getRepositoryRoleMatches);

/**
 * @swagger
 * /api/analysis/results/{repoId}:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest analysis result for a repository
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: repoId
 *         required: true
 *         schema:
 *           type: string
 *         description: Repository MongoDB _id or GitHub repo id
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *         description: summary returns compact response; detail adds analyzedAt, analyzedCommitShas, and scoreBreakdown.
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only works with view=detail. Includes debug skillVector evidence for admin/debug.
 *     responses:
 *       200:
 *         description: Analysis result fetched successfully.
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.get('/results/:repoId', authMiddleware, analysisController.getAnalysisResults);

/**
 * @swagger
 * /api/analysis/me:
 *   get:
 *     tags: [Analysis]
 *     summary: Get latest analysis results for all repositories of current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [summary, detail]
 *           default: summary
 *         description: summary returns compact list items. List items stay compact and do not include full skillVector.
 *       - in: query
 *         name: includeEvidence
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only works with view=detail. Includes debug skillVector evidence for admin/debug.
 *     responses:
 *       200:
 *         description: My analysis results fetched successfully. Default list items are compact and do not include full skillVector.
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, analysisController.getMyAnalysisResults);

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalysisScopeSummary:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [user_contribution]
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
 *     AnalysisCompactSkill:
 *       type: object
 *       properties:
 *         skill:
 *           type: string
 *         canonicalSkillName:
 *           type: string
 *         category:
 *           type: string
 *         score:
 *           type: number
 *         level:
 *           type: string
 *     AnalysisMissingSkill:
 *       type: object
 *       properties:
 *         skill:
 *           type: string
 *         canonicalSkillName:
 *           type: string
 *         category:
 *           type: string
 *         priority:
 *           type: string
 *           enum: [high, medium, low]
 *     AnalysisResponseSummary:
 *       type: object
 *       properties:
 *         careerDirection:
 *           type: string
 *         userLevel:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *         userReadinessScore:
 *           type: number
 *         overallScore:
 *           type: number
 *         projectType:
 *           type: string
 *         confidence:
 *           type: string
 *           enum: [low, medium, high]
 *     AnalysisScoreBreakdown:
 *       type: object
 *       properties:
 *         skillScore:
 *           type: number
 *         contributionScore:
 *           type: number
 *         commitQualityScore:
 *           type: number
 *         projectCompletenessScore:
 *           type: number
 *         missingCriticalPenalty:
 *           type: number
 *         confidence:
 *           type: string
 *           enum: [low, medium, high]
 *     AnalysisDebugSkill:
 *       type: object
 *       properties:
 *         skill:
 *           type: string
 *         canonicalSkillName:
 *           type: string
 *         normalizedSkillName:
 *           type: string
 *         category:
 *           type: string
 *         score:
 *           type: number
 *         level:
 *           type: string
 *         evidence:
 *           type: array
 *           items:
 *             type: string
 *         sources:
 *           type: array
 *           items:
 *             type: string
 *         lastCalculatedAt:
 *           type: string
 *           format: date-time
 *     AnalysisResponse:
 *       type: object
 *       properties:
 *         analysisId:
 *           type: string
 *         snapshotId:
 *           type: string
 *           nullable: true
 *         repository:
 *           type: object
 *           properties:
 *             repositoryId:
 *               type: string
 *             githubRepoId:
 *               type: number
 *             repoName:
 *               type: string
 *             fullName:
 *               type: string
 *         analysisScope:
 *           $ref: '#/components/schemas/AnalysisScopeSummary'
 *         summary:
 *           $ref: '#/components/schemas/AnalysisResponseSummary'
 *         topSkills:
 *           type: array
 *           maxItems: 5
 *           items:
 *             $ref: '#/components/schemas/AnalysisCompactSkill'
 *         missingSkills:
 *           type: array
 *           maxItems: 5
 *           items:
 *             $ref: '#/components/schemas/AnalysisMissingSkill'
 *         strengths:
 *           type: array
 *           maxItems: 3
 *           items:
 *             type: string
 *         weaknesses:
 *           type: array
 *           maxItems: 3
 *           items:
 *             type: string
 *         recommendations:
 *           type: array
 *           maxItems: 3
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         analyzedAt:
 *           type: string
 *           format: date-time
 *           description: Returned only with view=detail or list responses.
 *         scoreBreakdown:
 *           $ref: '#/components/schemas/AnalysisScoreBreakdown'
 *           description: Returned only with view=detail.
 *         debug:
 *           type: object
 *           description: Returned only with view=detail&includeEvidence=true.
 *           properties:
 *             skillVector:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AnalysisDebugSkill'
 */

module.exports = router;
