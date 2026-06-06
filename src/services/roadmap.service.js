const mongoose = require('mongoose');

const AiFeedback = require('../models/AiFeedback');
const AnalysisSnapshot = require('../models/AnalysisSnapshot');
const Repository = require('../models/Repository');
const RepositoryPackage = require('../models/RepositoryPackage');
const Roadmap = require('../models/Roadmap');
const SkillSignal = require('../models/SkillSignal');
const StudentProfile = require('../models/StudentProfile');
const { generateRoadmapResponse } = require('./ai.service');
const { buildRoadmapPrompt } = require('./ai/roadmap.prompt');
const { createStatusError } = require('./github/github.utils');

let LearningRecommendation = null;

try {
  LearningRecommendation = require('../models/LearningRecommendation');
} catch (error) {
  LearningRecommendation = null;
}

const MAX_REPOSITORIES = 8;
const MAX_ANALYSIS_SNAPSHOTS = 8;
const MAX_SKILL_SIGNALS = 30;
const MAX_AI_FEEDBACKS = 5;
const MAX_RECOMMENDATIONS = 12;

const getUserId = (authUserOrId) => {
  const userId =
    typeof authUserOrId === 'string'
      ? authUserOrId
      : authUserOrId?.userId || authUserOrId?._id || authUserOrId?.id;

  if (!userId) {
    throw createStatusError('Unauthorized', 401);
  }

  return String(userId);
};

const uniqueStrings = (values, limit = 20) =>
  [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))].slice(0, limit);

const mapRecommendations = (items) =>
  (items || [])
    .map((item) => ({
      summary: item.summary || item.content || item.recommendation || item.title || '',
      nextSteps: item.nextSteps || item.steps || [],
      source: item.source || item.type || 'database',
      createdAt: item.createdAt || null,
    }))
    .filter((item) => item.summary);

const buildFallbackRecommendations = (analysisSnapshots) => {
  const recommendations = [];
  for (const snapshot of analysisSnapshots) {
    recommendations.push(...(snapshot.recommendations || []));
  }

  return uniqueStrings(recommendations, MAX_RECOMMENDATIONS).map((recommendation) => ({
    summary: recommendation,
    nextSteps: [],
    source: 'analysisSnapshot',
  }));
};

