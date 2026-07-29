const mongoose = require('mongoose');
const crypto = require('crypto');

const AiFeedback = require('../models/AiFeedback');
const AnalysisResult = require('../models/AnalysisResult');
const Repository = require('../models/Repository');
const RepositoryPackage = require('../models/RepositoryPackage');
const Roadmap = require('../models/Roadmap');
const RoadmapProgress = require('../models/RoadmapProgress');
const SkillSignal = require('../models/SkillSignal');
const StudentProfile = require('../models/StudentProfile');
const { generateRoadmapResponse } = require('./ai.service');
const { buildRoadmapPrompt } = require('./ai/roadmap.prompt');
const { createStatusError } = require('./github/github.utils');
const { findRepositoryForUser } = require('./github/github.repository.service');
const { createAutomaticNotification } = require('./notification.service');
const { canonicalizeSkillName, getCanonicalSkillCategory } = require('../utils/skillCanonicalizer');
const {
  buildRoadmapSkillGapFromAnalysis,
  getDev2VecRoleName,
  normalizeDev2VecRoleId,
} = require('./roadmapSkillGap.service');
const { mapDev2VecOutputToRoleMatches } = require('./dev2vec/dev2vecRoleMapper.service');
const analysisSourceService = require('./analysisSource.service');
const { buildCompatibleAnalysisQuery, buildCompatibleSnapshotQuery, getRecordVersions, getRecordMetadata } = require('./dev2vec/dev2vecCompatibility.service');
const { aggregateRepositoryPrimaryRoles, primaryPrediction } = require('./dev2vec/dev2vecRoleCandidate.service');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');

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

const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const roundScore = (value) => Number((Number(value || 0)).toFixed(3));
const slugifySkill = (value) =>
  normalizeKey(canonicalizeSkillName(value))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'skill';

const slugifyText = (value, fallback = 'task') =>
  normalizeKey(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || fallback;

const normalizeDurationWeeks = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return Math.min(52, Math.max(1, Math.round(number)));
    }
  }
  return 6;
};

const priorityLabel = (priority) => {
  if (['high', 'medium', 'low'].includes(priority)) return priority;
  const value = Number(priority || 0);
  if (value <= 1) return 'high';
  if (value <= 3) return 'medium';
  return 'low';
};

const findRoleCatalogEntry = ({ roleId, targetRole }) => {
  const normalizedRoleId = normalizeDev2VecRoleId(roleId) || normalizeDev2VecRoleId(targetRole);
  if (!normalizedRoleId) return null;
  return {
    roleId: normalizedRoleId,
    roleName: getDev2VecRoleName(normalizedRoleId),
  };
};

const formatSkillGapSummary = (skillGaps = []) => {
  const seen = new Set();
  return (Array.isArray(skillGaps) ? skillGaps : [])
    .map((gap) => {
      const canonicalSkillName = canonicalizeSkillName(gap.canonicalSkillName || gap.skillName || gap.skill);
      if (gap.source === 'dev2vec') {
        return {
          skillName: canonicalSkillName,
          canonicalSkillName,
          category: gap.category || getCanonicalSkillCategory(canonicalSkillName),
          gapType: gap.gapType || gap.currentLevel || 'missing',
          priority: priorityLabel(gap.priority),
          similarity: Number.isFinite(Number(gap.similarity)) ? Number(gap.similarity) : null,
          source: 'dev2vec',
          currentLevel: gap.currentLevel || (gap.gapType === 'weak' ? 'weak' : 'missing'),
          targetLevel: gap.targetLevel || 'strong',
          currentScore: roundScore(gap.currentScore || gap.similarity || 0),
          requiredScore: roundScore(gap.requiredScore ?? 0.7),
          gap: roundScore(gap.gap || Math.max(0, 0.7 - Number(gap.currentScore || gap.similarity || 0))),
          reason: gap.reason || '',
        };
      }
      const currentScore = roundScore(gap.currentScore || 0);
      const fallbackRequiredScore = (gap.currentLevel || 'missing') === 'missing' ? 70 : 70;
      const requiredScore = roundScore(Number(gap.requiredScore ?? gap.targetMinScore ?? fallbackRequiredScore) || fallbackRequiredScore);
      const rawGap = gap.gap ?? Math.max(0, requiredScore - currentScore);
      const calculatedGap = roundScore(rawGap <= 0 && (gap.currentLevel || 'missing') === 'missing' ? Math.max(0.001, requiredScore - currentScore) : rawGap);
      return {
        skillName: canonicalSkillName,
        canonicalSkillName,
        category: getCanonicalSkillCategory(canonicalSkillName),
        currentLevel: gap.currentLevel || 'missing',
        targetLevel: gap.targetLevel || 'strong',
        currentScore,
        requiredScore,
        gap: calculatedGap,
        priority: priorityLabel(gap.priority),
        gapType: gap.gapType || gap.currentLevel || 'missing',
        source: gap.source || 'analysis',
        reason: gap.reason || gap.reasonVi || '',
      };
    })
    .filter((gap) => {
      const key = normalizeKey(gap.canonicalSkillName);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
};

const sanitizePriority = (value) => {
  if (['high', 'medium', 'low'].includes(value)) return value;
  return priorityLabel(value || 3);
};

const TASK_SKILL_RULES = [
  { pattern: /jest|supertest|api integration test|integration tests?|integration testing|api tests?|test.*api|test.*endpoint|endpoint.*test|kiem thu/i, skill: 'API Testing' },
  { pattern: /jwt|refresh token|auth|authentication|authorization|rbac|protected route|auth middleware|middleware.*auth|token|login|signin|sign in|xac thuc|phan quyen/i, skill: 'Authentication' },
  { pattern: /dockerfile|docker compose|docker-compose|docker|container|containerize|healthcheck|env production|production env|environment production/i, skill: 'Docker Basics' },
  { pattern: /soft delete|schema|model|indexing?|indexes|query|queries|mongodb|mongoose|database|data model|deletedat|deleted at|xoa mem|model du lieu|truy van|co so du lieu/i, skill: 'Database' },
  { pattern: /swagger|openapi|api docs?|api documentation|validation|validate|error handling|route|router|controller|rest|endpoint|crud|third[\s-]?party|ben thu ba|external service|external api|websocket|web socket|tich hop|integration|webhook|pagination|phan trang|search api|query api|tinh nang moi phuc tap|complex feature/i, skill: 'REST API' },
  { pattern: /readme|documentation|docs\b|tai lieu|project docs/i, skill: 'Documentation' },
  { pattern: /linting|eslint|prettier|formatting|formatter/i, skill: 'Clean Code' },
  { pattern: /conventional commit|commit convention|commit message|project setup|setup project/i, skill: 'Project Setup' },
];

const FRONTEND_TASK_SKILL_RULES = [
  { pattern: /accessibility|accessible|a11y|aria|keyboard|screen reader|semantic html|truy cap/i, skill: 'Accessibility' },
  { pattern: /performance|optimi[sz]e|lazy load|bundle|render performance|web vitals|memo|code split|toi uu/i, skill: 'Performance Optimization' },
  { pattern: /api integration|call api|fetch|axios|http client|loading|error state|connect.*api|tich hop api|ket noi api/i, skill: 'API Integration' },
  { pattern: /test|testing|vitest|react testing library|component test|ui test|kiem thu/i, skill: 'Frontend Testing' },
  { pattern: /responsive|mobile|breakpoint|media quer|layout.*mobile|mobile first/i, skill: 'Responsive Design' },
  { pattern: /state|redux|context|zustand|store|use reducer|use state|global state/i, skill: 'State Management' },
  { pattern: /component|props|composition|reusable|design system|ui pattern/i, skill: 'Component Design' },
  { pattern: /readme|documentation|docs\b|storybook|tai lieu/i, skill: 'Documentation' },
  { pattern: /react|jsx|ui|screen|page|form|route|router/i, skill: 'React UI' },
];

const MOBILE_TASK_SKILL_RULES = [
  { pattern: /navigation|react navigation|stack|tab|drawer|deep link|route|navigator/i, skill: 'Navigation' },
  { pattern: /asyncstorage|local storage|offline|cache|persist|preference|secure storage/i, skill: 'Local Storage' },
  { pattern: /api integration|call api|fetch|axios|http client|network request|loading|error state/i, skill: 'API Integration' },
  { pattern: /app state|lifecycle|background|foreground|state management|redux|context|store/i, skill: 'App State Management' },
  { pattern: /mobile ui|screen|layout|react native ui|widget|form|gesture|touch/i, skill: 'Mobile UI' },
];

const DEVOPS_TASK_SKILL_RULES = [
  { pattern: /kubernetes|k8s|cluster|pod|deployment yaml|service yaml|ingress|helm/i, skill: 'Kubernetes' },
  { pattern: /terraform|ansible|iac|infrastructure as code|module|provision/i, skill: 'Infrastructure as Code' },
  { pattern: /ci\/cd|cicd|pipeline|github actions|workflow|build.*test|deploy.*pipeline/i, skill: 'CI/CD' },
  { pattern: /monitoring|observability|metrics|logging|alert|prometheus|grafana|opentelemetry/i, skill: 'Monitoring' },
  { pattern: /docker|dockerfile|compose|container|image|containerize/i, skill: 'Docker' },
];

const inferSkillFromTaskText = (task = {}, options = {}) => {
  const text = `${task.title || task.name || ''} ${task.description || task.goal || ''}`.toLowerCase();
  const role = String(options.targetRole || '');
  let roleRules = [];
  if (/frontend/i.test(role)) roleRules = FRONTEND_TASK_SKILL_RULES;
  if (/mobile/i.test(role)) roleRules = MOBILE_TASK_SKILL_RULES;
  if (/devops/i.test(role)) roleRules = DEVOPS_TASK_SKILL_RULES;
  const rules = [...roleRules, ...TASK_SKILL_RULES];
  const matchedRule = rules.find((rule) => rule.pattern.test(text));
  return matchedRule ? matchedRule.skill : '';
};

const getRoadmapTaskCategory = (canonicalSkillName, fallbackCategory = '') => {
  if (['REST API', 'Database', 'Authentication', 'Docker Basics', 'API Testing'].includes(canonicalSkillName)) {
    return 'backend';
  }
  if (canonicalSkillName === 'Documentation' || canonicalSkillName === 'Project Setup') {
    return 'General';
  }
  return fallbackCategory || getCanonicalSkillCategory(canonicalSkillName);
};

const BACKEND_FRONTEND_ONLY_SKILLS = new Set([
  'React UI',
  'Responsive Design',
  'Component Design',
  'State Management',
  'Frontend Testing',
  'React',
  'React Hooks',
  'React Router',
  'Tailwind CSS',
  'Bootstrap',
  'Form Handling',
  'Frontend Development',
]);

const isBackendRole = (targetRole = '') => /backend/i.test(String(targetRole || ''));
const isFrontendOnlySkillForBackend = (targetRole, canonicalSkillName) =>
  isBackendRole(targetRole) && BACKEND_FRONTEND_ONLY_SKILLS.has(canonicalizeSkillName(canonicalSkillName));
const isFrontendRole = (targetRole = '') => /frontend/i.test(String(targetRole || ''));
const getRoleSkillSet = (targetRole = '') => {
  const role = String(targetRole || '');
  if (/backend/i.test(role)) {
    return new Set(['REST API', 'Database', 'Authentication', 'Docker Basics', 'API Testing', 'Documentation', 'Clean Code']);
  }
  if (/frontend/i.test(role)) {
    return new Set([
      'React UI',
      'Component Design',
      'State Management',
      'API Integration',
      'Frontend Testing',
      'Responsive Design',
      'Accessibility',
      'Performance Optimization',
      'Documentation',
      'Clean Code',
    ]);
  }
  if (/mobile/i.test(role)) {
    return new Set(['Mobile UI', 'Navigation', 'Local Storage', 'API Integration', 'App State Management', 'Documentation', 'Clean Code']);
  }
  if (/devops/i.test(role)) {
    return new Set(['Docker', 'Kubernetes', 'CI/CD', 'Infrastructure as Code', 'Monitoring', 'Documentation']);
  }
  return null;
};

const hasCrossFunctionalSkills = (targetRole, skills = []) => {
  const roleSkills = getRoleSkillSet(targetRole);
  if (!roleSkills) return false;
  return skills.some((skill) => {
    const canonicalSkillName = canonicalizeSkillName(skill);
    return canonicalSkillName && !roleSkills.has(canonicalSkillName);
  });
};

const markCrossFunctionalAlternative = (path, targetRole) => {
  const skills = Array.isArray(path.skills) ? path.skills : [];
  if (!hasCrossFunctionalSkills(targetRole, skills)) return path;
  const reason = String(path.reason || '').trim();
  const prefix = 'Supporting cross-functional path:';
  return {
    ...path,
    pathType: 'cross_functional_supporting',
    title: /supporting|cross/i.test(path.title || '') ? path.title : `Supporting: ${path.title}`,
    reason: reason.startsWith(prefix) ? reason : `${prefix} ${reason || 'Bổ sung kỹ năng backend/DevOps để phối hợp tốt hơn với roadmap chính.'}`,
  };
};

const sanitizeRoadmapTask = (task = {}, fallback = {}) => {
  const title = String(task.title || task.name || 'Roadmap task').trim();
  const canonicalSkillName = canonicalizeSkillName(
    inferSkillFromTaskText(task, { targetRole: fallback.targetRole }) || task.canonicalSkillName || task.skillName || task.skill || fallback.skillName || ''
  );
  const itemId = String(task.itemId || '').trim() || buildTaskItemId({
    scope: fallback.scope || 'main',
    phaseIndex: Number(fallback.phaseIndex || 0),
    taskIndex: Number(fallback.taskIndex || 0),
    canonicalSkillName,
    title,
  });
  return {
    itemId,
    prerequisites: Array.isArray(task.prerequisites) ? task.prerequisites.map(String) : [],
    title,
    description: String(task.description || task.goal || '').trim(),
    skillName: canonicalSkillName,
    canonicalSkillName,
    category: getRoadmapTaskCategory(canonicalSkillName),
    targetRole: String(task.targetRole || fallback.targetRole || '').trim(),
    level: canonicalSkillName === 'API Testing'
      ? 'beginner'
      : String(task.level || fallback.level || '').trim(),
    priority: canonicalSkillName === 'API Testing' ? 'high' : sanitizePriority(task.priority),
    week: Math.min(
      normalizeDurationWeeks(fallback.durationWeeks, 52),
      Number.isFinite(Number(task.week)) ? Number(task.week) : Number(fallback.week || 1)
    ),
    estimatedHours: Number.isFinite(Number(task.estimatedHours)) ? Number(task.estimatedHours) : 0,
    status: ['not_started', 'in_progress', 'completed'].includes(task.status) ? task.status : 'not_started',
  };
};

const sanitizeRoadmapPhases = (phases = [], context = {}) =>
  (Array.isArray(phases) ? phases : []).map((phase, phaseIndex) => {
    const tasks = (Array.isArray(phase.tasks) ? phase.tasks : []).map((task, taskIndex) =>
      sanitizeRoadmapTask(task, {
        targetRole: context.targetRole,
        level: context.effectiveLevel,
        phaseIndex,
        taskIndex,
        week: phaseIndex + 1,
        durationWeeks: context.durationWeeks,
        scope: 'main',
      })
    );
    return {
      title: String(phase.title || `Phase ${phaseIndex + 1}`).trim(),
      goal: String(phase.goal || phase.reason || '').trim(),
      skills: uniqueStrings(tasks.map((task) => task.canonicalSkillName).filter(Boolean), 12),
      tasks,
      status: ['not_started', 'in_progress', 'completed'].includes(phase.status) ? phase.status : 'not_started',
    };
  });

const formatLegacySuggestedTask = (task) => {
  if (typeof task === 'string' || typeof task === 'number') return String(task).trim();
  if (!task || typeof task !== 'object') return '';
  return [task.title || task.name, task.description || task.goal].map((value) => String(value || '').trim()).filter(Boolean).join(': ');
};

const parseSuggestedTaskText = (text, fallbackTitle = 'Roadmap task') => {
  const value = String(text || '').trim();
  if (!value) {
    return { title: fallbackTitle, description: '' };
  }

  let depth = 0;
  let separatorIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ':' && depth === 0) {
      separatorIndex = index;
      break;
    }
  }
  if (separatorIndex > 0) {
    const title = value.slice(0, separatorIndex).trim();
    const description = value.slice(separatorIndex + 1).trim();
    if (title.length >= 4 && description) {
      return { title, description };
    }
  }

  return { title: value, description: value };
};

