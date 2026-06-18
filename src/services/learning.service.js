const LearningContent = require('../models/LearningContent');
const LearningResource = require('../models/LearningResource');
const { generateJsonWithGemini } = require('./ai.service');
const { buildLearningPrompt } = require('./ai/learning.prompt');
const { createStatusError } = require('./github/github.utils');
const { findCatalogResources } = require('./learningResourceCatalog.service');
const { searchYoutubeVideos } = require('./youtube.service');
const normalizeText = require('../utils/normalizeText');

const DEFAULT_TARGET_ROLE = 'Software Developer';
const DEFAULT_LEVEL = 'beginner';
const DEFAULT_CONTENT_LANGUAGE = 'vi';
const DEFAULT_RESOURCE_LANGUAGE = 'en';
const DEFAULT_RESOURCE_TYPE = 'video';
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_RESOURCE_TYPES = ['video', 'article', 'docs'];
const VALID_RESOURCE_SOURCES = ['curated', 'youtube_api', 'manual'];

const normalizeLevel = (level) => {
  const normalized = normalizeText(level || DEFAULT_LEVEL);
  return VALID_LEVELS.includes(normalized) ? normalized : DEFAULT_LEVEL;
};

const normalizeType = (type) => {
  const normalized = normalizeText(type || DEFAULT_RESOURCE_TYPE);
  return VALID_RESOURCE_TYPES.includes(normalized) ? normalized : DEFAULT_RESOURCE_TYPE;
};

const normalizeSource = (source) => {
  const normalized = normalizeText(source || 'manual');
  return VALID_RESOURCE_SOURCES.includes(normalized) ? normalized : 'manual';
};

const normalizeLanguage = (language, defaultLanguage) =>
  normalizeText(language || defaultLanguage) || defaultLanguage;

const buildLearningIdentity = ({ skillName, targetRole, level, language }) => {
  const cleanSkillName = String(skillName || '').trim();
  const cleanTargetRole = String(targetRole || DEFAULT_TARGET_ROLE).trim() || DEFAULT_TARGET_ROLE;

  return {
    skillName: cleanSkillName,
    normalizedSkillName: normalizeText(cleanSkillName),
    targetRole: cleanTargetRole,
    normalizedTargetRole: normalizeText(cleanTargetRole),
    level: normalizeLevel(level),
    language: normalizeLanguage(language, DEFAULT_CONTENT_LANGUAGE),
  };
};

const buildResourceQuery = ({ skillName, targetRole, level, language, type }) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language: DEFAULT_CONTENT_LANGUAGE });
  return {
    identity,
    query: {
      normalizedSkillName: identity.normalizedSkillName,
      normalizedTargetRole: identity.normalizedTargetRole,
      level: identity.level,
      language: normalizeLanguage(language, DEFAULT_RESOURCE_LANGUAGE),
      type: normalizeType(type),
    },
  };
};

function extractJsonFromText(text) {
  const cleaned = String(text || '')
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(cleaned);
}

const stringArray = (values, limit = 12) =>
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, limit);

const sanitizeLearningContent = (payload) => ({
  title: String(payload?.title || '').trim(),
  overview: String(payload?.overview || '').trim(),
  whyLearn: String(payload?.whyLearn || '').trim(),
  useCases: stringArray(payload?.useCases),
  howToApply: String(payload?.howToApply || '').trim(),
  examples: (Array.isArray(payload?.examples) ? payload.examples : [])
    .map((example) => ({
      title: String(example?.title || '').trim(),
      code: String(example?.code || '').trim(),
      explanation: String(example?.explanation || '').trim(),
    }))
    .filter((example) => example.title || example.code || example.explanation)
    .slice(0, 5),
  checklist: stringArray(payload?.checklist),
  exercises: (Array.isArray(payload?.exercises) ? payload.exercises : [])
    .map((exercise) => ({
      title: String(exercise?.title || '').trim(),
      description: String(exercise?.description || '').trim(),
    }))
    .filter((exercise) => exercise.title || exercise.description)
    .slice(0, 6),
  commonMistakes: stringArray(payload?.commonMistakes),
  nextSkills: stringArray(payload?.nextSkills),
});

const getLearningContent = async ({ skillName, targetRole, level, language }) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const content = await LearningContent.findOne({
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
  }).lean();

  if (!content) {
    throw createStatusError('Learning content not found. Please generate it first.', 404);
  }

  return {
    message: 'Learning content found',
    data: content,
    statusCode: 200,
  };
};

