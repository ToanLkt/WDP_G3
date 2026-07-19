import { AIFeedback } from '../../types';
import { asRecord } from './helpers';

const pickFeedbackPayload = (payload: unknown): unknown => {
  const record = asRecord(payload);

  if (record.feedback !== undefined) return record.feedback;
  if (record.aiFeedback !== undefined) return record.aiFeedback;
  if (record.result !== undefined) return pickFeedbackPayload(record.result);
  if (record.data !== undefined) return pickFeedbackPayload(record.data);

  return payload;
};

const asStringArray = (value: unknown) => {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
};

const asStringField = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const asReferenceId = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) return value;
  const record = asRecord(value);
  const id = record.id ?? record._id ?? record.repositoryId;
  return typeof id === 'string' && id.trim() ? String(id) : undefined;
};

export const normalizeFeedback = (payload: unknown): AIFeedback => {
  const feedbackPayload = pickFeedbackPayload(payload);
  const record = asRecord(feedbackPayload);

  return {
    id: String(record.id ?? record._id ?? ''),
    repositoryId: asReferenceId(record.repositoryId ?? record.repoId) || '',
    analysisSnapshotId: asReferenceId(record.analysisSnapshotId ?? record.snapshotId),
    githubRepoId: typeof record.githubRepoId === 'number' ? record.githubRepoId : undefined,
    repoName: asStringField(record.repoName),
    fullName: asStringField(record.fullName),
    projectType: asStringField(record.projectType),
    careerDirection: asStringField(record.careerDirection),
    createdAt: asStringField(record.createdAt),
    generatedAt: asStringField(record.generatedAt),
    summary: asStringField(record.summary),
    feedback: asStringField(record.feedback) ?? asStringField(record.content),
    strengthFeedback: asStringArray(record.strengthFeedback),
    weaknessFeedback: asStringArray(record.weaknessFeedback),
    learningAdvice: asStringField(record.learningAdvice),
    nextSteps: asStringArray(record.nextSteps),
    recommendedTopics: asStringArray(record.recommendedTopics),
    careerSuggestion: asStringField(record.careerSuggestion),
    portfolioAdvice: asStringField(record.portfolioAdvice),
    riskNotes: asStringArray(record.riskNotes),
    recommendations: asStringArray(record.recommendations),
  };
};

export const normalizeFeedbackList = (payload: unknown): AIFeedback[] => {
  const record = asRecord(payload);
  
  if (Array.isArray(payload)) {
    return payload.map(normalizeFeedback);
  }
  
  if (record.data && Array.isArray(record.data)) {
    return record.data.map(normalizeFeedback);
  }
  
  if (record.result && Array.isArray(record.result)) {
    return record.result.map(normalizeFeedback);
  }
  
  return [];
};