const buildRoadmapGithubContext = async (userId) => {
  const [studentProfile, repositories, latestAnalysisSnapshots, skillSignals, aiFeedbacks] = await Promise.all([
    StudentProfile.findOne({ userId })
      .select('university major year targetCareer currentSkills githubUsername githubConnected')
      .lean(),
    Repository.find({ userId })
      .sort({ updatedAtGithub: -1, pushedAt: -1, createdAt: -1 })
      .limit(MAX_REPOSITORIES)
      .select('name fullName description language topics pushedAt updatedAtGithub')
      .lean(),
    AnalysisSnapshot.find({ userId })
      .sort({ analyzedAt: -1, createdAt: -1 })
      .limit(MAX_ANALYSIS_SNAPSHOTS)
      .select(
        'repositoryId repoName projectType languages frameworks packages skillSignals careerDirection strengths weaknesses missingSkills recommendations scores commitSummary checklist analyzedAt createdAt'
      )
      .lean(),
    SkillSignal.find({ userId })
      .sort({ score: -1, createdAt: -1 })
      .limit(MAX_SKILL_SIGNALS)
      .select('repositoryId skillName score evidence')
      .lean(),
    AiFeedback.find({ userId })
      .sort({ generatedAt: -1, createdAt: -1 })
      .limit(MAX_AI_FEEDBACKS)
      .select(
        'repositoryId analysisSnapshotId repoName projectType careerDirection summary strengthFeedback weaknessFeedback learningAdvice nextSteps recommendedTopics careerSuggestion portfolioAdvice generatedAt createdAt'
      )
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
      ? LearningRecommendation.find({ userId }).sort({ createdAt: -1 }).limit(MAX_RECOMMENDATIONS).lean()
      : [],
  ]);

  const packageMap = new Map(packageRecords.map((record) => [String(record.repositoryId), record]));
  const snapshotMap = new Map();
  for (const snapshot of latestAnalysisSnapshots) {
    const repositoryId = String(snapshot.repositoryId || '');
    if (repositoryId && !snapshotMap.has(repositoryId)) {
      snapshotMap.set(repositoryId, snapshot);
    }
  }

  const repositoriesContext = repositories.map((repository) => {
    const packageRecord = packageMap.get(String(repository._id));
    const snapshot = snapshotMap.get(String(repository._id));
    const hasReadme = snapshot?.checklist?.hasReadme;

    return {
      name: repository.name,
      description: repository.description || '',
      mainLanguage: repository.language || '',
      languages: packageRecord?.languages || snapshot?.languages || [],
      frameworks: packageRecord?.frameworks || snapshot?.frameworks || [],
      packages: packageRecord?.packages || snapshot?.packages || [],
      topics: repository.topics || [],
      readmeSummary:
        hasReadme === true
          ? 'README was detected in the latest analysis.'
          : hasReadme === false
            ? 'README was missing in the latest analysis.'
            : '',
      commitSummary: snapshot?.commitSummary || {},
      repoWeaknesses: snapshot?.weaknesses || [],
      strengths: snapshot?.strengths || [],
      recommendations: snapshot?.recommendations || [],
      careerDirection: snapshot?.careerDirection || '',
    };
  });

  const mappedAnalysisSnapshots = latestAnalysisSnapshots.map((snapshot) => ({
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
    repositories: repositoriesContext,
    latestAnalysisSnapshots: mappedAnalysisSnapshots,
    skillSignals: skillSignals.map((signal) => ({
      skillName: signal.skillName,
      score: signal.score || 0,
      evidence: signal.evidence || [],
      repositoryId: signal.repositoryId,
    })),
    learningRecommendations:
      LearningRecommendation && learningRecommendations.length > 0
        ? mapRecommendations(learningRecommendations)
        : buildFallbackRecommendations(latestAnalysisSnapshots),
    aiFeedbackSummary: {
      latest: aiFeedbacks[0]
        ? {
            repoName: aiFeedbacks[0].repoName,
            careerDirection: aiFeedbacks[0].careerDirection,
            summary: aiFeedbacks[0].summary,
            learningAdvice: aiFeedbacks[0].learningAdvice,
            nextSteps: aiFeedbacks[0].nextSteps || [],
            recommendedTopics: aiFeedbacks[0].recommendedTopics || [],
            careerSuggestion: aiFeedbacks[0].careerSuggestion || '',
            portfolioAdvice: aiFeedbacks[0].portfolioAdvice || '',
          }
        : null,
      recentSummaries: aiFeedbacks.map((feedback) => ({
        repoName: feedback.repoName,
        summary: feedback.summary || '',
        careerSuggestion: feedback.careerSuggestion || '',
        generatedAt: feedback.generatedAt || feedback.createdAt || null,
      })),
    },
  };
};

const parseRoadmapJson = (text) => {
  if (!text) {
    return null;
  }

  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !parsed.targetRole || !parsed.mainPath || !Array.isArray(parsed.supportingPaths)) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Parse roadmap JSON error:', error.message);
    return null;
  }
};

