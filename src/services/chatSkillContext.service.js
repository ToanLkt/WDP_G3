const mongoose = require('mongoose');

const AnalysisResult = require('../models/AnalysisResult');
const Repository = require('../models/Repository');
const StudentProfile = require('../models/StudentProfile');
const { mapDev2VecOutputToRoleMatches } = require('./dev2vec/dev2vecRoleMapper.service');

const NO_DEV2VEC_CONTEXT_MESSAGE = 'User has not analyzed a repository with Dev2Vec yet.';

const CHAT_INTENTS = {
  WEAK_SKILLS: 'WEAK_SKILLS',
  STRONG_SKILLS: 'STRONG_SKILLS',
  NEXT_SKILLS: 'NEXT_SKILLS',
  ROLE_FIT: 'ROLE_FIT',
  REPO_REVIEW: 'REPO_REVIEW',
  REPO_COMPARE: 'REPO_COMPARE',
  ROADMAP_PROGRESS: 'ROADMAP_PROGRESS',
  CV_ADVICE: 'CV_ADVICE',
  INTERVIEW_PREP: 'INTERVIEW_PREP',
  TIMEBOX_PRIORITY: 'TIMEBOX_PRIORITY',
  GENERAL: 'GENERAL',
  DETAIL_REQUEST: 'DETAIL_REQUEST',
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/đ/g, 'd');

const hasAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const detectChatIntents = (userQuestion) => {
  const text = normalizeText(userQuestion);
  const matches = [];
  const add = (intent, keywords) => {
    if (hasAny(text, keywords) && !matches.includes(intent)) matches.push(intent);
  };

  add(CHAT_INTENTS.REPO_COMPARE, ['so sanh', 'repo nao', 'repository nao', 'du an nao', 'nen dua repo nao', 'repo nao tot hon', 'so voi', 'cv nen de repo nao']);
  add(CHAT_INTENTS.ROADMAP_PROGRESS, ['tien do', 'roadmap', 'task tiep theo', 'da hoan thanh', 'chua hoan thanh', 'dang hoc toi dau', 'bi cham', 'tuan may']);
  add(CHAT_INTENTS.CV_ADVICE, ['cv', 'resume', 'portfolio', 'ghi gi vao cv', 'dua vao cv', 'mo ta project', 'kinh nghiem du an']);
  add(CHAT_INTENTS.INTERVIEW_PREP, ['phong van', 'interview', 'cau hoi phong van', 'chuan bi phong van', 'nha tuyen dung hoi gi']);
  add(CHAT_INTENTS.TIMEBOX_PRIORITY, ['1 tuan', '2 tuan', '3 ngay', 'trong thang nay', 'it thoi gian', 'uu tien', 'hoc gi truoc', 'kip', 'deadline']);
  add(CHAT_INTENTS.DETAIL_REQUEST, ['chi tiet', 'phan tich ky', 'giai thich ro', 'noi ro hon', 'vi sao']);
  add(CHAT_INTENTS.ROLE_FIT, ['phu hop role', 'phu hop', 'hop backend', 'hop frontend', 'backend hay frontend', 'role nao', 'nghe nao', 'vi tri nao', 'job nao', 'career nao']);
  add(CHAT_INTENTS.NEXT_SKILLS, ['hoc gi tiep', 'nen hoc', 'next', 'roadmap tiep', 'tiep theo hoc', 'hoc gi truoc']);
  add(CHAT_INTENTS.WEAK_SKILLS, ['yeu', 'thieu', 'can cai thien', 'weak', 'missing', 'improve', 'kem']);
  add(CHAT_INTENTS.STRONG_SKILLS, ['manh', 'tot', 'strong', 'good', 'diem cao']);
  add(CHAT_INTENTS.REPO_REVIEW, ['review repo', 'danh gia repo', 'repo cua toi', 'du an cua toi', 'repository']);

  return matches.length ? matches : [CHAT_INTENTS.GENERAL];
};

const detectChatIntent = (userQuestion) => detectChatIntents(userQuestion)[0] || CHAT_INTENTS.GENERAL;

