const mongoose = require('mongoose');

const RepoAnalysisSnapshot = require('../models/RepoAnalysisSnapshot');
const { findRepositoryForUser } = require('./github/github.repository.service');
const { createStatusError } = require('./github/github.utils');

const SCORE_LABELS = {
  techStackScore: 'Tech Stack',
  documentationScore: 'Documentation',
  commitQualityScore: 'Commit Quality',
  deploymentScore: 'Deployment',
  testingScore: 'Testing',
  portfolioReadinessScore: 'Portfolio Readiness',
  overallScore: 'Overall',
};

const CHECKLIST_LABELS = {
  hasReadme: 'README',
  hasEnvExample: '.env.example',
  hasDocker: 'Docker',
  hasDockerCompose: 'Docker Compose',
  hasCICD: 'CI/CD',
  hasTesting: 'Testing',
  hasLinting: 'Linting',
  hasFormatter: 'Formatter',
  hasPackageFile: 'Package File',
};

const validateAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    throw createStatusError('Unauthorized', 401);
  }
};

const toObject = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const stringArray = (values) => (Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : []);

const normalizeListMap = (values) => {
  const map = new Map();
  for (const value of stringArray(values)) {
    const normalized = value.toLowerCase();
    if (normalized && !map.has(normalized)) {
      map.set(normalized, value);
    }
  }
  return map;
};

const buildSnapshotPayload = (analysisResult) => {
  const source = toObject(analysisResult);

  return {
    userId: source.userId,
    repositoryId: source.repositoryId,
    githubRepoId: source.githubRepoId,
    repoName: source.repoName,
    fullName: source.fullName,
    analysisResultId: source._id,
    projectType: source.projectType,
    careerDirection: source.careerDirection,
    languages: stringArray(source.languages),
    frameworks: stringArray(source.frameworks),
    packages: stringArray(source.packages),
    configs: stringArray(source.configs),
    skillSignals: stringArray(source.skillSignals),
    careerSignals: stringArray(source.careerSignals),
    strengths: stringArray(source.strengths),
    weaknesses: stringArray(source.weaknesses),
    missingSkills: stringArray(source.missingSkills),
    recommendations: stringArray(source.recommendations),
    scores: source.scores || {},
    commitSummary: source.commitSummary || {},
    checklist: source.checklist || {},
    analyzedAt: source.analyzedAt || source.createdAt || new Date(),
    snapshotType: 'after_analysis',
    source: 'github',
  };
};

const createSnapshotFromAnalysisResult = async (analysisResult) => {
  if (!analysisResult) {
    return null;
  }

  return RepoAnalysisSnapshot.create(buildSnapshotPayload(analysisResult));
};

const summarizeSnapshot = (snapshot) => ({
  _id: snapshot._id,
  repositoryId: snapshot.repositoryId,
  repoName: snapshot.repoName,
  fullName: snapshot.fullName,
  careerDirection: snapshot.careerDirection,
  overallScore: snapshot.scores?.overallScore || 0,
  scores: snapshot.scores || {},
  missingSkills: snapshot.missingSkills || [],
  analyzedAt: snapshot.analyzedAt,
  createdAt: snapshot.createdAt,
});

