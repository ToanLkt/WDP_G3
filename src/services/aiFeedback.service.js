const mongoose = require('mongoose');

const AnalysisResult = require('../models/AnalysisResult');
const AiFeedback = require('../models/AiFeedback');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const Repository = require('../models/Repository');

const { buildAiFeedbackPrompt } = require('./ai-feedback/aiFeedback.prompt');
const { generateTextWithGemini } = require('./ai.service');
const { buildFallbackFeedback, parseAiFeedbackResponse } = require('./ai-feedback/aiFeedback.parser');
const { createStatusError, ensureAuthorizedUser } = require('./github/github.utils');
const { mapDev2VecOutputToRoleMatches } = require('./dev2vec/dev2vecRoleMapper.service');

const PROMPT_VERSION = 'dev2vec-v1';
const GEMINI_FALLBACK_RISK_NOTE = 'Gemini API failed, fallback feedback was used.';
const DEV2VEC_REQUIRED_MESSAGE =
  'Dev2Vec analysis is required before generating AI feedback. Please run POST /api/analysis/repositories/:repoId first.';

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
    metadata: feedback.metadata || undefined,
    generatedAt: feedback.generatedAt,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const hasDev2VecAnalysis = (analysis = {}) => (
  Array.isArray(analysis?.dev2vec?.rolePredictions)
    && analysis.dev2vec.rolePredictions.length > 0
    && analysis.dev2vec.skillGaps
    && typeof analysis.dev2vec.skillGaps === 'object'
);

const sortPredictions = (predictions = []) => (
  [...toArray(predictions)].sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))
);

const buildDev2VecOutput = (analysis = {}) => ({
  modelVersion: analysis.dev2vec?.modelVersion || null,
  vectorDims: analysis.dev2vec?.vectorDims || {},
  rolePredictions: analysis.dev2vec?.rolePredictions || [],
  skillGaps: analysis.dev2vec?.skillGaps || {},
  vectorSources: analysis.dev2vec?.vectorSources || {},
  sourceStats: analysis.dev2vec?.sourceStats || {},
  evidencePreview: analysis.dev2vec?.evidencePreview || {},
  scoringMethod: analysis.dev2vec?.scoringMethod || 'dev2vec_doc2vec_classifier',
});

const findLatestDev2VecSource = async (userId, repositoryId) => {
  const query = {
    userId,
    repositoryId,
    'dev2vec.rolePredictions.0': { $exists: true },
  };

  const analysisResult = await AnalysisResult.findOne(query)
    .sort({ analyzedAt: -1, createdAt: -1 })
    .select('repositoryId githubRepoId repoName fullName projectType careerDirection analyzedAt dev2vec')
    .lean();

  if (analysisResult && hasDev2VecAnalysis(analysisResult)) {
    return {
      sourceType: 'AnalysisResult',
      analysis: analysisResult,
      analysisSnapshotId: analysisResult._id,
    };
  }

  const snapshot = await RepoAnalysisSnapshot.findOne(query)
    .sort({ analyzedAt: -1, createdAt: -1 })
    .select('repositoryId githubRepoId repoName fullName projectType careerDirection analyzedAt analysisResultId dev2vec')
    .lean();

  if (snapshot && hasDev2VecAnalysis(snapshot)) {
    return {
      sourceType: 'RepoAnalysisSnapshot',
      analysis: snapshot,
      analysisSnapshotId: snapshot.analysisResultId || snapshot._id,
    };
  }

  return null;
};

const roundPercent = (probability) => Math.round((Number(probability) || 0) * 10000) / 100;

