const LearningContent = require('../models/LearningContent');
const LearningResource = require('../models/LearningResource');
const { generateJsonWithGemini } = require('./ai.service');
const { buildLearningPrompt } = require('./ai/learning.prompt');
const { createStatusError } = require('./github/github.utils');
const { findCatalogResources } = require('./learningResourceCatalog.service');
const { searchYoutubeVideos } = require('./youtube.service');
const {
  calculateYouTubeVideoScore,
  fetchYouTubeVideoDetails,
  mapVideoDetail,
  parseYouTubeVideoUrl,
  validateYouTubeVideoMetadata,
} = require('./youtube.service');
const { checkYouTubeSafety } = require('./youtubeSafety.service');
const normalizeText = require('../utils/normalizeText');
const { canonicalizeSkillName } = require('../utils/skillCanonicalizer');

const DEFAULT_TARGET_ROLE = 'Software Developer';
const DEFAULT_LEVEL = 'beginner';
const DEFAULT_CONTENT_LANGUAGE = 'vi';
const DEFAULT_RESOURCE_LANGUAGE = DEFAULT_CONTENT_LANGUAGE;
const DEFAULT_RESOURCE_TYPE = 'video';
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_RESOURCE_TYPES = ['video', 'article', 'docs'];
const INTERNAL_RESOURCE_FIELDS = [
  'youtubeVideoId',
  'youtubeChannelId',
  'durationSeconds',
  'privacyStatus',
  'embeddable',
  'safetyStatus',
  'safetyReasons',
  'validatedAt',
  'metadataExpiresAt',
];

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getYoutubeMetadataTtlMs = () => (
  parsePositiveInteger(process.env.YOUTUBE_METADATA_TTL_HOURS, 168) * 60 * 60 * 1000
);

const getMetadataExpiresAt = (validatedAt = new Date()) => new Date(new Date(validatedAt).getTime() + getYoutubeMetadataTtlMs());

const normalizeLevel = (level) => {
  const normalized = normalizeText(level || DEFAULT_LEVEL);
  return VALID_LEVELS.includes(normalized) ? normalized : DEFAULT_LEVEL;
};

const normalizeType = (type) => {
  const normalized = normalizeText(type || DEFAULT_RESOURCE_TYPE);
  return VALID_RESOURCE_TYPES.includes(normalized) ? normalized : DEFAULT_RESOURCE_TYPE;
};

const normalizeLanguage = (language, defaultLanguage) =>
  normalizeText(language || defaultLanguage) || defaultLanguage;

const buildLearningIdentity = ({ skillName, targetRole, level, language, contentCacheKey, roadmapId, roadmapItemId }) => {
  const requestedSkillName = String(skillName || '').trim();
  const canonicalSkillName = canonicalizeSkillName(requestedSkillName);
  const cleanTargetRole = String(targetRole || DEFAULT_TARGET_ROLE).trim() || DEFAULT_TARGET_ROLE;
  const normalizedBaseSkillName = normalizeText(canonicalSkillName);
  const normalizedContentCacheKey = normalizeText(contentCacheKey || '');

  return {
    requestedSkillName,
    skillName: canonicalSkillName,
    canonicalSkillName,
    normalizedSkillName: normalizedContentCacheKey
      ? `${normalizedBaseSkillName}__${normalizedContentCacheKey}${roadmapId ? `__roadmap_${String(roadmapId)}` : ''}`
      : normalizedBaseSkillName,
    roadmapId: roadmapId || null,
    roadmapItemId: String(roadmapItemId || contentCacheKey || '').trim(),
    contentCacheKey: String(contentCacheKey || '').trim(),
    resourceNormalizedSkillName: normalizedBaseSkillName,
    legacyNormalizedSkillName: normalizeText(requestedSkillName),
    targetRole: cleanTargetRole,
    normalizedTargetRole: normalizeText(cleanTargetRole),
    level: normalizeLevel(level),
    language: normalizeLanguage(language, DEFAULT_CONTENT_LANGUAGE),
  };
};

const buildLearningContentKey = (input = {}) => buildLearningIdentity(input);

const getLearningMetadata = (identity) => ({
  requestedSkillName: identity.requestedSkillName,
  skillName: identity.skillName,
  canonicalSkillName: identity.canonicalSkillName,
  normalizedSkillName: identity.resourceNormalizedSkillName || identity.normalizedSkillName,
  targetRole: identity.targetRole,
  level: identity.level,
  language: identity.language,
});

const canonicalizeStoredDocument = (document, identity) => {
  const output = {
    ...document,
    ...getLearningMetadata(identity),
  };
  for (const field of INTERNAL_RESOURCE_FIELDS) {
    delete output[field];
  }
  return output;
};

