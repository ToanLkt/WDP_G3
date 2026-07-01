const AnalysisResult = require('../models/AnalysisResult');
const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const SkillSignal = require('../models/SkillSignal');
const StudentProfile = require('../models/StudentProfile');
const { canonicalizeSkillName, listCanonicalSkills } = require('../utils/skillCanonicalizer');
const { matchSkillVectorToRoles } = require('./roleMatching.service');

const DEFAULT_ANALYSIS_LIMIT = 5;
const DEFAULT_SKILL_LIMIT = 20;
const WEAK_SCORE = 50;
const STRONG_SCORE = 75;

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

const knownSkillTerms = listCanonicalSkills().map((skill) => ({
  name: skill.name,
  terms: [skill.name, ...(skill.aliases || [])].map(normalizeText).filter(Boolean),
}));

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
const scoreToPercent = (score) => {
  const numeric = Number(score || 0);
  if (numeric <= 1) return Math.round(numeric * 100);
  return Math.round(Math.min(100, Math.max(0, numeric)));
};

const addUnique = (target, value, limit = 8) => {
  const normalized = String(value || '').trim();
  if (!normalized || target.includes(normalized) || target.length >= limit) return;
  target.push(normalized);
};

const getRepoName = (snapshot) => snapshot.repoName || snapshot.fullName || '';

const createBucket = (skillName) => ({
  skillName,
  scores: [],
  repositories: [],
  evidence: [],
  reasons: [],
  sources: [],
  missing: false,
  recommended: false,
  weakSignal: false,
  strongSignal: false,
});

const addSkillBucket = (map, rawSkillName) => {
  const skillName = canonicalizeSkillName(rawSkillName);
  if (!skillName) return null;
  const key = skillName.toLowerCase();
  if (!map.has(key)) map.set(key, createBucket(skillName));
  return map.get(key);
};

const addVectorSkill = (map, item, snapshot) => {
  const bucket = addSkillBucket(map, item?.canonicalSkillName || item?.skill || item?.skillName);
  if (!bucket) return;

  const score = scoreToPercent(item.score);
  bucket.scores.push(score);
  bucket.sources.push('skillVector');
  addUnique(bucket.repositories, getRepoName(snapshot));
  toArray(item.evidence).forEach((evidence) => addUnique(bucket.evidence, evidence, 5));

  const level = String(item.level || '').toLowerCase();
  if (level === 'missing' || level === 'weak' || score < WEAK_SCORE) bucket.weakSignal = true;
  if (level === 'strong' || score >= STRONG_SCORE) bucket.strongSignal = true;
};

const addSignalSkill = (map, signal) => {
  const bucket = addSkillBucket(map, signal?.skillName || signal?.skill);
  if (!bucket) return;

  bucket.scores.push(scoreToPercent(signal.score));
  bucket.sources.push('SkillSignal');
  toArray(signal.evidence).forEach((evidence) => addUnique(bucket.evidence, evidence, 5));
};

const addNamedSkills = (map, values, snapshot, options = {}) => {
  for (const value of toArray(values)) {
    const bucket = addSkillBucket(map, value);
    if (!bucket) continue;

    bucket.sources.push(options.source || 'analysis');
    if (options.missing) bucket.missing = true;
    if (options.recommended) bucket.recommended = true;
    if (options.weakSignal) bucket.weakSignal = true;
    if (options.strongSignal) bucket.strongSignal = true;
    addUnique(bucket.repositories, getRepoName(snapshot));
    addUnique(bucket.reasons, options.reason || value, 4);
  }
};

const extractKnownSkillsFromText = (text) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return [];

  return knownSkillTerms
    .filter((skill) => skill.terms.some((term) => term && normalizedText.includes(term)))
    .map((skill) => skill.name);
};

const addSkillsMentionedInText = (map, values, snapshot, options = {}) => {
  for (const value of toArray(values)) {
    const skills = extractKnownSkillsFromText(value);
    for (const skill of skills) {
      const bucket = addSkillBucket(map, skill);
      if (!bucket) continue;

      bucket.sources.push(options.source || 'analysisText');
      if (options.missing) bucket.missing = true;
      if (options.recommended) bucket.recommended = true;
      if (options.weakSignal) bucket.weakSignal = true;
      if (options.strongSignal) bucket.strongSignal = true;
      addUnique(bucket.repositories, getRepoName(snapshot));
      addUnique(bucket.reasons, options.reason || String(value || '').trim(), 4);
    }
  }
};

const finalizeSkill = (bucket) => {
  const scores = bucket.scores.length ? bucket.scores : [bucket.missing ? 0 : 50];
  const averageScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const score = bucket.missing ? Math.min(averageScore, 35) : averageScore;
  const level = score >= STRONG_SCORE ? 'strong' : score >= WEAK_SCORE ? 'medium' : bucket.missing ? 'missing' : 'weak';

  return {
    skillName: bucket.skillName,
    score,
    averageScore,
    maxScore,
    minScore,
    level,
    reason:
      bucket.reasons[0] ||
      bucket.evidence[0] ||
      (bucket.missing ? 'Missing skill trong analysis' : 'Duoc tinh tu skillVector/SkillSignal'),
    repositories: bucket.repositories.slice(0, 3),
    evidenceCount: bucket.evidence.length,
    repoCount: bucket.repositories.length,
    sources: [...new Set(bucket.sources)].slice(0, 4),
    missing: bucket.missing,
    recommended: bucket.recommended,
    weakSignal: bucket.weakSignal,
    strongSignal: bucket.strongSignal,
  };
};

