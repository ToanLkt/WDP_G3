const {
  getCurrentDev2VecPipelineMetadata,
} = require('./dev2vecPipelineMetadata.service');

const hasCachedDev2VecResult = (analysis = {}) => (
  Array.isArray(analysis?.dev2vec?.rolePredictions)
  && analysis.dev2vec.rolePredictions.length > 0
  && analysis.dev2vec.skillGaps
  && typeof analysis.dev2vec.skillGaps === 'object'
);

const toTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const getCacheMetadata = (analysis = {}) => {
  if (!analysis || typeof analysis !== 'object') return null;
  return (
    analysis.dev2vec?.cacheMetadata
    || analysis.rawAnalysis?.dev2vecCacheMetadata
    || analysis.rawAnalysis?.pipelineMetadata
    || null
  );
};

const getRepositoryFingerprint = (repository = {}) => ({
  pushedAt: repository.pushedAt || null,
  updatedAtGithub: repository.updatedAtGithub || null,
  defaultBranch: repository.defaultBranch || '',
  latestCommitSha: repository.defaultBranchSha || repository.latestCommitSha || repository.rawData?.default_branch_sha || '',
});

const isRepositoryChanged = ({ analysis = {}, repository = {} } = {}) => {
  const cacheMetadata = getCacheMetadata(analysis) || {};
  const cachedFingerprint = cacheMetadata.repositoryFingerprint || {};
  const currentFingerprint = getRepositoryFingerprint(repository);

  if (cachedFingerprint.latestCommitSha && currentFingerprint.latestCommitSha) {
    return cachedFingerprint.latestCommitSha !== currentFingerprint.latestCommitSha;
  }

  const cachedPushedAt = toTime(cachedFingerprint.pushedAt || analysis.analyzedAt || analysis.createdAt);
  const currentPushedAt = toTime(currentFingerprint.pushedAt);
  if (cachedPushedAt && currentPushedAt) {
    return currentPushedAt > cachedPushedAt;
  }

  const cachedUpdatedAt = toTime(cachedFingerprint.updatedAtGithub);
  const currentUpdatedAt = toTime(currentFingerprint.updatedAtGithub);
  return Boolean(cachedUpdatedAt && currentUpdatedAt && currentUpdatedAt > cachedUpdatedAt);
};

const compareMetadata = (cached = {}, current = {}) => {
  if (!cached || typeof cached !== 'object') return 'legacy_cache';
  const checks = [
    ['analysisPipelineVersion', 'pipeline_version_mismatch'],
    ['evidenceBuilderVersion', 'pipeline_version_mismatch'],
    ['issueEvidenceVersion', 'pipeline_version_mismatch'],
    ['sourceUsageParserVersion', 'pipeline_version_mismatch'],
    ['roleResolverVersion', 'pipeline_version_mismatch'],
    ['skillMappingVersion', 'pipeline_version_mismatch'],
    ['modelArtifactVersion', 'model_version_mismatch'],
    ['scoringVersion', 'scoring_version_mismatch'],
  ];
  for (const [field, reason] of checks) {
    if (!cached[field]) return 'legacy_cache';
    if (cached[field] !== current[field]) return reason;
  }
  return 'compatible';
};

const hasReliableFingerprint = (fingerprint = {}) => Boolean(
  fingerprint.defaultBranch
  && fingerprint.latestCommitSha
  && fingerprint.pushedAt
  && fingerprint.updatedAtGithub
);

const shouldUseExactAnalysisCache = ({ analysis, repository, currentHeadSha, forceRegenerate = false } = {}) => {
  const base = shouldUseCachedDev2Vec({ analysis, repository: {
    ...repository,
    defaultBranchSha: currentHeadSha || repository?.defaultBranchSha,
  }, forceRegenerate });
  if (!base.useCache) return base;
  const cached = getCacheMetadata(analysis)?.repositoryFingerprint || {};
  const current = getRepositoryFingerprint({ ...repository, defaultBranchSha: currentHeadSha });
  if (!hasReliableFingerprint(cached) || !hasReliableFingerprint(current)) {
    return { useCache: false, reason: 'fingerprint_incomplete' };
  }
  if (String(cached.defaultBranch) !== String(current.defaultBranch)
    || String(cached.latestCommitSha) !== String(current.latestCommitSha)
    || toTime(cached.pushedAt) !== toTime(current.pushedAt)
    || toTime(cached.updatedAtGithub) !== toTime(current.updatedAtGithub)) {
    return { useCache: false, reason: 'repository_changed' };
  }
  return { useCache: true, reason: 'exact_fingerprint_match' };
};

const shouldUseCachedDev2Vec = ({
  analysis,
  repository,
  forceRegenerate = false,
  currentMetadata = getCurrentDev2VecPipelineMetadata(),
} = {}) => {
  if (forceRegenerate) return { useCache: false, reason: 'forced' };
  if (!analysis) return { useCache: false, reason: 'cache_missing' };
  if (!hasCachedDev2VecResult(analysis)) return { useCache: false, reason: 'cache_incomplete' };

  const metadataReason = compareMetadata(getCacheMetadata(analysis), currentMetadata);
  if (metadataReason !== 'compatible') return { useCache: false, reason: metadataReason };

  if (isRepositoryChanged({ analysis, repository })) {
    return { useCache: false, reason: 'repository_changed' };
  }

  return { useCache: true, reason: 'compatible' };
};

module.exports = {
  getCacheMetadata,
  getRepositoryFingerprint,
  hasReliableFingerprint,
  hasCachedDev2VecResult,
  compareMetadata,
  shouldUseExactAnalysisCache,
  shouldUseCachedDev2Vec,
};