const buildRolePhases = (targetRole, detectedSkills) => {
  const hasFrontend = detectedSkills.some((skill) => /react|frontend|tailwind|css|html|typescript|javascript/i.test(skill));
  const hasBackend = detectedSkills.some((skill) => /node|express|api|mongo|sql|backend|database/i.test(skill));

  const templates = {
    'Frontend Developer': [
      ['Frontend Foundation', 'Nam vung HTML, CSS, JavaScript/TypeScript va cach chia component.', ['HTML', 'CSS', 'JavaScript', 'TypeScript']],
      ['React MVP', 'Xay dung ung dung React co routing, form va state management co ban.', ['React', 'Routing', 'State Management']],
      ['API Integration', 'Ket noi frontend voi REST API, xu ly loading/error va auth token.', ['REST API', 'Authentication']],
      ['Quality and Deployment', 'Hoan thien README, test co ban va deploy san pham demo.', ['Testing', 'Deployment']],
    ],
    'Backend Developer': [
      ['Backend Foundation', 'Cung co Node.js, Express va kien truc routes-controller-service-model.', ['Node.js', 'Express.js']],
      ['Database and API', 'Thiet ke schema MongoDB/Mongoose va CRUD API ro rang.', ['MongoDB', 'Mongoose', 'REST API']],
      ['Authentication and Security', 'Lam JWT auth, validation, error handling va bao ve route.', ['JWT', 'Validation', 'Security']],
      ['Testing and Deployment', 'Them test API co ban, Docker/CI va deploy backend demo.', ['Testing', 'Docker', 'Deployment']],
    ],
    'Fullstack Developer': [
      ['Fullstack Foundation', 'Ket noi UI, API va database trong mot flow san pham nho.', ['React', 'Node.js', 'MongoDB']],
      ['Auth and Data Flow', 'Lam dang nhap, protected route va call API co xu ly loi.', ['JWT', 'REST API']],
      ['Product MVP', 'Hoan thien mot feature end-to-end co README va demo.', ['Fullstack', 'Documentation']],
      ['Release Readiness', 'Them test, Docker va deploy frontend/backend.', ['Testing', 'Docker', 'Deployment']],
    ],
    'Mobile Developer': [
      ['Mobile Foundation', 'Nam layout, navigation va state co ban cho ung dung mobile.', ['Mobile UI', 'Navigation', 'State Management']],
      ['API Integration', 'Ket noi mobile app voi REST API va xu ly loading/error.', ['REST API', 'Authentication']],
      ['Local Data and UX', 'Luu tru local data co ban va cai thien trai nghiem nguoi dung.', ['Local Storage', 'UX']],
      ['Build and Release Demo', 'Tao ban build demo, README va video/screenshot portfolio.', ['Build', 'Documentation']],
    ],
    'Tester / QA Engineer': [
      ['QA Foundation', 'Nam test case, bug report va quy trinh kiem thu co ban.', ['Test Case', 'Bug Report']],
      ['Manual Testing Project', 'Ap dung exploratory testing va regression testing tren project hien co.', ['Manual Testing', 'Regression Testing']],
      ['API and Automation Basics', 'Viet API test hoac automation test co ban cho flow quan trong.', ['API Testing', 'Automation Testing']],
      ['QA Portfolio Readiness', 'Chuan bi test plan, bug samples va bao cao kiem thu trong GitHub.', ['Documentation', 'Portfolio']],
    ],
    'DevOps Beginner': [
      ['Linux and Git Workflow', 'Nam command line, Git workflow va cach doc log loi co ban.', ['Linux', 'Git']],
      ['Container Basics', 'Dong goi mot service bang Docker va chay bang docker compose.', ['Docker', 'Docker Compose']],
      ['CI/CD Basics', 'Tao pipeline kiem tra lint/test/build don gian.', ['CI/CD', 'GitHub Actions']],
      ['Deployment Demo', 'Deploy mot project nho va viet huong dan van hanh.', ['Deployment', 'Monitoring Basics']],
    ],
    'Data Analyst': [
      ['Data Foundation', 'On lai SQL, spreadsheet va cach lam sach du lieu co ban.', ['SQL', 'Data Cleaning']],
      ['Analysis Workflow', 'Phan tich dataset nho va rut ra insight co bang chung.', ['EDA', 'Visualization']],
      ['Dashboard MVP', 'Tao dashboard hoac notebook co bieu do ro rang.', ['Dashboard', 'Charting']],
      ['Business Communication', 'Viet summary, insight va recommendation cho nguoi khong chuyen ky thuat.', ['Communication', 'Documentation']],
    ],
    'AI / Machine Learning Beginner': [
      ['ML Foundation', 'Nam Python, numpy/pandas va quy trinh train/evaluate co ban.', ['Python', 'Pandas', 'Model Evaluation']],
      ['Classic ML MVP', 'Lam mot bai toan classification/regression nho co metric ro rang.', ['Scikit-learn', 'Metrics']],
      ['Data and Experiment Hygiene', 'Chia train/test, ghi lai experiment va tranh data leakage.', ['Experiment Tracking', 'Data Validation']],
      ['ML Portfolio Demo', 'Viet README giai thich dataset, model, metric va cach chay.', ['Documentation', 'Portfolio']],
    ],
  };

  const fallback = hasFrontend && !hasBackend ? templates['Fullstack Developer'] : templates['Backend Developer'];
  const phases = templates[targetRole] || fallback;

  return phases.map(([title, goal, skills]) => ({
    title,
    goal,
    skills,
    tasks: [
      {
        title: `Hoc va thuc hanh ${skills.slice(0, 2).join(', ')}`,
        description: `Tap trung vao nhung phan can thiet de dat MVP cho vai tro ${targetRole}.`,
        skillTags: skills,
        estimatedHours: 8,
        resources: [],
      },
      {
        title: `Ap dung vao project GitHub hien co`,
        description: 'Cap nhat mot repository hien co hoac tao mini project de co bang chung thuc hanh.',
        skillTags: skills,
        estimatedHours: 10,
        resources: [],
      },
    ],
  }));
};

