const AnalysisResult = require('../../models/AnalysisResult');
const RepoAnalysisSnapshot = require('../../models/RepoAnalysisSnapshot');
const { getCurrentDev2VecPipelineMetadata } = require('./dev2vecPipelineMetadata.service');

const REQUIRED_VERSION_FIELDS = [
  'modelVersion',
  'analysisPipelineVersion',
  'repoDocumentVersion',
  'issueDocumentVersion',
  'apiEvidenceVersion',
  'evidenceBuilderVersion',
  'mappingVersion',
  'cachePolicyVersion',
  'consumerCompatibilityVersion',
  'roleSelectionVersion',
  'aiContextBoundaryVersion',
  'roadmapSourceVersion',
];

const getRecordMetadata = (record = {}) => (
  record.dev2vec?.cacheMetadata
  || record.rawAnalysis?.dev2vecCacheMetadata
  || record.rawAnalysis?.pipelineMetadata
  || {}
);

const getCurrentDev2VecVersions = () => {
  const metadata = getCurrentDev2VecPipelineMetadata();
  return {
    modelVersion: metadata.modelVersion,
    analysisPipelineVersion: metadata.analysisPipelineVersion,
    pipelineVersion: metadata.analysisPipelineVersion,
    repoDocumentVersion: metadata.repoDocumentVersion,
    issueDocumentVersion: metadata.issueDocumentVersion,
    apiEvidenceVersion: metadata.apiEvidenceVersion,
    evidenceBuilderVersion: metadata.evidenceBuilderVersion,
    mappingVersion: metadata.mappingVersion,
    cachePolicyVersion: metadata.cachePolicyVersion,
    consumerCompatibilityVersion: metadata.consumerCompatibilityVersion,
    roleSelectionVersion: metadata.roleSelectionVersion,
    aiContextBoundaryVersion: metadata.aiContextBoundaryVersion,
    roadmapSourceVersion: metadata.roadmapSourceVersion,
  };
};

const getRecordVersions = (record = {}) => {
  const metadata = getRecordMetadata(record);
  return {
    modelVersion: record.dev2vec?.modelVersion || metadata.modelVersion || metadata.modelArtifactVersion || null,
    analysisPipelineVersion: metadata.analysisPipelineVersion || null,
    pipelineVersion: metadata.analysisPipelineVersion || null,
    repoDocumentVersion: metadata.repoDocumentVersion || null,
    issueDocumentVersion: metadata.issueDocumentVersion || null,
    apiEvidenceVersion: metadata.apiEvidenceVersion || null,
    evidenceBuilderVersion: metadata.evidenceBuilderVersion || null,
    mappingVersion: metadata.mappingVersion || null,
    cachePolicyVersion: metadata.cachePolicyVersion || null,
    consumerCompatibilityVersion: metadata.consumerCompatibilityVersion || null,
    roleSelectionVersion: metadata.roleSelectionVersion || null,
    aiContextBoundaryVersion: metadata.aiContextBoundaryVersion || null,
    roadmapSourceVersion: metadata.roadmapSourceVersion || null,
  };
};

const isUserContributionScope = (record = {}) => record.analysisScope?.type === 'user_contribution';

const isCompatibleRecord = (record) => {
  if (!record || !isUserContributionScope(record)) return false;
  const current = getCurrentDev2VecVersions();
  const actual = getRecordVersions(record);
  return REQUIRED_VERSION_FIELDS.every((field) => Boolean(actual[field]) && actual[field] === current[field]);
};

const isCompatibleAnalysisResult = (record) => isCompatibleRecord(record);
const isCompatibleSnapshot = (record) => isCompatibleRecord(record);

const mergeFilters = (base, extraFilters = {}) => ({ ...extraFilters, ...base });
const buildVersionQuery = (extraFilters = {}) => {
  const current = getCurrentDev2VecVersions();
  return mergeFilters({
    'analysisScope.type': 'user_contribution',
    'dev2vec.modelVersion': current.modelVersion,
    'dev2vec.cacheMetadata.analysisPipelineVersion': current.analysisPipelineVersion,
    'dev2vec.cacheMetadata.repoDocumentVersion': current.repoDocumentVersion,
    'dev2vec.cacheMetadata.issueDocumentVersion': current.issueDocumentVersion,
    'dev2vec.cacheMetadata.apiEvidenceVersion': current.apiEvidenceVersion,
    'dev2vec.cacheMetadata.evidenceBuilderVersion': current.evidenceBuilderVersion,
    'dev2vec.cacheMetadata.mappingVersion': current.mappingVersion,
    'dev2vec.cacheMetadata.cachePolicyVersion': current.cachePolicyVersion,
    'dev2vec.cacheMetadata.consumerCompatibilityVersion': current.consumerCompatibilityVersion,
    'dev2vec.cacheMetadata.roleSelectionVersion': current.roleSelectionVersion,
    'dev2vec.cacheMetadata.aiContextBoundaryVersion': current.aiContextBoundaryVersion,
    'dev2vec.cacheMetadata.roadmapSourceVersion': current.roadmapSourceVersion,
  }, extraFilters);
};

const buildCompatibleAnalysisQuery = (extraFilters = {}) => buildVersionQuery(extraFilters);
const buildCompatibleSnapshotQuery = (extraFilters = {}) => buildVersionQuery(extraFilters);

const findLatestCompatibleAnalysis = ({ userId, repositoryId, extraFilters = {} }) =>
  AnalysisResult.findOne(buildCompatibleAnalysisQuery({ userId, ...(repositoryId ? { repositoryId } : {}), ...extraFilters }))
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

const findLatestCompatibleSnapshot = ({ userId, repositoryId, extraFilters = {} }) =>
  RepoAnalysisSnapshot.findOne(buildCompatibleSnapshotQuery({ userId, ...(repositoryId ? { repositoryId } : {}), ...extraFilters }))
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

const compareSnapshotVersions = (left, right) => {
  const leftVersion = getRecordVersions(left);
  const rightVersion = getRecordVersions(right);
  const differences = REQUIRED_VERSION_FIELDS.filter((field) => leftVersion[field] !== rightVersion[field]);
  return {
    compatible: Boolean(left && right && isUserContributionScope(left) && isUserContributionScope(right) && differences.length === 0),
    isCurrentVersion: isCompatibleSnapshot(left) && isCompatibleSnapshot(right),
    differences,
    leftVersion,
    rightVersion,
  };
};

const buildCompatibilityMetadata = (record = {}) => {
  const versions = getRecordVersions(record);
  const isCompatible = isCompatibleRecord(record);
  return {
    ...versions,
    analysisScope: record.analysisScope || null,
    isCurrentVersion: isCompatible,
    isCompatible,
    isComparableWithCurrent: isCompatible,
  };
};

module.exports = {
  REQUIRED_VERSION_FIELDS,
  getCurrentDev2VecVersions,
  getRecordMetadata,
  getRecordVersions,
  isCompatibleAnalysisResult,
  isCompatibleSnapshot,
  buildCompatibleAnalysisQuery,
  buildCompatibleSnapshotQuery,
  findLatestCompatibleAnalysis,
  findLatestCompatibleSnapshot,
  compareSnapshotVersions,
  buildCompatibilityMetadata,
};
