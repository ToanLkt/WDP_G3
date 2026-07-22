const crypto = require('crypto');

const ALLOWED_PATHS = new Map([
  ['learn', 'course'],
  ['specializations', 'specialization'],
  ['professional-certificates', 'professional_certificate'],
  ['projects', 'guided_project'],
]);

const normalizeCourseraUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !['coursera.org', 'www.coursera.org'].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || !ALLOWED_PATHS.has(segments[0]) || !segments[1]) return null;
    url.hostname = 'www.coursera.org';
    url.pathname = `/${segments[0]}/${segments[1]}`;
    url.search = '';
    url.hash = '';
    return { canonicalUrl: url.toString().replace(/\/$/, ''), contentType: ALLOWED_PATHS.get(segments[0]), externalId: segments[1] };
  } catch (error) { return null; }
};

const deterministicJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const validateSeed = (plan, seed) => {
  const errors = [];
  const topicIds = new Set((plan.roadmapTopics || []).map((topic) => topic.topicId));
  const urls = new Set();
  const ids = new Set();
  for (const course of seed.courses || []) {
    const normalized = normalizeCourseraUrl(course.canonicalUrl);
    if (!normalized) errors.push(`Invalid direct URL: ${course.canonicalUrl}`);
    else if (normalized.canonicalUrl !== course.canonicalUrl) errors.push(`URL is not canonical: ${course.canonicalUrl}`);
    if (urls.has(course.canonicalUrl)) errors.push(`Duplicate canonicalUrl: ${course.canonicalUrl}`);
    if (ids.has(course.externalId)) errors.push(`Duplicate externalId: ${course.externalId}`);
    urls.add(course.canonicalUrl); ids.add(course.externalId);
    if (normalized && normalized.externalId !== course.externalId) errors.push(`externalId mismatch: ${course.externalId}`);
    for (const mapping of course.roadmapTopicMappings || []) {
      if (!topicIds.has(mapping.topicId)) errors.push(`Unknown topic mapping: ${mapping.topicId}`);
      if (!Number.isFinite(mapping.relevanceScore) || mapping.relevanceScore < 0 || mapping.relevanceScore > 100) errors.push(`Invalid score: ${mapping.topicId}`);
    }
  }
  for (const topicId of topicIds) {
    if (!(seed.courses || []).some((course) => (course.roadmapTopicMappings || []).some((mapping) => mapping.topicId === topicId))) errors.push(`Topic has no course: ${topicId}`);
  }
  return errors;
};

module.exports = { deterministicJson, normalizeCourseraUrl, sha256, validateSeed };
