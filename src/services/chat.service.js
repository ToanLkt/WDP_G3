const mongoose = require('mongoose');

const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const ChatSetting = require('../models/ChatSetting');
const StudentProfile = require('../models/StudentProfile');
const Repository = require('../models/Repository');
const RepositoryPackage = require('../models/RepositoryPackage');
const AnalysisResult = require('../models/AnalysisResult');
const SkillSignal = require('../models/SkillSignal');

const { generateChatResult } = require('./ai.service');
const { buildChatContextPrompt } = require('./ai/chatContext.prompt');
const {
  CHAT_INTENTS,
  buildChatSkillScoreContext,
  buildRepoComparisonContext,
  detectChatIntent,
  detectChatIntents,
} = require('./chatSkillContext.service');
const { createStatusError } = require('./github/github.utils');
const { resolveCurrentContext } = require('./currentContext.service');

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

const computeChatSessionMode = (session = {}, globalSetting = null) => {
  const modeSource = CHAT_MODE_SOURCES.includes(session?.modeSource) ? session.modeSource : 'GLOBAL';
  const globalMode = CHAT_MODES.includes(globalSetting?.mode) ? globalSetting.mode : 'AI_AUTO';
  const sessionMode = CHAT_MODES.includes(session?.mode) ? session.mode : null;
  const effectiveMode = modeSource === 'SESSION' ? sessionMode || globalMode : globalMode;

  return {
    mode: modeSource === 'GLOBAL' ? null : sessionMode,
    modeSource,
    effectiveMode,
  };
};

const normalizeActiveStatusForMode = (status, effectiveMode) =>
  effectiveMode === 'AI_AUTO' && status === 'waiting_admin' ? 'active' : status;

const buildSessionResponse = (session, globalSetting = null) => {
  if (!session) {
    return null;
  }

  const modeState = computeChatSessionMode(session, globalSetting);

  return {
    _id: session._id,
    userId: session.userId,
    repositoryId: session.repositoryId || null,
    roadmapId: session.roadmapId || null,
    analysisId: session.analysisId || null,
    snapshotId: session.snapshotId || null,
    contextSelectionReason: session.contextSelectionReason || '',
    contextPinnedAt: session.contextPinnedAt || null,
    contextPinnedBy: session.contextPinnedBy || null,
    title: session.title,
    lastMessage: session.lastMessage || '',
    status: session.status || 'active',
    mode: modeState.mode,
    modeSource: modeState.modeSource,
    effectiveMode: modeState.effectiveMode,
    assignedAdminId: session.assignedAdminId || null,
    aiPausedAt: session.aiPausedAt || null,
    aiPausedBy: session.aiPausedBy || null,
    manualReason: session.manualReason || '',
    unreadByAdmin: Boolean(session.unreadByAdmin),
    unreadByUser: Boolean(session.unreadByUser),
    lastMessageAt: session.lastMessageAt || null,
    userDeletedAt: session.userDeletedAt || null,
    closedAt: session.closedAt || null,
    closedBy: session.closedBy || null,
    closeReason: session.closeReason || '',
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
  const setting = await getOrCreateChatSetting();
  return computeChatSessionMode(session, setting).effectiveMode;
};

const buildSessionWithEffectiveMode = (session, setting) => buildSessionResponse(session, setting);

const findOwnedSession = async (userId, sessionId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(String(sessionId || ''))) {
    return null;
  }

  const query = ChatSession.findOne({
    _id: sessionId,
    userId,
    userDeletedAt: null,
  });

  if (options.lean) {
    query.lean();
  }

  return query;
};

const ensureSessionOpen = (session) => {
  if ((session?.status || 'active') === 'closed' || session?.closedAt) {
    const error = createStatusError('Chat session is closed', 400);
    error.errorCode = 'CHAT_SESSION_CLOSED';
    throw error;
  }
};

const selectorFields = ['repositoryId', 'roadmapId', 'analysisId', 'snapshotId'];

const getContextSelectors = (source = {}) => selectorFields.reduce((selectors, field) => {
  selectors[field] = source?.[field] ? String(source[field]) : null;
  return selectors;
}, {});