const toArray = (value) => (Array.isArray(value) ? value : []);

const sortByLatest = { analyzedAt: -1, createdAt: -1 };

const hasDev2VecAnalysis = (analysis = {}) => (
  Array.isArray(analysis?.dev2vec?.rolePredictions)
    && analysis.dev2vec.rolePredictions.length > 0
    && analysis.dev2vec.skillGaps
    && typeof analysis.dev2vec.skillGaps === 'object'
);

const buildDev2VecOutputFromAnalysis = (analysis = {}) => ({
  modelVersion: analysis.dev2vec?.modelVersion || null,
  evidenceVersion: analysis.analysisProvenance?.evidenceVersion || analysis.dev2vec?.evidenceVersion || null,
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

const compactAnalysisSkill = (item, levelFallback = 'weak', priority = 'normal') => {
  const skillName = canonicalSkillNameOf(item);
  return {
    skillName,
    level: item?.level || levelFallback,
    priority,
    score: toDisplayScore(item?.score),
    source: 'analysis_top_skills',
  };
};

const findLatestDev2VecAnalysis = async (userId, repositoryId) => {
  const baseQuery = {
    userId,
    'dev2vec.rolePredictions.0': { $exists: true },
  };

  if (repositoryId && mongoose.Types.ObjectId.isValid(String(repositoryId))) {
    const repoAnalysis = await AnalysisResult.findOne({
      ...baseQuery,
      repositoryId,
    })
      .sort(sortByLatest)
      .select('repositoryId repoName fullName analyzedAt summary strengths weaknesses recommendations missingSkills skillVector dev2vec')
      .lean();

    if (repoAnalysis && hasDev2VecAnalysis(repoAnalysis)) {
      return repoAnalysis;
    }
  }

  return AnalysisResult.findOne(baseQuery)
    .sort(sortByLatest)
    .select('repositoryId repoName fullName analyzedAt summary strengths weaknesses recommendations missingSkills skillVector dev2vec')
    .lean();
};

const compactSkill = (skillName, level, priority = 'normal') => ({
  skillName,
  level,
  priority,
  source: 'dev2vec_skill_gap',
});

const compactEvidenceForSkill = (item) => ({
  skillName: canonicalSkillNameOf(item),
  score: toDisplayScore(item?.score),
  level: item?.level || '',
  reason: item?.reason || '',
  evidenceStatus: item?.evidenceStatus || '',
  sources: toArray(item?.sources).slice(0, 4),
  evidence: toArray(item?.evidence).slice(0, 3).map((evidence) => ({
    source: evidence?.source || evidence?.type || '',
    path: evidence?.path || evidence?.file || '',
    signal: evidence?.signal || evidence?.summary || evidence?.reason || '',
  })),
});

const buildScoreSummary = (analysis = {}, topPrediction = {}, topRoleMatch = {}, dev2vecOutput = {}) => ({
  readinessScore: Number(analysis.summary?.userReadinessScore ?? analysis.summary?.readinessScore ?? 0),
  roleProbability: Number(topPrediction?.probability || 0),
  roleMatchScore: Number(topRoleMatch?.matchScore || 0),
  overallScore: Number(analysis.summary?.overallScore ?? analysis.scores?.overall ?? 0),
  confidence: Number(analysis.summary?.confidence ?? topPrediction?.confidence ?? 0),
  scoringMethod: dev2vecOutput.scoringMethod,
});

const buildChatSkillScoreContext = async (userId, options = {}) => {
  const repositoryId = options.repositoryId || options.repoId || null;
  const [studentProfile, loadedAnalysis] = await Promise.all([
    StudentProfile.findOne({ userId }).select('targetCareer currentSkills githubUsername githubConnected').lean(),
    options.analysis ? Promise.resolve(options.analysis) : findLatestDev2VecAnalysis(userId, repositoryId),
  ]);
  const analysis = options.analysis || loadedAnalysis;

  if (!analysis || !hasDev2VecAnalysis(analysis)) {
    return {
      analysisId: null,
      repositoryId: repositoryId || null,
      repoName: '',
      fullName: '',
      topRole: null,
      matchedSkillNames: [],
      weakSkillNames: [],
      missingSkillNames: [],
      recommendedNextSkills: [],
      vectorSources: {},
      sourceStats: {},
      evidencePreview: {},
      roleMatches: [],
      weakSkills: [],
      strongSkills: [],
      nextSkills: [],
      targetCareer: studentProfile?.targetCareer || '',
      currentSkills: studentProfile?.currentSkills || [],
      hasSkillScoreData: false,
      hasDev2VecAnalysis: false,
      internalMessage: NO_DEV2VEC_CONTEXT_MESSAGE,
      summary: {
        source: 'Dev2Vec AnalysisResult',
        hasDev2VecAnalysis: false,
        roleMatchCount: 0,
        analyzedRepoCount: 0,
        message: NO_DEV2VEC_CONTEXT_MESSAGE,
      },
    };
  }

  const dev2vecOutput = buildDev2VecOutputFromAnalysis(analysis);
  const roleMatches = mapDev2VecOutputToRoleMatches(dev2vecOutput, {
    includeDetails: false,
    limit: 3,
  }).matches;
  const topPrediction = [...toArray(dev2vecOutput.rolePredictions)]
    .sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))[0];
  const topSkillGap = dev2vecOutput.skillGaps[topPrediction?.roleId] || {};
  const topRoleMatch = roleMatches[0] || {};
  const topSkillItems = toArray(analysis.skillVector)
    .filter((item) => item && item.level !== 'missing' && Number(item.score || 0) > 0)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const missingSkillNamesFromAnalysis = toArray(analysis.missingSkills).map(canonicalSkillNameOf).filter(Boolean);
  const hasAnalysisSkillContext = topSkillItems.length > 0 || missingSkillNamesFromAnalysis.length > 0;
  const matchedSkillNames = hasAnalysisSkillContext
    ? topSkillItems.map(canonicalSkillNameOf).filter(Boolean)
    : toArray(topSkillGap.matchedSkillNames);
  const weakSkillNames = hasAnalysisSkillContext
    ? topSkillItems
        .filter((item) => item.level === 'weak' || toDisplayScore(item.score) < 45)
        .map(canonicalSkillNameOf)
        .filter(Boolean)
    : toArray(topSkillGap.weakSkillNames);
  const missingSkillNames = hasAnalysisSkillContext
    ? missingSkillNamesFromAnalysis.filter((name) => !matchedSkillNames.some((skill) => skill.toLowerCase() === name.toLowerCase()))
    : toArray(topSkillGap.missingSkillNames);
  const recommendedNextSkills = hasAnalysisSkillContext
    ? [...missingSkillNames, ...weakSkillNames]
    : toArray(topSkillGap.recommendedNextSkills);
  const scoreSummary = buildScoreSummary(analysis, topPrediction, topRoleMatch, dev2vecOutput);
  const weakEvidence = topSkillItems
    .filter((item) => item.level === 'weak' || toDisplayScore(item.score) < 45)
    .slice(0, 6)
    .map(compactEvidenceForSkill);
  const strongEvidence = topSkillItems.slice(0, 6).map(compactEvidenceForSkill);

  return {
    analysisId: analysis._id,
    repositoryId: analysis.repositoryId,
    repoName: analysis.repoName || '',
    fullName: analysis.fullName || '',
    analyzedAt: analysis.analyzedAt || analysis.createdAt || null,
    modelVersion: dev2vecOutput.modelVersion,
    evidenceVersion: dev2vecOutput.evidenceVersion,
    projectType: analysis.projectType || '',
    languages: toArray(analysis.languages).slice(0, 8),
    frameworks: toArray(analysis.frameworks).slice(0, 8),
    packages: toArray(analysis.packages).slice(0, 12),
    readinessScore: scoreSummary.readinessScore,
    roleProbability: scoreSummary.roleProbability,
    roleMatchScore: scoreSummary.roleMatchScore,
    overallScore: scoreSummary.overallScore,
    confidence: scoreSummary.confidence,
    scoreBreakdown: analysis.scoreBreakdown || {},
    topRole: topPrediction
      ? {
          roleId: topPrediction.roleId || '',
          roleName: topPrediction.roleName || topPrediction.modelLabel || '',
          probability: Number(topPrediction.probability) || 0,
          matchScore: topRoleMatch.matchScore || 0,
          modelVersion: dev2vecOutput.modelVersion,
          scoringMethod: dev2vecOutput.scoringMethod,
        }
      : null,
    matchedSkillNames,
    weakSkillNames,
    missingSkillNames,
    recommendedNextSkills,
    vectorSources: dev2vecOutput.vectorSources,
    sourceStats: dev2vecOutput.sourceStats,
    evidenceStats: dev2vecOutput.sourceStats,
    evidencePreview: dev2vecOutput.evidencePreview,
    rolePredictions: toArray(dev2vecOutput.rolePredictions).slice(0, 5),
    roleMatches,
    weakSkills: hasAnalysisSkillContext
      ? [
          ...topSkillItems
            .filter((item) => item.level === 'weak' || toDisplayScore(item.score) < 45)
            .map((item) => compactAnalysisSkill(item, 'weak', 'medium')),
          ...missingSkillNames.map((skillName) => compactSkill(skillName, 'missing', 'high')),
        ]
      : [
          ...weakSkillNames.map((skillName) => compactSkill(skillName, 'weak', 'medium')),
          ...missingSkillNames.map((skillName) => compactSkill(skillName, 'missing', 'high')),
        ],
    strongSkills: topSkillItems.length
      ? topSkillItems.map((item) => compactAnalysisSkill(item, item.level || 'strong'))
      : matchedSkillNames.map((skillName) => compactSkill(skillName, 'strong')),
    nextSkills: recommendedNextSkills.map((skillName) => compactSkill(skillName, 'next', 'high')),
    strengths: toArray(analysis.strengths),
    weaknesses: toArray(analysis.weaknesses),
    recommendations: toArray(analysis.recommendations),
    analysisSummary: analysis.summary || {},
    skillGaps: topSkillGap || {},
    skillEvidence: {
      strong: strongEvidence,
      weak: weakEvidence,
      missing: missingSkillNames.slice(0, 8).map((skillName) => ({ skillName, level: 'missing' })),
    },
    scoreSummary,
    targetCareer: studentProfile?.targetCareer || '',
    currentSkills: studentProfile?.currentSkills || [],
    hasSkillScoreData: true,
    hasDev2VecAnalysis: true,
    summary: {
      source: 'Dev2Vec AnalysisResult.dev2vec',
      scoringMethod: dev2vecOutput.scoringMethod,
      modelVersion: dev2vecOutput.modelVersion,
      roleMatchCount: roleMatches.length,
      matchedCount: matchedSkillNames.length,
      weakCount: weakSkillNames.length,
      missingCount: missingSkillNames.length,
      nextCount: recommendedNextSkills.length,
      analyzedRepoCount: 1,
      issueVector: Boolean(dev2vecOutput.vectorSources?.issueVector),
      issueCount: Number(dev2vecOutput.sourceStats?.issueCount || 0),
    },
  };
};