const getPersistedIdentity = (identity) => ({
  skillName: identity.skillName,
  canonicalSkillName: identity.canonicalSkillName,
  normalizedSkillName: identity.normalizedSkillName,
  roadmapId: identity.roadmapId,
  roadmapItemId: identity.roadmapItemId,
  contentCacheKey: identity.contentCacheKey,
  targetRole: identity.targetRole,
  normalizedTargetRole: identity.normalizedTargetRole,
  level: identity.level,
  language: identity.language,
});

const buildResourceQuery = ({ skillName, targetRole, level, language, type, topicCacheKey, roadmapId, roadmapItemId, contentCacheKey }) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language, roadmapId, roadmapItemId, contentCacheKey });
  return {
    identity,
    query: {
      normalizedSkillName: identity.normalizedSkillName,
      normalizedTargetRole: identity.normalizedTargetRole,
      level: identity.level,
      language: normalizeLanguage(language, DEFAULT_RESOURCE_LANGUAGE),
      type: normalizeType(type),
      normalizedTopicKey: normalizeText(topicCacheKey || ''),
      isStale: { $ne: true },
    },
  };
};

const buildLearningTopicProfile = ({ skillName, targetRole, level, language, taskTitle = '', taskDescription = '', projectType = '' }) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language });
  const text = `${taskTitle || ''} ${taskDescription || ''} ${identity.canonicalSkillName || ''}`.toLowerCase();
  const terms = [identity.canonicalSkillName, targetRole, level, projectType].filter(Boolean);
  let querySkill = identity.canonicalSkillName;
  const rules = [
    { pattern: /swagger|openapi|swagger-jsdoc|swagger-ui|api documentation|tài liệu api|tao tai lieu api/i, primaryTopic: 'Swagger OpenAPI API documentation', query: 'Swagger OpenAPI Node.js Express swagger-jsdoc swagger-ui-express API documentation', terms: ['swagger', 'openapi', 'api documentation', 'swagger-jsdoc', 'swagger-ui-express', 'node.js', 'express'], requiredTermGroups: [['swagger', 'openapi'], ['api documentation', 'api docs', 'swagger-jsdoc', 'swagger-ui']], excludedTerms: ['generic rest api design', '.net', 'asp.net', 'django', 'spring boot'] },
    { pattern: /\bjsx\b|reconciliation|virtual dom|component render cycle|rendering mechanism|co che rendering/i, query: 'React JSX rendering reconciliation virtual DOM', terms: ['react', 'jsx', 'rendering', 'reconciliation', 'virtual dom'], requiredTermGroups: [['react', 'jsx'], ['jsx', 'rendering', 'reconciliation', 'virtual dom']], excludedTerms: ['angular', 'vue'] },
    { pattern: /unit test|unit tests|component test|component testing|react testing library|jest|vitest|test|testing|kiem thu/i, query: 'React component unit testing', terms: ['react', 'component', 'unit testing', 'testing', 'jest', 'react testing library'] },
    { pattern: /docker|dockerfile|compose|container/i, query: 'Docker Dockerfile container tutorial', terms: ['docker', 'dockerfile', 'container'] },
    { pattern: /jwt|auth|authentication|authorization|rbac|login|token/i, query: 'JWT authentication middleware Node.js Express', terms: ['jwt', 'authentication', 'authorization', 'middleware', 'node.js', 'express'], requiredTermGroups: [['jwt', 'authentication'], ['middleware', 'authorization', 'auth']], excludedTerms: ['python', 'django', '.net', 'asp.net', 'spring boot', 'java'] },
    { pattern: /mongodb|mongoose|schema|data model|index/i, query: 'MongoDB advanced schema design data modeling indexes', terms: ['mongodb', 'mongoose', 'schema', 'data modeling', 'indexes'], requiredTermGroups: [['mongodb', 'mongoose'], ['schema', 'data modeling', 'index']], excludedTerms: ['.net', 'asp.net', 'sql server', 'entity framework'] },
    { pattern: /api|crud|endpoint|route|controller/i, primaryTopic: 'REST API endpoint implementation', query: 'REST API CRUD endpoint Node.js Express tutorial', terms: ['rest api', 'crud', 'endpoint', 'controller', 'node.js', 'express'] },
    { pattern: /accessibility|a11y|aria|keyboard/i, query: 'React accessibility ARIA tutorial', terms: ['accessibility', 'aria', 'react'] },
    { pattern: /performance|lazy load|bundle|web vitals|render performance|memo|code split/i, query: 'React performance optimization tutorial', terms: ['react', 'performance', 'optimization'], requiredTermGroups: [['react'], ['performance', 'optimization']] },
  ];
  const matched = rules.find((rule) => rule.pattern.test(text));
  if (matched) {
    querySkill = matched.query;
    terms.push(...matched.terms);
  }
  const targetRoleText = targetRole ? `for ${targetRole}` : '';
  const levelText = level ? `${level}` : '';
  return {
    primaryTopic: matched?.primaryTopic || querySkill,
    specificKeywords: matched?.terms || [],
    technologyKeywords: (matched?.terms || []).filter((term) => /node|express|react|mongodb|mongoose|docker|swagger|openapi/i.test(term)),
    primaryQuery: [querySkill, targetRoleText, levelText, 'tutorial'].filter(Boolean).join(' '),
    fallbackEnglishQuery: [querySkill, targetRoleText, 'practical tutorial'].filter(Boolean).join(' '),
    relevanceTerms: [...new Set(terms.map((term) => normalizeText(term)).filter(Boolean))],
    requiredKeywordGroups: matched?.requiredTermGroups || [[identity.canonicalSkillName]],
    requiredTermGroups: matched?.requiredTermGroups || [[identity.canonicalSkillName]],
    excludedTerms: matched?.excludedTerms || [],
    normalizedTopicKey: normalizeText([matched?.primaryTopic || querySkill, taskTitle, taskDescription].filter(Boolean).join(' ')),
    topicCacheKey: normalizeText([matched?.primaryTopic || querySkill, taskTitle, taskDescription].filter(Boolean).join(' ')),
    tags: [...new Set((matched?.terms || []).concat([identity.normalizedSkillName, normalizeText(targetRole), normalizeText(level)]).filter(Boolean))],
  };
};