const hasContextSelectors = (selectors = {}) => selectorFields.some((field) => Boolean(selectors?.[field]));

const buildContextResponse = (context, contextPinned = false, extras = {}) => ({
  ...(context?.provenance || {
    repositoryId: null,
    repoName: '',
    analysisId: null,
    snapshotId: null,
    roadmapId: null,
    progressUpdatedAt: null,
    analysisSource: 'none',
    contextSelectionReason: 'none',
  }),
  contextPinned,
  ...extras,
});

const buildSessionContextUpdate = ({ context, userId }) => {
  const provenance = context?.provenance || {};
  return {
    repositoryId: provenance.repositoryId || null,
    roadmapId: provenance.roadmapId || null,
    analysisId: provenance.analysisId || null,
    snapshotId: provenance.snapshotId || null,
    contextSelectionReason: context?.contextSelectionReason || provenance.contextSelectionReason || '',
    contextPinnedAt: new Date(),
    contextPinnedBy: userId,
  };
};

const pinSessionContext = async (session, context, userId) => {
  if (!session || !context) return;
  Object.assign(session, buildSessionContextUpdate({ context, userId }));
  if (typeof session.save === 'function') {
    await session.save();
  }
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
const NO_SKILL_SCORE_DATA_MESSAGE =
  'Hien chua co phan tich Dev2Vec tu repository. Hay phan tich repo truoc de minh tu van role va skill gap chinh xac hon.';
const intentsRequiringSkillScore = new Set([
  CHAT_INTENTS.WEAK_SKILLS,
  CHAT_INTENTS.STRONG_SKILLS,
  CHAT_INTENTS.NEXT_SKILLS,
  CHAT_INTENTS.ROLE_FIT,
  CHAT_INTENTS.REPO_REVIEW,
  CHAT_INTENTS.REPO_COMPARE,
  CHAT_INTENTS.ROADMAP_PROGRESS,
  CHAT_INTENTS.CV_ADVICE,
  CHAT_INTENTS.INTERVIEW_PREP,
  CHAT_INTENTS.TIMEBOX_PRIORITY,
]);

const hasIntent = (intents, intent) => Array.isArray(intents) && intents.includes(intent);

const buildSelectedAnalysisContext = (selectedContext = {}, skillScoreContext = {}) => {
  const analysis = selectedContext.analysis || {};
  return {
    repositoryId: selectedContext.provenance?.repositoryId || analysis.repositoryId || null,
    repositoryName: selectedContext.repository?.name || analysis.repoName || '',
    repoName: selectedContext.repository?.name || analysis.repoName || '',
    analyzedAt: analysis.analyzedAt || analysis.createdAt || skillScoreContext.analyzedAt || null,
    modelVersion: skillScoreContext.modelVersion || analysis.dev2vec?.modelVersion || null,
    evidenceVersion: skillScoreContext.evidenceVersion || analysis.analysisProvenance?.evidenceVersion || null,
    projectType: analysis.projectType || skillScoreContext.projectType || '',
    languages: analysis.languages || skillScoreContext.languages || [],
    frameworks: analysis.frameworks || skillScoreContext.frameworks || [],
    packages: analysis.packages || skillScoreContext.packages || [],
    careerDirection: analysis.careerDirection || '',
    userLevel: analysis.summary?.userLevel || '',
    readinessScore: skillScoreContext.readinessScore ?? analysis.summary?.userReadinessScore ?? null,
    roleProbability: skillScoreContext.roleProbability ?? skillScoreContext.topRole?.probability ?? null,
    roleMatchScore: skillScoreContext.roleMatchScore ?? skillScoreContext.topRole?.matchScore ?? null,
    overallScore: skillScoreContext.overallScore ?? analysis.summary?.overallScore ?? analysis.scores?.overall ?? null,
    confidence: skillScoreContext.confidence ?? analysis.summary?.confidence ?? null,
    scoreBreakdown: skillScoreContext.scoreBreakdown || analysis.scoreBreakdown || {},
    topRole: skillScoreContext.topRole || null,
    rolePredictions: skillScoreContext.rolePredictions || [],
    roleMatches: skillScoreContext.roleMatches || [],
    topSkills: selectedContext.topSkills || [],
    strongSkills: skillScoreContext.strongSkills || [],
    weakSkills: skillScoreContext.weakSkills || [],
    missingSkills: selectedContext.missingSkills || skillScoreContext.missingSkillNames || [],
    recommendedNextSkills: skillScoreContext.recommendedNextSkills || [],
    matchedSkillNames: skillScoreContext.matchedSkillNames || [],
    weakSkillNames: skillScoreContext.weakSkillNames || [],
    missingSkillNames: skillScoreContext.missingSkillNames || [],
    skillGaps: skillScoreContext.skillGaps || {},
    sourceStats: skillScoreContext.sourceStats || {},
    evidenceStats: skillScoreContext.evidenceStats || {},
    skillEvidence: skillScoreContext.skillEvidence || {},
    targetRole: selectedContext.roadmap?.targetRole || '',
    progress: selectedContext.progressContext,
    provenance: selectedContext.provenance,
    contextSelectionReason: selectedContext.contextSelectionReason || selectedContext.provenance?.contextSelectionReason || '',
  };
};

const buildCvInterviewContext = ({ selectedAnalysisContext, comparisonContext }) => {
  const primary = selectedAnalysisContext?.repoName || selectedAnalysisContext?.repositoryName
    ? [selectedAnalysisContext]
    : [];
  const comparison = Array.isArray(comparisonContext) ? comparisonContext : [];
  return [...primary, ...comparison].slice(0, 5).map((item) => ({
    projectName: item.repoName || item.repositoryName || '',
    targetRole: item.targetRole || item.topRole?.roleName || item.careerDirection || '',
    strongestSkills: (item.strongSkills || item.topSkills || []).slice(0, 5),
    relevantTechnologies: [...(item.languages || []), ...(item.frameworks || [])].slice(0, 8),
    concreteEvidence: item.skillEvidence?.strong || item.topSkills || [],
    weakPoints: item.weakSkills || item.missingSkills || [],
    suggestedCvBullets: [],
    interviewTalkingPoints: [],
    likelyQuestionsFromWeakSkills: (item.weakSkills || item.missingSkills || []).slice(0, 5),
    provenance: item.provenance || { repositoryId: item.repositoryId || null, repoName: item.repoName || '' },
  }));
};

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
    AnalysisResult.find({ userId })
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
  const bodySelectors = getContextSelectors(body);
  let selectedContext = null;
  let contextUpdate = {};

  if (hasContextSelectors(bodySelectors)) {
    selectedContext = await resolveCurrentContext(userId, { bodySelectors });
    contextUpdate = buildSessionContextUpdate({ context: selectedContext, userId });
  }

  const session = await ChatSession.create({
    userId,
    title,
    lastMessageAt: new Date(),
    ...contextUpdate,
  });

  return {
    message: 'Chat session created successfully',
    data: {
      session: buildSessionResponse(session.toObject(), await getOrCreateChatSetting()),
      context: selectedContext ? buildContextResponse(selectedContext, true) : null,
    },
    statusCode: 201,
  };
};

