const DEFAULT_PARSE_RISK_NOTE = 'AI response could not be parsed as valid JSON, fallback feedback was used.';
const { buildDocumentationRecommendation } = require('../../utils/documentationEvidence');

const extractJsonString = (content) => {
  if (!content || typeof content !== 'string') {
    return '';
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
};

const hasDocumentationEvidence = (docs = {}) => (
  docs.readmeRootExists === true
  || Number(docs.markdownFileCount || 0) > 0
  || docs.hasDocsDirectory === true
);

const conflictsWithDocsEvidence = (text, docs = {}) => {
  const lower = String(text || '').toLowerCase();
  if (!hasDocumentationEvidence(docs)) return false;
  return (
    lower.includes('thiếu readme')
    || lower.includes('thieu readme')
    || lower.includes('missing readme')
    || lower.includes('thiếu tài liệu')
    || lower.includes('thieu tai lieu')
    || lower.includes('no documentation')
    || lower.includes('không có tài liệu')
    || lower.includes('khong co tai lieu')
    || lower.includes('chưa có bất kỳ tài liệu')
    || lower.includes('chua co bat ky tai lieu')
  );
};

const sanitizeDocsWording = (value, docs = {}) => {
  const replacement = buildDocumentationRecommendation(docs);
  if (!replacement) return value;

  if (Array.isArray(value)) {
    const sanitized = value.filter((item) => !conflictsWithDocsEvidence(item, docs));
    if (sanitized.length !== value.length && !sanitized.includes(replacement)) {
      sanitized.push(replacement);
    }
    return sanitized;
  }

  return conflictsWithDocsEvidence(value, docs) ? replacement : value;
};

const buildFallbackFeedback = (context, riskNotes = [DEFAULT_PARSE_RISK_NOTE]) => {
  const topRoleName = context.topRole?.roleName || context.rolePrediction?.roleName || 'software engineering role';
  const matchScore = Number.isFinite(Number(context.topRole?.matchScore))
    ? ` voi matchScore khoang ${context.topRole.matchScore}%`
    : '';
  const weakSkills = [
    ...(Array.isArray(context.weakSkillNames) ? context.weakSkillNames : []),
    ...(Array.isArray(context.missingSkillNames) ? context.missingSkillNames : []),
  ];
  const missingSet = new Set((Array.isArray(context.missingSkillNames) ? context.missingSkillNames : []).map((skill) => String(skill).toLowerCase()));
  const recommendedNextSkills = Array.isArray(context.recommendedNextSkills)
    ? context.recommendedNextSkills
    : [];
  const matchedSkillNames = Array.isArray(context.matchedSkillNames)
    ? context.matchedSkillNames
    : [];
  const normalizedRiskNotes = normalizeStringArray(riskNotes);
  const docsEvidence = context.docsEvidence || context.evidencePreview?.docs || {};
  const docsRecommendation = buildDocumentationRecommendation(docsEvidence);

  if (context.issueDataMissing) {
    normalizedRiskNotes.push('Phan tich hien chua co du lieu issue.');
  }

  return {
    summary: `Dua tren Dev2Vec analysis tu repository evidence, repo ${context.repoName} dang co xu huong phu hop voi ${topRoleName}${matchScore}.`,
    strengthFeedback:
      matchedSkillNames.length > 0
        ? matchedSkillNames.map((skill) => `Da thay evidence ve ${skill} trong repository.`)
        : [`Tin hieu manh nhat hien tai nam o xu huong ${topRoleName}.`],
    weaknessFeedback:
      weakSkills.length > 0
        ? weakSkills.map((skill) => (
            missingSet.has(String(skill).toLowerCase())
              ? `Chua thay du evidence ro ve ${skill} trong du lieu phan tich hien tai.`
              : `Da co evidence ve ${skill}, nen can cung co hoac lam ro them bang docs/tests/validation.`
          ))
        : ['Dev2Vec chua ghi nhan skill gap noi bat cho role du doan dau tien.'],
    learningAdvice:
      recommendedNextSkills.length > 0
        ? `Nen uu tien hoc va the hien ro hon: ${recommendedNextSkills.join(', ')}.`
        : 'Nen tiep tuc bo sung evidence trong repository de lam ro skill gap va nang cao do tin cay cua feedback.',
    nextSteps: recommendedNextSkills,
    recommendedTopics: weakSkills,
    careerSuggestion: `Khong nen xem day la ket luan tuyet doi; dua tren repository evidence hien co, huong ${topRoleName} la tin hieu noi bat nhat.`,
    portfolioAdvice:
      docsRecommendation && docsEvidence.documentationStatus !== 'no_markdown_docs'
        ? docsRecommendation
        : 'Nen bo sung README, cach chay project, test/API examples va deployment notes de repository thuyet phuc hon khi dung lam portfolio.',
    riskNotes: [...new Set(normalizedRiskNotes)],
    usedFallback: true,
  };
};

const normalizeFeedback = (parsed, context) => {
  const docsEvidence = context.docsEvidence || context.evidencePreview?.docs || {};
  const normalized = {
    summary: normalizeString(parsed.summary),
    strengthFeedback: normalizeStringArray(parsed.strengthFeedback),
    weaknessFeedback: normalizeStringArray(parsed.weaknessFeedback),
    learningAdvice: normalizeString(parsed.learningAdvice),
    nextSteps: normalizeStringArray(parsed.nextSteps),
    recommendedTopics: normalizeStringArray(parsed.recommendedTopics),
    careerSuggestion: normalizeString(parsed.careerSuggestion),
    portfolioAdvice: normalizeString(parsed.portfolioAdvice),
    riskNotes: normalizeStringArray(parsed.riskNotes),
    usedFallback: false,
  };

  normalized.summary = sanitizeDocsWording(normalized.summary, docsEvidence);
  normalized.strengthFeedback = sanitizeDocsWording(normalized.strengthFeedback, docsEvidence);
  normalized.weaknessFeedback = sanitizeDocsWording(normalized.weaknessFeedback, docsEvidence);
  normalized.learningAdvice = sanitizeDocsWording(normalized.learningAdvice, docsEvidence);
  normalized.nextSteps = sanitizeDocsWording(normalized.nextSteps, docsEvidence);
  normalized.recommendedTopics = sanitizeDocsWording(normalized.recommendedTopics, docsEvidence);
  normalized.careerSuggestion = sanitizeDocsWording(normalized.careerSuggestion, docsEvidence);
  normalized.portfolioAdvice = sanitizeDocsWording(normalized.portfolioAdvice, docsEvidence);
  normalized.riskNotes = sanitizeDocsWording(normalized.riskNotes, docsEvidence);

  if (context.issueDataMissing && !normalized.riskNotes.some((note) => note.toLowerCase().includes('issue'))) {
    normalized.riskNotes.push('Phan tich hien chua co du lieu issue.');
  }

  if (
    !normalized.summary &&
    normalized.strengthFeedback.length === 0 &&
    normalized.weaknessFeedback.length === 0 &&
    !normalized.learningAdvice &&
    normalized.nextSteps.length === 0 &&
    normalized.recommendedTopics.length === 0 &&
    !normalized.careerSuggestion &&
    !normalized.portfolioAdvice
  ) {
    return buildFallbackFeedback(context);
  }

  return normalized;
};

const parseAiFeedbackResponse = (content, context) => {
  const jsonString = extractJsonString(content);

  if (!jsonString) {
    return buildFallbackFeedback(context);
  }

  try {
    const parsed = JSON.parse(jsonString);
    return normalizeFeedback(parsed, context);
  } catch (error) {
    return buildFallbackFeedback(context);
  }
};

module.exports = {
  buildFallbackFeedback,
  parseAiFeedbackResponse,
};