const sanitizeAlternativeRoadmaps = (roadmap = {}, context = {}) => {
  if (Array.isArray(roadmap.alternativeRoadmaps) && roadmap.alternativeRoadmaps.length > 0) {
    return roadmap.alternativeRoadmaps.slice(0, 2).map((item, roadmapIndex) => ({
      title: String(item.title || `Alternative Roadmap ${roadmapIndex + 1}`).trim(),
      targetRole: String(context.targetRole || item.targetRole || '').trim(),
      pathType: item.pathType || 'supporting',
      reason: String(item.reason || '').trim(),
      skills: Array.isArray(item.skills) ? uniqueStrings(item.skills.map(canonicalizeSkillName), 12) : [],
      tasks: (Array.isArray(item.tasks) ? item.tasks : []).map((task, taskIndex) =>
        sanitizeRoadmapTask(task, {
          targetRole: context.targetRole || item.targetRole,
          level: context.effectiveLevel,
          skillName: 'REST API',
          phaseIndex: roadmapIndex,
          taskIndex,
          week: taskIndex + 1,
          durationWeeks: context.durationWeeks,
          scope: 'alt',
        })
      ),
    })).map((item) => markCrossFunctionalAlternative({
      ...item,
      skills: uniqueStrings((item.tasks || []).map((task) => task.canonicalSkillName).filter(Boolean), 12),
    }, context.targetRole));
  }

  return (Array.isArray(roadmap.supportingPaths) ? roadmap.supportingPaths : []).slice(0, 2).map((path, roadmapIndex) => {
    const skills = Array.isArray(path.skills) ? uniqueStrings(path.skills.map(canonicalizeSkillName), 12) : [];
    const tasks = (Array.isArray(path.suggestedTasks) ? path.suggestedTasks : [])
      .map(formatLegacySuggestedTask)
      .filter(Boolean)
      .map((text, taskIndex) => {
        const parsedTask = parseSuggestedTaskText(text, `Alternative task ${taskIndex + 1}`);
        return sanitizeRoadmapTask(
          {
            title: parsedTask.title,
            description: parsedTask.description,
            canonicalSkillName: skills[taskIndex % Math.max(1, skills.length)] || skills[0] || 'Clean Code',
            priority: taskIndex === 0 ? 'medium' : 'low',
            estimatedHours: 4,
          },
          {
            targetRole: context.targetRole,
            level: context.effectiveLevel,
            skillName: 'REST API',
            phaseIndex: roadmapIndex,
            taskIndex,
            week: taskIndex + 1,
            durationWeeks: context.durationWeeks,
            scope: 'alt',
          }
        );
      });
    return markCrossFunctionalAlternative({
      title: String(path.title || `Alternative Roadmap ${roadmapIndex + 1}`).trim(),
      targetRole: String(context.targetRole || '').trim(),
      pathType: 'supporting',
      reason: String(path.reason || '').trim(),
      skills: uniqueStrings([
        ...skills,
        ...tasks.map((task) => task.canonicalSkillName).filter(Boolean),
      ], 12),
      tasks,
    }, context.targetRole);
  });
};

