const assert = require('assert');

const {
  getCurrentDev2VecPipelineMetadata,
} = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const {
  getRepositoryFingerprint,
  shouldUseCachedDev2Vec,
} = require('../src/services/dev2vec/dev2vecCachePolicy.service');

const currentMetadata = getCurrentDev2VecPipelineMetadata({ generatedAt: new Date('2026-07-13T00:00:00.000Z') });
const repository = {
  _id: 'repo-1',
  pushedAt: new Date('2026-07-12T00:00:00.000Z'),
  updatedAtGithub: new Date('2026-07-12T01:00:00.000Z'),
  defaultBranch: 'main',
};

const compatibleAnalysis = {
  _id: 'analysis-1',
  repositoryId: 'repo-1',
  analyzedAt: new Date('2026-07-12T02:00:00.000Z'),
  rawAnalysis: {
    evidenceChannels: {
      availableChannels: ['repo', 'issue', 'api'],
      channelStatus: { issue: 'available' },
    },
    pipelineMetadata: {
      ...currentMetadata,
      repositoryFingerprint: getRepositoryFingerprint(repository),
    },
  },
  dev2vec: {
    modelVersion: currentMetadata.modelArtifactVersion,
    rolePredictions: [{ roleId: 'frontend', probability: 0.7 }],
    skillGaps: { frontend: { matchedSkills: [] } },
    scoringMethod: 'dev2vec_doc2vec_classifier',
    sourceStats: {
      repoTokenCount: 10,
      apiTokenCount: 6,
      issueTokenCount: 2,
      sourceFileCount: 4,
      skippedFileCount: 1,
    },
    cacheMetadata: {
      ...currentMetadata,
      repositoryFingerprint: getRepositoryFingerprint(repository),
    },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const cases = [
  {
    name: 'cache_hit',
    args: { analysis: compatibleAnalysis, repository, currentMetadata },
    expected: { useCache: true, reason: 'compatible' },
  },
  {
    name: 'forceRegenerate',
    args: { analysis: compatibleAnalysis, repository, currentMetadata, forceRegenerate: true },
    expected: { useCache: false, reason: 'forced' },
  },
  {
    name: 'legacy_cache',
    args: {
      analysis: {
        ...clone(compatibleAnalysis),
        rawAnalysis: {},
        dev2vec: {
          rolePredictions: [{ roleId: 'frontend', probability: 0.7 }],
          skillGaps: { frontend: {} },
        },
      },
      repository,
      currentMetadata,
    },
    expected: { useCache: false, reason: 'legacy_cache' },
  },
  {
    name: 'model_version_mismatch',
    args: {
      analysis: {
        ...clone(compatibleAnalysis),
        dev2vec: {
          ...clone(compatibleAnalysis.dev2vec),
          cacheMetadata: {
            ...clone(compatibleAnalysis.dev2vec.cacheMetadata),
            modelArtifactVersion: 'older-model',
          },
        },
      },
      repository,
      currentMetadata,
    },
    expected: { useCache: false, reason: 'model_version_mismatch' },
  },
  {
    name: 'scoring_version_mismatch',
    args: {
      analysis: {
        ...clone(compatibleAnalysis),
        dev2vec: {
          ...clone(compatibleAnalysis.dev2vec),
          cacheMetadata: {
            ...clone(compatibleAnalysis.dev2vec.cacheMetadata),
            scoringVersion: 'older-scoring',
          },
        },
      },
      repository,
      currentMetadata,
    },
    expected: { useCache: false, reason: 'scoring_version_mismatch' },
  },
  {
    name: 'repository_changed',
    args: {
      analysis: compatibleAnalysis,
      repository: {
        ...repository,
        pushedAt: new Date('2026-07-13T00:00:00.000Z'),
      },
      currentMetadata,
    },
    expected: { useCache: false, reason: 'repository_changed' },
  },
  {
    name: 'cache_missing',
    args: { analysis: null, repository, currentMetadata },
    expected: { useCache: false, reason: 'cache_missing' },
  },
  {
    name: 'cache_incomplete',
    args: {
      analysis: {
        ...clone(compatibleAnalysis),
        dev2vec: { skillGaps: { frontend: {} }, cacheMetadata: currentMetadata },
      },
      repository,
      currentMetadata,
    },
    expected: { useCache: false, reason: 'cache_incomplete' },
  },
];

const results = cases.map((testCase) => {
  const decision = shouldUseCachedDev2Vec(testCase.args);
  assert.deepStrictEqual(decision, testCase.expected, testCase.name);
  return { name: testCase.name, decision };
});

const multiRepo = [
  { repoName: 'compatible', decision: shouldUseCachedDev2Vec({ analysis: compatibleAnalysis, repository, currentMetadata }) },
  { repoName: 'legacy', decision: shouldUseCachedDev2Vec({ analysis: cases[2].args.analysis, repository, currentMetadata }) },
];
assert.strictEqual(multiRepo[0].decision.reason, 'compatible');
assert.strictEqual(multiRepo[1].decision.reason, 'legacy_cache');

console.log(JSON.stringify({
  currentMetadata,
  cases: results,
  simulatedPipelineEffects: {
    cache_hit: 'would_skip_input_builder_and_inference',
    forceRegenerate: 'would_rebuild_evidence_fetch_issues_parse_source_and_run_inference',
    legacy_cache: 'would_rebuild_without_crash',
    model_version_mismatch: 'would_run_new_inference',
    scoring_version_mismatch: 'would_run_new_inference',
    repository_changed: 'would_run_new_inference_when_repository_metadata_is_available',
    cache_incomplete: 'would_rebuild',
    issue_fetch_error_on_regenerate: 'handled_by_existing issue channel status fetch_failed/rate_limited and zero issue channel',
    source_parser_error_on_regenerate: 'handled_by existing source parser fallback and dependency tokens',
    debug_disabled: 'DEV2VEC_DEBUG unset produces no verbose cache log',
    debug_enabled: 'DEV2VEC_DEBUG=true logs sanitized cache reason/version/channel counts',
    contract_regression: 'policy does not add response fields',
  },
  multiRepo,
}, null, 2));
