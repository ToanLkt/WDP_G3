const mongoose = require('mongoose');

const AnalysisResult = require('../models/AnalysisResult');
const StudentProfile = require('../models/StudentProfile');
const { mapDev2VecOutputToRoleMatches } = require('./dev2vec/dev2vecRoleMapper.service');

const NO_DEV2VEC_CONTEXT_MESSAGE = 'User has not analyzed a repository with Dev2Vec yet.';

const CHAT_INTENTS = {
  WEAK_SKILLS: 'WEAK_SKILLS',
  STRONG_SKILLS: 'STRONG_SKILLS',
  NEXT_SKILLS: 'NEXT_SKILLS',
  ROLE_FIT: 'ROLE_FIT',
  REPO_REVIEW: 'REPO_REVIEW',
  GENERAL: 'GENERAL',
  DETAIL_REQUEST: 'DETAIL_REQUEST',
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const hasAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const detectChatIntent = (userQuestion) => {
  const text = normalizeText(userQuestion);

  if (hasAny(text, ['chi tiet', 'phan tich ky', 'giai thich ro', 'noi ro hon', 'vi sao'])) {
    return CHAT_INTENTS.DETAIL_REQUEST;
  }

  if (hasAny(text, ['phu hop role', 'role nao', 'nghe nao', 'vi tri nao', 'job nao', 'career nao'])) {
    return CHAT_INTENTS.ROLE_FIT;
  }

  if (hasAny(text, ['hoc gi tiep', 'nen hoc', 'next', 'roadmap tiep', 'tiep theo hoc'])) {
    return CHAT_INTENTS.NEXT_SKILLS;
  }

  if (hasAny(text, ['yeu', 'thieu', 'can cai thien', 'weak', 'missing', 'improve', 'kem'])) {
    return CHAT_INTENTS.WEAK_SKILLS;
  }

  if (hasAny(text, ['manh', 'tot', 'strong', 'good', 'diem cao'])) {
    return CHAT_INTENTS.STRONG_SKILLS;
  }

  if (hasAny(text, ['review repo', 'danh gia repo', 'repo cua toi', 'du an cua toi', 'repository'])) {
    return CHAT_INTENTS.REPO_REVIEW;
  }

  return CHAT_INTENTS.GENERAL;
};

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

const buildChatSkillScoreContext = async (userId, options = {}) => {
  const repositoryId = options.repositoryId || options.repoId || null;
  const [studentProfile, analysis] = await Promise.all([
    StudentProfile.findOne({ userId }).select('targetCareer currentSkills githubUsername githubConnected').lean(),
    findLatestDev2VecAnalysis(userId, repositoryId),
  ]);

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

  return {
    analysisId: analysis._id,
    repositoryId: analysis.repositoryId,
    repoName: analysis.repoName || '',
    fullName: analysis.fullName || '',
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
    evidencePreview: dev2vecOutput.evidencePreview,
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

module.exports = {
  CHAT_INTENTS,
  detectChatIntent,
  buildChatSkillScoreContext,
};
