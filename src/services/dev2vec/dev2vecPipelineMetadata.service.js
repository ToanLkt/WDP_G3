const modelMetadata = require('../../../ml_service/artifacts/model_metadata.json');

const ANALYSIS_PIPELINE_VERSION = 'dev2vec-analysis-pipeline-v5';
const EVIDENCE_BUILDER_VERSION = 'dev2vec-evidence-builder-v5';
const ROLE_RESOLVER_VERSION = 'effective-role-resolver-v2';
const ISSUE_EVIDENCE_VERSION = 'github-issue-evidence-v1';
const SOURCE_USAGE_PARSER_VERSION = 'source-usage-parser-v1';
const SKILL_MAPPING_VERSION = 'canonical-skill-mapping-v3';

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
  skillMappingVersion: SKILL_MAPPING_VERSION,
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
  SKILL_MAPPING_VERSION,
  getCurrentDev2VecPipelineMetadata,
};
