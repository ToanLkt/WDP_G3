const mongoose = require('mongoose');

const AiFeedback = require('../models/AiFeedback');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const Repository = require('../models/Repository');

const { buildAiFeedbackPrompt } = require('./ai-feedback/aiFeedback.prompt');
const { generateTextWithGemini } = require('./ai.service');
const { buildFallbackFeedback, parseAiFeedbackResponse } = require('./ai-feedback/aiFeedback.parser');
const { createStatusError, ensureAuthorizedUser } = require('./github/github.utils');
const { mapDev2VecOutputToRoleMatches } = require('./dev2vec/dev2vecRoleMapper.service');
const { resolveCurrentContext } = require('./currentContext.service');
const {
  findLatestCompatibleAnalysis,
  isCompatibleSnapshot,
  getCurrentDev2VecVersions,
  getRecordMetadata,
} = require('./dev2vec/dev2vecCompatibility.service');

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
  const currentVersions = getCurrentDev2VecVersions();
  return {
    _id: feedback._id,
    repositoryId: feedback.repositoryId,
    analysisSnapshotId: feedback.analysisSnapshotId,
    analysisId: feedback.analysisId || null,
    snapshotId: feedback.snapshotId || feedback.analysisSnapshotId || null,
    roadmapId: feedback.roadmapId || null,
    progressUpdatedAt: feedback.progressUpdatedAt || null,
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
    isStale: Boolean(feedback.isStale),
    staleReason: feedback.staleReason || null,
    sourceModelVersion: feedback.metadata?.modelVersion || null,
    sourcePipelineVersion: feedback.metadata?.analysisPipelineVersion || null,
    currentModelVersion: currentVersions.modelVersion,
    currentPipelineVersion: currentVersions.pipelineVersion,
    context: {
      repositoryId: feedback.repositoryId || null,
      analysisId: feedback.analysisId || null,
      snapshotId: feedback.snapshotId || feedback.analysisSnapshotId || null,
      roadmapId: feedback.roadmapId || null,
      progressUpdatedAt: feedback.progressUpdatedAt || null,
    },
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

const canonicalSkillNameOf = (item) => String(
  item?.canonicalSkillName || item?.skillName || item?.skill || item || ''
).trim();

const toDisplayScore = (value) => {
  const score = Number(value) || 0;
  return Math.round((score <= 1 ? score * 100 : score) * 100) / 100;
};

const roundPercent = (probability) => Math.round((Number(probability) || 0) * 10000) / 100;

const buildFeedbackContext = ({ repository, dev2vecSource }) => {
  const analysis = dev2vecSource.analysis;
  const dev2vecOutput = buildDev2VecOutput(analysis);
  const pipelineMetadata = getRecordMetadata(analysis);
  const topPrediction = sortPredictions(dev2vecOutput.rolePredictions)[0] || null;
  const selectedSkillGap = dev2vecOutput.skillGaps[topPrediction?.roleId] || {};
  const roleMatches = mapDev2VecOutputToRoleMatches(dev2vecOutput, { limit: 3 }).matches;
  const roleMatch = roleMatches[0] || null;
  const sourceStats = dev2vecOutput.sourceStats || {};
  const vectorSources = dev2vecOutput.vectorSources || {};
  const hasIssueVector = Boolean(vectorSources.issues || vectorSources.issueVector);
  const topSkillItems = toArray(analysis.skillVector)
    .filter((item) => item && item.level !== 'missing' && Number(item.score || 0) > 0)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const detectedSkillNames = topSkillItems.map(canonicalSkillNameOf).filter(Boolean);
  const weakDetectedSkillNames = topSkillItems
    .filter((item) => item.level === 'weak' || toDisplayScore(item.score) < 45)
    .map(canonicalSkillNameOf)
    .filter(Boolean);
  const missingFromAnalysis = toArray(analysis.missingSkills)
    .map(canonicalSkillNameOf)
    .filter((name) => name && !detectedSkillNames.some((skill) => skill.toLowerCase() === name.toLowerCase()));
  const hasAnalysisSkillContext = detectedSkillNames.length > 0 || missingFromAnalysis.length > 0;

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
    pipelineMetadata,
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
    matchedSkillNames: hasAnalysisSkillContext ? detectedSkillNames : toArray(selectedSkillGap.matchedSkillNames),
    weakSkillNames: hasAnalysisSkillContext ? weakDetectedSkillNames : toArray(selectedSkillGap.weakSkillNames),
    missingSkillNames: hasAnalysisSkillContext ? missingFromAnalysis : toArray(selectedSkillGap.missingSkillNames),
    recommendedNextSkills: hasAnalysisSkillContext
      ? [...missingFromAnalysis, ...weakDetectedSkillNames]
      : toArray(selectedSkillGap.recommendedNextSkills),
    topSkills: topSkillItems.map((item) => ({
      skillName: canonicalSkillNameOf(item),
      canonicalSkillName: canonicalSkillNameOf(item),
      score: toDisplayScore(item.score),
      level: item.level || 'weak',
    })),
    strengths: toArray(analysis.strengths),
    weaknesses: toArray(analysis.weaknesses),
    recommendations: toArray(analysis.recommendations),
    vectorSources,
    sourceStats,
    evidencePreview: dev2vecOutput.evidencePreview || {},
    docsEvidence: dev2vecOutput.evidencePreview?.docs || {},
    issueDataMissing: !hasIssueVector || Number(sourceStats.issueCount || 0) === 0,
    changedFileDataMissing: Number(sourceStats.changedFileCount || 0) === 0,
  };
};

