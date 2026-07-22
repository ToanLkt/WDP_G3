const assert = require('assert');
const { mapDev2VecOutputToRoleMatches, buildAnalysisSkillsFromDev2Vec, buildAnalysisSummaryFromDev2Vec } = require('../src/services/dev2vec/dev2vecRoleMapper.service');
const { buildEvidenceFingerprint, decideEvidenceCache, compareMetadata } = require('../src/services/dev2vec/dev2vecCachePolicy.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const { assertPersistableAnalysis, shouldPersistVectors, estimateDocumentBytes } = require('../src/services/dev2vec/dev2vecPersistence.service');
const { buildInferenceEvent, recordInferenceEvent, getMetricSnapshot, resetMetrics } = require('../src/services/dev2vec/dev2vecObservability.service');
const { buildSnapshotPayload } = require('../src/services/snapshot.service');
const { getDev2VecStatus } = require('../src/services/dev2vec/dev2vecStatus.service');

const output = {
  modelVersion: 'dev2vec-demo-v4', vectorDims: { repo: 230, issue: 150, api: 200, combined: 580 },
  vectorSources: { repos: true, issues: false, apis: true }, sourceStats: { repoTextLength: 10, issueTextLength: 0, apiTokenCount: 2 },
  rolePredictions: [
    { roleId: 'frontend', roleName: 'Frontend Developer', modelLabel: 'Frontend', probability: 0.412345, rank: 1 },
    { roleId: 'backend', roleName: 'Backend Developer', modelLabel: 'Backend', probability: 0.7, rank: 2 },
  ],
  skillGaps: {
    frontend: {
      matchedSkillNames: ['React'], weakSkillNames: ['Testing'], missingSkillNames: ['Accessibility'],
      recommendedNextSkills: ['Accessibility', 'Testing'],
      details: [
        { skillName: 'React', similarity: 0.01, status: 'matched' },
        { skillName: 'Testing', similarity: 0.99, status: 'weak' },
        { skillName: 'Accessibility', similarity: 0.8, status: 'missing' },
      ],
    }, backend: { matchedSkillNames: [], weakSkillNames: [], missingSkillNames: [], recommendedNextSkills: [], details: [] },
  },
};
const mapped = mapDev2VecOutputToRoleMatches(output, { includeDetails: true, limit: 3 });
assert.deepStrictEqual(mapped.matches.map((item) => item.roleId), ['frontend', 'backend']);
assert.strictEqual(mapped.matches[0].matchScore, 41.23);
assert.strictEqual(buildAnalysisSummaryFromDev2Vec(output).careerDirection, 'Frontend Developer');
for (const field of ['roleId', 'roleName', 'matchScore', 'matchLevel', 'matchLevelLabel', 'matchedSkillNames', 'weakSkillNames', 'missingSkillNames', 'recommendedNextSkills']) assert(Object.hasOwn(mapped.matches[0], field));
assert(Array.isArray(mapped.matches[1].matchedSkillNames));
const skills = buildAnalysisSkillsFromDev2Vec(output);
assert.strictEqual(skills.topSkills.find((item) => item.skill === 'React').dev2vecStatus, 'matched');
assert.strictEqual(skills.topSkills.find((item) => item.skill === 'Testing').dev2vecStatus, 'weak');
assert.strictEqual(skills.missingSkills[0].dev2vecStatus, 'missing');
assert.deepStrictEqual(skills.recommendations, ['Accessibility', 'Testing']);
assert.strictEqual(skills.topSkills.find((item) => item.skill === 'React').score, 1);

const metadata = getCurrentDev2VecPipelineMetadata({ generatedAt: new Date(0) });
assert.strictEqual(metadata.analysisPipelineVersion, 'dev2vec-analysis-pipeline-v12');
assert.strictEqual(metadata.consumerCompatibilityVersion, 'dev2vec-consumer-compatibility-v1');
const evidence = {
  contributionSummary: { accepted: true, verifiedChangedLines: 9, selectedCommitShas: ['b', 'a'], selectedPullRequests: [{ number: 2, updatedAt: '2026-01-01' }], changedPaths: ['z', 'a'] },
  issues: [{ number: 3, relations: ['commented'], updatedAt: '2026-01-02', userComments: [{ updatedAt: '2026-01-03' }] }],
  apiTokens: ['react', 'axios'], topN: 3, metadata,
};
const fingerprint = buildEvidenceFingerprint(evidence);
assert.strictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, apiTokens: ['axios', 'react'], contributionSummary: { ...evidence.contributionSummary, selectedCommitShas: ['a', 'b'] } }));
const cached = { ...metadata, generatedAt: new Date(1), evidenceFingerprint: fingerprint, topN: 3 };
assert.deepStrictEqual(decideEvidenceCache({ cachedMetadata: cached, currentMetadata: metadata, evidenceFingerprint: fingerprint, topN: 3 }), { useCache: true, status: 'exact_hit' });
assert.strictEqual(decideEvidenceCache({ cachedMetadata: cached, currentMetadata: metadata, evidenceFingerprint: buildEvidenceFingerprint({ ...evidence, apiTokens: ['vue'] }), topN: 3 }).status, 'evidence_changed');
assert.strictEqual(decideEvidenceCache({ cachedMetadata: cached, currentMetadata: metadata, evidenceFingerprint: fingerprint, topN: 2 }).status, 'topn_changed');
assert.strictEqual(decideEvidenceCache({ cachedMetadata: cached, currentMetadata: metadata, evidenceFingerprint: fingerprint, refreshAvailable: false }).status, 'refresh_unavailable');
assert.strictEqual(decideEvidenceCache({ cachedMetadata: cached, currentMetadata: metadata, evidenceFingerprint: fingerprint, refreshAvailable: false, allowStaleFallback: true }).status, 'stale_fallback');
assert.strictEqual(compareMetadata({ ...metadata, analysisPipelineVersion: 'dev2vec-analysis-pipeline-v8' }, metadata), 'pipeline_version_mismatch');
assert.strictEqual(compareMetadata({ ...metadata, modelVersion: 'old-model' }, metadata), 'model_version_mismatch');
assert.strictEqual(compareMetadata({ ...metadata, mappingVersion: 'old-mapping' }, metadata), 'pipeline_version_mismatch');
assert.notStrictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, issues: [{ ...evidence.issues[0], updatedAt: '2026-02-01' }] }));
assert.notStrictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, issues: [{ ...evidence.issues[0], userComments: [{ updatedAt: '2026-02-01' }] }] }));
assert.notStrictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, contributionSummary: { ...evidence.contributionSummary, selectedCommitShas: ['different'] } }));
assert.notStrictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, contributionSummary: { ...evidence.contributionSummary, selectedPullRequests: [{ number: 2, updatedAt: '2026-02-01' }] } }));
assert.strictEqual(fingerprint, buildEvidenceFingerprint({ ...evidence, issues: [...evidence.issues, { number: 99, relations: [], updatedAt: '2099-01-01' }] }));

