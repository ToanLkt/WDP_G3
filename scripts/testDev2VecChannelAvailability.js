const assert = require('assert');

const {
  buildDev2VecInputFromRepositoryAnalysis,
  buildDev2VecInputFromAnalysisSource,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  normalizeDev2VecInput,
  runDev2VecInference,
} = require('../src/services/dev2vec/dev2vec.service');

const vectorIsFinite = (values) => Array.isArray(values) && values.every((value) => Number.isFinite(Number(value)));

const repository = {
  name: 'channel-fixture',
  fullName: 'example/channel-fixture',
  description: 'Express React fixture',
  language: 'JavaScript',
};

const packageRecord = {
  packageFiles: ['package.json'],
  packages: ['express', 'react'],
  frameworks: ['Backend HTTP framework', 'React'],
  detectedFiles: [{
    path: 'src/routes/users.js',
    fileName: 'users.js',
    sourceContent: 'import express from "express"; const router = express.Router(); router.get("/users", handler);',
  }],
};
const contributionSummary = { accepted: true, selectedCommitShas: ['abc'], selectedPullRequests: [] };
const userCommit = { sha: 'abc', message: 'feat: add users route', normalizedFiles: [{
  filename: 'package.json', evidenceContent: JSON.stringify({ dependencies: { express: '^4', react: '^19' } }),
}] };

const fullInput = buildDev2VecInputFromRepositoryAnalysis({
  repository,
  packages: [packageRecord],
  commits: [userCommit],
  contributionSummary,
  issues: [{
    number: 1,
    title: 'Users endpoint returns 401',
    body: 'Authentication token validation middleware fails.',
    labels: ['backend', 'bug'],
    repositoryFullName: 'example/channel-fixture',
    relations: ['authored'],
  }],
  channelStatus: { issue: 'available' },
  requestId: 'channel-full',
});

assert.strictEqual(fullInput.evidenceChannels.availableChannels.repo, true);
assert.strictEqual(fullInput.evidenceChannels.availableChannels.issue, true);
assert.strictEqual(fullInput.evidenceChannels.availableChannels.api, true);
assert.strictEqual(fullInput.evidenceChannels.channelStatus.issue, 'available');

const noIssueInput = buildDev2VecInputFromRepositoryAnalysis({
  repository,
  packages: [packageRecord],
  commits: [userCommit],
  contributionSummary,
  issues: [],
  channelStatus: { issue: 'empty' },
  requestId: 'channel-no-issue',
});
assert.strictEqual(noIssueInput.issueDocument, '');
assert.strictEqual(noIssueInput.evidenceChannels.availableChannels.issue, false);
assert.strictEqual(noIssueInput.evidenceChannels.channelStatus.issue, 'empty');

const fetchFailedInput = buildDev2VecInputFromRepositoryAnalysis({
  repository,
  packages: [packageRecord],
  commits: [],
  issues: [],
  channelStatus: { issue: 'fetch_failed' },
  requestId: 'channel-fetch-failed',
});
assert.strictEqual(fetchFailedInput.evidenceChannels.availableChannels.issue, false);
assert.strictEqual(fetchFailedInput.evidenceChannels.channelStatus.issue, 'fetch_failed');

const legacyInput = buildDev2VecInputFromAnalysisSource({
  analysis: {
    packages: [packageRecord],
    commits: [],
    rawAnalysis: {},
  },
  repository,
  requestId: 'channel-legacy',
});
assert.strictEqual(legacyInput.evidenceChannels.channelStatus.issue, 'legacy_snapshot');
assert.strictEqual(legacyInput.evidenceChannels.channelStatus.api, 'contribution_unverified');

const apiParseFailedInput = buildDev2VecInputFromRepositoryAnalysis({
  repository,
  packages: [{
    packageFiles: [],
    packages: [],
    frameworks: [],
    detectedFiles: [{
      path: 'src/broken.js',
      fileName: 'broken.js',
      sourceContent: 'function broken( {',
    }],
  }],
  commits: [],
  issues: [],
  channelStatus: { api: 'parse_failed', issue: 'empty' },
  requestId: 'channel-api-parse-failed',
});
assert.strictEqual(apiParseFailedInput.evidenceChannels.availableChannels.api, false);
assert.strictEqual(apiParseFailedInput.evidenceChannels.channelStatus.api, 'contribution_unverified');

const normalized = normalizeDev2VecInput(noIssueInput);
assert.deepStrictEqual(normalized.evidenceChannels.availableChannels.issue, false);
assert.strictEqual(normalized.evidenceChannels.channelStatus.issue, 'empty');

(async () => {
  const output = await runDev2VecInference(noIssueInput);
  assert.strictEqual(output.vectorDims.repo, 230);
  assert.strictEqual(output.vectorDims.issue, 150);
  assert.strictEqual(output.vectorDims.api, 200);
  assert.strictEqual(output.vectorDims.combined, 580);
  assert.strictEqual(output.vectors.repoVector.length, 230);
  assert.strictEqual(output.vectors.issueVector.length, 150);
  assert.strictEqual(output.vectors.apiVector.length, 200);
  assert.strictEqual(output.vectors.combinedVector.length, 580);
  assert(vectorIsFinite(output.vectors.combinedVector));
  assert.strictEqual(output.vectorSources.issues, false);
  assert(output.vectors.issueVector.every((value) => Number(value) === 0));
  assert(Array.isArray(output.rolePredictions));
  console.log('PASS: Dev2Vec channel availability fixtures');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
