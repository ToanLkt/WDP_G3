const { isCompatibleAnalysisResult, getRecordVersions } = require('./dev2vecCompatibility.service');

const valueId = (value) => String(value?._id || value || '');
const time = (value) => new Date(value || 0).getTime() || 0;
const probabilityOf = (prediction = {}) => Number(prediction.probability || 0);
const primaryPrediction = (analysis = {}) => Array.isArray(analysis.dev2vec?.rolePredictions)
  ? analysis.dev2vec.rolePredictions[0] || null
  : null;

const toRole = (analysis, selectionType) => {
  const prediction = primaryPrediction(analysis);
  if (!prediction) return null;
  const versions = getRecordVersions(analysis);
  const roleId = String(prediction.roleId || prediction.modelLabel || prediction.label || '').trim();
  const gap = analysis.dev2vec?.skillGaps?.[roleId] || {};
  return {
    roleId,
    roleName: prediction.roleName || prediction.modelLabel || prediction.label || roleId,
    matchScore: Number((probabilityOf(prediction) * 100).toFixed(2)),
    probability: probabilityOf(prediction),
    rank: 1,
    matchedSkillNames: gap.matchedSkillNames || [],
    weakSkillNames: gap.weakSkillNames || [],
    missingSkillNames: gap.missingSkillNames || [],
    recommendedNextSkills: gap.recommendedNextSkills || [],
    sourceRepositoryId: analysis.repositoryId || null,
    sourceRepositoryName: analysis.repoName || analysis.fullName || '',
    sourceAnalysisId: analysis._id || null,
    sourceSnapshotId: analysis.snapshotId || analysis.sourceSnapshotId || null,
    modelVersion: versions.modelVersion,
    pipelineVersion: versions.pipelineVersion,
    analyzedAt: analysis.analyzedAt || analysis.createdAt || null,
    selectionType,
    authoritativeScope: 'per_repository_dev2vec',
  };
};

const better = (left, right) => (
  right.probability - left.probability
  || time(right.analyzedAt) - time(left.analyzedAt)
  || valueId(left.sourceRepositoryId).localeCompare(valueId(right.sourceRepositoryId))
);

const aggregateRepositoryPrimaryRoles = ({
  currentRepositoryId,
  compatibleAnalyses = [],
  maxAdditionalRoles = 2,
  userId,
} = {}) => {
  const currentId = valueId(currentRepositoryId);
  const eligible = compatibleAnalyses.filter((analysis) => (
    isCompatibleAnalysisResult(analysis)
    && (!userId || valueId(analysis.userId) === valueId(userId))
    && analysis.repositoryDeleted !== true
    && analysis.repositoryArchived !== true
    && primaryPrediction(analysis)
  ));
  const currentAnalysis = eligible
    .filter((analysis) => valueId(analysis.repositoryId) === currentId)
    .sort((a, b) => time(b.analyzedAt || b.createdAt) - time(a.analyzedAt || a.createdAt))[0] || null;
  let primaryRole = currentAnalysis ? toRole(currentAnalysis, 'current_repository_primary') : null;

  const perRole = new Map();
  for (const analysis of eligible) {
    if (currentAnalysis && valueId(analysis.repositoryId) === currentId) continue;
    const candidate = toRole(analysis, currentAnalysis ? 'portfolio_repository_primary' : 'portfolio_suggestion');
    if (!candidate || candidate.roleId === primaryRole?.roleId) continue;
    const existing = perRole.get(candidate.roleId);
    if (!existing || better(existing, candidate) > 0) perRole.set(candidate.roleId, candidate);
  }
  const ranked = [...perRole.values()].sort(better);
  if (!primaryRole && ranked.length) primaryRole = ranked.shift();
  return {
    primaryRole,
    additionalRoleOptions: ranked.slice(0, Math.max(0, Number(maxAdditionalRoles) || 0)),
    aggregationMode: 'repository_primary_roles',
    classifierInferencePerformed: false,
    authoritativeScope: 'per_repository_dev2vec',
    sourceRepositoryCount: new Set(eligible.map((item) => valueId(item.repositoryId))).size,
  };
};

module.exports = { primaryPrediction, toRole, aggregateRepositoryPrimaryRoles };