const analysis = { userId: 'u', repositoryId: 'r', modelVersion: output.modelVersion, dev2vec: { ...output, cacheMetadata: cached } };
assert.strictEqual(assertPersistableAnalysis(analysis), analysis);
assert.throws(() => assertPersistableAnalysis({ dev2vec: { ...output, rolePredictions: [], cacheMetadata: cached } }), /not valid/);
assert.strictEqual(shouldPersistVectors({}), true);
assert.strictEqual(shouldPersistVectors({ DEV2VEC_PERSIST_VECTORS: 'false' }), false);
const snapshot = buildSnapshotPayload(analysis);
assert.deepStrictEqual(snapshot.dev2vec.combinedVector, []);
assert.strictEqual(snapshot.dev2vec.cacheMetadata.mappingVersion, metadata.mappingVersion);
const worstCase = { ...analysis, dev2vec: { ...analysis.dev2vec, repoVector: Array(230).fill(0.1), issueVector: Array(150).fill(0.1), apiVector: Array(200).fill(0.1), combinedVector: Array(580).fill(0.1), rolePredictions: Array(3).fill(output.rolePredictions[0]), skillGaps: { frontend: { details: Array(25).fill(output.skillGaps.frontend.details[0]) } } } };
assert(estimateDocumentBytes(worstCase) < 16 * 1024 * 1024);
assert.strictEqual(snapshot.dev2vec.repoDocument, undefined);
assert.strictEqual(snapshot.dev2vec.issueDocument, undefined);
assert.strictEqual(snapshot.dev2vec.apiTokens, undefined);

resetMetrics();
const event = recordInferenceEvent({ requestId: 'req', modelVersion: output.modelVersion, pipelineVersion: metadata.analysisPipelineVersion, mappingVersion: metadata.mappingVersion, cachePolicyVersion: metadata.cachePolicyVersion, cacheStatus: 'exact_hit', inferenceStatus: 'success', repoAvailable: true, issueAvailable: false, apiAvailable: true, repoDocument: 'SECRET', issueDocument: 'SECRET', apiTokens: ['SECRET'], vectors: [1], githubToken: 'SECRET' }, { emit: false });
const serialized = JSON.stringify(event);
for (const secret of ['repoDocument', 'issueDocument', 'apiTokens', 'vectors', 'githubToken', 'SECRET']) assert(!serialized.includes(secret));
assert.strictEqual(event.cacheStatus, 'exact_hit');
assert(getMetricSnapshot()['dev2vec_inference_total:{}'] >= 1);
const errorEvent = buildInferenceEvent({ requestId: 'req', errorCode: 'DEV2VEC_INVALID_OUTPUT', stderr: 'SECRET' });
assert.strictEqual(errorEvent.errorCode, 'DEV2VEC_INVALID_OUTPUT');
assert(!JSON.stringify(errorEvent).includes('SECRET'));

(async () => {
  const status = await getDev2VecStatus();
  assert.strictEqual(status.data.pipelineVersion, 'dev2vec-analysis-pipeline-v12');
  assert(status.data.modelVersion);
  assert(['http_worker', 'process'].includes(status.data.transportMode));
  console.log('PASS: Phase 4 product/cache/persistence/observability alignment');
})().catch((error) => { console.error(error); process.exit(1); });