const getSessions = async ({ user }) => {
  const userId = getUserId(user);
  const sessions = await ChatSession.find({ userId, userDeletedAt: null })
    .sort({ updatedAt: -1 })
    .lean();
  const setting = await getOrCreateChatSetting();

  return {
    message: 'Chat sessions fetched successfully',
    data: {
      sessions: sessions.map((session) => buildSessionResponse(session, setting)),
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

  const [setting, messages] = await Promise.all([
    getOrCreateChatSetting(),
    ChatMessage.find({
      sessionId: session._id,
      userId,
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
  ]);

  return {
    message: 'Chat session fetched successfully',
    data: {
      session: buildSessionResponse(session, setting),
      messages: messages.map(buildMessageResponse),
    },
    statusCode: 200,
  };
};

const deleteSession = async ({ user, params }) => {
  const userId = getUserId(user);
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }
  const session = await ChatSession.findOneAndUpdate(
    {
      _id: params?.sessionId,
      userId,
      userDeletedAt: null,
    },
    { $set: { userDeletedAt: new Date() } },
    { new: true }
  ).lean();

  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  return {
    message: 'Chat session deleted successfully',
    data: {
      sessionId: session._id,
      deleted: true,
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
  ensureSessionOpen(session);

  const content = String(body?.message || '').trim();
  const bodySelectors = getContextSelectors(body);
  const sessionSelectors = getContextSelectors(session);
  const hasBodySelectors = hasContextSelectors(bodySelectors);
  const hasSessionSelectors = hasContextSelectors(sessionSelectors);
  const setting = await getOrCreateChatSetting();
  const modeState = computeChatSessionMode(session, setting);
  const effectiveMode = modeState.effectiveMode;
  let selectedContext = null;

  if (effectiveMode === 'AI_AUTO' || hasBodySelectors) {
    try {
      selectedContext = await resolveCurrentContext(userId, { bodySelectors, sessionSelectors });
    } catch (error) {
      if (error.statusCode !== 404 || hasBodySelectors || hasSessionSelectors) throw error;
      selectedContext = {
        analysis: null,
        repository: null,
        roadmap: null,
        progressContext: null,
        topSkills: [],
        missingSkills: [],
        provenance: {
          repositoryId: null,
          repoName: '',
          analysisId: null,
          snapshotId: null,
          roadmapId: null,
          progressUpdatedAt: null,
          analysisSource: 'none',
          contextSelectionReason: 'none',
        },
        contextSelectionReason: 'none',
      };
    }
  }

  if (hasBodySelectors && selectedContext) {
    await pinSessionContext(session, selectedContext, userId);
  }

  const userMessage = await ChatMessage.create({
    sessionId: session._id,
    userId,
    role: 'user',
    senderType: 'USER',
    senderId: userId,
    content,
  });

  if (effectiveMode === 'MANUAL') {
    session.lastMessage = content;
    session.status = 'waiting_admin';
    session.unreadByAdmin = true;
    session.lastMessageAt = new Date();
    await session.save();

    return {
      message: 'Tin nhan da duoc gui.',
      data: {
        mode: computeChatSessionMode(session, setting).mode,
        effectiveMode,
        modeSource: modeState.modeSource,
        status: session.status,
        userMessage: buildMessageResponse(userMessage.toObject()),
        adminMessage: null,
        session: buildSessionResponse(session.toObject(), setting),
        context: selectedContext ? buildContextResponse(selectedContext, hasBodySelectors) : null,
      },
      statusCode: 200,
    };
  }

  const intents = detectChatIntents(content);
  const intent = detectChatIntent(content);
  const selectedIsExplicit = /^(body|session)_/.test(selectedContext?.contextSelectionReason || '');
  const needsComparisonContext = hasIntent(intents, CHAT_INTENTS.REPO_COMPARE);
  const [githubContext, recentMessages, skillScoreContext, comparisonContext] = await Promise.all([
    buildUserGithubContext(userId),
    ChatMessage.find({
      sessionId: session._id,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_CHAT_HISTORY)
      .select('role content createdAt')
      .lean(),
    buildChatSkillScoreContext(userId, {
      intent,
      repositoryId: selectedContext?.provenance?.repositoryId || null,
      analysis: selectedContext.analysis,
    }),
    needsComparisonContext || hasIntent(intents, CHAT_INTENTS.CV_ADVICE) || hasIntent(intents, CHAT_INTENTS.INTERVIEW_PREP)
      ? buildRepoComparisonContext(userId, content)
      : Promise.resolve([]),
  ]);
  const selectedAnalysisContext = buildSelectedAnalysisContext(selectedContext, skillScoreContext);
  const hasRoadmapIntent = hasIntent(intents, CHAT_INTENTS.ROADMAP_PROGRESS) || hasIntent(intents, CHAT_INTENTS.TIMEBOX_PRIORITY);
  const roadmapProgressContext = selectedContext.progressContext || null;
  const cvInterviewContext =
    hasIntent(intents, CHAT_INTENTS.CV_ADVICE) || hasIntent(intents, CHAT_INTENTS.INTERVIEW_PREP)
      ? buildCvInterviewContext({ selectedAnalysisContext, comparisonContext })
      : [];

  const shouldShortCircuitNoSkillData =
    intents.some((item) => intentsRequiringSkillScore.has(item)) && !skillScoreContext.hasSkillScoreData;
  const prompt = shouldShortCircuitNoSkillData
    ? ''
    : buildChatContextPrompt({
        intent,
        intents,
        skillScoreContext,
        studentProfile: githubContext.studentProfile,
        repositories: selectedIsExplicit && !needsComparisonContext ? [] : githubContext.repositories,
        analysisSnapshots: selectedIsExplicit && !needsComparisonContext ? [] : githubContext.analysisSnapshots,
        skillSignals: selectedIsExplicit && !needsComparisonContext ? [] : githubContext.skillSignals,
        learningRecommendations: selectedIsExplicit && !needsComparisonContext ? [] : githubContext.learningRecommendations,
        chatHistory: recentMessages.reverse(),
        userQuestion: content,
        selectedContext: selectedAnalysisContext,
        selectedContextIsExplicit: selectedIsExplicit,
        roadmapProgressContext,
        multiRepoComparisonContext: comparisonContext,
        cvInterviewContext,
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
      intents,
      contextSource: 'dev2vec',
      context: selectedContext.provenance,
      hasRoadmapContext: Boolean(roadmapProgressContext),
      hasComparisonContext: comparisonContext.length > 0,
      comparedRepoCount: comparisonContext.length,
    },
  });

  session.lastMessage = assistantContent;
  session.status = 'active';
  session.unreadByUser = false;
  session.unreadByAdmin = false;
  session.lastMessageAt = new Date();
  await session.save();

  const data = {
    mode: computeChatSessionMode(session, setting).mode,
    effectiveMode,
    modeSource: modeState.modeSource,
    status: session.status,
    userMessage: buildMessageResponse(userMessage.toObject()),
    aiMessage: buildMessageResponse(assistantMessage.toObject()),
    assistantMessage: buildMessageResponse(assistantMessage.toObject()),
    session: buildSessionResponse(session.toObject(), setting),
    context: buildContextResponse(selectedContext, hasBodySelectors || hasSessionSelectors, {
      intent,
      intents,
      hasRoadmapContext: Boolean(roadmapProgressContext),
      hasComparisonContext: comparisonContext.length > 0,
      comparedRepoCount: comparisonContext.length,
    }),
  };

  if (shouldIncludeChatDebug()) {
    data.intent = intent;
    data.contextSource = 'dev2vec';
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
  if (mode === 'AI_AUTO') {
    await ChatSession.updateMany(
      { modeSource: 'GLOBAL', status: 'waiting_admin', closedAt: null },
      { $set: { status: 'active' } }
    );
  }
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
        ...buildSessionWithEffectiveMode(session, setting),
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
    .populate('closedBy', 'email fullName name role')
    .lean();
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  const [setting, messages] = await Promise.all([
    getOrCreateChatSetting(),
    ChatMessage.find({ sessionId: session._id }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);

  return {
    message: 'Chat session fetched successfully',
    data: {
      session: {
        ...buildSessionWithEffectiveMode(session, setting),
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
  ensureSessionOpen(session);

  const adminMessage = await ChatMessage.create({
    sessionId: session._id,
    userId: session.userId,
    role: 'assistant',
    senderType: 'ADMIN',
    senderId: adminId,
    content,
  });

  session.status = 'answered';
  session.assignedAdminId = adminId;
  session.unreadByUser = true;
  session.unreadByAdmin = false;
  session.lastMessage = content;
  session.lastMessageAt = new Date();
  await session.save();
  const setting = await getOrCreateChatSetting();

  return {
    message: 'Admin message sent successfully',
    data: {
      adminMessage: buildMessageResponse(adminMessage.toObject()),
      session: buildSessionWithEffectiveMode(session.toObject(), setting),
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

  const existingSession = await ChatSession.findById(params.sessionId).select('status closedAt').lean();
  if (!existingSession) {
    throw createStatusError('Chat session not found', 404);
  }
  ensureSessionOpen(existingSession);

  const update =
    mode === 'MANUAL'
      ? {
          mode,
          modeSource: 'SESSION',
          status: existingSession.status || 'active',
          assignedAdminId: adminId,
          aiPausedAt: new Date(),
          aiPausedBy: adminId,
          manualReason: String(body?.reason || '').trim(),
        }
      : {
          mode,
          modeSource: 'SESSION',
          status: normalizeActiveStatusForMode(existingSession.status || 'active', mode),
          assignedAdminId: null,
          aiPausedAt: null,
          aiPausedBy: null,
          manualReason: '',
        };

  const session = await ChatSession.findByIdAndUpdate(params.sessionId, { $set: update }, { new: true }).lean();

  return {
    message:
      mode === 'MANUAL'
        ? 'Chat session switched to manual mode'
        : 'Chat session switched to AI auto mode',
    data: {
      session: buildSessionWithEffectiveMode(session, { mode }),
    },
    statusCode: 200,
  };
};

const useGlobalChatSessionMode = async ({ params }) => {
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const setting = await getOrCreateChatSetting();
  const existingSession = await ChatSession.findById(params.sessionId).select('status closedAt').lean();
  if (!existingSession) {
    throw createStatusError('Chat session not found', 404);
  }
  ensureSessionOpen(existingSession);
  const effectiveMode = computeChatSessionMode({ modeSource: 'GLOBAL', mode: null }, setting).effectiveMode;
  const session = await ChatSession.findByIdAndUpdate(
    params.sessionId,
    {
      $set: {
        modeSource: 'GLOBAL',
        mode: null,
        status: normalizeActiveStatusForMode(existingSession.status || 'active', effectiveMode),
      },
    },
    { new: true }
  ).lean();
  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  return {
    message: 'Chat session switched to global mode',
    data: {
      session: buildSessionWithEffectiveMode(session, setting),
    },
    statusCode: 200,
  };
};

const closeAdminChatSession = async ({ user, params, body }) => {
  const adminId = getAdminId(user);
  if (!mongoose.Types.ObjectId.isValid(String(params?.sessionId || ''))) {
    throw createStatusError('Chat session not found', 404);
  }

  const existingSession = await ChatSession.findById(params.sessionId);
  if (!existingSession) {
    throw createStatusError('Chat session not found', 404);
  }
  if ((existingSession.status || 'active') === 'closed' || existingSession.closedAt) {
    return {
      message: 'Chat session closed successfully',
      data: {
        session: buildSessionResponse(existingSession.toObject(), await getOrCreateChatSetting()),
      },
      statusCode: 200,
    };
  }

  const now = new Date();
  const session = await ChatSession.findByIdAndUpdate(
    params.sessionId,
    {
      $set: {
        status: 'closed',
        closedAt: now,
        closedBy: adminId,
        closeReason: String(body?.reason || '').trim(),
        unreadByAdmin: false,
      },
    },
    { new: true }
  )
    .populate('closedBy', 'email fullName name role')
    .lean();

  if (!session) {
    throw createStatusError('Chat session not found', 404);
  }

  return {
    message: 'Chat session closed successfully',
    data: {
      session: buildSessionResponse(session, await getOrCreateChatSetting()),
    },
    statusCode: 200,
  };
};

module.exports = {
  createSession,
  getSessions,
  getSessionDetail,
  sendMessage,
  deleteSession,
  getChatSettings,
  updateChatSettings,
  getAdminChatSessions,
  getAdminChatSessionDetail,
  sendAdminChatMessage,
  updateAdminChatSessionMode,
  useGlobalChatSessionMode,
  closeAdminChatSession,
  buildUserGithubContext,
  computeChatSessionMode,
};
