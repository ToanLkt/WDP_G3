const DEFAULT_PARSE_RISK_NOTE = 'AI response could not be parsed as valid JSON, fallback feedback was used.';

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

const buildFallbackFeedback = (snapshot, riskNotes = [DEFAULT_PARSE_RISK_NOTE]) => ({
  summary: `Repository ${snapshot.repoName} đã được phân tích, nhưng phản hồi AI chưa đúng định dạng. Dưới đây là feedback tạm thời dựa trên kết quả phân tích rule-based.`,
  strengthFeedback: Array.isArray(snapshot.strengths) ? snapshot.strengths : [],
  weaknessFeedback: Array.isArray(snapshot.weaknesses) ? snapshot.weaknesses : [],
  learningAdvice:
    Array.isArray(snapshot.recommendations) && snapshot.recommendations.length > 0
      ? snapshot.recommendations.join(' ')
      : 'Nên cải thiện repository dựa trên các kỹ năng còn thiếu.',
  nextSteps: Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [],
  recommendedTopics: Array.isArray(snapshot.missingSkills) ? snapshot.missingSkills : [],
  careerSuggestion: `Tín hiệu hiện tại phù hợp với hướng ${snapshot.careerDirection || 'Generalist Software Engineer'}.`,
  portfolioAdvice: 'Nên bổ sung README, hướng dẫn chạy project, testing và cấu hình triển khai để repo phù hợp hơn cho portfolio.',
  riskNotes: normalizeStringArray(riskNotes),
  usedFallback: true,
});

const normalizeFeedback = (parsed, snapshot) => {
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
    return buildFallbackFeedback(snapshot);
  }

  return normalized;
};

const parseAiFeedbackResponse = (content, snapshot) => {
  const jsonString = extractJsonString(content);

  if (!jsonString) {
    return buildFallbackFeedback(snapshot);
  }

  try {
    const parsed = JSON.parse(jsonString);
    return normalizeFeedback(parsed, snapshot);
  } catch (error) {
    return buildFallbackFeedback(snapshot);
  }
};

module.exports = {
  buildFallbackFeedback,
  parseAiFeedbackResponse,
};
