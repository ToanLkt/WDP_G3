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
 */
router.post('/repositories/:repoId', authMiddleware, analysisController.analyzeRepository);

/**
 * @swagger
 * /api/analysis/repositories/{repoId}/role-matches:
 *   get:
 *     tags: [Roles]
 *     summary: Match the latest repository skillVector to career role vectors
 *     description: Returns compact role matches by default. includeDetails=true adds full matched, weak, and missing skill arrays.
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
 *           default: 5
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