const attachRoadmapFeedbackContext = (context, selectedContext) => ({
  ...context,
  analysisId: selectedContext.provenance.analysisId,
  snapshotId: selectedContext.provenance.snapshotId,
  roadmapId: selectedContext.provenance.roadmapId,
  progressUpdatedAt: selectedContext.provenance.progressUpdatedAt,
  roadmap: selectedContext.roadmap
    ? { targetRole: selectedContext.roadmap.targetRole, effectiveLevel: selectedContext.roadmap.effectiveLevel, language: selectedContext.roadmap.language }
    : null,
  progress: selectedContext.progressContext,
  topSkills: selectedContext.topSkills.length ? selectedContext.topSkills : context.topSkills,
  missingSkillNames: selectedContext.missingSkills.length ? selectedContext.missingSkills : context.missingSkillNames,
});

const buildFeedbackMetadata = (context) => ({
  analysisSource: 'dev2vec',
  analysisRecordType: context.analysisRecordType,
  modelVersion: context.modelVersion,
  analysisPipelineVersion: context.pipelineMetadata?.analysisPipelineVersion || null,
  repoDocumentVersion: context.pipelineMetadata?.repoDocumentVersion || null,
  issueDocumentVersion: context.pipelineMetadata?.issueDocumentVersion || null,
  apiEvidenceVersion: context.pipelineMetadata?.apiEvidenceVersion || null,
  evidenceFingerprint: context.pipelineMetadata?.evidenceFingerprint || null,
  scoringMethod: context.scoringMethod,
  rolePrediction: context.rolePrediction,
  vectorSources: context.vectorSources,
  sourceStats: context.sourceStats,
  docs: context.docsEvidence || {},
  provenance: {
    repositoryId: context.repositoryId || null,
    analysisId: context.analysisId || null,
    snapshotId: context.snapshotId || null,
    roadmapId: context.roadmapId || null,
    progressUpdatedAt: context.progressUpdatedAt || null,
  },
});

const createDev2VecRequiredError = () => {
  const error = createStatusError(DEV2VEC_REQUIRED_MESSAGE, 400);
  error.errorCode = 'DEV2VEC_ANALYSIS_REQUIRED';
  error.analysisStatus = 'analysis_required';
  error.reason = 'no_compatible_dev2vec_analysis';
  error.errors = [{ analysisStatus: error.analysisStatus, reason: error.reason }];
  return error;
};

