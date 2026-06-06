const mongoose = require('mongoose');

const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const StudentProfile = require('../models/StudentProfile');
const Repository = require('../models/Repository');
const RepositoryPackage = require('../models/RepositoryPackage');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const SkillSignal = require('../models/SkillSignal');

const { generateChatResponse } = require('./ai.service');
const { buildChatContextPrompt } = require('./ai/chatContext.prompt');
const { createStatusError } = require('./github/github.utils');

let LearningRecommendation = null;

try {
  LearningRecommendation = require('../models/LearningRecommendation');
} catch (error) {
  LearningRecommendation = null;
}

const DEFAULT_SESSION_TITLE = 'New GitHub Mentor Chat';
const MAX_CONTEXT_REPOSITORIES = 5;
const MAX_CONTEXT_SNAPSHOTS = 5;
const MAX_CONTEXT_SKILL_SIGNALS = 20;
const MAX_CHAT_HISTORY = 10;

const getUserId = (authUser) => {
  const userId = authUser?.userId || authUser?._id || authUser?.id;

  if (!userId) {
    throw createStatusError('Unauthorized', 401);
  }

  return String(userId);
};

const buildSessionResponse = (session) => {
  if (!session) {
    return null;
  }

  return {
    _id: session._id,
    userId: session.userId,
    title: session.title,
    lastMessage: session.lastMessage || '',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

const buildMessageResponse = (message) => {
  if (!message) {
    return null;
  }

  return {
    _id: message._id,
    sessionId: message.sessionId,
    userId: message.userId,
    role: message.role,
    content: message.content,
    metadata: message.metadata || {},
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
};

const findOwnedSession = async (userId, sessionId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
    return null;
  }

  const query = ChatSession.findOne({
    _id: sessionId,
    userId,
  });

  if (options.lean) {
    query.lean();
  }

  return query;
};

const mapLearningRecommendation = (recommendation) => {
  if (!recommendation || typeof recommendation !== 'object') {
    return null;
  }

  const summary =
    recommendation.summary ||
    recommendation.content ||
    recommendation.recommendation ||
    recommendation.title ||
    '';

  const nextSteps = Array.isArray(recommendation.nextSteps)
    ? recommendation.nextSteps
    : Array.isArray(recommendation.steps)
      ? recommendation.steps
      : [];

  return {
    summary: String(summary || '').trim(),
    nextSteps,
    source: recommendation.source || recommendation.type || 'database',
    createdAt: recommendation.createdAt || null,
  };
};

const buildFallbackLearningRecommendations = (analysisSnapshots) => {
  const uniqueRecommendations = new Set();

  for (const snapshot of analysisSnapshots) {
    for (const recommendation of snapshot.recommendations || []) {
      const normalized = String(recommendation || '').trim();
      if (normalized) {
        uniqueRecommendations.add(normalized);
      }
    }
  }

  return Array.from(uniqueRecommendations).slice(0, 15).map((recommendation) => ({
    summary: recommendation,
    nextSteps: [],
    source: 'analysisSnapshot',
  }));
};

const buildRepositoryContext = (repositories, packageMap, snapshotMap) =>
  repositories.map((repository) => {
    const repositoryId = String(repository._id);
    const packageRecord = packageMap.get(repositoryId);
    const snapshot = snapshotMap.get(repositoryId);
    const hasReadme = snapshot?.checklist?.hasReadme;

    return {
      repositoryId: repository._id,
      name: repository.name,
      fullName: repository.fullName,
      description: repository.description,
      mainLanguage: repository.language || '',
      languages: packageRecord?.languages || snapshot?.languages || [],
      frameworks: packageRecord?.frameworks || snapshot?.frameworks || [],
      packages: packageRecord?.packages || snapshot?.packages || [],
      topics: repository.topics || [],
      readmeSummary:
        hasReadme === true
          ? 'README was detected in the latest repository analysis.'
          : hasReadme === false
            ? 'README was not detected in the latest repository analysis.'
            : 'README information is not available yet.',
      commitSummary: snapshot?.commitSummary || {},
      repoWeaknesses: snapshot?.weaknesses || [],
      strengths: snapshot?.strengths || [],
      careerDirection: snapshot?.careerDirection || '',
      recommendations: snapshot?.recommendations || [],
      lastAnalyzedAt: snapshot?.analyzedAt || null,
      pushedAt: repository.pushedAt || null,
    };
  });

const buildAnalysisContext = (analysisSnapshots) =>
  analysisSnapshots.map((snapshot) => ({
    analysisId: snapshot._id,
    repositoryId: snapshot.repositoryId,
    repoName: snapshot.repoName,
    projectType: snapshot.projectType,
    languages: snapshot.languages || [],
    frameworks: snapshot.frameworks || [],
    packages: snapshot.packages || [],
    skillSignals: snapshot.skillSignals || [],
    careerDirection: snapshot.careerDirection || '',
    strengths: snapshot.strengths || [],
    weaknesses: snapshot.weaknesses || [],
    missingSkills: snapshot.missingSkills || [],
    recommendations: snapshot.recommendations || [],
    scores: snapshot.scores || {},
    commitSummary: snapshot.commitSummary || {},
    analyzedAt: snapshot.analyzedAt || snapshot.createdAt || null,
  }));

const buildSkillSignalContext = (skillSignals) =>
  skillSignals.map((signal) => ({
    skillName: signal.skillName,
    score: signal.score || 0,
    evidence: signal.evidence || [],
    repositoryId: signal.repositoryId,
  }));

const buildUserGithubContext = async (userId) => {
  const [studentProfile, repositories, analysisSnapshots, skillSignals] = await Promise.all([
    StudentProfile.findOne({ userId })
      .select('university major year targetCareer currentSkills githubUsername githubConnected')
      .lean(),
    Repository.find({ userId })
      .sort({ updatedAtGithub: -1, pushedAt: -1, createdAt: -1 })
      .limit(MAX_CONTEXT_REPOSITORIES)
      .select('name fullName description language topics pushedAt updatedAtGithub')
      .lean(),
    AnalysisSnapshot.find({ userId })
      .sort({ analyzedAt: -1, createdAt: -1 })
      .limit(MAX_CONTEXT_SNAPSHOTS)
      .select(
        'repositoryId repoName projectType languages frameworks packages skillSignals careerDirection strengths weaknesses missingSkills recommendations scores commitSummary checklist analyzedAt createdAt'
      )
      .lean(),
    SkillSignal.find({ userId })
      .sort({ score: -1, createdAt: -1 })
      .limit(MAX_CONTEXT_SKILL_SIGNALS)
      .select('repositoryId skillName score evidence')
      .lean(),
  ]);

  const repositoryIds = repositories.map((repository) => repository._id);
  const [packageRecords, learningRecommendations] = await Promise.all([
    repositoryIds.length > 0
      ? RepositoryPackage.find({ userId, repositoryId: { $in: repositoryIds } })
          .select('repositoryId packages frameworks languages configs')
          .lean()
      : [],
    LearningRecommendation && typeof LearningRecommendation.find === 'function'
      ? LearningRecommendation.find({ userId }).sort({ createdAt: -1 }).limit(10).lean()
      : [],
  ]);

  const packageMap = new Map(
    packageRecords.map((record) => [String(record.repositoryId), record])
  );

  const snapshotMap = new Map();
  for (const snapshot of analysisSnapshots) {
    const repositoryId = String(snapshot.repositoryId || '');
    if (repositoryId && !snapshotMap.has(repositoryId)) {
      snapshotMap.set(repositoryId, snapshot);
    }
  }

  const mappedRecommendations = Array.isArray(learningRecommendations)
    ? learningRecommendations.map(mapLearningRecommendation).filter(Boolean).filter((item) => item.summary)
    : [];

  return {
    studentProfile: studentProfile
      ? {
          university: studentProfile.university || '',
          major: studentProfile.major || '',
          year: studentProfile.year,
          targetCareer: studentProfile.targetCareer || '',
          currentSkills: studentProfile.currentSkills || [],
          githubUsername: studentProfile.githubUsername || '',
          githubConnected: Boolean(studentProfile.githubConnected),
        }
      : null,
    repositories: buildRepositoryContext(repositories, packageMap, snapshotMap),
    analysisSnapshots: buildAnalysisContext(analysisSnapshots),
    skillSignals: buildSkillSignalContext(skillSignals),
    learningRecommendations:
      mappedRecommendations.length > 0
        ? mappedRecommendations
        : buildFallbackLearningRecommendations(analysisSnapshots),
  };
};

const createSession = async ({ user, body }) => {
  const userId = getUserId(user);
  const title = String(body?.title || '').trim() || DEFAULT_SESSION_TITLE;

  const session = await ChatSession.create({
    userId,
    title,
  });

  return {
    message: 'Chat session created successfully',
    data: {
      session: buildSessionResponse(session.toObject()),
    },
    statusCode: 201,
  };
};

const getSessions = async ({ user }) => {
  const userId = getUserId(user);
  const sessions = await ChatSession.find({ userId })
    .sort({ updatedAt: -1 })
    .lean();

  return {
    message: 'Chat sessions fetched successfully',
    data: {
      sessions: sessions.map(buildSessionResponse),
    },
    statusCode: 200,
  };
};

const getSessionDetail = async ({ user, params }) => {
  const userId = getUserId(user);
  const session = await findOwnedSession(userId, params?.sessionId, { lean: true });

  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  const messages = await ChatMessage.find({
    sessionId: session._id,
    userId,
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return {
    message: 'Chat session fetched successfully',
    data: {
      session: buildSessionResponse(session),
      messages: messages.map(buildMessageResponse),
    },
    statusCode: 200,
  };
};

const sendMessage = async ({ user, params, body }) => {
  const userId = getUserId(user);
  const session = await findOwnedSession(userId, params?.sessionId);

  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  const content = String(body?.message || '').trim();
  const userMessage = await ChatMessage.create({
    sessionId: session._id,
    userId,
    role: 'user',
    content,
  });

  const [githubContext, recentMessages] = await Promise.all([
    buildUserGithubContext(userId),
    ChatMessage.find({
      sessionId: session._id,
      userId,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_CHAT_HISTORY)
      .select('role content createdAt')
      .lean(),
  ]);

  const prompt = buildChatContextPrompt({
    studentProfile: githubContext.studentProfile,
    repositories: githubContext.repositories,
    analysisSnapshots: githubContext.analysisSnapshots,
    skillSignals: githubContext.skillSignals,
    learningRecommendations: githubContext.learningRecommendations,
    chatHistory: recentMessages.reverse(),
    userQuestion: content,
  });

  const assistantContent = await generateChatResponse(prompt);
  const assistantMessage = await ChatMessage.create({
    sessionId: session._id,
    userId,
    role: 'assistant',
    content: assistantContent,
    metadata: {
      provider: process.env.LLM_PROVIDER || 'gemini',
      model: process.env.LLM_MODEL || 'gemini-1.5-flash',
    },
  });

  session.lastMessage = assistantContent;
  await session.save();

  return {
    message: 'Message sent successfully',
    data: {
      userMessage: buildMessageResponse(userMessage.toObject()),
      assistantMessage: buildMessageResponse(assistantMessage.toObject()),
    },
    statusCode: 200,
  };
};

module.exports = {
  createSession,
  getSessions,
  getSessionDetail,
  sendMessage,
  buildUserGithubContext,
};
