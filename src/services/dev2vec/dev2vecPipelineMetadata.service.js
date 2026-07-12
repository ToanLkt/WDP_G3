const modelMetadata = require('../../../ml_service/artifacts/model_metadata.json');

const ANALYSIS_PIPELINE_VERSION = 'dev2vec-analysis-pipeline-v3';
const EVIDENCE_BUILDER_VERSION = 'dev2vec-evidence-builder-v4';
const ROLE_RESOLVER_VERSION = 'effective-role-resolver-v1';
const ISSUE_EVIDENCE_VERSION = 'github-issue-evidence-v1';
const SOURCE_USAGE_PARSER_VERSION = 'source-usage-parser-v1';

const getRoleScoringVersion = () => (
  modelMetadata.roleScoring?.scoringVersion
  || modelMetadata.roleScoring?.strategy
  || 'classifier-only-v1'
);

const getCurrentDev2VecPipelineMetadata = ({ generatedAt = new Date() } = {}) => ({
  analysisPipelineVersion: ANALYSIS_PIPELINE_VERSION,
  evidenceBuilderVersion: EVIDENCE_BUILDER_VERSION,
  issueEvidenceVersion: ISSUE_EVIDENCE_VERSION,
  sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
  roleResolverVersion: ROLE_RESOLVER_VERSION,
  modelArtifactVersion: modelMetadata.modelVersion || 'unknown',
  scoringVersion: getRoleScoringVersion(),
  generatedAt,
});

module.exports = {
  ANALYSIS_PIPELINE_VERSION,
  EVIDENCE_BUILDER_VERSION,
  ISSUE_EVIDENCE_VERSION,
  SOURCE_USAGE_PARSER_VERSION,
  ROLE_RESOLVER_VERSION,
  getCurrentDev2VecPipelineMetadata,
};