const getRepositorySnapshots = async (user, repoId) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, repoId);
  const snapshots = await RepoAnalysisSnapshot.find({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  return {
    message: 'Repository snapshots fetched successfully',
    data: {
      total: snapshots.length,
      snapshots: snapshots.map(summarizeSnapshot),
    },
    statusCode: 200,
  };
};

const getSnapshotById = async (user, snapshotId) => {
  validateAuthUser(user);

  if (!mongoose.Types.ObjectId.isValid(String(snapshotId || ''))) {
    throw createStatusError('Snapshot not found', 404);
  }

  const snapshot = await RepoAnalysisSnapshot.findOne({ _id: snapshotId, userId: user.userId }).lean();
  if (!snapshot) {
    throw createStatusError('Snapshot not found', 404);
  }

  return {
    message: 'Snapshot fetched successfully',
    data: snapshot,
    statusCode: 200,
  };
};

const compareScores = (fromSnapshot, toSnapshot) => {
  const scoreChanges = Object.entries(SCORE_LABELS).map(([key, label]) => {
    const before = Number(fromSnapshot.scores?.[key] || 0);
    const after = Number(toSnapshot.scores?.[key] || 0);
    const change = after - before;
    const status = change > 0 ? 'improved' : change < 0 ? 'regressed' : 'unchanged';

    return { key, label, before, after, change, status };
  });

  return {
    scoreChanges,
    improvements: scoreChanges.filter((item) => item.change > 0).sort((a, b) => b.change - a.change),
    regressions: scoreChanges.filter((item) => item.change < 0).sort((a, b) => a.change - b.change),
    unchanged: scoreChanges.filter((item) => item.change === 0),
  };
};

const compareChecklist = (fromSnapshot, toSnapshot) => {
  const improvedChecklist = [];
  const regressedChecklist = [];
  const stillMissingChecklist = [];
  const alreadyPresentChecklist = [];

  for (const [key, label] of Object.entries(CHECKLIST_LABELS)) {
    const before = Boolean(fromSnapshot.checklist?.[key]);
    const after = Boolean(toSnapshot.checklist?.[key]);

    if (!before && after) improvedChecklist.push(label);
    else if (before && !after) regressedChecklist.push(label);
    else if (!before && !after) stillMissingChecklist.push(label);
    else alreadyPresentChecklist.push(label);
  }

  return {
    improvedChecklist,
    regressedChecklist,
    stillMissingChecklist,
    alreadyPresentChecklist,
  };
};

const compareMissingSkills = (fromSnapshot, toSnapshot) => {
  const fromMap = normalizeListMap(fromSnapshot.missingSkills);
  const toMap = normalizeListMap(toSnapshot.missingSkills);

  return {
    resolvedMissingSkills: [...fromMap.entries()]
      .filter(([normalized]) => !toMap.has(normalized))
      .map(([, value]) => value),
    remainingMissingSkills: [...fromMap.entries()]
      .filter(([normalized]) => toMap.has(normalized))
      .map(([, value]) => value),
    newMissingSkills: [...toMap.entries()]
      .filter(([normalized]) => !fromMap.has(normalized))
      .map(([, value]) => value),
  };
};

const buildVietnameseSummary = ({ overallChange, improvements, resolvedMissingSkills, remainingMissingSkills }) => {
  const sentences = [];

  if (overallChange > 0) {
    sentences.push(`Repo đã cải thiện tổng thể +${overallChange} điểm so với lần phân tích trước.`);
  } else if (overallChange < 0) {
    sentences.push(`Điểm tổng thể giảm ${Math.abs(overallChange)} điểm, cần kiểm tra lại các thay đổi gần đây trong repo.`);
  } else {
    sentences.push('Điểm tổng thể chưa thay đổi đáng kể so với lần phân tích trước.');
  }

  if (improvements.length > 0) {
    const topLabels = improvements.slice(0, 3).map((item) => item.label).join(', ');
    sentences.push(`Kỹ năng cải thiện rõ nhất là ${topLabels}.`);
  }

  if (resolvedMissingSkills.length > 0) {
    sentences.push(`Các điểm thiếu đã được xử lý: ${resolvedMissingSkills.join(', ')}.`);
  }

  if (remainingMissingSkills.length > 0) {
    sentences.push(`Các kỹ năng vẫn cần cải thiện: ${remainingMissingSkills.join(', ')}.`);
  }

  return sentences.join(' ');
};

const buildComparisonResult = (fromSnapshotInput, toSnapshotInput) => {
  const fromSnapshot = toObject(fromSnapshotInput);
  const toSnapshot = toObject(toSnapshotInput);
  const fromRepositoryId = String(fromSnapshot.repositoryId || '');
  const toRepositoryId = String(toSnapshot.repositoryId || '');

  if (fromRepositoryId !== toRepositoryId) {
    throw createStatusError('Snapshots must belong to the same repository', 400);
  }

  const overallBefore = Number(fromSnapshot.scores?.overallScore || 0);
  const overallAfter = Number(toSnapshot.scores?.overallScore || 0);
  const overallChange = overallAfter - overallBefore;
  const scoreComparison = compareScores(fromSnapshot, toSnapshot);
  const checklistComparison = compareChecklist(fromSnapshot, toSnapshot);
  const missingSkillComparison = compareMissingSkills(fromSnapshot, toSnapshot);
  const summary = buildVietnameseSummary({
    overallChange,
    improvements: scoreComparison.improvements,
    resolvedMissingSkills: missingSkillComparison.resolvedMissingSkills,
    remainingMissingSkills: missingSkillComparison.remainingMissingSkills,
  });

  return {
    repositoryId: toSnapshot.repositoryId,
    repoName: toSnapshot.repoName,
    fullName: toSnapshot.fullName,
    fromSnapshotId: fromSnapshot._id,
    toSnapshotId: toSnapshot._id,
    fromDate: fromSnapshot.analyzedAt || fromSnapshot.createdAt,
    toDate: toSnapshot.analyzedAt || toSnapshot.createdAt,
    overallBefore,
    overallAfter,
    overallChange,
    ...scoreComparison,
    ...checklistComparison,
    ...missingSkillComparison,
    summary,
  };
};

const compareSnapshots = async (user, { fromSnapshotId, toSnapshotId } = {}) => {
  validateAuthUser(user);

  if (!mongoose.Types.ObjectId.isValid(String(fromSnapshotId || '')) || !mongoose.Types.ObjectId.isValid(String(toSnapshotId || ''))) {
    throw createStatusError('fromSnapshotId and toSnapshotId are required', 400);
  }

  const [fromSnapshot, toSnapshot] = await Promise.all([
    RepoAnalysisSnapshot.findOne({ _id: fromSnapshotId, userId: user.userId }).lean(),
    RepoAnalysisSnapshot.findOne({ _id: toSnapshotId, userId: user.userId }).lean(),
  ]);

  if (!fromSnapshot || !toSnapshot) {
    throw createStatusError('Snapshot not found', 404);
  }

  return {
    message: 'Snapshots compared successfully',
    data: buildComparisonResult(fromSnapshot, toSnapshot),
    statusCode: 200,
  };
};

const compareRepositoryProgress = async (user, repoId) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, repoId);
  const snapshots = await RepoAnalysisSnapshot.find({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ createdAt: 1, analyzedAt: 1 })
    .lean();

  if (snapshots.length < 2) {
    throw createStatusError('At least two snapshots are required for comparison', 400);
  }

  return {
    message: 'Snapshots compared successfully',
    data: buildComparisonResult(snapshots[0], snapshots[snapshots.length - 1]),
    statusCode: 200,
  };
};

module.exports = {
  createSnapshotFromAnalysisResult,
  getRepositorySnapshots,
  getSnapshotById,
  compareSnapshots,
  compareRepositoryProgress,
  buildComparisonResult,
};
