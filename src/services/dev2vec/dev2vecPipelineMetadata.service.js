const modelMetadata = require('../../../ml_service/artifacts/model_metadata.json');
const { API_EVIDENCE_VERSION } = require('./apiEvidenceBuilder.service');
const { REPO_DOCUMENT_VERSION } = require('./repoDocumentBuilder.service');
const { ISSUE_DOCUMENT_VERSION } = require('./issueDocumentBuilder.service');

const ANALYSIS_PIPELINE_VERSION = 'dev2vec-analysis-pipeline-v12';
const CONSUMER_COMPATIBILITY_VERSION = 'dev2vec-consumer-compatibility-v1';
const ROLE_SELECTION_VERSION = 'repository-primary-role-selection-v1';
const AI_CONTEXT_BOUNDARY_VERSION = 'ai-context-boundary-v1';
const ROADMAP_SOURCE_VERSION = 'roadmap-source-provenance-v1';
const EVIDENCE_BUILDER_VERSION = 'dev2vec-evidence-builder-v7-training-aligned';
const MAPPING_VERSION = 'dev2vec-product-mapping-v1';
const CACHE_POLICY_VERSION = 'dev2vec-cache-policy-v1-evidence-fingerprint';
const ROLE_RESOLVER_VERSION = 'effective-role-resolver-v2';
const ISSUE_EVIDENCE_VERSION = 'github-issue-evidence-v2-user-comments';
const SOURCE_USAGE_PARSER_VERSION = 'source-usage-parser-v1';
const SKILL_MAPPING_VERSION = 'python-skill-gap-direct-v4';

const getRoleScoringVersion = () => (
  modelMetadata.roleScoring?.scoringVersion
  || modelMetadata.roleScoring?.strategy
  || 'classifier-only-v1'
);

const getCurrentDev2VecPipelineMetadata = ({ generatedAt = new Date() } = {}) => ({
  analysisPipelineVersion: ANALYSIS_PIPELINE_VERSION,
  consumerCompatibilityVersion: CONSUMER_COMPATIBILITY_VERSION,
  roleSelectionVersion: ROLE_SELECTION_VERSION,
  aiContextBoundaryVersion: AI_CONTEXT_BOUNDARY_VERSION,
  roadmapSourceVersion: ROADMAP_SOURCE_VERSION,
  evidenceBuilderVersion: EVIDENCE_BUILDER_VERSION,
  mappingVersion: MAPPING_VERSION,
  cachePolicyVersion: CACHE_POLICY_VERSION,
  issueEvidenceVersion: ISSUE_EVIDENCE_VERSION,
  repoDocumentVersion: REPO_DOCUMENT_VERSION,
  apiEvidenceVersion: API_EVIDENCE_VERSION,
  issueDocumentVersion: ISSUE_DOCUMENT_VERSION,
  sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
  roleResolverVersion: ROLE_RESOLVER_VERSION,
  skillMappingVersion: SKILL_MAPPING_VERSION,
  modelArtifactVersion: modelMetadata.modelVersion || 'unknown',
  modelVersion: modelMetadata.modelVersion || 'unknown',
  scoringVersion: getRoleScoringVersion(),
  generatedAt,
});

module.exports = {
  ANALYSIS_PIPELINE_VERSION,
  CONSUMER_COMPATIBILITY_VERSION,
  ROLE_SELECTION_VERSION,
  AI_CONTEXT_BOUNDARY_VERSION,
  ROADMAP_SOURCE_VERSION,
  EVIDENCE_BUILDER_VERSION,
  MAPPING_VERSION,
  CACHE_POLICY_VERSION,
  ISSUE_EVIDENCE_VERSION,
  SOURCE_USAGE_PARSER_VERSION,
  ROLE_RESOLVER_VERSION,
  SKILL_MAPPING_VERSION,
  getCurrentDev2VecPipelineMetadata,
};