const buildFeedbackContext = ({ repository, dev2vecSource }) => {
  const analysis = dev2vecSource.analysis;
  const dev2vecOutput = buildDev2VecOutput(analysis);
  const topPrediction = sortPredictions(dev2vecOutput.rolePredictions)[0] || null;
  const selectedSkillGap = dev2vecOutput.skillGaps[topPrediction?.roleId] || {};
  const roleMatches = mapDev2VecOutputToRoleMatches(dev2vecOutput, { limit: 3 }).matches;
  const roleMatch = roleMatches[0] || null;
  const sourceStats = dev2vecOutput.sourceStats || {};
  const vectorSources = dev2vecOutput.vectorSources || {};
  const hasIssueVector = Boolean(vectorSources.issues || vectorSources.issueVector);

  return {
    repositoryId: repository._id,
    analysisSnapshotId: dev2vecSource.analysisSnapshotId,
    githubRepoId: repository.githubRepoId || analysis.githubRepoId,
    repoName: repository.name || analysis.repoName,
    fullName: repository.fullName || analysis.fullName,
    projectType: analysis.projectType || 'Unknown',
    careerDirection: topPrediction?.roleName || analysis.careerDirection || 'Generalist Software Engineer',
    analysisSource: 'dev2vec',
    analysisRecordType: dev2vecSource.sourceType,
    modelVersion: dev2vecOutput.modelVersion,
    scoringMethod: dev2vecOutput.scoringMethod,
    rolePrediction: topPrediction,
    topRole: topPrediction
      ? {
          roleId: topPrediction.roleId || '',
          roleName: topPrediction.roleName || topPrediction.modelLabel || '',
          probability: Number(topPrediction.probability) || 0,
          matchScore: roleMatch?.matchScore ?? roundPercent(topPrediction.probability),
        }
      : null,
    roleMatches,
    matchedSkillNames: toArray(selectedSkillGap.matchedSkillNames),
    weakSkillNames: toArray(selectedSkillGap.weakSkillNames),
    missingSkillNames: toArray(selectedSkillGap.missingSkillNames),
    recommendedNextSkills: toArray(selectedSkillGap.recommendedNextSkills),
    vectorSources,
    sourceStats,
    evidencePreview: dev2vecOutput.evidencePreview || {},
    docsEvidence: dev2vecOutput.evidencePreview?.docs || {},
    issueDataMissing: !hasIssueVector || Number(sourceStats.issueCount || 0) === 0,
    changedFileDataMissing: Number(sourceStats.changedFileCount || 0) === 0,
  };
};

const buildFeedbackMetadata = (context) => ({
  analysisSource: 'dev2vec',
  analysisRecordType: context.analysisRecordType,
  modelVersion: context.modelVersion,
  scoringMethod: context.scoringMethod,
  rolePrediction: context.rolePrediction,
  vectorSources: context.vectorSources,
  sourceStats: context.sourceStats,
  docs: context.docsEvidence || {},
});

const createDev2VecRequiredError = () => {
  const error = createStatusError(DEV2VEC_REQUIRED_MESSAGE, 400);
  error.errorCode = 'DEV2VEC_ANALYSIS_REQUIRED';
  return error;
};

const generateRepositoryFeedback = async (user, repoId) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const repository = await findRepositoryForUser(userId, repoId);
  const dev2vecSource = await findLatestDev2VecSource(userId, repository._id);

  if (!dev2vecSource) {
    throw createDev2VecRequiredError();
  }

  const feedbackContext = buildFeedbackContext({ repository, dev2vecSource });
  const prompt = buildAiFeedbackPrompt(feedbackContext);
  let aiContent = '';
  let parsed = null;
  let resolvedModel = String(process.env.LLM_MODEL || 'gemini-2.0-flash').replace(/^models\//, '');
  let llmErrorMeta = null;

  try {
    const geminiResult = await generateTextWithGemini(prompt);
    aiContent = geminiResult.content;
    resolvedModel = geminiResult.model || resolvedModel;
  } catch (error) {
    llmErrorMeta = error.llmError || null;
    parsed = buildFallbackFeedback(feedbackContext, [GEMINI_FALLBACK_RISK_NOTE]);
  }

  if (aiContent) {
    parsed = parseAiFeedbackResponse(aiContent, feedbackContext);
  }

  if (!parsed) {
    parsed = buildFallbackFeedback(feedbackContext, [GEMINI_FALLBACK_RISK_NOTE]);
  }

  const feedback = await AiFeedback.create({
    userId,
    repositoryId: repository._id,
    analysisSnapshotId: feedbackContext.analysisSnapshotId,
    githubRepoId: feedbackContext.githubRepoId,
    repoName: feedbackContext.repoName,
    fullName: feedbackContext.fullName,
    projectType: feedbackContext.projectType,
    careerDirection: feedbackContext.careerDirection,
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
    metadata: buildFeedbackMetadata(feedbackContext),
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
