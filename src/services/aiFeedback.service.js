const mongoose = require('mongoose');

const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const AiFeedback = require('../models/AiFeedback');
const Repository = require('../models/Repository');

const { buildAiFeedbackPrompt } = require('./ai-feedback/aiFeedback.prompt');
const { callGemini } = require('./ai-feedback/aiFeedback.llmClient');
const { buildFallbackFeedback, parseAiFeedbackResponse } = require('./ai-feedback/aiFeedback.parser');
const { createStatusError, ensureAuthorizedUser } = require('./github/github.utils');

const PROMPT_VERSION = 'v1';
const NON_FALLBACK_LLM_ERRORS = new Set(['LLM_API_KEY is not configured', 'Unsupported LLM provider']);
const GEMINI_FALLBACK_RISK_NOTE = 'Gemini API failed, fallback feedback was used.';

const buildRepositoryQuery = (userId, repoId) => {
  const normalizedRepoId = String(repoId || '').trim();
  const query = { userId };
  const repoCriteria = [];

  if (mongoose.Types.ObjectId.isValid(normalizedRepoId)) {
    repoCriteria.push({ _id: normalizedRepoId });
  }

  const numericRepoId = Number(normalizedRepoId);
  if (!Number.isNaN(numericRepoId)) {
    repoCriteria.push({ githubRepoId: numericRepoId });
  }

  if (repoCriteria.length === 0) {
    query._id = normalizedRepoId;
  } else if (repoCriteria.length === 1) {
    Object.assign(query, repoCriteria[0]);
  } else {
    query.$or = repoCriteria;
  }

  return query;
};

const findRepositoryForUser = async (userId, repoId) => {
  const repository = await Repository.findOne(buildRepositoryQuery(userId, repoId)).lean();

  if (!repository) {
    throw createStatusError('Repository not found', 404);
  }

  return repository;
};

const buildFeedbackResponse = (feedback) => {
  if (!feedback) {
    return null;
  }

  return {
    _id: feedback._id,
    repositoryId: feedback.repositoryId,
    analysisSnapshotId: feedback.analysisSnapshotId,
    githubRepoId: feedback.githubRepoId,
    repoName: feedback.repoName,
    fullName: feedback.fullName,
    projectType: feedback.projectType,
    careerDirection: feedback.careerDirection,
    summary: feedback.summary,
    strengthFeedback: feedback.strengthFeedback || [],
    weaknessFeedback: feedback.weaknessFeedback || [],
    learningAdvice: feedback.learningAdvice,
    nextSteps: feedback.nextSteps || [],
    recommendedTopics: feedback.recommendedTopics || [],
    careerSuggestion: feedback.careerSuggestion,
    portfolioAdvice: feedback.portfolioAdvice,
    riskNotes: feedback.riskNotes || [],
    generatedAt: feedback.generatedAt,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
};

const generateRepositoryFeedback = async (user, repoId) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const repository = await findRepositoryForUser(userId, repoId);
  const snapshot = await AnalysisSnapshot.findOne({
    userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  if (!snapshot) {
    throw createStatusError('Please analyze repository before generating AI feedback.', 400);
  }

  const prompt = buildAiFeedbackPrompt(snapshot);
  let aiContent = '';
  let parsed = null;
  let resolvedModel = process.env.LLM_MODEL || 'gemini-1.5-flash';
  let llmErrorMeta = null;

  try {
    const geminiResult = await callGemini(prompt);
    aiContent = geminiResult.content;
    resolvedModel = geminiResult.model || resolvedModel;
  } catch (error) {
    if (NON_FALLBACK_LLM_ERRORS.has(error.message)) {
      throw error;
    }

    llmErrorMeta = error.llmError || null;
    parsed = buildFallbackFeedback(snapshot, [GEMINI_FALLBACK_RISK_NOTE]);
  }

  if (aiContent) {
    parsed = parseAiFeedbackResponse(aiContent, snapshot);
  }

  if (!parsed) {
    parsed = buildFallbackFeedback(snapshot, [GEMINI_FALLBACK_RISK_NOTE]);
  }

  const feedback = await AiFeedback.create({
    userId,
    repositoryId: repository._id,
    analysisSnapshotId: snapshot._id,
    githubRepoId: repository.githubRepoId,
    repoName: repository.name || snapshot.repoName,
    fullName: repository.fullName || snapshot.fullName,
    projectType: snapshot.projectType,
    careerDirection: snapshot.careerDirection,
    summary: parsed.summary,
    strengthFeedback: parsed.strengthFeedback,
    weaknessFeedback: parsed.weaknessFeedback,
    learningAdvice: parsed.learningAdvice,
    nextSteps: parsed.nextSteps,
    recommendedTopics: parsed.recommendedTopics,
    careerSuggestion: parsed.careerSuggestion,
    portfolioAdvice: parsed.portfolioAdvice,
    riskNotes: parsed.riskNotes,
    rawAiResponse: {
      provider: process.env.LLM_PROVIDER || 'gemini',
      model: resolvedModel,
      content: aiContent || '',
      usedFallback: Boolean(parsed.usedFallback),
      error: llmErrorMeta,
    },
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date(),
  });

  return {
    statusCode: 201,
    message: 'AI feedback generated successfully',
    data: {
      feedback: buildFeedbackResponse(feedback.toObject()),
    },
  };
};

const getRepositoryFeedback = async (user, repoId) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const repository = await findRepositoryForUser(userId, repoId);
  const feedback = await AiFeedback.findOne({
    userId,
    repositoryId: repository._id,
  })
    .sort({ generatedAt: -1, createdAt: -1 })
    .select('-rawAiResponse')
    .lean();

  return {
    statusCode: 200,
    message: 'AI feedback result fetched successfully',
    data: {
      feedback: buildFeedbackResponse(feedback),
    },
  };
};

const getMyFeedbacks = async (user) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const feedbackDocuments = await AiFeedback.find({ userId })
    .sort({ generatedAt: -1, createdAt: -1 })
    .select('-rawAiResponse')
    .lean();

  const seenRepositoryIds = new Set();
  const feedbacks = [];

  for (const feedback of feedbackDocuments) {
    const repositoryId = String(feedback.repositoryId || '');
    if (!repositoryId || seenRepositoryIds.has(repositoryId)) {
      continue;
    }

    seenRepositoryIds.add(repositoryId);
    feedbacks.push(buildFeedbackResponse(feedback));
  }

  return {
    statusCode: 200,
    message: 'My AI feedback results fetched successfully',
    data: {
      total: feedbacks.length,
      feedbacks,
    },
  };
};

module.exports = {
  findRepositoryForUser,
  generateRepositoryFeedback,
  getRepositoryFeedback,
  getMyFeedbacks,
};
