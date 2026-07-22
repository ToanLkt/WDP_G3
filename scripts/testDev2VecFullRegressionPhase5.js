const assert = require('assert');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { runDev2VecInference, validateDev2VecOutput } = require('../src/services/dev2vec/dev2vec.service');
const { mapDev2VecOutputToRoleMatches } = require('../src/services/dev2vec/dev2vecRoleMapper.service');
const { buildDev2VecInputFromRepositoryAnalysis } = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const { buildEvidenceFingerprint, decideEvidenceCache } = require('../src/services/dev2vec/dev2vecCachePolicy.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const { assertPersistableAnalysis, shouldPersistVectors, estimateDocumentBytes } = require('../src/services/dev2vec/dev2vecPersistence.service');
const { buildSnapshotPayload } = require('../src/services/snapshot.service');
const { buildInferenceEvent } = require('../src/services/dev2vec/dev2vecObservability.service');

const root = path.resolve(__dirname, '..');
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/dev2vec-parity/golden-inputs.json'), 'utf8'));
const golden = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/dev2vec-parity/golden-expected.json'), 'utf8'));
const zero = (values) => values.every((value) => Number(value) === 0);

const assertPublicRoleShape = (role) => {
  const types = { roleId: 'string', roleName: 'string', matchScore: 'number', matchLevel: 'string', matchLevelLabel: 'string' };
  Object.entries(types).forEach(([field, type]) => assert.strictEqual(typeof role[field], type));
  ['matchedSkillNames', 'weakSkillNames', 'missingSkillNames', 'recommendedNextSkills'].forEach((field) => assert(Array.isArray(role[field])));
};

(async () => {
  const outputs = {};
  for (const item of inputs) {
    const output = await runDev2VecInference(item.input);
    outputs[item.id] = output;
    assert.deepStrictEqual(output.vectorDims, { repo: 230, issue: 150, api: 200, combined: 580 });
    assert.strictEqual(output.vectors.repoVector.length, 230);
    assert.strictEqual(output.vectors.issueVector.length, 150);
    assert.strictEqual(output.vectors.apiVector.length, 200);
    assert.strictEqual(output.vectors.combinedVector.length, 580);
    assert(output.rolePredictions.length <= 3);
    if (!item.input.evidenceChannels.availableChannels.repo) assert(zero(output.vectors.repoVector));
    if (!item.input.evidenceChannels.availableChannels.issue) assert(zero(output.vectors.issueVector));
    if (!item.input.evidenceChannels.availableChannels.api) assert(zero(output.vectors.apiVector));

    const expected = golden.cases[item.id];
    assert.strictEqual(output.modelVersion, golden.artifactVersion);
    assert.deepStrictEqual(output.vectorSources, expected.vectorSources);
    assert.deepStrictEqual(output.rolePredictions.map((prediction) => prediction.roleId), expected.roleIds);
    output.rolePredictions.forEach((prediction, index) => assert(Math.abs(prediction.probability - expected.probabilities[index]) <= golden.probabilityTolerance));
    const gap = output.skillGaps[output.rolePredictions[0].roleId];
    for (const field of ['matchedSkillNames', 'weakSkillNames', 'missingSkillNames', 'recommendedNextSkills']) assert.deepStrictEqual(gap[field], expected.topSkillGap[field]);
    const mapped = mapDev2VecOutputToRoleMatches(output, { includeDetails: true });
    assertPublicRoleShape(mapped.matches[0]);
    assert.strictEqual(mapped.matches[0].roleId, output.rolePredictions[0].roleId);
  }

  const metadata = getCurrentDev2VecPipelineMetadata();
  assert.strictEqual(metadata.analysisPipelineVersion, 'dev2vec-analysis-pipeline-v12');
  const evidence = { contributionSummary: { accepted: true, verifiedChangedLines: 5, selectedCommitShas: ['a'], selectedPullRequests: [], changedPaths: ['src/a.js'] }, issues: [], apiTokens: ['express'], topN: 3, metadata };
  const fingerprint = buildEvidenceFingerprint(evidence);
  const cachedMetadata = { ...metadata, topN: 3, evidenceFingerprint: fingerprint };
  assert.strictEqual(decideEvidenceCache({ cachedMetadata, currentMetadata: metadata, evidenceFingerprint: fingerprint, topN: 3 }).status, 'exact_hit');
  assert.strictEqual(decideEvidenceCache({ cachedMetadata, currentMetadata: metadata, evidenceFingerprint: buildEvidenceFingerprint({ ...evidence, issues: [{ number: 1, relations: ['commented'], updatedAt: '2026-01-01', userComments: [{ updatedAt: '2026-01-01' }] }] }), topN: 3 }).status, 'evidence_changed');

  const source = outputs['all-channels'];
  const analysis = { userId: 'u', repositoryId: 'r', repoName: 'fixture', fullName: 'acme/fixture', dev2vec: { ...source, repoVector: source.vectors.repoVector, issueVector: source.vectors.issueVector, apiVector: source.vectors.apiVector, combinedVector: source.vectors.combinedVector, cacheMetadata: cachedMetadata } };
  assertPersistableAnalysis(analysis);
  const snapshot = buildSnapshotPayload(analysis);
  assert.deepStrictEqual(snapshot.dev2vec.rolePredictions, analysis.dev2vec.rolePredictions);
  assert.deepStrictEqual(snapshot.dev2vec.skillGaps, analysis.dev2vec.skillGaps);
  assert.deepStrictEqual(snapshot.dev2vec.combinedVector, []);
  assert.strictEqual(shouldPersistVectors({}), true);
  assert.strictEqual(shouldPersistVectors({ DEV2VEC_PERSIST_VECTORS: 'false' }), false);
  assert(estimateDocumentBytes(analysis) < 16 * 1024 * 1024);
  assert.throws(() => assertPersistableAnalysis({ dev2vec: { ...analysis.dev2vec, rolePredictions: [] } }), /not valid/);

  const event = buildInferenceEvent({ requestId: 'phase5', modelVersion: source.modelVersion, pipelineVersion: metadata.analysisPipelineVersion, evidenceBuilderVersion: metadata.evidenceBuilderVersion, mappingVersion: metadata.mappingVersion, cachePolicyVersion: metadata.cachePolicyVersion, cacheStatus: 'exact_hit', inferenceStatus: 'success', repoAvailable: true, issueAvailable: true, apiAvailable: true, repoDocument: 'secret', apiTokens: ['secret'], vectors: source.vectors, githubToken: 'secret' });
  const serializedEvent = JSON.stringify(event);
  assert(!serializedEvent.includes('repoDocument') && !serializedEvent.includes('apiTokens') && !serializedEvent.includes('vectors') && !serializedEvent.includes('githubToken'));

  const originalPost = axios.post;
  const originalUrl = process.env.DEV2VEC_SERVICE_URL;
  process.env.DEV2VEC_SERVICE_URL = 'http://fixture-worker';
  try {
    axios.post = async () => ({ data: source });
    assert.strictEqual((await runDev2VecInference(inputs[0].input)).modelVersion, golden.artifactVersion);
    axios.post = async () => ({ data: { success: true, modelVersion: golden.artifactVersion, rolePredictions: [], skillGaps: {}, vectorDims: {} } });
    await assert.rejects(() => runDev2VecInference(inputs[0].input), (error) => error.errorCode === 'DEV2VEC_OUTPUT_CONTRACT_INVALID');
  } finally {
    axios.post = originalPost;
    if (originalUrl === undefined) delete process.env.DEV2VEC_SERVICE_URL; else process.env.DEV2VEC_SERVICE_URL = originalUrl;
  }
  await assert.rejects(
    () => runDev2VecInference(inputs[0].input, { pythonBin: path.join(root, 'missing-python.exe') }),
    (error) => error.errorCode === 'DEV2VEC_PROCESS_UNAVAILABLE' && error.statusCode === 503,
  );
  assert.throws(() => validateDev2VecOutput({ ...source, vectorDims: { ...source.vectorDims, combined: 579 } }), (error) => error.errorCode === 'DEV2VEC_OUTPUT_CONTRACT_INVALID');

  const roleContexts = {
    backend: ['express', 'mongoose'], frontend: ['react', 'vite'], mobile: ['flutter', 'dio'], devops: ['docker', 'actions/checkout'], data_scientist: ['pandas', 'scikit-learn'],
  };
  Object.entries(roleContexts).forEach(([role, tokens]) => {
    const commit = { sha: role, message: `add ${role}`, additions: 5, deletions: 0, normalizedFiles: [{ filename: 'package.json', evidenceContent: JSON.stringify({ dependencies: Object.fromEntries(tokens.map((token) => [token, '1'])) }) }] };
    const built = buildDev2VecInputFromRepositoryAnalysis({ repository: { name: role }, commits: [commit], contributionSummary: { accepted: true, selectedCommitShas: [role], selectedPullRequests: [] }, issues: [{ number: 1, relations: ['authored'], title: `${role} issue`, repositoryFullName: role }] });
    assert.deepStrictEqual(built.evidenceChannels.availableChannels, { repo: true, issue: true, api: true });
  });

  console.log('PASS: Phase 5 full regression, golden inference, missing channels, cache, persistence and API shape');
})().catch((error) => { console.error(error); process.exit(1); });