const evaluateFeedbackCompatibility = async (userId, feedback) => {
  if (!feedback) return { isStale: false, staleReason: null };
  const repositoryId = feedback.repositoryId?._id || feedback.repositoryId;
  const current = await findLatestCompatibleAnalysis({ userId, repositoryId });
  if (!current) return { isStale: true, staleReason: 'no_compatible_dev2vec_analysis' };
  if (String(current._id) !== String(feedback.analysisId || '')) return { isStale: true, staleReason: 'analysis_changed' };
  const currentMetadata = getRecordMetadata(current);
  const source = feedback.metadata || {};
  for (const field of ['modelVersion', 'analysisPipelineVersion', 'repoDocumentVersion', 'issueDocumentVersion', 'apiEvidenceVersion']) {
    const currentValue = field === 'modelVersion' ? current.dev2vec?.modelVersion : currentMetadata[field];
    if (!source[field] || source[field] !== currentValue) return { isStale: true, staleReason: `${field}_changed` };
  }
  if (source.evidenceFingerprint && source.evidenceFingerprint !== currentMetadata.evidenceFingerprint) {
    return { isStale: true, staleReason: 'evidence_fingerprint_changed' };
  }
  if (feedback.snapshotId) {
    const snapshot = await RepoAnalysisSnapshot.findOne({ _id: feedback.snapshotId, userId }).lean();
    if (!snapshot || !isCompatibleSnapshot(snapshot)) return { isStale: true, staleReason: 'snapshot_incompatible' };
  }
  return { isStale: false, staleReason: null };
};

const generateRepositoryFeedback = async (user, repoId, options = {}) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const repository = await findRepositoryForUser(userId, repoId);
  const selectedContext = await resolveCurrentContext(userId, {
    repositoryId: repository._id,
    roadmapId: options.roadmapId,
    analysisId: options.analysisId,
    snapshotId: options.snapshotId,
  });
  const roadmapRepositoryIds = selectedContext.roadmap?.roadmapSource?.repositoryIds || [];
  const contextMatchesRepository =
    !selectedContext.provenance.repositoryId ||
    String(selectedContext.provenance.repositoryId) === String(repository._id) ||
    roadmapRepositoryIds.some((id) => String(id) === String(repository._id));
  if (!contextMatchesRepository) {
    throw createStatusError('Selected context does not belong to the requested repository', 400);
  }
  const dev2vecSource = selectedContext.analysis && hasDev2VecAnalysis(selectedContext.analysis)
    ? { sourceType: 'AnalysisResult', analysis: selectedContext.analysis, analysisSnapshotId: selectedContext.provenance.snapshotId }
    : null;

  if (!dev2vecSource) {
    throw createDev2VecRequiredError();
  }

  const feedbackContext = attachRoadmapFeedbackContext(buildFeedbackContext({ repository, dev2vecSource }), selectedContext);
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
    analysisSnapshotId: feedbackContext.snapshotId || null,
    analysisId: feedbackContext.analysisId || null,
    snapshotId: feedbackContext.snapshotId || null,
    roadmapId: feedbackContext.roadmapId || null,
    progressUpdatedAt: feedbackContext.progressUpdatedAt || null,
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

const getRepositoryFeedback = async (user, repoId, options = {}) => {
  ensureAuthorizedUser(user);

  const userId = user.userId || user._id || user.id;
  const repository = await findRepositoryForUser(userId, repoId);
  const feedback = await AiFeedback.findOne({
    userId,
    repositoryId: repository._id,
    ...(options.roadmapId ? { roadmapId: options.roadmapId } : {}),
  })
    .sort({ generatedAt: -1, createdAt: -1 })
    .select('-rawAiResponse')
    .lean();

  const stale = feedback ? await evaluateFeedbackCompatibility(userId, feedback) : { isStale: false, staleReason: null };
  return {
    statusCode: 200,
    message: 'AI feedback result fetched successfully',
    data: {
      feedback: buildFeedbackResponse(feedback ? { ...feedback, ...stale } : feedback),
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
    feedbacks.push(buildFeedbackResponse({ ...feedback, ...(await evaluateFeedbackCompatibility(userId, feedback)) }));
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
  buildFeedbackResponse,
  evaluateFeedbackCompatibility,
};
