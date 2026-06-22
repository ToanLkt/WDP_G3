const express = require('express');

const learningController = require('../controllers/learning.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Learning
 *     description: Shared learning APIs. skillName may be canonical or an alias; the backend canonicalizes it before query, generation, save, search, and cache.
 */

/**
 * @swagger
 * /api/learning/skills/generate:
 *   post:
 *     tags: [Learning]
 *     summary: Generate shared learning content for a skill
 *     description: Canonicalizes skillName before generation and persistence. New documents are stored only under the canonical skill key.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skillName
 *             properties:
 *               skillName:
 *                 type: string
 *                 example: Code Quality
 *               targetRole:
 *                 type: string
 *                 example: Frontend Developer
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *                 example: beginner
 *               language:
 *                 type: string
 *                 default: vi
 *                 example: vi
 *               forceRegenerate:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Learning content generated successfully with requestedSkillName, canonicalSkillName, and normalizedSkillName metadata
 *       200:
 *         description: Learning content already exists
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post('/skills/generate', authMiddleware, learningController.generateLearningContent);

/**
 * @swagger
 * /api/learning/skills/{skillName}:
 *   get:
 *     tags: [Learning]
 *     summary: Get shared learning content for a skill
 *     description: Accepts a canonical skill or alias. Roadmap clients should prefer task.canonicalSkillName.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: skillName
 *         required: true
 *         schema:
 *           type: string
 *         example: Code Quality
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *           default: Software Developer
 *         example: Frontend Developer
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *           default: beginner
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           default: vi
 *     responses:
 *       200:
 *         description: Learning content found
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Learning content found
 *               data:
 *                 skillName: HTML
 *                 targetRole: Frontend Developer
 *                 level: advanced
 *                 language: vi
 *                 title: "HTML nâng cao: Xây dựng giao diện web có ngữ nghĩa và dễ truy cập"
 *                 overview: "Phần này giúp bạn hiểu sâu hơn về HTML5, semantic HTML, form và accessibility."
 *                 whyLearn: "HTML tốt giúp cải thiện SEO, khả năng truy cập và khả năng bảo trì giao diện."
 *                 useCases: ["Xây dựng form phức tạp có validation.", "Tổ chức cấu trúc trang rõ ràng bằng semantic HTML."]
 *                 howToApply: "Áp dụng semantic HTML khi chia layout, viết form và tối ưu nội dung trang."
 *                 examples: []
 *                 checklist: []
 *                 exercises: []
 *                 commonMistakes: []
 *                 nextSkills: [CSS, JavaScript]
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Learning content not found. Please generate it first.
 */
router.get('/skills/:skillName', authMiddleware, learningController.getLearningContent);

/**
 * @swagger
 * /api/learning/skills/{skillName}/resources:
 *   get:
 *     tags: [Learning]
 *     summary: Get cached learning resources for a skill
 *     description: Canonicalizes skillName before reading the resource cache and returns canonical metadata with resources.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: skillName
 *         required: true
 *         schema:
 *           type: string
 *         example: JWT Auth
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *           default: Software Developer
 *         example: Frontend Developer
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *           default: beginner
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           default: en
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [video, article, docs]
 *           default: video
 *     responses:
 *       200:
 *         description: Learning resources fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Learning resources fetched successfully
 *               data:
 *                 - skillName: HTML
 *                   targetRole: Frontend Developer
 *                   level: beginner
 *                   language: en
 *                   type: video
 *                   title: HTML Tutorial for Beginners
 *                   url: https://www.youtube.com/watch?v=example
 *                   provider: YouTube
 *                   thumbnailUrl: https://img.youtube.com/example.jpg
 *                   channelTitle: Example Channel
 *                   source: curated
 *                   score: 90
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags: [Learning]
 *     summary: Seed or update a learning resource manually
 *     description: Saves the resource under the canonical path skill; body.skillName cannot override it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: skillName
 *         required: true
 *         schema:
 *           type: string
 *         example: CICD
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - url
 *             properties:
 *               title:
 *                 type: string
 *                 example: HTML Tutorial for Beginners
 *               url:
 *                 type: string
 *                 example: https://www.youtube.com/watch?v=example
 *               provider:
 *                 type: string
 *                 example: YouTube
 *               type:
 *                 type: string
 *                 enum: [video, article, docs]
 *                 example: video
 *               language:
 *                 type: string
 *                 example: en
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *                 example: beginner
 *               targetRole:
 *                 type: string
 *                 example: Frontend Developer
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [html, frontend, web]
 *               source:
 *                 type: string
 *                 enum: [curated, youtube_api, manual]
 *                 example: curated
 *               score:
 *                 type: number
 *                 example: 90
 *     responses:
 *       200:
 *         description: Learning resource saved successfully
 *       400:
 *         description: title and url are required
 *       401:
 *         description: Unauthorized
 */
router.get('/skills/:skillName/resources', authMiddleware, learningController.getLearningResources);
router.post('/skills/:skillName/resources', authMiddleware, learningController.saveLearningResource);

/**
 * @swagger
 * /api/learning/skills/{skillName}/resources/search:
 *   post:
 *     tags: [Learning]
 *     summary: Load or search learning resources for a skill and cache them
 *     description: Canonicalizes skillName, checks the canonical cache, then loads curated resources or searches YouTube using the canonical skill name. Alias-specific cache documents are not created.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: skillName
 *         required: true
 *         schema:
 *           type: string
 *         example: docker-compose
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetRole:
 *                 type: string
 *                 example: Frontend Developer
 *               level:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *                 example: beginner
 *               language:
 *                 type: string
 *                 example: en
 *     responses:
 *       201:
 *         description: Resources loaded from catalog or searched from YouTube successfully
 *         content:
 *           application/json:
 *             examples:
 *               loadedFromCatalog:
 *                 summary: Loaded from local catalog
 *                 value:
 *                   success: true
 *                   message: Learning resources loaded from catalog and cached successfully
 *                   data:
 *                     - skillName: HTML
 *                       targetRole: Frontend Developer
 *                       level: beginner
 *                       language: en
 *                       type: video
 *                       title: HTML Tutorial for Beginners
 *                       url: https://www.youtube.com/watch?v=UB1O30fR-EE
 *                       provider: YouTube
 *                       source: curated
 *                       score: 95
 *               youtubeSearched:
 *                 summary: YouTube API searched
 *                 value:
 *                   success: true
 *                   message: Best YouTube resource searched and cached successfully
 *                   data:
 *                     - skillName: HTML
 *                       targetRole: Frontend Developer
 *                       level: beginner
 *                       language: en
 *                       type: video
 *                       title: HTML Tutorial for Beginners
 *                       url: https://www.youtube.com/watch?v=example
 *                       provider: YouTube
 *                       source: youtube_api
 *                       score: 60
 *       200:
 *         description: Learning resources already cached or no relevant YouTube resources found
 *         content:
 *           application/json:
 *             examples:
 *               alreadyCached:
 *                 summary: Existing DB cache
 *                 value:
 *                   success: true
 *                   message: Learning resources already cached
 *                   data:
 *                     - skillName: HTML
 *                       targetRole: Frontend Developer
 *                       level: beginner
 *                       language: en
 *                       type: video
 *                       title: HTML Tutorial for Beginners
 *                       url: https://www.youtube.com/watch?v=UB1O30fR-EE
 *                       provider: YouTube
 *                       source: curated
 *                       score: 95
 *               noRelevantYoutube:
 *                 summary: No YouTube result passed relevance score
 *                 value:
 *                   success: true
 *                   message: No relevant YouTube resources found
 *                   data: []
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: No valid catalog resources found and YOUTUBE_API_KEY is not configured
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: No valid catalog resources found and YOUTUBE_API_KEY is not configured
 *               data: null
 */
router.post('/skills/:skillName/resources/search', authMiddleware, learningController.searchAndCacheYoutubeResources);

module.exports = router;