const normalizeRoadmapSourceForResponse = (roadmapSource) => {
  if (
    !roadmapSource ||
    typeof roadmapSource !== 'object' ||
    !['user_contribution_analysis', 'multi_repo_user_contribution_analysis'].includes(roadmapSource.type)
  ) {
    return null;
  }
  return roadmapSource;
};

const formatLegacyGapItems = (skillGapSummary = {}) =>
  uniqueStrings([
    ...(skillGapSummary.recommendedNextSkills || []),
    ...(skillGapSummary.prioritySkills || []),
  ].map(canonicalizeSkillName), 12).map((skillName) => ({
    skillName,
    canonicalSkillName: skillName,
    category: getCanonicalSkillCategory(skillName),
    currentLevel: 'missing',
    targetLevel: 'strong',
    currentScore: 0,
    requiredScore: 0.4,
    gap: 0.4,
    priority: 'medium',
    reason: 'Legacy roadmap gap converted for compact response.',
  }));

const hasCachedDev2VecResult = (analysis = {}) => (
  Array.isArray(analysis?.dev2vec?.rolePredictions)
  && analysis.dev2vec.rolePredictions.length > 0
  && analysis.dev2vec.skillGaps
  && typeof analysis.dev2vec.skillGaps === 'object'
);

const buildDev2VecOutputFromAnalysis = (analysis = {}) => ({
  success: true,
  modelVersion: analysis.dev2vec?.modelVersion || null,
  vectorDims: analysis.dev2vec?.vectorDims || {},
  rolePredictions: analysis.dev2vec?.rolePredictions || [],
  skillGaps: analysis.dev2vec?.skillGaps || {},
  vectorSources: analysis.dev2vec?.vectorSources || {},
  sourceStats: analysis.dev2vec?.sourceStats || {},
  scoringMethod: analysis.dev2vec?.scoringMethod || 'dev2vec_doc2vec_classifier',
});

const getDev2VecOutputForRoadmap = async ({ analysisForGap }) => (
  hasCachedDev2VecResult(analysisForGap) ? buildDev2VecOutputFromAnalysis(analysisForGap) : null
);

const buildRoadmapSourceWithDev2Vec = ({
  roadmapSource,
  dev2vecOutput,
  requestedRoleId,
  resolvedRoleId,
  roleSelectionType,
  sourceRepositoryId,
  sourceAnalysisId,
  sourceSnapshotId,
}) => ({
  ...(roadmapSource || {}),
  modelVersion: dev2vecOutput?.modelVersion || null,
  scoringMethod: dev2vecOutput?.scoringMethod || 'dev2vec_doc2vec_classifier',
  vectorSources: dev2vecOutput?.vectorSources || {},
  sourceStats: dev2vecOutput?.sourceStats || {},
  requestedRoleId: requestedRoleId || '',
  resolvedRoleId: resolvedRoleId || '',
  selectedRoleId: resolvedRoleId || '',
  roleSelectionType: roleSelectionType || 'current_repository_primary',
  sourceRepositoryId: sourceRepositoryId || roadmapSource?.repositoryId || null,
  sourceAnalysisId: sourceAnalysisId || roadmapSource?.analysisId || null,
  sourceSnapshotId: sourceSnapshotId || roadmapSource?.snapshotId || null,
});

const safeCreateRoadmapNotification = async (payload) => {
  try {
    await createAutomaticNotification(payload);
  } catch (error) {
    console.warn('Create roadmap notification failed:', error.message);
  }
};

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

