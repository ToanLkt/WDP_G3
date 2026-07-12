const assert = require('assert');

const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  EVIDENCE_BUILDER_VERSION,
  SOURCE_USAGE_PARSER_VERSION,
} = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const {
  isSourceEvidenceCacheCompatible,
  runWithConcurrency,
} = require('../src/services/github/github.package.service');
const {
  createDev2VecTimer,
} = require('../src/utils/dev2vecTiming');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const repository = {
  _id: 'repo-1',
  defaultBranch: 'main',
  pushedAt: '2026-07-13T00:00:00.000Z',
  updatedAtGithub: '2026-07-13T01:00:00.000Z',
};

const compatiblePackageRecord = {
  detectedFiles: [{
    path: 'src/services/api.ts',
    sourceContent: 'import axios from "axios"; export const getUsers = () => axios.get("/api/users");',
  }],
  rawData: {
    __sourceEvidenceCache: {
      defaultBranch: repository.defaultBranch,
      pushedAt: repository.pushedAt,
      updatedAtGithub: repository.updatedAtGithub,
      evidenceBuilderVersion: EVIDENCE_BUILDER_VERSION,
      sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
    },
    __sourceUsageCache: {
      tokens: ['import:axios', 'client_http:axios.get'],
      parsedFileCount: 1,
      skippedFileCount: 0,
      totalChars: 80,
      sourceUsageParserVersion: SOURCE_USAGE_PARSER_VERSION,
    },
  },
};

(async () => {
  const timer = createDev2VecTimer({ repoId: 'repo-1', requestId: 'perf-test' });
  await timer.measure('mockPhaseMs', () => wait(5));
  assert(timer.phases.mockPhaseMs >= 1);

  let active = 0;
  let maxActive = 0;
  const started = Date.now();
  const results = await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await wait(20);
    active -= 1;
    return item * 2;
  });
  assert.deepStrictEqual(results.slice(0, 6), [2, 4, 6, 8, 10, 12]);
  assert(maxActive <= 3);
  assert(results.maxActive <= 3);
  assert(Date.now() - started < 100);

  assert.strictEqual(isSourceEvidenceCacheCompatible(compatiblePackageRecord, repository), true);
  assert.strictEqual(isSourceEvidenceCacheCompatible({
    ...compatiblePackageRecord,
    rawData: {
      ...compatiblePackageRecord.rawData,
      __sourceEvidenceCache: {
        ...compatiblePackageRecord.rawData.__sourceEvidenceCache,
        pushedAt: '2026-07-12T00:00:00.000Z',
      },
    },
  }, repository), false);
  assert.strictEqual(isSourceEvidenceCacheCompatible({
    ...compatiblePackageRecord,
    rawData: {
      ...compatiblePackageRecord.rawData,
      __sourceEvidenceCache: {
        ...compatiblePackageRecord.rawData.__sourceEvidenceCache,
        sourceUsageParserVersion: 'older',
      },
    },
  }, repository), false);

  const input = buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages: [compatiblePackageRecord],
    commits: [],
    issues: [],
    channelStatus: { issue: 'no_issues' },
    requestId: 'source-usage-cache',
  });
  assert.strictEqual(input.sourceStats.sourceUsageFromCache, true);
  assert(input.apiTokens.includes('client_http:axios.get'));

  console.log('PASS: Dev2Vec performance optimization fixtures');
})();