const buildNextSkillReason = (skill, targetCareer) => {
  if (skill.missing) return 'Dang thieu trong analysis';
  if (skill.recommended) return 'Duoc analysis de xuat uu tien';
  if (targetCareer) return `Can thiet cho muc tieu ${targetCareer}`;
  return 'Diem hien tai con thap';
};

const buildMergedSkillVector = (skills) =>
  skills.map((skill) => ({
    skill: skill.skillName,
    canonicalSkillName: skill.skillName,
    score: Math.min(1, Math.max(0, Number(skill.score || 0) / 100)),
    level: skill.level === 'medium' ? 'developing' : skill.level,
  }));

const compactRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: match.matchScore,
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  topMatchedSkills: match.topMatchedSkills || [],
  recommendedNextSkills: match.recommendedNextSkills || [],
  summary: match.summary || '',
});

const buildChatSkillScoreContext = async (userId, options = {}) => {
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_ANALYSIS_LIMIT, 1), 10);
  const [studentProfile, analyses, repoSnapshots, skillSignals] = await Promise.all([
    StudentProfile.findOne({ userId }).select('targetCareer currentSkills githubUsername githubConnected').lean(),
    AnalysisResult.find({ userId })
      .sort({ analyzedAt: -1, createdAt: -1 })
      .limit(limit)
      .select(
        'repositoryId repoName fullName skillVector missingSkills weaknesses strengths recommendations summary scores scoreBreakdown commitSummary analyzedAt'
      )
      .lean(),
    RepoAnalysisSnapshot.find({ userId })
      .sort({ analyzedAt: -1, createdAt: -1 })
      .limit(limit)
      .select(
        'repositoryId repoName fullName skillVector missingSkills weaknesses strengths recommendations summary scores scoreBreakdown commitSummary analyzedAt'
      )
      .lean(),
    SkillSignal.find({ userId })
      .sort({ score: -1, createdAt: -1 })
      .limit(DEFAULT_SKILL_LIMIT)
      .select('repositoryId skillName score evidence')
      .lean(),
  ]);

  const snapshots = [...analyses, ...repoSnapshots];
  const skillMap = new Map();

  for (const snapshot of snapshots) {
    toArray(snapshot.skillVector).forEach((skill) => addVectorSkill(skillMap, skill, snapshot));
    addNamedSkills(skillMap, snapshot.missingSkills, snapshot, {
      source: 'missingSkills',
      missing: true,
      weakSignal: true,
      reason: 'Missing skill trong analysis',
    });
    addSkillsMentionedInText(skillMap, snapshot.weaknesses, snapshot, {
      source: 'weaknesses',
      weakSignal: true,
      reason: 'Nam trong weaknesses cua analysis',
    });
    addSkillsMentionedInText(skillMap, snapshot.recommendations, snapshot, {
      source: 'recommendations',
      recommended: true,
      reason: 'Duoc analysis khuyen nghi',
    });
    addSkillsMentionedInText(skillMap, snapshot.strengths, snapshot, {
      source: 'strengths',
      strongSignal: true,
      reason: 'Nam trong strengths cua analysis',
    });
  }

  skillSignals.forEach((signal) => addSignalSkill(skillMap, signal));

  const allSkills = [...skillMap.values()].map(finalizeSkill);
  const targetCareer = studentProfile?.targetCareer || '';
  const weakSkills = allSkills
    .filter((skill) => skill.missing || skill.weakSignal || skill.score < WEAK_SCORE)
    .sort((left, right) => left.score - right.score || right.evidenceCount - left.evidenceCount)
    .slice(0, 7);
  const strongSkills = allSkills
    .filter((skill) => skill.strongSignal || skill.score >= STRONG_SCORE)
    .sort((left, right) => right.score - left.score || right.evidenceCount - left.evidenceCount)
    .slice(0, 5);
  const nextSkills = allSkills
    .filter((skill) => skill.missing || skill.recommended || skill.score < STRONG_SCORE)
    .sort((left, right) => {
      const leftPriority = (left.missing ? 0 : 2) + (left.recommended ? 0 : 1);
      const rightPriority = (right.missing ? 0 : 2) + (right.recommended ? 0 : 1);
      return leftPriority - rightPriority || left.score - right.score;
    })
    .slice(0, 5)
    .map((skill) => ({
      ...skill,
      priority: skill.missing ? 'high' : skill.recommended ? 'medium' : 'normal',
      reason: buildNextSkillReason(skill, targetCareer),
    }));

  const mergedSkillVector = buildMergedSkillVector(allSkills);
  const roleMatches =
    mergedSkillVector.length > 0
      ? matchSkillVectorToRoles(mergedSkillVector, { limit: 3 }).map(compactRoleMatch)
      : [];

  return {
    weakSkills,
    strongSkills,
    nextSkills,
    roleMatches,
    targetCareer,
    currentSkills: studentProfile?.currentSkills || [],
    hasSkillScoreData: allSkills.length > 0,
    summary: {
      totalSkills: allSkills.length,
      weakCount: weakSkills.length,
      strongCount: strongSkills.length,
      nextCount: nextSkills.length,
      roleMatchCount: roleMatches.length,
      analyzedRepoCount: new Set(snapshots.map((snapshot) => String(snapshot.repositoryId || snapshot.fullName || ''))).size,
      source: 'skillVector + SkillSignal + AnalysisSnapshot',
    },
  };
};

module.exports = {
  CHAT_INTENTS,
  detectChatIntent,
  buildChatSkillScoreContext,
};