const recommendRepoUse = ({ topRoleName = '', readinessScore = 0, roleMatchScore = 0, weakCount = 0 }) => {
  const role = String(topRoleName || '').toLowerCase();
  const score = Math.max(Number(readinessScore || 0), Number(roleMatchScore || 0));
  if (score < 45 || weakCount >= 6) return 'Needs improvement';
  if (role.includes('backend')) return 'Backend CV';
  if (role.includes('frontend')) return 'Frontend CV';
  return score >= 60 ? 'Fullstack CV' : 'Needs improvement';
};

const buildRepoComparisonContext = async (userId, userQuestion = '') => {
  const analyses = await AnalysisResult.find({
    userId,
    'dev2vec.rolePredictions.0': { $exists: true },
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .limit(30)
    .select('repositoryId repoName fullName analyzedAt createdAt summary careerDirection projectType languages frameworks packages missingSkills skillVector dev2vec scores scoreBreakdown recommendations strengths weaknesses')
    .lean();

  const latestByRepo = new Map();
  for (const analysis of analyses) {
    const key = String(analysis.repositoryId || analysis.repoName || analysis._id);
    if (key && !latestByRepo.has(key)) latestByRepo.set(key, analysis);
  }

  const selected = Array.from(latestByRepo.values());
  const repositoryIds = selected.map((analysis) => analysis.repositoryId).filter(Boolean);
  const repositories = repositoryIds.length
    ? await Repository.find({ userId, _id: { $in: repositoryIds } })
        .select('name fullName description language topics pushedAt updatedAtGithub')
        .lean()
    : [];
  const repoMap = new Map(repositories.map((repo) => [String(repo._id), repo]));
  const question = normalizeText(userQuestion);

  return selected.map((analysis) => {
    const dev2vecOutput = buildDev2VecOutputFromAnalysis(analysis);
    const roleMatches = mapDev2VecOutputToRoleMatches(dev2vecOutput, { includeDetails: false, limit: 3 }).matches;
    const topPrediction = [...toArray(dev2vecOutput.rolePredictions)]
      .sort((left, right) => Number(left.rank || 999) - Number(right.rank || 999))[0];
    const topRoleMatch = roleMatches[0] || {};
    const skillItems = toArray(analysis.skillVector)
      .filter((item) => item && item.level !== 'missing' && Number(item.score || 0) > 0)
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
    const weakSkillNames = skillItems
      .filter((item) => item.level === 'weak' || toDisplayScore(item.score) < 45)
      .map(canonicalSkillNameOf)
      .filter(Boolean);
    const missingSkillNames = toArray(analysis.missingSkills).map(canonicalSkillNameOf).filter(Boolean);
    const repo = repoMap.get(String(analysis.repositoryId || '')) || {};
    const scoreSummary = buildScoreSummary(analysis, topPrediction, topRoleMatch, dev2vecOutput);
    const repoName = repo.name || analysis.repoName || '';
    return {
      repositoryId: analysis.repositoryId || null,
      repoName,
      fullName: repo.fullName || analysis.fullName || '',
      analyzedAt: analysis.analyzedAt || analysis.createdAt || null,
      topRole: topPrediction
        ? {
            roleId: topPrediction.roleId || '',
            roleName: topPrediction.roleName || topPrediction.modelLabel || '',
            probability: Number(topPrediction.probability || 0),
            matchScore: topRoleMatch.matchScore || 0,
          }
        : null,
      careerDirection: analysis.careerDirection || topPrediction?.roleName || '',
      readinessScore: scoreSummary.readinessScore,
      overallScore: scoreSummary.overallScore,
      roleProbability: scoreSummary.roleProbability,
      roleMatchScore: scoreSummary.roleMatchScore,
      topSkills: skillItems.slice(0, 5).map(compactEvidenceForSkill),
      weakSkills: weakSkillNames.slice(0, 5),
      missingSkills: missingSkillNames.slice(0, 5),
      projectType: analysis.projectType || '',
      languages: toArray(analysis.languages).slice(0, 5),
      frameworks: toArray(analysis.frameworks).slice(0, 5),
      sourceStats: dev2vecOutput.sourceStats,
      recommendedUse: recommendRepoUse({
        topRoleName: topPrediction?.roleName || topPrediction?.modelLabel || '',
        readinessScore: scoreSummary.readinessScore,
        roleMatchScore: scoreSummary.roleMatchScore,
        weakCount: weakSkillNames.length + missingSkillNames.length,
      }),
      mentioned: Boolean(repoName && question.includes(normalizeText(repoName))),
    };
  })
    .sort((left, right) => {
      if (left.mentioned !== right.mentioned) return left.mentioned ? -1 : 1;
      return new Date(right.analyzedAt || 0) - new Date(left.analyzedAt || 0);
    })
    .slice(0, 5);
};

module.exports = {
  CHAT_INTENTS,
  detectChatIntent,
  detectChatIntents,
  buildChatSkillScoreContext,
  buildRepoComparisonContext,
};