const buildFallbackRoadmap = ({ targetRole, githubContext }) => {
  const snapshots = githubContext.latestAnalysisSnapshots || [];
  const detectedSkills = uniqueStrings([
    ...(githubContext.studentProfile?.currentSkills || []),
    ...(githubContext.skillSignals || []).map((signal) => signal.skillName),
    ...snapshots.flatMap((snapshot) => [
      ...(snapshot.languages || []),
      ...(snapshot.frameworks || []),
      ...(snapshot.packages || []),
      ...(snapshot.skillSignals || []),
      ...(snapshot.strengths || []),
    ]),
  ]);
  const missingSkills = uniqueStrings(snapshots.flatMap((snapshot) => snapshot.missingSkills || []));
  const latestDirection =
    snapshots[0]?.careerDirection ||
    githubContext.aiFeedbackSummary?.latest?.careerDirection ||
    githubContext.studentProfile?.targetCareer ||
    'Generalist Software Engineer';
  const hasFrontend = detectedSkills.some((skill) => /react|frontend|tailwind|css|html|typescript|javascript/i.test(skill));

  return {
    targetRole,
    currentGithubDirection: latestDirection,
    summary: `Lo trinh fallback duoc tao dua tren ${githubContext.repositories.length} repository, cac skill da phat hien (${detectedSkills.slice(0, 6).join(', ') || 'chua co du lieu ro rang'}) va muc tieu ${targetRole}.`,
    mainPath: {
      title: `${targetRole} MVP Path`,
      reason: `Tap trung vao nhung ky nang toi thieu de sinh vien co the demo nang luc ${targetRole}, khong bat hoc tat ca ky nang con thieu.`,
      phases: buildRolePhases(targetRole, detectedSkills),
    },
    supportingPaths: [
      {
        title: hasFrontend ? 'Fullstack Extension' : 'GitHub Strength Extension',
        reason: hasFrontend
          ? 'GitHub hien co co dau hieu frontend, nen co the tan dung de mo rong sang san pham fullstack.'
          : 'Tan dung cac ky nang da co trong GitHub de tao diem manh rieng cho ho so.',
        skills: detectedSkills.slice(0, 8),
        suggestedTasks: [
          'Chon repository co tin hieu tot nhat va viet lai README theo huong portfolio.',
          'Bo sung mot tinh nang nho the hien ro skill manh da co.',
          'Ghi lai evidence: cong nghe dung, demo link, anh man hinh va cach chay project.',
        ],
      },
      {
        title: 'Job-readiness Path',
        reason: 'Tang kha nang ung tuyen thuc tap/di lam bang cac dau hieu nha tuyen dung de kiem tra.',
        skills: uniqueStrings(['README', 'Testing', 'Docker', 'CI/CD', 'Deployment', ...missingSkills], 8),
        suggestedTasks: [
          'Chuan hoa README: problem, features, tech stack, setup, demo va screenshots.',
          'Them test co ban cho flow quan trong nhat.',
          'Them Dockerfile hoac huong dan deploy don gian.',
          'Chuan bi 3 gach dau dong giai thich dong gop ky thuat trong CV.',
        ],
      },
    ],
  };
};

