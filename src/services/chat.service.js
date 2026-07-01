const mongoose = require('mongoose');

const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const ChatSetting = require('../models/ChatSetting');
const StudentProfile = require('../models/StudentProfile');
const Repository = require('../models/Repository');
const RepositoryPackage = require('../models/RepositoryPackage');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const SkillSignal = require('../models/SkillSignal');

const { generateChatResult } = require('./ai.service');
const { buildChatContextPrompt } = require('./ai/chatContext.prompt');
const {
  CHAT_INTENTS,
  buildChatSkillScoreContext,
  detectChatIntent,
} = require('./chatSkillContext.service');
const { createStatusError } = require('./github/github.utils');

let LearningRecommendation = null;

try {
  LearningRecommendation = require('../models/LearningRecommendation');
} catch (error) {
  LearningRecommendation = null;
}

const DEFAULT_SESSION_TITLE = 'New GitHub Mentor Chat';
const CHAT_MODES = ['AI_AUTO', 'MANUAL'];
const CHAT_MODE_SOURCES = ['GLOBAL', 'SESSION'];
const CHAT_STATUSES = ['active', 'waiting_admin', 'answered', 'closed'];
const MAX_CONTEXT_REPOSITORIES = 5;
const MAX_CONTEXT_SNAPSHOTS = 5;
const MAX_CONTEXT_SKILL_SIGNALS = 20;
const MAX_CHAT_HISTORY = 6;

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
    status: session.status || 'active',
    mode: session.mode || 'AI_AUTO',
    modeSource: session.modeSource || 'GLOBAL',
    assignedAdminId: session.assignedAdminId || null,
    aiPausedAt: session.aiPausedAt || null,
    aiPausedBy: session.aiPausedBy || null,
    manualReason: session.manualReason || '',
    unreadByAdmin: Boolean(session.unreadByAdmin),
    unreadByUser: Boolean(session.unreadByUser),
    lastMessageAt: session.lastMessageAt || null,
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
    senderType: message.senderType || (message.role === 'assistant' ? 'AI' : 'USER'),
    senderId: message.senderId || message.userId || null,
    content: message.content,
    metadata: message.metadata || {},
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
};

const getAdminId = (authUser) => getUserId(authUser);

const getOrCreateChatSetting = async () => {
  let setting = await ChatSetting.findOne().populate('updatedBy', 'email fullName name role').lean();
  if (setting) {
    return setting;
  }

  const created = await ChatSetting.create({ mode: 'AI_AUTO' });
  return ChatSetting.findById(created._id).populate('updatedBy', 'email fullName name role').lean();
};

const buildSettingResponse = (setting) => ({
  mode: setting?.mode || 'AI_AUTO',
  aiEnabled: (setting?.mode || 'AI_AUTO') === 'AI_AUTO',
  manualEnabled: setting?.mode === 'MANUAL',
  updatedBy: setting?.updatedBy
    ? {
        id: setting.updatedBy._id,
        email: setting.updatedBy.email,
        fullName: setting.updatedBy.fullName || setting.updatedBy.name || '',
      }
    : null,
  updatedAt: setting?.updatedAt || null,
});

const getEffectiveMode = async (session) => {
  if ((session.modeSource || 'GLOBAL') === 'SESSION') {
    return session.mode || 'AI_AUTO';
  }

  const setting = await getOrCreateChatSetting();
  return setting.mode || 'AI_AUTO';
};

const buildSessionWithEffectiveMode = (session, effectiveMode) => ({
  ...buildSessionResponse(session),
  effectiveMode,
});

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