const buildRoadmapGithubContext = async (userId, sourceRepositoryId = null) => {
  const repositoryFilter = { userId, ...(sourceRepositoryId ? { _id: sourceRepositoryId } : {}) };
  const analysisFilter = buildCompatibleAnalysisQuery({ userId, ...(sourceRepositoryId ? { repositoryId: sourceRepositoryId } : {}) });
  const [studentProfile, repositories, latestAnalysisSnapshots, skillSignals, aiFeedbacks] = await Promise.all([
    StudentProfile.findOne({ userId })
      .select('university major year targetCareer currentSkills githubUsername githubConnected')
      .lean(),
    Repository.find(repositoryFilter)
      .sort({ updatedAtGithub: -1, pushedAt: -1, createdAt: -1 })
      .limit(MAX_REPOSITORIES)
      .select('name fullName description language topics pushedAt updatedAtGithub')
      .lean(),
    AnalysisResult.find(analysisFilter)
      .sort({ analyzedAt: -1, createdAt: -1 })
      .limit(MAX_ANALYSIS_SNAPSHOTS)
      .select(
        'repositoryId repoName projectType languages frameworks packages skillSignals careerDirection strengths weaknesses missingSkills recommendations scores commitSummary checklist analyzedAt createdAt'
      )
      .lean(),
    SkillSignal.find({ userId, ...(sourceRepositoryId ? { repositoryId: sourceRepositoryId } : {}) })
      .sort({ score: -1, createdAt: -1 })
      .limit(MAX_SKILL_SIGNALS)
      .select('repositoryId skillName score evidence')
      .lean(),
    AiFeedback.find({ userId, ...(sourceRepositoryId ? { repositoryId: sourceRepositoryId } : {}) })
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

const buildFallbackRoadmap = ({ targetRole, githubContext, roadmapGapContext }) => {
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

  const roadmap = {
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
  return roadmap;
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
  const missingSkills = uniqueStrings(
    snapshots.flatMap((snapshot) => snapshot.missingSkills || []).map(canonicalizeSkillName)
  );

  return {
    repositoriesCount: githubContext.repositories.length,
    detectedSkills,
    missingSkills,
    latestAnalysisSnapshotId: snapshots[0]?.analysisId || null,
  };
};

const inferPrimarySkillForTask = (task, skillGaps = [], phase = {}) => {
  const text = `${task?.title || ''} ${task?.description || ''}`.toLowerCase();
  const gaps = Array.isArray(skillGaps) ? skillGaps : [];
  const allowedSkills = gaps
    .map((gap) => canonicalizeSkillName(gap.canonicalSkillName || gap.skillName))
    .filter(Boolean);
  const allowedSet = new Set(allowedSkills.map((skill) => skill.toLowerCase()));
  const findAllowedSkill = (skillName) => {
    const canonicalSkillName = canonicalizeSkillName(skillName);
    return allowedSkills.find((allowed) => allowed.toLowerCase() === canonicalSkillName.toLowerCase()) || '';
  };
  const explicitSkill = canonicalizeSkillName(task?.canonicalSkillName || task?.skillName || '');
  const textRuleSkill = canonicalizeSkillName(inferSkillFromTaskText(task, { targetRole: phase.targetRole }));
  if (textRuleSkill) {
    const allowedTextRuleSkill = allowedSkills.length ? findAllowedSkill(textRuleSkill) : textRuleSkill;
    if (allowedTextRuleSkill) return allowedTextRuleSkill;
    if (isBackendRole(phase.targetRole)) return textRuleSkill;
  }

  const textMatchedGap = gaps.find((gap) =>
    text.includes(String(gap.canonicalSkillName || gap.skillName || '').toLowerCase())
  );
  if (textMatchedGap) {
    return canonicalizeSkillName(textMatchedGap.canonicalSkillName || textMatchedGap.skillName);
  }

  const allowedRules = [
    { pattern: /mongodb|mongoose|schema|query|queries|index|database|data model|model du lieu|truy van|co so du lieu/i, skill: 'Database' },
    { pattern: /jwt|auth|authentication|authorization|rbac|token|refresh token|login|signin|sign in|xac thuc|phan quyen/i, skill: 'Authentication' },
    { pattern: /docker|dockerfile|compose|docker compose|container|image|containerize/i, skill: 'Docker Basics' },
    { pattern: /jest|supertest|test|testing|unit|integration|api test|integration test|kiem thu/i, skill: 'API Testing' },
    { pattern: /rest|api|endpoint|route|router|controller|swagger|openapi|crud/i, skill: 'REST API' },
  ];
  const matchedAllowedRule = allowedRules.find((rule) => rule.pattern.test(text));
  const allowedRuleSkill = matchedAllowedRule ? findAllowedSkill(matchedAllowedRule.skill) : '';
  if (allowedRuleSkill) return allowedRuleSkill;
  if (
    explicitSkill &&
    allowedSet.has(explicitSkill.toLowerCase()) &&
    !isFrontendOnlySkillForBackend(phase.targetRole, explicitSkill)
  ) return explicitSkill;

  const rules = [
    { pattern: /integration test|api test|test.*endpoint|endpoint.*test|supertest/, skill: 'API Testing' },
    { pattern: /owasp|api security|rate limit|input validation|bảo mật api|bao mat api/, skill: 'API Security' },
    { pattern: /github actions|github workflow/, skill: 'GitHub Actions' },
    { pattern: /\bci\/cd\b|\bcicd\b|pipeline|workflow/, skill: 'CI/CD' },
    { pattern: /eslint|linting/, skill: 'Linting' },
    { pattern: /prettier|formatter|formatting/, skill: 'Formatting' },
    { pattern: /clean code|refactor|code quality|maintainability/, skill: 'Clean Code' },
    { pattern: /unit test|jest|vitest|automated testing|\btesting\b/, skill: 'Testing' },
    { pattern: /docker image|dockerfile|container|docker/, skill: 'Docker' },
  ];
  const matchedRule = rules.find((rule) => rule.pattern.test(text));
  if (matchedRule && !allowedSkills.length) return canonicalizeSkillName(matchedRule.skill);

  const phaseSkills = Array.isArray(phase.skills) ? phase.skills.map(canonicalizeSkillName) : [];
  if (explicitSkill && phaseSkills.includes(explicitSkill) && !allowedSkills.length) return explicitSkill;

  const phaseGap = gaps.find((gap) =>
    phaseSkills.includes(canonicalizeSkillName(gap.canonicalSkillName || gap.skillName))
  );
  return canonicalizeSkillName(
    phaseGap?.canonicalSkillName ||
      phaseGap?.skillName ||
      gaps[0]?.canonicalSkillName ||
      gaps[0]?.skillName ||
      (allowedSkills.length ? allowedSkills[0] : explicitSkill) ||
      (allowedSkills.length ? '' : phaseSkills[0]) ||
      ''
  );
};

const buildTaskItemId = ({ scope = 'main', phaseIndex, taskIndex, canonicalSkillName, title }) => {
  const taskSlug = slugifyText(`${canonicalSkillName || ''} ${title || ''}`, slugifySkill(canonicalSkillName));
  if (scope === 'alt') {
    return `alt-${Number(phaseIndex || 0) + 1}-task-${Number(taskIndex || 0) + 1}-${taskSlug}`;
  }
  return `main-${Number(phaseIndex || 0) + 1}-${Number(taskIndex || 0) + 1}-${taskSlug}`;
};

const buildStableTaskItemId = ({ scope = 'main', canonicalSkillName, title }) => {
  const seed = `${scope}|${normalizeKey(canonicalSkillName)}|${normalizeKey(title)}`;
  const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10);
  return `${scope === 'alt' ? 'alt' : 'main'}-${slugifySkill(canonicalSkillName)}-${hash}`;
};

const normalizeTask = (task, index, skillGaps = [], phase = {}, targetRole = '', context = {}) => {
  const skillTags = Array.isArray(task?.skillTags)
    ? uniqueStrings(task.skillTags.map(canonicalizeSkillName), 10)
    : [];
  let canonicalSkillName = inferPrimarySkillForTask(task, skillGaps, {
    ...phase,
    targetRole,
  });
  if (isFrontendOnlySkillForBackend(targetRole, canonicalSkillName)) {
    canonicalSkillName = inferSkillFromTaskText(task, { targetRole }) || 'REST API';
  }
  canonicalSkillName = canonicalizeSkillName(canonicalSkillName);
  const normalizedSkillTags = uniqueStrings(
    [canonicalSkillName, ...skillTags].filter(Boolean).map(canonicalizeSkillName),
    10
  );
  const title = String(task?.title || `Task ${index + 1}`).trim();
  const phaseIndex = Number(context.phaseIndex || 0);
  const gapForSkill = skillGaps.find((gap) => canonicalizeSkillName(gap.canonicalSkillName || gap.skillName) === canonicalSkillName);
  const level = canonicalSkillName === 'API Testing'
    ? 'beginner'
    : gapForSkill?.gapType === 'weak'
      ? (context.effectiveLevel === 'beginner' ? 'intermediate' : context.effectiveLevel || 'intermediate')
      : context.effectiveLevel || task?.level || '';
  const priority = canonicalSkillName === 'API Testing'
    ? 'high'
    : task?.priority || priorityLabel(gapForSkill?.priority || 3);
  return {
    itemId: String(task?.itemId || '').trim() || buildStableTaskItemId({
      scope: context.scope || 'main',
      canonicalSkillName,
      title,
    }),
    prerequisites: Array.isArray(task?.prerequisites) ? task.prerequisites.map(String) : [],
    title,
    description: String(task?.description || '').trim(),
    skillTags: normalizedSkillTags,
    skillName: canonicalSkillName,
    canonicalSkillName,
    category: getRoadmapTaskCategory(canonicalSkillName, gapForSkill?.category),
    priority,
    targetRole: String(targetRole || '').trim(),
    level,
    week: Math.min(
      normalizeDurationWeeks(context.durationWeeks, 52),
      Number.isFinite(Number(task?.week)) ? Number(task.week) : phaseIndex + 1
    ),
    status: ['not_started', 'in_progress', 'completed'].includes(task?.status) ? task.status : 'not_started',
    estimatedHours: Number.isFinite(Number(task?.estimatedHours)) ? Number(task.estimatedHours) : 0,
    resources: [],
  };
};

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

const normalizePhase = (phase, index, skillGaps = [], targetRole = '', context = {}) => {
  const normalizedPhase = {
    ...phase,
    skills: Array.isArray(phase?.skills)
      ? uniqueStrings(phase.skills.map(canonicalizeSkillName), 12)
      : [],
  };
  const tasks = Array.isArray(phase?.tasks)
    ? phase.tasks
        .slice(0, 4)
        .map((task, taskIndex) =>
          normalizeTask(task, taskIndex, skillGaps, normalizedPhase, targetRole, {
            ...context,
            phaseIndex: index,
            week: index + 1,
            scope: 'main',
          })
        )
    : [];
  return {
    title: String(phase?.title || `Phase ${index + 1}`).trim(),
    goal: String(phase?.goal || '').trim(),
    skills: uniqueStrings(tasks.map((task) => task.canonicalSkillName).filter(Boolean), 12),
    tasks,
    status: ['not_started', 'in_progress', 'completed'].includes(phase?.status)
      ? phase.status
      : 'not_started',
  };
};

const normalizeSuggestedTaskText = (task) => {
  if (typeof task === 'string' || typeof task === 'number') return String(task).trim();
  if (!task || typeof task !== 'object') return '';
  const title = String(task.title || task.name || '').trim();
  const description = String(task.description || task.goal || '').trim();
  return [title, description].filter(Boolean).join(': ');
};

const normalizeSupportingPath = (path, index) => ({
  title: String(path?.title || `Supporting Path ${index + 1}`).trim(),
  reason: String(path?.reason || '').trim(),
  skills: Array.isArray(path?.skills) ? uniqueStrings(path.skills.map(canonicalizeSkillName), 12) : [],
  suggestedTasks: Array.isArray(path?.suggestedTasks) ? uniqueStrings(path.suggestedTasks.map(normalizeSuggestedTaskText), 10) : [],
});

const buildAlternativeRoadmaps = (supportingPaths, { targetRole, effectiveLevel, durationWeeks }) =>
  (Array.isArray(supportingPaths) ? supportingPaths : []).slice(0, 2).map((path, pathIndex) => {
    const tasks = (path.suggestedTasks || []).slice(0, 4).map((text, taskIndex) => {
      const parsedTask = parseSuggestedTaskText(text, `Alternative task ${taskIndex + 1}`);
      return normalizeTask(
        {
          title: parsedTask.title,
          description: parsedTask.description,
          canonicalSkillName: inferSkillFromTaskText(parsedTask, { targetRole }) || 'REST API',
          priority: taskIndex === 0 ? 'medium' : 'low',
          estimatedHours: 4,
          week: Math.min(Number(durationWeeks || 6), taskIndex + 1),
        },
        taskIndex,
        [],
        { skills: [] },
        targetRole,
        { effectiveLevel, phaseIndex: pathIndex, scope: 'alt', durationWeeks }
      );
    });
    const originalSkills = Array.isArray(path.skills) ? path.skills.map(canonicalizeSkillName) : [];
    const skills = uniqueStrings([
      ...originalSkills,
      ...tasks.map((task) => task.canonicalSkillName).filter(Boolean),
    ], 6);
    return markCrossFunctionalAlternative({
      title: path.title,
      targetRole,
      pathType: 'supporting',
      reason: path.reason,
      skills,
      tasks,
    }, targetRole);
  });

const buildAnalysisGapReason = (roadmapGapContext = {}) => {
  const missing = uniqueStrings((roadmapGapContext.missingSkills || []).map(canonicalizeSkillName), 5);
  const weak = uniqueStrings((roadmapGapContext.weakSkills || []).map(canonicalizeSkillName), 5);
  if (!missing.length && !weak.length) return '';
  const parts = [];
  if (missing.length) parts.push(`${missing.join(', ')} là skill chưa thấy đủ evidence rõ nên cần bổ sung mới`);
  if (weak.length) parts.push(`${weak.join(', ')} đã có evidence nhưng cần củng cố/làm rõ thêm`);
  return parts.join('; ') + '.';
};

const applyRoadmapSkillGapPriorities = (roadmapData, roadmapGapContext) => {
  if (!roadmapGapContext?.prioritySkills?.length || !roadmapData?.mainPath?.phases?.length) {
    return roadmapData;
  }
  const priorityMap = new Map(
    roadmapGapContext.skillGaps.map((gap) => [gap.canonicalSkillName, gap])
  );
  const phases = roadmapData.mainPath.phases.map((phase) => ({
    ...phase,
    skills: [...(phase.skills || [])],
    tasks: (phase.tasks || []).map((task) => ({ ...task, skillTags: [...(task.skillTags || [])] })),
  }));

  roadmapGapContext.prioritySkills.slice(0, 8).forEach((skillName, index) => {
    const phase = phases[index % phases.length];
    const gap = priorityMap.get(skillName);
    phase.skills = uniqueStrings([skillName, ...phase.skills.map(canonicalizeSkillName)], 12);
    if (phase.tasks.length) {
      const taskIndex = Math.floor(index / phases.length) % phase.tasks.length;
      const task = phase.tasks[taskIndex];
      task.skillTags = uniqueStrings([skillName, ...task.skillTags.map(canonicalizeSkillName)], 10);
      task.skillName = skillName;
      task.canonicalSkillName = skillName;
      task.category = gap?.category || getCanonicalSkillCategory(skillName);
      task.priority = gap?.priority || 3;
    }
  });
  return {
    ...roadmapData,
    mainPath: { ...roadmapData.mainPath, phases },
  };
};

const buildRepairTaskForWeek = ({ week, taskIndex = 0, skillGaps = [], targetRole = '', effectiveLevel = '', durationWeeks }) => {
  const gap = skillGaps[(week - 1) % Math.max(1, skillGaps.length)] || {};
  const canonicalSkillName = canonicalizeSkillName(gap.canonicalSkillName || gap.skillName || 'REST API');
  const title = `Thực hành ${canonicalSkillName} tuần ${week}`;
  return normalizeTask(
    {
      title,
      description: `Hoàn thành một task nhỏ để bổ sung evidence cho ${canonicalSkillName} trong roadmap ${targetRole}.`,
      canonicalSkillName,
      priority: gap.priority || 'medium',
      estimatedHours: 4,
      week,
    },
    taskIndex,
    skillGaps,
    { skills: [canonicalSkillName], targetRole },
    targetRole,
    { effectiveLevel, phaseIndex: week - 1, durationWeeks }
  );
};

const buildGroundedTaskContent = ({ canonicalSkillName, targetRole, effectiveLevel, technologies = [] }) => {
  const stack = technologies.join(' ').toLowerCase();
  const isNode = /node|express|javascript|typescript/.test(stack);
  const isMongo = /mongo|mongoose/.test(stack);
  const templates = {
    Database: isMongo
      ? ['Thiết kế schema MongoDB và chiến lược indexing', 'Mô hình hóa dữ liệu, xác định index và kiểm chứng query bằng explain plan.']
      : ['Thiết kế mô hình dữ liệu và tối ưu truy vấn', 'Xác định quan hệ dữ liệu, index cần thiết và đo hiệu năng truy vấn.'],
    Authentication: isNode
      ? ['Triển khai JWT và middleware xác thực cho Express', 'Xây access/refresh token, authorization middleware và test protected routes.']
      : ['Triển khai JWT, authorization và middleware xác thực', 'Xây access/refresh token, phân quyền và test các protected routes.'],
    'REST API': ['Thiết kế REST API có validation và xử lý lỗi', 'Hoàn thiện endpoint, validation, error contract và tài liệu API.'],
    'Docker Basics': ['Đóng gói ứng dụng bằng Docker Compose', 'Viết Dockerfile, cấu hình environment và healthcheck có thể kiểm chứng.'],
    'API Testing': ['Viết integration test cho REST API', 'Kiểm thử success/error/auth flows với assertions có thể chạy lặp lại.'],
    'React UI': ['Làm rõ JSX và cơ chế rendering trong React', 'Thực hành JSX, reconciliation, virtual DOM và component render cycle.'],
  };
  const [title, description] = templates[canonicalSkillName] || [
    `Thực hành ${canonicalSkillName} ở mức ${effectiveLevel || 'phù hợp'}`,
    `Hoàn thành một nhiệm vụ đo lường được, bám sát ${canonicalSkillName} cho vai trò ${targetRole}.`,
  ];
  return { title, description };
};

const validateAndEnsureGapCoverage = (phases = [], context = {}) => {
  const output = phases.map((phase) => ({ ...phase, tasks: [...(phase.tasks || [])] }));
  const required = (context.skillGaps || []).filter((gap) =>
    gap.priority === 'high' || gap.gapType === 'missing'
  );
  const technologies = context.technologies || [];

  for (const gap of required) {
    const skill = canonicalizeSkillName(gap.canonicalSkillName || gap.skillName);
    if (!skill || output.some((phase) => phase.tasks.some((task) => task.canonicalSkillName === skill))) continue;
    const phaseIndex = output.reduce(
      (best, phase, index) => ((phase.tasks || []).length < (output[best]?.tasks || []).length ? index : best),
      0
    );
    const phase = output[phaseIndex];
    const content = buildGroundedTaskContent({
      canonicalSkillName: skill,
      targetRole: context.targetRole,
      effectiveLevel: context.effectiveLevel,
      technologies,
    });
    const task = normalizeTask(
      { ...content, canonicalSkillName: skill, priority: gap.priority || 'high', week: phaseIndex + 1, estimatedHours: 6 },
      phase.tasks.length,
      context.skillGaps,
      { skills: [skill], targetRole: context.targetRole },
      context.targetRole,
      { effectiveLevel: context.effectiveLevel, phaseIndex, durationWeeks: output.length }
    );
    if (phase.tasks.length >= 4) phase.tasks[phase.tasks.length - 1] = task;
    else phase.tasks.push(task);
    phase.skills = uniqueStrings(phase.tasks.map((item) => item.canonicalSkillName), 12);
  }
  return output;
};

const ensureMainWeekCoverage = (phases = [], context = {}) => {
  const durationWeeks = normalizeDurationWeeks(context.durationWeeks);
  const skillGaps = Array.isArray(context.skillGaps) ? context.skillGaps : [];
  const repaired = [...phases];

  for (let week = 1; week <= durationWeeks; week += 1) {
    const phaseIndex = week - 1;
    if (!repaired[phaseIndex]) {
      repaired[phaseIndex] = {
        title: `Week ${week}`,
        goal: `Hoàn thành task chính của tuần ${week}.`,
        skills: [],
        tasks: [],
        status: 'not_started',
      };
    }

    const phase = repaired[phaseIndex];
    const tasks = Array.isArray(phase.tasks) ? [...phase.tasks] : [];
    const weekTasks = tasks.filter((task) => Number(task.week) === week);
    if (!weekTasks.length) {
      tasks.push(buildRepairTaskForWeek({
        week,
        taskIndex: tasks.length,
        skillGaps,
        targetRole: context.targetRole,
        effectiveLevel: context.effectiveLevel,
        durationWeeks,
      }));
      console.warn('[roadmap_generation_repaired]', {
        reasonCode: 'missing_week_task',
        week,
        durationWeeks,
        targetRole: context.targetRole,
      });
    }

    repaired[phaseIndex] = {
      ...phase,
      title: String(phase.title || `Week ${week}`).trim(),
      tasks,
      skills: uniqueStrings(tasks.map((task) => task.canonicalSkillName).filter(Boolean), 12),
    };
  }

  return repaired.slice(0, durationWeeks).map((phase, phaseIndex) => ({
    ...phase,
    tasks: (phase.tasks || []).map((task, taskIndex) => {
      const week = Math.min(durationWeeks, Math.max(1, Number(task.week) || phaseIndex + 1));
      return {
        ...task,
        week,
        itemId: buildTaskItemId({
          scope: 'main',
          phaseIndex,
          taskIndex,
          canonicalSkillName: task.canonicalSkillName,
          title: task.title,
        }),
      };
    }),
  }));
};

const diversifyMainWeekSkills = (phases = [], context = {}) => {
  const skillGaps = Array.isArray(context.skillGaps) ? context.skillGaps : [];
  const gapMap = new Map(
    skillGaps.map((gap) => [canonicalizeSkillName(gap.canonicalSkillName || gap.skillName).toLowerCase(), gap])
  );
  const allowedSkills = new Set(skillGaps.map((gap) => canonicalizeSkillName(gap.canonicalSkillName || gap.skillName)).filter(Boolean));

  return phases.map((phase) => {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
    if (tasks.length < 2) return phase;

    const uniqueSkills = new Set(tasks.map((task) => task.canonicalSkillName));
    if (uniqueSkills.size > 1) return phase;

    let changed = false;
    const diversifiedTasks = tasks.map((task) => {
      const inferred = canonicalizeSkillName(inferSkillFromTaskText(task, { targetRole: context.targetRole }));
      if (!inferred || inferred === task.canonicalSkillName) return task;
      if (allowedSkills.size && !allowedSkills.has(inferred)) return task;
      const gap = gapMap.get(inferred.toLowerCase());
      changed = true;
      return {
        ...task,
        skillName: inferred,
        canonicalSkillName: inferred,
        category: gap?.category || getRoadmapTaskCategory(inferred, getCanonicalSkillCategory(inferred)),
        skillTags: uniqueStrings([inferred, ...(task.skillTags || [])], 10),
        priority: task.priority || gap?.priority || 'medium',
      };
    });

    if (!changed) return phase;
    console.warn('[roadmap_generation_repaired]', {
      reasonCode: 'diversified_week_skills',
      week: diversifiedTasks[0]?.week || null,
      targetRole: context.targetRole,
      skills: uniqueStrings(diversifiedTasks.map((task) => task.canonicalSkillName), 12),
    });
    return {
      ...phase,
      tasks: diversifiedTasks,
      skills: uniqueStrings(diversifiedTasks.map((task) => task.canonicalSkillName), 12),
    };
  });
};

const ensureUniqueTaskIds = (mainPhases = [], alternativeRoadmaps = []) => {
  const seen = new Set();
  const uniqueId = (baseId) => {
    let candidate = baseId || 'task';
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seen.add(candidate);
    return candidate;
  };

  const phases = mainPhases.map((phase, phaseIndex) => ({
    ...phase,
    tasks: (phase.tasks || []).map((task, taskIndex) => ({
      ...task,
      itemId: uniqueId(String(task.itemId || '').trim() || buildStableTaskItemId({ scope: 'main', canonicalSkillName: task.canonicalSkillName, title: task.title })),
    })),
  }));

  const alternatives = alternativeRoadmaps.map((roadmap, roadmapIndex) => ({
    ...roadmap,
    tasks: (roadmap.tasks || []).map((task, taskIndex) => ({
      ...task,
      itemId: uniqueId(String(task.itemId || '').trim() || buildStableTaskItemId({ scope: 'alt', canonicalSkillName: task.canonicalSkillName, title: task.title })),
    })),
  }));

  return { phases, alternativeRoadmaps: alternatives };
};

const validateRoadmapTaskItemIds = (roadmapPayload = {}) => {
  const tasks = [];
  const phases = Array.isArray(roadmapPayload?.mainRoadmap?.phases)
    ? roadmapPayload.mainRoadmap.phases
    : roadmapPayload?.mainPath?.phases || [];
  phases.forEach((phase, phaseIndex) => (phase.tasks || []).forEach((task, taskIndex) => tasks.push({ task, phaseIndex, taskIndex })));
  (roadmapPayload.alternativeRoadmaps || []).forEach((path, pathIndex) => (path.tasks || []).forEach((task, taskIndex) => tasks.push({ task, phaseIndex: pathIndex, taskIndex })));
  const missing = tasks.filter(({ task }) => !String(task?.itemId || '').trim());
  const byId = new Map();
  tasks.forEach((entry) => { const id = String(entry.task?.itemId || '').trim(); if (id) byId.set(id, [...(byId.get(id) || []), entry]); });
  const duplicates = [...byId.entries()].filter(([, entries]) => entries.length > 1);
  if (missing.length || duplicates.length) {
    const error = createStatusError('Roadmap task itemId validation failed', 409);
    error.code = 'ROADMAP_ITEM_ID_CONFLICT';
    error.details = { missing: missing.length, duplicates: duplicates.map(([itemId, entries]) => ({ itemId, titles: entries.map(({ task }) => task.title) })) };
    throw error;
  }
  return true;
};

const enforceMainRoadmapDev2VecSkills = (roadmapData, roadmapGapContext) => {
  const skillGaps = Array.isArray(roadmapGapContext?.skillGaps) ? roadmapGapContext.skillGaps : [];
  const allowedSkills = skillGaps
    .map((gap) => canonicalizeSkillName(gap.canonicalSkillName || gap.skillName))
    .filter(Boolean);
  if (!allowedSkills.length || !roadmapData?.mainPath?.phases?.length) return roadmapData;

  const allowedSet = new Set(allowedSkills.map((skill) => skill.toLowerCase()));
  const gapMap = new Map(
    skillGaps.map((gap) => [canonicalizeSkillName(gap.canonicalSkillName || gap.skillName).toLowerCase(), gap])
  );
  const phases = roadmapData.mainPath.phases.map((phase, phaseIndex) => ({
    ...phase,
    skills: uniqueStrings(
      (phase.tasks || []).map((task, taskIndex) =>
        inferPrimarySkillForTask(task, skillGaps, {
          ...phase,
          skills: allowedSkills,
          phaseIndex,
          taskIndex,
        })
      ),
      12
    ),
    tasks: (phase.tasks || []).map((task, taskIndex) => {
      let canonicalSkillName = inferPrimarySkillForTask(task, skillGaps, {
        ...phase,
        skills: allowedSkills,
        targetRole: roadmapGapContext?.targetRole || roadmapGapContext?.selectedRoleMatch?.roleName,
        phaseIndex,
        taskIndex,
      });
      if (
        isFrontendOnlySkillForBackend(roadmapGapContext?.targetRole || roadmapGapContext?.selectedRoleMatch?.roleName, canonicalSkillName) ||
        !allowedSet.has(canonicalSkillName.toLowerCase())
      ) {
        canonicalSkillName = allowedSkills[(phaseIndex + taskIndex) % allowedSkills.length];
      }
      if (isFrontendOnlySkillForBackend(roadmapGapContext?.targetRole || roadmapGapContext?.selectedRoleMatch?.roleName, canonicalSkillName)) {
        canonicalSkillName = inferSkillFromTaskText(task, {
          targetRole: roadmapGapContext?.targetRole || roadmapGapContext?.selectedRoleMatch?.roleName,
        }) || 'REST API';
      }
      canonicalSkillName = canonicalizeSkillName(canonicalSkillName);
      const gap = gapMap.get(canonicalSkillName.toLowerCase());
      return {
        ...task,
        skillName: canonicalSkillName,
        canonicalSkillName,
        category: gap?.category || getCanonicalSkillCategory(canonicalSkillName),
        skillTags: uniqueStrings([canonicalSkillName], 10),
        priority: gap?.priority || task.priority || 'medium',
      };
    }),
  }));

  return {
    ...roadmapData,
    mainPath: { ...roadmapData.mainPath, phases },
  };
};

const normalizeRoadmapPayload = ({
  userId,
  repositoryId,
  roleId,
  requestedLevel,
  effectiveLevel,
  durationWeeks,
  language,
  targetRole,
  roadmapData,
  sourceContextSummary,
  roadmapGapContext,
  roadmapSource,
  roleMatch,
  skillGapSummary,
}) => {
  const requestedDurationWeeks = normalizeDurationWeeks(durationWeeks, roadmapData.durationWeeks);
  const normalizedMainPhases = Array.isArray(roadmapData.mainPath?.phases)
    ? roadmapData.mainPath.phases
        .slice(0, requestedDurationWeeks)
        .map((phase, index) =>
          normalizePhase(phase, index, roadmapGapContext?.skillGaps || [], targetRole, {
            effectiveLevel,
            durationWeeks: requestedDurationWeeks,
          })
        )
    : [];
  const repairedPhases = ensureMainWeekCoverage(normalizedMainPhases, {
    targetRole,
    effectiveLevel,
    durationWeeks: requestedDurationWeeks,
    skillGaps: roadmapGapContext?.skillGaps || [],
  });
  const diversifiedPhases = diversifyMainWeekSkills(repairedPhases, {
    targetRole,
    skillGaps: roadmapGapContext?.skillGaps || [],
  });
  const validatedPhases = validateAndEnsureGapCoverage(diversifiedPhases, {
    targetRole,
    effectiveLevel,
    skillGaps: roadmapGapContext?.skillGaps || [],
    technologies: sourceContextSummary?.detectedSkills || [],
  });
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

  const alternativeRoadmaps = buildAlternativeRoadmaps(supportingPaths, {
    targetRole,
    effectiveLevel,
    durationWeeks: requestedDurationWeeks,
  });
  const uniqueTasks = ensureUniqueTaskIds(validatedPhases, alternativeRoadmaps);
  const phases = uniqueTasks.phases;
  phases.forEach((phase, phaseIndex) => {
    const previousIds = phaseIndex > 0 ? (phases[phaseIndex - 1].tasks || []).map((task) => task.itemId) : [];
    phase.tasks = (phase.tasks || []).map((task) => ({ ...task, prerequisites: previousIds }));
  });
  const mainRoadmap = {
    title: roadmapData.mainPath?.title || `${targetRole} MVP Path`,
    targetRole,
    reason: roadmapData.mainPath?.reason || buildAnalysisGapReason(roadmapGapContext),
    phases,
  };
  validateRoadmapTaskItemIds({ mainRoadmap, alternativeRoadmaps: uniqueTasks.alternativeRoadmaps });
  const allTasks = [
    ...phases.flatMap((phase) => phase.tasks || []),
    ...uniqueTasks.alternativeRoadmaps.flatMap((roadmap) => roadmap.tasks || []),
  ];
  const gapItems = skillGapSummary || formatSkillGapSummary(roadmapGapContext?.skillGaps || []);

  return {
    userId,
    repositoryId: repositoryId || null,
    targetRole,
    roleId: roleId || roleMatch?.roleId || '',
    requestedLevel: requestedLevel || '',
    effectiveLevel: effectiveLevel || requestedLevel || '',
    durationWeeks: requestedDurationWeeks,
    language: language || 'vi',
    currentGithubDirection: roadmapData.currentGithubDirection || '',
    summary: roadmapData.summary || '',
    mainPath: {
      title: mainRoadmap.title,
      reason: mainRoadmap.reason,
      phases,
    },
    supportingPaths,
    mainRoadmap,
    alternativeRoadmaps: uniqueTasks.alternativeRoadmaps,
    sourceContextSummary: {
      ...sourceContextSummary,
      detectedSkills: uniqueStrings(
        (sourceContextSummary?.detectedSkills || []).map(canonicalizeSkillName)
      ),
      missingSkills: uniqueStrings(
        (sourceContextSummary?.missingSkills || []).map(canonicalizeSkillName)
      ),
    },
    roadmapSource: roadmapSource || roadmapGapContext?.source || 'legacy',
    roleMatch: roleMatch || roadmapGapContext?.selectedRoleMatch || {},
    skillGapSummary: {
      items: gapItems,
      totalGaps: gapItems.length,
      missingRequiredCount: Array.isArray(roadmapGapContext?.missingSkills) ? roadmapGapContext.missingSkills.length : 0,
      weakSkillCount: Array.isArray(roadmapGapContext?.weakSkills) ? roadmapGapContext.weakSkills.length : 0,
      recommendedNextSkills: uniqueStrings((roadmapGapContext?.recommendedNextSkills || []).map(canonicalizeSkillName)),
      prioritySkills: uniqueStrings((roadmapGapContext?.prioritySkills || []).map(canonicalizeSkillName)),
    },
    progressSummary: {
      totalItems: allTasks.length,
      completedItems: 0,
      inProgressItems: 0,
      overallProgress: 0,
    },
    status: 'active',
  };
};

const formatGeneratedRoadmapResponse = (roadmapInput) => {
  const roadmap = roadmapInput?.toObject ? roadmapInput.toObject() : roadmapInput;
  if (!roadmap) return null;
  const effectiveLevel = roadmap.effectiveLevel || roadmap.requestedLevel || '';
  const targetRole = roadmap.targetRole || '';
  const mainRoadmapSource =
    roadmap.mainRoadmap && Object.keys(roadmap.mainRoadmap).length
      ? roadmap.mainRoadmap
      : {
          title: roadmap.mainPath?.title || targetRole,
          targetRole,
          reason: roadmap.mainPath?.reason || '',
          phases: roadmap.mainPath?.phases || [],
        };
  const skillGapSummary = Array.isArray(roadmap.skillGapSummary)
    ? roadmap.skillGapSummary
    : Array.isArray(roadmap.skillGapSummary?.items)
      ? roadmap.skillGapSummary.items
      : formatLegacyGapItems(roadmap.skillGapSummary || {});
  const durationWeekCount = Number(roadmap.durationWeeks || 6);

  return {
    roadmapId: roadmap._id,
    title: mainRoadmapSource.title || targetRole,
    targetRole,
    roleId: roadmap.roleId || roadmap.roleMatch?.roleId || '',
    requestedLevel: roadmap.requestedLevel || null,
    effectiveLevel,
    durationWeeks: durationWeekCount,
    language: roadmap.language || 'vi',
    roadmapSource: normalizeRoadmapSourceForResponse(roadmap.roadmapSource),
    roleMatch: roadmap.roleMatch || {},
    skillGapSummary: formatSkillGapSummary(skillGapSummary),
    mainRoadmap: {
      title: mainRoadmapSource.title || targetRole,
      targetRole: mainRoadmapSource.targetRole || targetRole,
      reason: mainRoadmapSource.reason || '',
      phases: sanitizeRoadmapPhases(mainRoadmapSource.phases || [], { targetRole, effectiveLevel, durationWeeks: durationWeekCount }),
    },
    alternativeRoadmaps: sanitizeAlternativeRoadmaps(roadmap, { targetRole, effectiveLevel, durationWeeks: durationWeekCount }),
    progressSummary:
      roadmap.progressSummary || {
        totalItems: 0,
        completedItems: 0,
        inProgressItems: 0,
        overallProgress: roadmap.progress || 0,
      },
    createdAt: roadmap.createdAt,
    updatedAt: roadmap.updatedAt,
  };
};

const generateRoadmap = async (
  userIdOrAuthUser,
  {
    targetRole,
    forceRegenerate,
    repoId,
    repoIds,
    sourceMode,
    roleId,
    level,
    durationWeeks,
    weeks,
    targetWeeks,
    estimatedWeeks,
    timelineWeeks,
    duration,
    language,
    useRoleMatching,
    selectedRoleId,
    sourceRepositoryId,
    sourceAnalysisId,
    sourceSnapshotId,
    currentRepositoryId,
  } = {}
) => {
  const userId = getUserId(userIdOrAuthUser);
  const normalizedTargetRole = String(targetRole || '').trim();
  const requestedLevel = level || null;
  let repository = null;
  let latestAnalysis = null;
  let roadmapGapContext = null;
  let roadmapSource = null;
  let roleCatalogEntry = findRoleCatalogEntry({ roleId, targetRole: normalizedTargetRole });
  let roleMatch = null;
  let skillGapSummary = [];
  let effectiveLevel = requestedLevel || 'beginner';
  const normalizedSourceMode =
    sourceMode || (repoId ? 'single_repo' : 'all_analyzed_repos');
  let analysisForGap = null;
  let selectedAnalysisIds = [];
  let selectedRepositoryIds = [];
  const requestedDurationWeeks = normalizeDurationWeeks(
    durationWeeks,
    weeks,
    targetWeeks,
    estimatedWeeks,
    timelineWeeks,
    duration
  );

  if (!['single_repo', 'all_analyzed_repos', 'selected_repos'].includes(normalizedSourceMode)) {
    throw createStatusError('sourceMode must be one of: single_repo, all_analyzed_repos, selected_repos.', 400);
  }

  const requestedSourceRepositoryId = sourceRepositoryId || currentRepositoryId || repoId;
  if (sourceAnalysisId) {
    latestAnalysis = await AnalysisResult.findOne(buildCompatibleAnalysisQuery({ _id: sourceAnalysisId, userId })).lean();
    if (!latestAnalysis) throw createStatusError('Selected role source analysis is unavailable or incompatible.', 400);
  } else if (sourceSnapshotId) {
    const selectedSnapshot = await RepoAnalysisSnapshot.findOne(buildCompatibleSnapshotQuery({ _id: sourceSnapshotId, userId })).lean();
    if (!selectedSnapshot?.analysisResultId) throw createStatusError('Selected role source snapshot is unavailable or incompatible.', 400);
    latestAnalysis = await AnalysisResult.findOne(buildCompatibleAnalysisQuery({ _id: selectedSnapshot.analysisResultId, userId })).lean();
  } else if (requestedSourceRepositoryId) {
    repository = await findRepositoryForUser({ userId }, requestedSourceRepositoryId);
    latestAnalysis = await analysisSourceService.findLatestUserContributionAnalysis({ userId, repository, repoId: requestedSourceRepositoryId });
  } else {
    const analyses = normalizedSourceMode === 'selected_repos'
      ? (await analysisSourceService.findLatestUserContributionAnalysesByRepoIds(userId, repoIds || [])).analyses.map((item) => item.analysis)
      : await analysisSourceService.findLatestUserContributionAnalysesForUser(userId);
    const selection = aggregateRepositoryPrimaryRoles({ compatibleAnalyses: analyses, userId, maxAdditionalRoles: 2 });
    latestAnalysis = analyses.find((analysis) => String(analysis._id) === String(selection.primaryRole?.sourceAnalysisId)) || null;
  }
  if (!latestAnalysis) throw createStatusError('Please analyze a compatible repository before generating roadmap.', 400);

  repository = repository || await findRepositoryForUser({ userId }, latestAnalysis.repositoryId);
  if (requestedSourceRepositoryId && String(repository._id) !== String(requestedSourceRepositoryId)) {
    throw createStatusError('Selected role provenance does not match source repository.', 400);
  }
  const sourcePrimary = primaryPrediction(latestAnalysis);
  const sourcePrimaryRoleId = normalizeDev2VecRoleId(sourcePrimary?.roleId || sourcePrimary?.modelLabel);
  if (!sourcePrimaryRoleId) throw createStatusError('Selected role source has no rank-1 Dev2Vec prediction.', 400);
  roleCatalogEntry = findRoleCatalogEntry({ roleId: sourcePrimaryRoleId });
  const requestedSelectedRoleId = normalizeDev2VecRoleId(selectedRoleId || roleId);
  if (requestedSelectedRoleId && requestedSelectedRoleId !== sourcePrimaryRoleId) {
    throw createStatusError('selectedRoleId must be the rank-1 role of its compatible source analysis.', 400);
  }
  const sourceSnapshot = sourceSnapshotId
    ? await RepoAnalysisSnapshot.findOne(buildCompatibleSnapshotQuery({ _id: sourceSnapshotId, userId, analysisResultId: latestAnalysis._id })).lean()
    : await RepoAnalysisSnapshot.findOne(buildCompatibleSnapshotQuery({ userId, analysisResultId: latestAnalysis._id })).sort({ createdAt: -1 }).lean();
  if (sourceSnapshotId && !sourceSnapshot) throw createStatusError('Selected role source snapshot does not match its analysis.', 400);

  const versions = getRecordVersions(latestAnalysis);
  const sourceMetadata = getRecordMetadata(latestAnalysis);
  const anchorRepositoryId = repoId || currentRepositoryId;
  const selectionType = anchorRepositoryId
    ? (String(repository._id) === String(anchorRepositoryId) ? 'current_repository_primary' : 'portfolio_repository_primary')
    : ((sourceAnalysisId || sourceSnapshotId || sourceRepositoryId) ? 'portfolio_repository_primary' : 'portfolio_suggestion');
  roadmapSource = {
    ...analysisSourceService.buildAnalysisSourceSummary({ analysis: latestAnalysis, repository }),
    sourceMode: normalizedSourceMode,
    selectedRoleId: sourcePrimaryRoleId,
    roleSelectionType: selectionType,
    sourceRepositoryId: repository._id,
    sourceAnalysisId: latestAnalysis._id,
    sourceSnapshotId: sourceSnapshot?._id || null,
    modelVersion: versions.modelVersion,
    pipelineVersion: versions.pipelineVersion,
    repoDocumentVersion: versions.repoDocumentVersion,
    issueDocumentVersion: versions.issueDocumentVersion,
    apiEvidenceVersion: versions.apiEvidenceVersion,
    evidenceFingerprint: sourceMetadata.evidenceFingerprint || null,
  };
  effectiveLevel = latestAnalysis.summary?.userLevel || requestedLevel || 'beginner';
  analysisForGap = latestAnalysis;
  selectedAnalysisIds = [String(latestAnalysis._id)];
  selectedRepositoryIds = [String(repository._id)];

  roadmapSource = await analysisSourceService.attachSnapshotProvenance({ userId, roadmapSource });

  const requestedRoleId = sourcePrimaryRoleId;
  let dev2vecOutput = null;
  if (useRoleMatching !== false || hasCachedDev2VecResult(analysisForGap)) {
    dev2vecOutput = await getDev2VecOutputForRoadmap({ analysisForGap });
  }
  const roleMatches = dev2vecOutput
    ? mapDev2VecOutputToRoleMatches(dev2vecOutput, { includeDetails: true, limit: 3 }).matches
    : [];
  roadmapGapContext = buildRoadmapSkillGapFromAnalysis(analysisForGap, {
    targetRole: roleCatalogEntry?.roleName || normalizedTargetRole,
    roleId: requestedRoleId || roleCatalogEntry?.roleId || roleId,
    level: effectiveLevel,
    durationWeeks: requestedDurationWeeks,
    language,
    useRoleMatching,
    roleMatches,
    dev2vecOutput,
  });
  roleMatch = roadmapGapContext?.selectedRoleMatch || null;
  const resolvedRoleId = normalizeDev2VecRoleId(roleMatch?.roleId) || requestedRoleId || roleCatalogEntry?.roleId || '';
  roleCatalogEntry = roleCatalogEntry || (resolvedRoleId ? findRoleCatalogEntry({ roleId: resolvedRoleId }) : null);
  const resolvedTargetRole = roleMatch?.roleName || roleCatalogEntry?.roleName || normalizedTargetRole;
  skillGapSummary = formatSkillGapSummary(roadmapGapContext?.skillGaps || []);
  roadmapSource = buildRoadmapSourceWithDev2Vec({
    roadmapSource,
    dev2vecOutput,
    requestedRoleId: requestedRoleId || roleId || '',
    resolvedRoleId,
    roleSelectionType: roadmapSource.roleSelectionType,
    sourceRepositoryId: roadmapSource.sourceRepositoryId,
    sourceAnalysisId: roadmapSource.sourceAnalysisId,
    sourceSnapshotId: roadmapSource.sourceSnapshotId,
  });

  const sameSet = (left = [], right = []) => {
    const leftSet = new Set(left.map(String));
    const rightSet = new Set(right.map(String));
    if (leftSet.size !== rightSet.size) return false;
    for (const item of leftSet) {
      if (!rightSet.has(item)) return false;
    }
    return true;
  };

  if (!forceRegenerate) {
    const baseExistingQuery = {
      userId,
      targetRole: resolvedTargetRole,
      status: 'active',
      isDeleted: { $ne: true },
    };
    if (repository) baseExistingQuery.repositoryId = repository._id;
    if (resolvedRoleId || roleCatalogEntry?.roleId || roleId) baseExistingQuery.roleId = resolvedRoleId || roleCatalogEntry?.roleId || roleId;
    const existingQuery = {
      ...baseExistingQuery,
      'roadmapSource.type': 'user_contribution_analysis',
      'roadmapSource.sourceMode': normalizedSourceMode,
      effectiveLevel: { $nin: [null, ''] },
    };
    if (roadmapSource?.analysisId) existingQuery['roadmapSource.analysisId'] = roadmapSource.analysisId;
    const existingRoadmaps = await Roadmap.find(existingQuery)
      .sort({ updatedAt: -1 })
      .lean();
    const existingRoadmap = existingRoadmaps.find((candidate) => {
      const source = candidate.roadmapSource || {};
      return String(source.sourceAnalysisId || source.analysisId || '') === String(roadmapSource.sourceAnalysisId || roadmapSource.analysisId || '');
    });

    if (
      existingRoadmap &&
      (existingRoadmap.mainRoadmap || existingRoadmap.mainPath) &&
      normalizeRoadmapSourceForResponse(existingRoadmap.roadmapSource)
    ) {
      existingRoadmap.roadmapSource = await analysisSourceService.attachSnapshotProvenance({
        userId,
        roadmapSource: existingRoadmap.roadmapSource,
      });
      return {
        message: 'Roadmap fetched successfully',
        data: formatGeneratedRoadmapResponse(existingRoadmap),
        statusCode: 200,
      };
    }

    await Roadmap.updateMany(
      {
        ...baseExistingQuery,
        'roadmapSource.sourceMode': normalizedSourceMode,
        $or: [
          { roadmapSource: { $type: 'string' } },
          { 'roadmapSource.type': { $nin: ['user_contribution_analysis', 'multi_repo_user_contribution_analysis'] } },
          { effectiveLevel: { $in: [null, ''] } },
        ],
      },
      { $set: { status: 'archived' } }
    );
  } else {
    const archiveQuery = {
      userId,
      targetRole: normalizedTargetRole,
      status: 'active',
      isDeleted: { $ne: true },
      'roadmapSource.sourceMode': normalizedSourceMode,
    };
    if (repository) archiveQuery.repositoryId = repository._id;
    await Roadmap.updateMany(archiveQuery, { $set: { status: 'archived' } });
  }

  const githubContext = await buildRoadmapGithubContext(userId, roadmapSource.sourceRepositoryId);
  const prompt = buildRoadmapPrompt({
    targetRole: resolvedTargetRole || normalizedTargetRole,
    githubContext,
    roadmapGapContext: {
      ...roadmapGapContext,
      roadmapSource,
      requestedLevel,
      effectiveLevel,
      durationWeeks: requestedDurationWeeks,
      userReadinessScore: roadmapSource?.userReadinessScore || 0,
      roleCatalog: roleCatalogEntry,
      dev2vecOutput: dev2vecOutput
        ? {
            modelVersion: dev2vecOutput.modelVersion || null,
            scoringMethod: dev2vecOutput.scoringMethod || 'dev2vec_doc2vec_classifier',
          }
        : null,
      skillGapSummary,
    },
  });
  const aiText = await generateRoadmapResponse(prompt);
  const parsedRoadmap = parseRoadmapJson(aiText);
  const baseRoadmapData =
    parsedRoadmap ||
    buildFallbackRoadmap({
      targetRole: resolvedTargetRole || normalizedTargetRole,
      githubContext,
      roadmapGapContext,
    });
  const roadmapData = enforceMainRoadmapDev2VecSkills(
    applyRoadmapSkillGapPriorities(baseRoadmapData, roadmapGapContext),
    roadmapGapContext
  );
  const sourceContextSummary = buildSourceContextSummary(githubContext);

  const roadmap = await Roadmap.create(
    normalizeRoadmapPayload({
      userId,
      repositoryId: repository?._id || null,
      roleId: resolvedRoleId || roleCatalogEntry?.roleId || roleId || '',
      requestedLevel,
      effectiveLevel,
      durationWeeks: requestedDurationWeeks,
      language,
      targetRole: resolvedTargetRole || normalizedTargetRole,
      roadmapData,
      sourceContextSummary,
      roadmapGapContext,
      roadmapSource,
      roleMatch,
      skillGapSummary,
    })
  );
  console.info('[roadmap_generation_saved]', {
    roadmapId: String(roadmap._id),
    targetRole: roadmap.targetRole,
    durationWeeks: roadmap.durationWeeks,
    mainWeeks: uniqueStrings(
      (roadmap.mainRoadmap?.phases || []).flatMap((phase) => (phase.tasks || []).map((task) => task.week)),
      roadmap.durationWeeks || 6
    ),
  });
  await safeCreateRoadmapNotification({
    userId,
    title: 'Lộ trình học đã sẵn sàng',
    message: `Lộ trình học cho mục tiêu ${normalizedTargetRole} đã được tạo thành công.`,
    type: 'ROADMAP_TASK_REMINDER',
    metadata: {
      event: 'roadmap_generated',
      roadmapId: roadmap._id,
      targetRole: roadmap.targetRole,
      mainPathTitle: roadmap.mainPath?.title || '',
    },
  });

  return {
    message: 'Roadmap generated successfully',
    data: formatGeneratedRoadmapResponse(roadmap),
    statusCode: 201,
  };
};

const getMyRoadmaps = async (userIdOrAuthUser, filters = {}) => {
  const userId = getUserId(userIdOrAuthUser);
  const query = { userId, isDeleted: { $ne: true } };

  if (['active', 'archived'].includes(filters.status)) {
    query.status = filters.status;
  }

  if (filters.targetRole) {
    query.targetRole = String(filters.targetRole).trim();
  }

  const roadmaps = await Roadmap.find(query).sort({ updatedAt: -1 }).lean();

  return {
    message: 'Roadmaps fetched successfully',
    data: { roadmaps: roadmaps.map(formatGeneratedRoadmapResponse) },
    statusCode: 200,
  };
};

const getRoadmapById = async (userIdOrAuthUser, roadmapId) => {
  const userId = getUserId(userIdOrAuthUser);

  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOne({ _id: roadmapId, userId, isDeleted: { $ne: true } }).lean();
  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  roadmap.roadmapSource = await analysisSourceService.attachSnapshotProvenance({
    userId,
    roadmapSource: roadmap.roadmapSource,
  });
  const progress = await RoadmapProgress.findOne({ userId, roadmapId })
    .select('progressSummary overallProgress updatedAt')
    .lean();
  if (progress) {
    roadmap.progressSummary = progress.progressSummary || {
      ...(roadmap.progressSummary || {}),
      overallProgress: Number(progress.overallProgress || 0),
    };
  }
  return {
    message: 'Roadmap fetched successfully',
    data: { roadmap: formatGeneratedRoadmapResponse(roadmap) },
    statusCode: 200,
  };
};

const archiveRoadmap = async (userIdOrAuthUser, roadmapId) => {
  const userId = getUserId(userIdOrAuthUser);

  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOneAndUpdate(
    { _id: roadmapId, userId, isDeleted: { $ne: true } },
    { $set: { status: 'archived' } },
    { new: true }
  ).lean();

  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap archived successfully',
    data: {
      roadmapId: roadmap._id,
      status: roadmap.status,
    },
    statusCode: 200,
  };
};

const deleteRoadmap = async (userIdOrAuthUser, roadmapId) => {
  const userId = getUserId(userIdOrAuthUser);

  if (!mongoose.Types.ObjectId.isValid(String(roadmapId || ''))) {
    throw createStatusError('Roadmap not found', 404);
  }

  const roadmap = await Roadmap.findOneAndUpdate(
    { _id: roadmapId, userId, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      },
    },
    { new: true }
  ).lean();

  if (!roadmap) {
    throw createStatusError('Roadmap not found', 404);
  }

  return {
    message: 'Roadmap deleted successfully',
    data: {
      roadmapId: roadmap._id,
      deleted: true,
    },
    statusCode: 200,
  };
};

module.exports = {
  generateRoadmap,
  getMyRoadmaps,
  getRoadmapById,
  archiveRoadmap,
  deleteRoadmap,
  buildRoadmapGithubContext,
  parseRoadmapJson,
  buildFallbackRoadmap,
  applyRoadmapSkillGapPriorities,
  inferPrimarySkillForTask,
  normalizeRoadmapPayload,
  validateAndEnsureGapCoverage,
  validateRoadmapTaskItemIds,
  formatGeneratedRoadmapResponse,
};