const buildSourceContextSummary = (githubContext) => {
  const snapshots = githubContext.latestAnalysisSnapshots || [];
  const detectedSkills = uniqueStrings([
    ...(githubContext.studentProfile?.currentSkills || []),
    ...(githubContext.skillSignals || []).map((signal) => signal.skillName),
    ...snapshots.flatMap((snapshot) => [
      ...(snapshot.languages || []),
      ...(snapshot.frameworks || []),
      ...(snapshot.packages || []),
      ...(snapshot.skillSignals || []),
      ...(snapshot.strengths || []),
    ]),
  ]);
  const missingSkills = uniqueStrings(snapshots.flatMap((snapshot) => snapshot.missingSkills || []));

  return {
    repositoriesCount: githubContext.repositories.length,
    detectedSkills,
    missingSkills,
    latestAnalysisSnapshotId: snapshots[0]?.analysisId || null,
  };
};

const normalizeTask = (task, index) => ({
  title: String(task?.title || `Task ${index + 1}`).trim(),
  description: String(task?.description || '').trim(),
  skillTags: Array.isArray(task?.skillTags) ? uniqueStrings(task.skillTags, 10) : [],
  status: ['not_started', 'in_progress', 'completed'].includes(task?.status) ? task.status : 'not_started',
  estimatedHours: Number.isFinite(Number(task?.estimatedHours)) ? Number(task.estimatedHours) : 0,
  resources: normalizeResources(task?.resources),
});

function normalizeResources(resources) {
  if (!Array.isArray(resources)) {
    return [];
  }

  return resources.slice(0, 5).map((resource) => {
    if (typeof resource === 'string') {
      return {
        title: resource,
        type: '',
        url: '',
      };
    }

    if (resource && typeof resource === 'object') {
      return {
        title: resource.title || '',
        type: resource.type || '',
        url: resource.url || '',
      };
    }

    return {
      title: '',
      type: '',
      url: '',
    };
  });
}

const normalizePhase = (phase, index) => ({
  title: String(phase?.title || `Phase ${index + 1}`).trim(),
  goal: String(phase?.goal || '').trim(),
  skills: Array.isArray(phase?.skills) ? uniqueStrings(phase.skills, 12) : [],
  tasks: Array.isArray(phase?.tasks) ? phase.tasks.slice(0, 4).map(normalizeTask) : [],
  status: ['not_started', 'in_progress', 'completed'].includes(phase?.status) ? phase.status : 'not_started',
});

const normalizeSupportingPath = (path, index) => ({
  title: String(path?.title || `Supporting Path ${index + 1}`).trim(),
  reason: String(path?.reason || '').trim(),
  skills: Array.isArray(path?.skills) ? uniqueStrings(path.skills, 12) : [],
  suggestedTasks: Array.isArray(path?.suggestedTasks) ? uniqueStrings(path.suggestedTasks, 10) : [],
});