const shouldIncludeChatDebug = () => process.env.NODE_ENV !== 'production';
const NO_SKILL_SCORE_DATA_MESSAGE = 'Hien chua du du lieu phan tich tu repo de xac dinh.';
const intentsRequiringSkillScore = new Set([
  CHAT_INTENTS.WEAK_SKILLS,
  CHAT_INTENTS.STRONG_SKILLS,
  CHAT_INTENTS.NEXT_SKILLS,
  CHAT_INTENTS.ROLE_FIT,
]);

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
    lastMessageAt: new Date(),
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
    senderType: 'USER',
    senderId: userId,
    content,
  });

  const effectiveMode = await getEffectiveMode(session);

  if (effectiveMode === 'MANUAL') {
    session.lastMessage = content;
    session.status = 'waiting_admin';
    session.unreadByAdmin = true;
    session.lastMessageAt = new Date();
    await session.save();

    return {
      message: 'Tin nhan da duoc gui.',
      data: {
        mode: 'MANUAL',
        effectiveMode: 'MANUAL',
        modeSource: session.modeSource || 'GLOBAL',
        status: session.status,
        userMessage: buildMessageResponse(userMessage.toObject()),
        adminMessage: null,
      },
      statusCode: 200,
    };
  }

  const intent = detectChatIntent(content);

  const [githubContext, recentMessages, skillScoreContext] = await Promise.all([
    buildUserGithubContext(userId),
    ChatMessage.find({
      sessionId: session._id,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_CHAT_HISTORY)
      .select('role content createdAt')
      .lean(),
    buildChatSkillScoreContext(userId, { intent }),
  ]);

  const shouldShortCircuitNoSkillData =
    intentsRequiringSkillScore.has(intent) && !skillScoreContext.hasSkillScoreData;
  const prompt = shouldShortCircuitNoSkillData
    ? ''
    : buildChatContextPrompt({
        intent,
        skillScoreContext,
        studentProfile: githubContext.studentProfile,
        repositories: githubContext.repositories,
        analysisSnapshots: githubContext.analysisSnapshots,
        skillSignals: githubContext.skillSignals,
        learningRecommendations: githubContext.learningRecommendations,
        chatHistory: recentMessages.reverse(),
        userQuestion: content,
      });

  const assistantResult = shouldShortCircuitNoSkillData
    ? {
        text: NO_SKILL_SCORE_DATA_MESSAGE,
        provider: 'system',
        model: 'skill-score-guard',
        usedFallback: true,
      }
    : await generateChatResult(prompt);
  const assistantContent = assistantResult.text;
  const assistantMessage = await ChatMessage.create({
    sessionId: session._id,
    userId,
    role: 'assistant',
    senderType: 'AI',
    senderId: null,
    content: assistantContent,
    metadata: {
      provider: assistantResult.provider,
      model: assistantResult.model,
      usedFallback: assistantResult.usedFallback,
      intent,
      contextSource: 'skillVector',
    },
  });

  session.lastMessage = assistantContent;
  session.status = 'active';
  if ((session.modeSource || 'GLOBAL') === 'GLOBAL') {
    session.mode = 'AI_AUTO';
  }
  session.unreadByUser = false;
  session.unreadByAdmin = false;
  session.lastMessageAt = new Date();
  await session.save();

  const data = {
    mode: 'AI_AUTO',
    effectiveMode: 'AI_AUTO',
    modeSource: session.modeSource || 'GLOBAL',
    status: session.status,
    userMessage: buildMessageResponse(userMessage.toObject()),
    aiMessage: buildMessageResponse(assistantMessage.toObject()),
    assistantMessage: buildMessageResponse(assistantMessage.toObject()),
  };

  if (shouldIncludeChatDebug()) {
    data.intent = intent;
    data.contextSource = 'skillVector';
    data.skillScoreSummary = skillScoreContext.summary;
  }

  return {
    message: 'Message sent successfully',
    data,
    statusCode: 200,
  };
};

const getChatSettings = async () => {
  const setting = await getOrCreateChatSetting();

  return {
    message: 'Chat settings fetched successfully',
    data: buildSettingResponse(setting),
    statusCode: 200,
  };
};

const updateChatSettings = async ({ user, body }) => {
  const adminId = getAdminId(user);
  const mode = String(body?.mode || '').trim().toUpperCase();

  if (!CHAT_MODES.includes(mode)) {
    throw createStatusError(`mode must be one of ${CHAT_MODES.join(', ')}`, 400);
  }

  const existing = await getOrCreateChatSetting();
  await ChatSetting.findByIdAndUpdate(existing._id, { $set: { mode, updatedBy: adminId } });
  const setting = await ChatSetting.findById(existing._id).populate('updatedBy', 'email fullName name role').lean();

  return {
    message: 'Chat settings updated successfully',
    data: buildSettingResponse(setting),
    statusCode: 200,
  };
};