const generateLearningContent = async ({ skillName, targetRole, level, language, forceRegenerate } = {}) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const contentQuery = {
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
  };
  const existing = forceRegenerate ? null : await LearningContent.findOne(contentQuery).lean();

  if (existing) {
    return {
      message: 'Learning content already exists',
      data: existing,
      statusCode: 200,
    };
  }

  const prompt = buildLearningPrompt(identity);
  const aiResult = await generateJsonWithGemini(prompt, { temperature: 0.4 });
  const parsed = extractJsonFromText(aiResult.text);
  const content = await LearningContent.findOneAndUpdate(
    contentQuery,
    {
      $set: {
        ...identity,
        ...sanitizeLearningContent(parsed),
        generatedBy: 'ai',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    message: 'Learning content generated successfully',
    data: content.toObject(),
    statusCode: 201,
  };
};

const sortResources = (query) =>
  LearningResource.aggregate([
    { $match: query },
    {
      $addFields: {
        sourcePriority: {
          $switch: {
            branches: [
              { case: { $eq: ['$source', 'curated'] }, then: 3 },
              { case: { $eq: ['$source', 'manual'] }, then: 2 },
            ],
            default: 1,
          },
        },
      },
    },
    { $sort: { sourcePriority: -1, score: -1, createdAt: -1 } },
    { $project: { sourcePriority: 0 } },
  ]);

const getLearningResources = async ({ skillName, targetRole, level, language, type }) => {
  const { identity, query } = buildResourceQuery({ skillName, targetRole, level, language, type });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const resources = await sortResources(query);

  return {
    message: resources.length ? 'Learning resources fetched successfully' : 'No learning resources found',
    data: resources,
    statusCode: 200,
  };
};

const saveResourceByUrl = (resourcePayload) =>
  LearningResource.findOneAndUpdate(
    { url: resourcePayload.url },
    { $set: resourcePayload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

const saveLearningResource = async ({ skillName, body = {} }) => {
  const { identity } = buildResourceQuery({
    skillName,
    targetRole: body?.targetRole,
    level: body?.level,
    language: body?.language,
    type: body?.type,
  });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  if (!body.title || !body.url) {
    throw createStatusError('title and url are required', 400);
  }

  const resourcePayload = {
    ...identity,
    language: normalizeLanguage(body.language, DEFAULT_RESOURCE_LANGUAGE),
    type: normalizeType(body.type),
    title: String(body.title).trim(),
    url: String(body.url).trim(),
    provider: String(body.provider || 'YouTube').trim() || 'YouTube',
    thumbnailUrl: String(body.thumbnailUrl || '').trim(),
    channelTitle: String(body.channelTitle || '').trim(),
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    tags: stringArray(body.tags),
    source: normalizeSource(body.source),
    score: Number.isFinite(Number(body.score)) ? Number(body.score) : 0,
  };

  const resource = await saveResourceByUrl(resourcePayload);

  return {
    message: 'Learning resource saved successfully',
    data: resource,
    statusCode: 200,
  };
};

const searchAndCacheYoutubeResources = async ({ skillName, targetRole, level, language }) => {
  const { identity, query } = buildResourceQuery({
    skillName,
    targetRole,
    level,
    language,
    type: DEFAULT_RESOURCE_TYPE,
  });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const existing = await sortResources(query);
  if (existing.length) {
    return {
      message: 'Learning resources already cached',
      data: existing,
      statusCode: 200,
    };
  }

  const catalogResources = findCatalogResources({
    skillName: identity.skillName,
    targetRole: identity.targetRole,
    level: identity.level,
    language: query.language,
    type: DEFAULT_RESOURCE_TYPE,
  });

  if (catalogResources.length) {
    const savedCatalogResources = [];
    for (const catalogResource of catalogResources) {
      const resource = await saveResourceByUrl({
        ...identity,
        language: String(catalogResource.language || query.language).trim() || query.language,
        type: normalizeType(catalogResource.type),
        title: String(catalogResource.title || '').trim(),
        url: String(catalogResource.url || '').trim(),
        provider: String(catalogResource.provider || 'YouTube').trim() || 'YouTube',
        thumbnailUrl: String(catalogResource.thumbnailUrl || '').trim(),
        channelTitle: String(catalogResource.channelTitle || '').trim(),
        publishedAt: catalogResource.publishedAt ? new Date(catalogResource.publishedAt) : undefined,
        tags: stringArray(catalogResource.tags),
        source: 'curated',
        score: Number.isFinite(Number(catalogResource.score)) ? Number(catalogResource.score) : 0,
        cachedAt: new Date(),
      });

      if (resource) {
        savedCatalogResources.push(resource);
      }
    }

    return {
      message: 'Learning resources loaded from catalog and cached successfully',
      data: savedCatalogResources.sort((a, b) => (b.score || 0) - (a.score || 0)),
      statusCode: 201,
    };
  }

  if (!process.env.YOUTUBE_API_KEY) {
    throw createStatusError('No valid catalog resources found and YOUTUBE_API_KEY is not configured', 500);
  }

  const videos = await searchYoutubeVideos({
    skillName: identity.skillName,
    targetRole: identity.targetRole,
    level: identity.level,
    language: query.language,
  });

  const bestVideo = videos[0];
  if (!bestVideo) {
    return {
      message: 'No relevant YouTube resources found',
      data: [],
      statusCode: 200,
    };
  }

  const savedResource = await saveResourceByUrl({
    ...identity,
    language: query.language,
    type: DEFAULT_RESOURCE_TYPE,
    title: bestVideo.title,
    url: bestVideo.url,
    provider: bestVideo.provider,
    thumbnailUrl: bestVideo.thumbnailUrl,
    channelTitle: bestVideo.channelTitle,
    publishedAt: bestVideo.publishedAt,
    tags: [identity.normalizedSkillName, identity.normalizedTargetRole, identity.level],
    source: 'youtube_api',
    score: bestVideo.score,
    cachedAt: new Date(),
  });

  return {
    message: 'Best YouTube resource searched and cached successfully',
    data: [savedResource],
    statusCode: 201,
  };
};

module.exports = {
  getLearningContent,
  generateLearningContent,
  getLearningResources,
  saveLearningResource,
  searchAndCacheYoutubeResources,
  extractJsonFromText,
};