const normalizeRoadmapPayload = ({ userId, targetRole, roadmapData, sourceContextSummary }) => {
  const phases = Array.isArray(roadmapData.mainPath?.phases)
    ? roadmapData.mainPath.phases.slice(0, 5).map(normalizePhase)
    : [];
  const supportingPaths = Array.isArray(roadmapData.supportingPaths)
    ? roadmapData.supportingPaths.slice(0, 2).map(normalizeSupportingPath)
    : [];

  while (supportingPaths.length < 2) {
    supportingPaths.push(
      normalizeSupportingPath(
        {
          title: supportingPaths.length === 0 ? 'GitHub Strength Extension' : 'Job-readiness Path',
          reason: '',
          skills: [],
          suggestedTasks: [],
        },
        supportingPaths.length
      )
    );
  }

  return {
    userId,
    targetRole,
    currentGithubDirection: roadmapData.currentGithubDirection || '',
    summary: roadmapData.summary || '',
    mainPath: {
      title: roadmapData.mainPath?.title || `${targetRole} MVP Path`,
      reason: roadmapData.mainPath?.reason || '',
      phases,
    },
    supportingPaths,
    sourceContextSummary,
    status: 'active',
  };
};

const generateRoadmap = async (userIdOrAuthUser, { targetRole, forceRegenerate } = {}) => {
  const userId = getUserId(userIdOrAuthUser);
  const normalizedTargetRole = String(targetRole || '').trim();

  if (!forceRegenerate) {
    const existingRoadmap = await Roadmap.findOne({
      userId,
      targetRole: normalizedTargetRole,
      status: 'active',
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (existingRoadmap) {
      return {
        message: 'Roadmap fetched successfully',
        data: { roadmap: existingRoadmap },
        statusCode: 200,
      };
    }
  } else {
    await Roadmap.updateMany(
      {
        userId,
        targetRole: normalizedTargetRole,
        status: 'active',
      },
      { $set: { status: 'archived' } }
    );
  }

  const githubContext = await buildRoadmapGithubContext(userId);
  const prompt = buildRoadmapPrompt({ targetRole: normalizedTargetRole, githubContext });
  const aiText = await generateRoadmapResponse(prompt);
  const parsedRoadmap = parseRoadmapJson(aiText);
  const roadmapData = parsedRoadmap || buildFallbackRoadmap({ targetRole: normalizedTargetRole, githubContext });
  const sourceContextSummary = buildSourceContextSummary(githubContext);

  const roadmap = await Roadmap.create(
    normalizeRoadmapPayload({
      userId,
      targetRole: normalizedTargetRole,
      roadmapData,
      sourceContextSummary,
    })
  );

  return {
    message: 'Roadmap generated successfully',
    data: { roadmap: roadmap.toObject() },
    statusCode: 201,
  };
};

const getMyRoadmaps = async (userIdOrAuthUser, filters = {}) => {
  const userId = getUserId(userIdOrAuthUser);
  const query = { userId };

  if (['active', 'archived'].includes(filters.status)) {
    query.status = filters.status;
  }

  if (filters.targetRole) {
    query.targetRole = String(filters.targetRole).trim();
  }

  const roadmaps = await Roadmap.find(query).sort({ updatedAt: -1 }).lean();

  return {
    message: 'Roadmaps fetched successfully',
    data: { roadmaps },
    statusCode: 200,
  };
};

const getRoadmapById = async (userIdOrAuthUser, roadmapId) => {
  const userId = getUserId(userIdOrAuthUser);

  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap fetched successfully',
    data: { roadmap },
    statusCode: 200,
  };
};

const archiveRoadmap = async (userIdOrAuthUser, roadmapId) => {
  const userId = getUserId(userIdOrAuthUser);

  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOneAndUpdate(
    { _id: roadmapId, userId },
    { $set: { status: 'archived' } },
    { new: true }
  ).lean();

  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap archived successfully',
    data: { roadmap },
    statusCode: 200,
  };
};

module.exports = {
  generateRoadmap,
  getMyRoadmaps,
  getRoadmapById,
  archiveRoadmap,
  buildRoadmapGithubContext,
  parseRoadmapJson,
  buildFallbackRoadmap,
};