const getAdminChatSessions = async ({ query }) => {
  const filter = {};
  const pagination = {
    page: Math.max(Number(query?.page) || 1, 1),
    limit: Math.min(Math.max(Number(query?.limit) || 20, 1), 100),
  };
  pagination.skip = (pagination.page - 1) * pagination.limit;

  if (CHAT_STATUSES.includes(query?.status)) filter.status = query.status;
  if (CHAT_MODES.includes(query?.mode)) filter.mode = query.mode;
  if (CHAT_MODE_SOURCES.includes(query?.modeSource)) filter.modeSource = query.modeSource;
  if (mongoose.Types.ObjectId.isValid(String(query?.userId || ''))) filter.userId = query.userId;
  if (mongoose.Types.ObjectId.isValid(String(query?.assignedAdminId || ''))) {
    filter.assignedAdminId = query.assignedAdminId;
  }

  const [sessions, total, setting] = await Promise.all([
    ChatSession.find(filter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('userId', 'email fullName name role status')
      .populate('assignedAdminId', 'email fullName name role')
      .lean(),
    ChatSession.countDocuments(filter),
    getOrCreateChatSetting(),
  ]);

  const lastMessages = await ChatMessage.find({ sessionId: { $in: sessions.map((item) => item._id) } })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const lastMessageMap = new Map();
  for (const message of lastMessages) {
    const sessionId = String(message.sessionId);
    if (!lastMessageMap.has(sessionId)) {
      lastMessageMap.set(sessionId, buildMessageResponse(message));
    }
  }

  return {
    message: 'Chat sessions fetched successfully',
    data: {
      items: sessions.map((session) => ({
        ...buildSessionWithEffectiveMode(
          session,
          (session.modeSource || 'GLOBAL') === 'SESSION' ? session.mode || 'AI_AUTO' : setting.mode || 'AI_AUTO'
        ),
        user: session.userId,
        lastMessage: lastMessageMap.get(String(session._id)) || null,
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    },
    statusCode: 200,
  };
};

const getAdminChatSessionDetail = async ({ params }) => {
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const session = await ChatSession.findById(params.sessionId)
    .populate('userId', 'email fullName name role status')
    .populate('assignedAdminId', 'email fullName name role')
    .populate('aiPausedBy', 'email fullName name role')
    .lean();
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  const [effectiveMode, messages] = await Promise.all([
    getEffectiveMode(session),
    ChatMessage.find({ sessionId: session._id }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);

  return {
    message: 'Chat session fetched successfully',
    data: {
      session: {
        ...buildSessionWithEffectiveMode(session, effectiveMode),
        user: session.userId,
      },
      messages: messages.map(buildMessageResponse),
    },
    statusCode: 200,
  };
};

const sendAdminChatMessage = async ({ user, params, body }) => {
  const adminId = getAdminId(user);
  const content = String(body?.content || '').trim();
  if (!content) {
    throw createStatusError('content is required', 400);
  }
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const session = await ChatSession.findById(params.sessionId);
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  const adminMessage = await ChatMessage.create({
    sessionId: session._id,
    userId: session.userId,
    role: 'assistant',
    senderType: 'ADMIN',
    senderId: adminId,
    content,
  });

  session.mode = 'MANUAL';
  session.modeSource = 'SESSION';
  session.status = 'answered';
  session.assignedAdminId = adminId;
  session.unreadByUser = true;
  session.unreadByAdmin = false;
  session.lastMessage = content;
  session.lastMessageAt = new Date();
  await session.save();

  return {
    message: 'Admin message sent successfully',
    data: {
      adminMessage: buildMessageResponse(adminMessage.toObject()),
      session: buildSessionWithEffectiveMode(session.toObject(), 'MANUAL'),
    },
    statusCode: 201,
  };
};

const updateAdminChatSessionMode = async ({ user, params, body }) => {
  const adminId = getAdminId(user);
  const mode = String(body?.mode || '').trim().toUpperCase();
  if (!CHAT_MODES.includes(mode)) {
    throw createStatusError(`mode must be one of ${CHAT_MODES.join(', ')}`, 400);
  }
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const update =
    mode === 'MANUAL'
      ? {
          mode,
          modeSource: 'SESSION',
          status: 'waiting_admin',
          assignedAdminId: adminId,
          aiPausedAt: new Date(),
          aiPausedBy: adminId,
          manualReason: String(body?.reason || '').trim(),
        }
      : {
          mode,
          modeSource: 'SESSION',
          status: 'active',
          assignedAdminId: null,
          aiPausedAt: null,
          aiPausedBy: null,
          manualReason: '',
        };

  const session = await ChatSession.findByIdAndUpdate(params.sessionId, { $set: update }, { new: true }).lean();
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  return {
    message:
      mode === 'MANUAL'
        ? 'Chat session switched to manual mode'
        : 'Chat session switched to AI auto mode',
    data: {
      session: buildSessionWithEffectiveMode(session, mode),
    },
    statusCode: 200,
  };
};

const useGlobalChatSessionMode = async ({ params }) => {
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const setting = await getOrCreateChatSetting();
  const session = await ChatSession.findByIdAndUpdate(
    params.sessionId,
    { $set: { modeSource: 'GLOBAL', mode: setting.mode || 'AI_AUTO' } },
    { new: true }
  ).lean();
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  return {
    message: 'Chat session switched to global mode',
    data: {
      session: buildSessionWithEffectiveMode(session, setting.mode || 'AI_AUTO'),
    },
    statusCode: 200,
  };
};

module.exports = {
  createSession,
  getSessions,
  getSessionDetail,
  sendMessage,
  getChatSettings,
  updateChatSettings,
  getAdminChatSessions,
  getAdminChatSessionDetail,
  sendAdminChatMessage,
  updateAdminChatSessionMode,
  useGlobalChatSessionMode,
  buildUserGithubContext,
};