const buildResourceSearchContext = (input = {}) => buildLearningTopicProfile(input);

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
  nextSkills: stringArray(payload?.nextSkills)
    .map(canonicalizeSkillName)
    .filter((value, index, values) => values.indexOf(value) === index),
});

const validateGroundedLearningContent = (content, topicProfile = {}) => {
  const haystack = normalizeText([
    content?.title,
    content?.overview,
    ...(content?.useCases || []),
    ...(content?.checklist || []),
    ...(content?.exercises || []).flatMap((item) => [item?.title, item?.description]),
  ].join(' '));
  const keywords = (topicProfile.specificKeywords || []).map(normalizeText).filter((value) => value.length > 2);
  const strong = keywords.filter((keyword) => haystack.includes(keyword));
  return {
    valid: !keywords.length || strong.length >= Math.min(2, keywords.length),
    matchedKeywords: strong,
    missingKeywords: keywords.filter((keyword) => !strong.includes(keyword)),
  };
};

const hasValidLearningVideo = (resources = [], topicProfile = {}) => {
  const profileTerms = (topicProfile.specificKeywords || []).map(normalizeText).filter(Boolean);
  return (Array.isArray(resources) ? resources : []).some((resource) => {
    if (resource?.type !== 'video' || !resource?.title) return false;
    const parsed = parseYouTubeVideoUrl(resource.url);
    if (!parsed || resource.isStale === true) return false;
    if (resource.privacyStatus && resource.privacyStatus !== 'public') return false;
    if (resource.embeddable === false) return false;
    if (!profileTerms.length) return true;
    const text = normalizeText(`${resource.title} ${resource.description || ''} ${resource.normalizedTopicKey || ''}`);
    return profileTerms.filter((term) => text.includes(term)).length >= Math.min(2, profileTerms.length);
  });
};

const getLearningContent = async ({ skillName, targetRole, level, language, contentCacheKey, roadmapId, roadmapItemId }) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language, contentCacheKey, roadmapId, roadmapItemId });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const canonicalQuery = {
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
  };
  if (identity.roadmapId && identity.roadmapItemId) Object.assign(canonicalQuery, { roadmapId: identity.roadmapId, roadmapItemId: identity.roadmapItemId });
  let content = await LearningContent.findOne(canonicalQuery).lean();
  if (
    !content &&
    identity.legacyNormalizedSkillName &&
    identity.legacyNormalizedSkillName !== identity.normalizedSkillName
  ) {
    content = await LearningContent.findOne({
      ...canonicalQuery,
      normalizedSkillName: identity.legacyNormalizedSkillName,
    }).lean();
  }

  if (!content) {
    throw createStatusError('Learning content not found. Please generate it first.', 404);
  }

  return {
    message: 'Learning content found',
    data: canonicalizeStoredDocument(content, identity),
    statusCode: 200,
  };
};

const generateLearningContent = async ({ skillName, targetRole, level, language, forceRegenerate, context, contentCacheKey, roadmapId, roadmapItemId } = {}) => {
  const identity = buildLearningIdentity({ skillName, targetRole, level, language, contentCacheKey, roadmapId, roadmapItemId });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  const contentQuery = {
    normalizedSkillName: identity.normalizedSkillName,
    normalizedTargetRole: identity.normalizedTargetRole,
    level: identity.level,
    language: identity.language,
  };
  if (identity.roadmapId && identity.roadmapItemId) Object.assign(contentQuery, { roadmapId: identity.roadmapId, roadmapItemId: identity.roadmapItemId });
  let existing = forceRegenerate ? null : await LearningContent.findOne(contentQuery).lean();
  if (
    !forceRegenerate &&
    !existing &&
    identity.legacyNormalizedSkillName &&
    identity.legacyNormalizedSkillName !== identity.normalizedSkillName
  ) {
    existing = await LearningContent.findOne({
      ...contentQuery,
      normalizedSkillName: identity.legacyNormalizedSkillName,
    }).lean();
  }

  if (existing) {
    return {
      message: 'Learning content already exists',
      data: canonicalizeStoredDocument(existing, identity),
      statusCode: 200,
    };
  }

  const topicProfile = buildLearningTopicProfile({
    skillName: identity.skillName,
    targetRole: identity.targetRole,
    level: identity.level,
    language: identity.language,
    taskTitle: context?.taskTitle,
    taskDescription: context?.taskDescription,
    projectType: context?.projectType,
  });
  const prompt = buildLearningPrompt({ ...identity, context, topicProfile });
  let aiResult = await generateJsonWithGemini(prompt, { temperature: 0.4 });
  let parsed;
  try {
    parsed = sanitizeLearningContent(extractJsonFromText(aiResult.text));
    if (!parsed || typeof parsed !== 'object' || !String(parsed.title || '').trim()) throw new Error('Gemini content title is missing');
    const grounding = validateGroundedLearningContent(parsed, topicProfile);
    if (!grounding.valid) {
      const repairPrompt = `${prompt}\n\nREPAIR REQUIRED: The previous content missed these topic keywords: ${grounding.missingKeywords.join(', ')}. Regenerate the JSON with a title and overview explicitly about the specific roadmap task.`;
      aiResult = await generateJsonWithGemini(repairPrompt, { temperature: 0.2 });
      parsed = sanitizeLearningContent(extractJsonFromText(aiResult.text));
      const repaired = validateGroundedLearningContent(parsed, topicProfile);
      if (!repaired.valid) {
        parsed.title = context?.taskTitle || parsed.title;
        parsed.overview = `${context?.taskDescription || ''} ${parsed.overview || ''}`.trim();
      }
    }
  } catch (error) {
    const parseError = createStatusError('Gemini returned invalid learning content', 502);
    parseError.errorCode = 'GEMINI_RESPONSE_INVALID';
    parseError.cause = error;
    console.error('[learning_stage_failed]', { stage: 'gemini_response_parse_failed', errorMessage: error.message });
    throw parseError;
  }
  let content;
  try {
    content = await LearningContent.findOneAndUpdate(
      contentQuery,
      { $set: { ...getPersistedIdentity(identity), ...sanitizeLearningContent(parsed), normalizedTopicKey: topicProfile.normalizedTopicKey, topicTags: topicProfile.tags, isStale: false, generatedBy: 'ai' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    const saveError = createStatusError('Learning content could not be saved', 500);
    saveError.errorCode = 'LEARNING_CONTENT_SAVE_FAILED';
    saveError.cause = error;
    console.error('[learning_stage_failed]', { stage: 'learning_content_save_failed', errorName: error.name, errorCode: error.code, errorMessage: error.message });
    throw saveError;
  }

  return {
    message: 'Learning content generated successfully',
    data: canonicalizeStoredDocument(content.toObject(), identity),
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

const isYoutubeResource = (resource = {}) => (
  resource.source === 'youtube_api' || /youtube\.com|youtu\.be/i.test(String(resource.url || ''))
);

const isResourceMetadataFresh = (resource = {}) => (
  !isYoutubeResource(resource)
  || (resource.metadataExpiresAt && new Date(resource.metadataExpiresAt).getTime() > Date.now())
);

const extractVideoIdFromUrl = (url = '') => {
  const text = String(url || '');
  const watchMatch = text.match(/[?&]v=([^&]+)/i);
  if (watchMatch) return watchMatch[1];
  const shortMatch = text.match(/youtu\.be\/([^?&/]+)/i);
  return shortMatch ? shortMatch[1] : '';
};

const revalidateYoutubeResource = async (resource = {}, identity = {}) => {
  const videoId = resource.youtubeVideoId || extractVideoIdFromUrl(resource.url);
  if (!videoId || !process.env.YOUTUBE_API_KEY) return null;
  const details = await fetchYouTubeVideoDetails([videoId]);
  const detail = details.find((item) => item.id === videoId);
  if (!detail) {
    await LearningResource.deleteOne({ _id: resource._id });
    return null;
  }

  const video = mapVideoDetail(detail);
  const metadata = validateYouTubeVideoMetadata(video);
  const safety = checkYouTubeSafety(video);
  const score = calculateYouTubeVideoScore({
    title: video.title,
    description: video.description,
    channelTitle: video.channelTitle,
    skillName: identity.skillName || resource.skillName,
    level: identity.level || resource.level,
  });
  if (!metadata.valid || !safety.allowed || score < 40) {
    await LearningResource.deleteOne({ _id: resource._id });
    return null;
  }

  const validatedAt = new Date();
  const updated = await LearningResource.findOneAndUpdate(
    { _id: resource._id },
    {
      $set: {
        title: video.title,
        url: video.url,
        provider: video.provider,
        thumbnailUrl: video.thumbnailUrl,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
        score,
        youtubeVideoId: video.videoId,
        youtubeChannelId: video.channelId,
        durationSeconds: video.durationSeconds,
        privacyStatus: video.privacyStatus,
        embeddable: video.embeddable,
        safetyStatus: 'allowed',
        safetyReasons: [],
        validatedAt,
        metadataExpiresAt: getMetadataExpiresAt(validatedAt),
      },
    },
    { new: true }
  ).lean();
  return updated;
};

const filterFreshOrRevalidatedResources = async (resources = [], identity = {}) => {
  const output = [];
  for (const resource of resources) {
    if (isResourceMetadataFresh(resource)) {
      output.push(resource);
      continue;
    }
    try {
      const revalidated = await revalidateYoutubeResource(resource, identity);
      if (revalidated) output.push(revalidated);
    } catch (error) {
      // Fail closed for stale YouTube resources; keep curated/manual resources unaffected.
    }
  }
  return output;
};

const getLearningResources = async ({ skillName, targetRole, level, language, type, taskTitle, taskDescription, projectType, roadmapId, roadmapItemId, contentCacheKey }) => {
  const searchContext = buildResourceSearchContext({ skillName, targetRole, level, language, taskTitle, taskDescription, projectType });
  const { identity, query } = buildResourceQuery({ skillName, targetRole, level, language, type, topicCacheKey: searchContext.topicCacheKey, roadmapId, roadmapItemId, contentCacheKey });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  let resources = await filterFreshOrRevalidatedResources(await sortResources(query), identity);
  if (
    !resources.length &&
    identity.legacyNormalizedSkillName &&
    identity.legacyNormalizedSkillName !== identity.normalizedSkillName
  ) {
    resources = await filterFreshOrRevalidatedResources(await sortResources({
      ...query,
      normalizedSkillName: identity.legacyNormalizedSkillName,
    }), identity);
  }

  return {
    message: resources.length ? 'Learning resources fetched successfully' : 'No learning resources found',
    data: {
      ...getLearningMetadata({
        ...identity,
        language: query.language,
      }),
      resources: resources.map((resource) => canonicalizeStoredDocument(resource, {
        ...identity,
        language: query.language,
      })),
    },
    statusCode: 200,
  };
};

const hasSameResourceIdentity = (resource = {}, payload = {}) => (
  resource.normalizedSkillName === payload.normalizedSkillName
  && resource.normalizedTargetRole === payload.normalizedTargetRole
  && resource.level === payload.level
  && resource.language === payload.language
  && resource.type === payload.type
  && String(resource.normalizedTopicKey || '') === String(payload.normalizedTopicKey || '')
);

const saveResourceByUrl = async (resourcePayload) => {
  const existing = await LearningResource.findOne({ url: resourcePayload.url }).lean();
  if (existing && !hasSameResourceIdentity(existing, resourcePayload)) {
    return null;
  }
  try {
    return await LearningResource.findOneAndUpdate(
      {
        url: resourcePayload.url,
        normalizedSkillName: resourcePayload.normalizedSkillName,
        normalizedTargetRole: resourcePayload.normalizedTargetRole,
        level: resourcePayload.level,
        language: resourcePayload.language,
        type: resourcePayload.type,
      },
      { $set: resourcePayload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // A concurrent request may have inserted the globally unique URL first.
    if (error?.code === 11000) return null;
    throw error;
  }
};

const validateExternalUrl = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS resource URLs are allowed');
    }
    return parsed.toString();
  } catch (error) {
    throw createStatusError(
      error.message === 'Only HTTPS resource URLs are allowed'
        ? error.message
        : 'A valid HTTPS resource URL is required',
      400
    );
  }
};

const validateYoutubeResource = async ({
  url,
  skillName,
  level,
  relevanceTerms = [],
  requiredTermGroups = [],
  excludedTerms = [],
}) => {
  const parsed = parseYouTubeVideoUrl(url);
  if (!parsed) {
    throw createStatusError('A valid HTTPS YouTube watch URL is required', 400);
  }
  if (!process.env.YOUTUBE_API_KEY) {
    throw createStatusError('YOUTUBE_API_KEY is required to validate YouTube resources', 503);
  }

  const details = await fetchYouTubeVideoDetails([parsed.videoId]);
  const detail = details.find((item) => item.id === parsed.videoId);
  if (!detail) {
    throw createStatusError('YouTube video is unavailable or does not exist', 400);
  }
  const video = mapVideoDetail(detail);
  const metadata = validateYouTubeVideoMetadata(video);
  if (!metadata.valid) {
    throw createStatusError(`YouTube video failed metadata validation: ${metadata.reasons.join(', ')}`, 400);
  }
  const safety = checkYouTubeSafety(video);
  if (!safety.allowed) {
    throw createStatusError('YouTube video failed safety validation', 400);
  }
  const score = calculateYouTubeVideoScore({
    title: video.title,
    description: video.description,
    channelTitle: video.channelTitle,
    skillName,
    level,
    relevanceTerms,
    requiredTermGroups,
    excludedTerms,
  });
  if (score < 40) {
    throw createStatusError('YouTube video is not relevant enough for this skill', 400);
  }
  const validatedAt = new Date();
  return {
    ...video,
    url: parsed.canonicalUrl,
    score,
    safetyStatus: 'allowed',
    safetyReasons: [],
    validatedAt,
    metadataExpiresAt: getMetadataExpiresAt(validatedAt),
  };
};

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

  const type = normalizeType(body.type);
  let validatedUrl = validateExternalUrl(body.url);
  let youtubeMetadata = {};
  if (type === 'video') {
    youtubeMetadata = await validateYoutubeResource({
      url: validatedUrl,
      skillName: identity.skillName,
      level: identity.level,
    });
    validatedUrl = youtubeMetadata.url;
  }

  const existingByUrl = await LearningResource.findOne(
    type === 'video'
      ? { $or: [{ url: validatedUrl }, { youtubeVideoId: youtubeMetadata.videoId }] }
      : { url: validatedUrl }
  ).lean();
  if (existingByUrl) {
    throw createStatusError('A learning resource with this URL already exists', 409);
  }

  const resourcePayload = {
    ...getPersistedIdentity(identity),
    language: normalizeLanguage(body.language, DEFAULT_RESOURCE_LANGUAGE),
    type,
    title: type === 'video' ? youtubeMetadata.title : String(body.title).trim(),
    url: validatedUrl,
    provider: type === 'video' ? 'YouTube' : String(body.provider || '').trim(),
    thumbnailUrl: type === 'video' ? youtubeMetadata.thumbnailUrl : String(body.thumbnailUrl || '').trim(),
    channelTitle: type === 'video' ? youtubeMetadata.channelTitle : String(body.channelTitle || '').trim(),
    publishedAt: type === 'video'
      ? youtubeMetadata.publishedAt
      : (body.publishedAt ? new Date(body.publishedAt) : undefined),
    tags: stringArray(body.tags),
    source: 'manual',
    score: type === 'video' ? youtubeMetadata.score : 0,
    cachedAt: new Date(),
    ...(type === 'video' ? {
      youtubeVideoId: youtubeMetadata.videoId,
      youtubeChannelId: youtubeMetadata.channelId,
      durationSeconds: youtubeMetadata.durationSeconds,
      privacyStatus: youtubeMetadata.privacyStatus,
      embeddable: youtubeMetadata.embeddable,
      safetyStatus: youtubeMetadata.safetyStatus,
      safetyReasons: youtubeMetadata.safetyReasons,
      validatedAt: youtubeMetadata.validatedAt,
      metadataExpiresAt: youtubeMetadata.metadataExpiresAt,
    } : {}),
  };

  const resource = await saveResourceByUrl(resourcePayload);
  if (!resource) {
    throw createStatusError('A learning resource with this URL already exists', 409);
  }

  return {
    message: 'Learning resource saved successfully',
    data: {
      ...getLearningMetadata({
        ...identity,
        language: resourcePayload.language,
      }),
      resource: canonicalizeStoredDocument(resource, {
        ...identity,
        language: resourcePayload.language,
      }),
    },
    statusCode: 200,
  };
};

const searchAndCacheYoutubeResources = async ({ skillName, targetRole, level, language, taskTitle, taskDescription, projectType, roadmapId, roadmapItemId, contentCacheKey }) => {
  const searchContext = buildResourceSearchContext({ skillName, targetRole, level, language, taskTitle, taskDescription, projectType });
  const { identity, query } = buildResourceQuery({
    skillName,
    targetRole,
    level,
    language,
    type: DEFAULT_RESOURCE_TYPE,
    topicCacheKey: searchContext.topicCacheKey,
    roadmapId,
    roadmapItemId,
    contentCacheKey,
  });

  if (!identity.skillName) {
    throw createStatusError('skillName is required', 400);
  }

  let existing = await filterFreshOrRevalidatedResources(await sortResources(query), identity);
  if (
    !existing.length &&
    identity.legacyNormalizedSkillName &&
    identity.legacyNormalizedSkillName !== identity.normalizedSkillName
  ) {
    existing = await filterFreshOrRevalidatedResources(await sortResources({
      ...query,
      normalizedSkillName: identity.legacyNormalizedSkillName,
    }), identity);
  }
  if (existing.length) {
    console.info('[learning-resource]', { reasonCode: 'learning_resources_cache_hit', skillName: identity.canonicalSkillName, level: identity.level, language: query.language, count: existing.length });
    return {
      message: 'Learning resources already cached',
      data: {
        ...getLearningMetadata({ ...identity, language: query.language }),
        resources: existing.map((resource) =>
          canonicalizeStoredDocument(resource, { ...identity, language: query.language })
        ),
      },
      statusCode: 200,
    };
  }

  console.info('[learning-resource]', {
    reasonCode: 'learning_resources_cache_empty',
    skillName: identity.canonicalSkillName,
    targetRole: identity.targetRole,
    level: identity.level,
    language: query.language,
  });

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
      let validated;
      try {
        validated = await validateYoutubeResource({
          url: catalogResource.url,
          skillName: identity.skillName,
          level: identity.level,
          relevanceTerms: searchContext.relevanceTerms,
          requiredTermGroups: searchContext.requiredTermGroups,
          excludedTerms: searchContext.excludedTerms,
        });
      } catch (error) {
        console.warn('[learning-resource]', {
          reasonCode: 'curated_resource_rejected',
          skillName: identity.canonicalSkillName,
          url: catalogResource.url,
          validationStatus: error.statusCode || 500,
        });
        continue;
      }
      const resource = await saveResourceByUrl({
        ...getPersistedIdentity(identity),
        normalizedTopicKey: query.normalizedTopicKey,
        language: String(catalogResource.language || query.language).trim() || query.language,
        type: normalizeType(catalogResource.type),
        title: validated.title,
        url: validated.url,
        provider: validated.provider,
        thumbnailUrl: validated.thumbnailUrl,
        channelTitle: validated.channelTitle,
        publishedAt: validated.publishedAt,
        tags: stringArray(catalogResource.tags),
        source: 'curated',
        score: validated.score,
        cachedAt: new Date(),
        youtubeVideoId: validated.videoId,
        youtubeChannelId: validated.channelId,
        durationSeconds: validated.durationSeconds,
        privacyStatus: validated.privacyStatus,
        embeddable: validated.embeddable,
        safetyStatus: validated.safetyStatus,
        safetyReasons: validated.safetyReasons,
        validatedAt: validated.validatedAt,
        metadataExpiresAt: validated.metadataExpiresAt,
      });

      if (resource) {
        savedCatalogResources.push(resource);
      }
    }

    if (savedCatalogResources.length) {
      console.info('[learning-resource]', { reasonCode: 'learning_resources_attached', source: 'curated', skillName: identity.canonicalSkillName, level: identity.level, language: query.language, acceptedCount: savedCatalogResources.length });
      return {
        message: 'Learning resources loaded from catalog and cached successfully',
        data: {
          ...getLearningMetadata({ ...identity, language: query.language }),
          resources: savedCatalogResources
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .map((resource) =>
              canonicalizeStoredDocument(resource, { ...identity, language: query.language })
            ),
        },
        statusCode: 201,
      };
    }
  }

  if (!process.env.YOUTUBE_API_KEY) {
    console.warn('[learning-resource]', { reasonCode: 'youtube_api_key_missing', skillName: identity.canonicalSkillName, level: identity.level, language: query.language });
    throw createStatusError('No valid catalog resources found and YOUTUBE_API_KEY is not configured', 500);
  }

  let videos;
  try {
    console.info('[learning-resource]', {
      reasonCode: 'learning_resources_search_started',
      skillName: identity.canonicalSkillName,
      targetRole: identity.targetRole,
      level: identity.level,
      language: query.language,
      query: searchContext.primaryQuery,
    });
    videos = await searchYoutubeVideos({
      skillName: identity.skillName,
      targetRole: identity.targetRole,
      level: identity.level,
      language: query.language,
      query: searchContext.primaryQuery,
      relevanceTerms: searchContext.relevanceTerms,
      requiredTermGroups: searchContext.requiredTermGroups,
      excludedTerms: searchContext.excludedTerms,
    });
    if (!videos.length && query.language !== 'en') {
      console.info('[learning-resource]', {
        reasonCode: 'youtube_search_started',
        fallback: 'en',
        skillName: identity.canonicalSkillName,
        query: searchContext.fallbackEnglishQuery,
      });
      videos = await searchYoutubeVideos({
        skillName: identity.skillName,
        targetRole: identity.targetRole,
        level: identity.level,
        language: 'en',
        query: searchContext.fallbackEnglishQuery,
        relevanceTerms: searchContext.relevanceTerms,
        requiredTermGroups: searchContext.requiredTermGroups,
        excludedTerms: searchContext.excludedTerms,
      });
    }
  } catch (error) {
    const providerStatus = Number(error?.response?.status || error?.statusCode || 0);
    const reasonCode = error.reasonCode === 'youtube_api_key_missing'
      ? 'youtube_api_key_missing'
      : providerStatus === 403 || providerStatus === 429
      ? 'youtube_quota_exceeded'
      : 'youtube_api_error';
    console.warn('[learning-resource]', {
      reasonCode,
      skillName: identity.canonicalSkillName,
      level: identity.level,
      language: query.language,
      query: searchContext.primaryQuery,
      providerStatus: providerStatus || undefined,
    });
    throw error;
  }

  if (!videos[0]) {
    console.info('[learning-resource]', { reasonCode: 'youtube_no_candidates', skillName: identity.canonicalSkillName, level: identity.level, language: query.language, query: searchContext.primaryQuery });
    return {
      message: 'No relevant YouTube resources found',
      data: {
        ...getLearningMetadata({ ...identity, language: query.language }),
        resources: [],
      },
      statusCode: 200,
    };
  }

  let savedResource = null;
  for (const video of videos) {
    savedResource = await saveResourceByUrl({
      ...getPersistedIdentity(identity),
      normalizedTopicKey: query.normalizedTopicKey,
      language: query.language,
      type: DEFAULT_RESOURCE_TYPE,
      title: video.title,
      url: video.url,
      provider: video.provider,
      thumbnailUrl: video.thumbnailUrl,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      tags: searchContext.tags,
      source: 'youtube_api',
      score: video.score,
      cachedAt: new Date(),
      youtubeVideoId: video.videoId,
      youtubeChannelId: video.channelId,
      durationSeconds: video.durationSeconds,
      privacyStatus: video.privacyStatus,
      embeddable: video.embeddable,
      safetyStatus: video.safetyStatus,
      safetyReasons: video.safetyReasons,
      validatedAt: video.validatedAt,
      metadataExpiresAt: getMetadataExpiresAt(video.validatedAt),
    });
    if (savedResource) break;
  }
  if (!savedResource) {
    return {
      message: 'No relevant YouTube resources available for this learning context',
      data: {
        ...getLearningMetadata({ ...identity, language: query.language }),
        resources: [],
      },
      statusCode: 200,
    };
  }
  console.info('[learning-resource]', { reasonCode: 'youtube_hit', skillName: identity.canonicalSkillName, level: identity.level, language: query.language, count: 1 });
  console.info('[learning-resource]', { reasonCode: 'learning_resources_attached', source: 'youtube_api', skillName: identity.canonicalSkillName, level: identity.level, language: query.language, acceptedCount: 1 });

  return {
    message: 'Best YouTube resource searched and cached successfully',
    data: {
      ...getLearningMetadata({ ...identity, language: query.language }),
      resources: [
        canonicalizeStoredDocument(savedResource, { ...identity, language: query.language }),
      ],
    },
    statusCode: 201,
  };
};

module.exports = {
  getLearningContent,
  generateLearningContent,
  getLearningResources,
  saveLearningResource,
  searchAndCacheYoutubeResources,
  buildResourceSearchContext,
  buildLearningTopicProfile,
  validateGroundedLearningContent,
  hasValidLearningVideo,
  isResourceMetadataFresh,
  revalidateYoutubeResource,
  extractJsonFromText,
  buildLearningIdentity,
  buildLearningContentKey,
  buildResourceQuery,
};
