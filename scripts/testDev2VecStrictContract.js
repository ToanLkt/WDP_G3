const assert = require('assert');
const axios = require('axios');

const {
  normalizeDev2VecInput,
  runDev2VecInference,
  validateDev2VecOutput,
} = require('../src/services/dev2vec/dev2vec.service');
const { buildDev2VecInputFromRepositoryAnalysis } = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const { buildDev2VecAnalysisPayload } = require('../src/services/analysis.service');

const dims = { repo: 230, issue: 150, api: 200, combined: 580 };
const zero = (length) => Array(length).fill(0);
const nonZero = (length, offset) => Array.from({ length }, (_, index) => (index + offset) / 10000);

const skillGap = (skillName = 'REST API') => ({
  matchedSkillNames: [skillName],
  weakSkillNames: [],
  missingSkillNames: [],
  recommendedNextSkills: [],
  details: [{
    skillName,
    canonicalSkillName: skillName,
    similarity: 0.8,
    status: 'matched',
  }],
});

const validOutput = () => {
  const repoVector = nonZero(dims.repo, 1);
  const issueVector = zero(dims.issue);
  const apiVector = nonZero(dims.api, 401);
  return {
    success: true,
    modelVersion: 'dev2vec-demo-v4',
    vectorDims: { ...dims },
    vectors: {
      repoVector,
      issueVector,
      apiVector,
      combinedVector: [...repoVector, ...issueVector, ...apiVector],
    },
    rolePredictions: [
      { roleId: 'backend', roleName: 'Backend Developer', modelLabel: 'Backend', probability: 0.7, rank: 1 },
      { roleId: 'frontend', roleName: 'Frontend Developer', modelLabel: 'Frontend', probability: 0.2, rank: 2 },
    ],
    skillGaps: { backend: skillGap(), frontend: skillGap('React UI') },
    vectorSources: { repos: true, issues: false, apis: true },
    sourceStats: { repoTextLength: 100, issueTextLength: 0, apiTokenCount: 4 },
  };
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const expectContractFailure = (mutate, field) => {
  const output = clone(validOutput());
  mutate(output);
  assert.throws(
    () => validateDev2VecOutput(output),
    (error) => error.errorCode === 'DEV2VEC_OUTPUT_CONTRACT_INVALID' && error.message.includes(field),
  );
};

assert.strictEqual(validateDev2VecOutput(validOutput()).success, true);
expectContractFailure((output) => { output.vectorDims.repo = 229; }, 'vectorDims.repo');
expectContractFailure((output) => { output.vectors.repoVector.pop(); }, 'vectors.repoVector');
expectContractFailure((output) => { output.vectors.repoVector[0] = null; }, 'vectors.repoVector');
expectContractFailure((output) => { output.vectors.apiVector[0] = Infinity; }, 'vectors.apiVector');
expectContractFailure((output) => { output.vectors.combinedVector[0] += 1; }, 'vectors.combinedVector');
expectContractFailure((output) => { output.rolePredictions = []; }, 'rolePredictions');
expectContractFailure((output) => {
  output.rolePredictions.push(
    { roleId: 'mobile', roleName: 'Mobile Developer', modelLabel: 'Mobile', probability: 0.1, rank: 3 },
    { roleId: 'devops', roleName: 'DevOps Engineer', modelLabel: 'DevOps', probability: 0.05, rank: 4 },
  );
  output.skillGaps.mobile = skillGap('Mobile UI');
  output.skillGaps.devops = skillGap('Docker');
}, 'rolePredictions');
expectContractFailure((output) => { output.rolePredictions[0].roleId = 'unknown'; }, 'roleId');
expectContractFailure((output) => { output.rolePredictions[1].roleId = 'backend'; }, 'roleId');
expectContractFailure((output) => { output.rolePredictions[1].rank = 3; }, 'rank');
expectContractFailure((output) => { output.rolePredictions[0].probability = 1.1; }, 'probability');
expectContractFailure((output) => { delete output.skillGaps.backend; }, 'skillGaps.backend');
expectContractFailure((output) => { output.skillGaps.backend.details[0].status = 'present'; }, 'status');
expectContractFailure((output) => {
  output.vectorSources.issues = false;
  output.vectors.issueVector[0] = 0.2;
  output.vectors.combinedVector[dims.repo] = 0.2;
}, 'vectors.issues');

assert.strictEqual(normalizeDev2VecInput({ topN: 0 }).topN, 1);
[4, 5, 20].forEach((topN) => assert.strictEqual(normalizeDev2VecInput({ topN }).topN, 3));
[0, 4, 5, 20].forEach((topN, index) => {
  const expected = index === 0 ? 1 : 3;
  assert.strictEqual(buildDev2VecInputFromRepositoryAnalysis({ topN }).topN, expected);
});

const output = validOutput();
const payload = buildDev2VecAnalysisPayload({
  repository: { githubRepoId: 1, name: 'phase-one', fullName: 'example/phase-one', language: 'JavaScript' },
  packageRecord: { packages: [], frameworks: [], languages: [], configs: [], packageFiles: [] },
  commits: [],
  contributionScope: { totalRepoCommits: 0 },
  githubAccount: { username: 'example' },
  dev2vecInput: {
    requestId: 'phase-one-primary-role',
    apiTokens: [],
    sourceStats: {
      sourceFileCount: 3,
      apiTokenCount: 0,
      userContributionFileCount: 3,
      userContributionFrontendFileCount: 3,
      userContributionBackendFileCount: 0,
      packageFileCount: 0,
    },
    repoFeatureEvidence: { Frontend: { detected: true, evidence: [] } },
    evidencePreview: { docs: {} },
    evidenceChannels: {},
  },
  dev2vecOutput: output,
  issueEvidence: { issues: [], metadata: {} },
});

assert.strictEqual(payload.careerDirection, 'Backend Developer');
assert.strictEqual(payload.summary.careerDirection, 'Backend Developer');
assert.strictEqual(payload.dev2vec.rolePredictions[0].roleId, 'backend');
assert.strictEqual(payload.rawAnalysis.explanatoryRoleContext.roleId, 'frontend');
assert.notStrictEqual(payload.rawAnalysis.explanatoryRoleContext.roleId, payload.dev2vec.rolePredictions[0].roleId);
assert.strictEqual(payload.skillVector[0].canonicalSkillName, 'REST API');

const verifyMalformedWorkerDoesNotFallback = async () => {
  const originalPost = axios.post;
  const originalUrl = process.env.DEV2VEC_SERVICE_URL;
  const originalFallback = process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED;
  process.env.DEV2VEC_SERVICE_URL = 'http://dev2vec-contract.invalid';
  process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED = 'true';
  axios.post = async () => {
    const malformed = validOutput();
    malformed.vectorDims.repo = 229;
    return { data: malformed };
  };
  try {
    await assert.rejects(
      () => runDev2VecInference({ topN: 3 }),
      (error) => error.errorCode === 'DEV2VEC_OUTPUT_CONTRACT_INVALID'
        && error.message.includes('vectorDims.repo'),
    );
  } finally {
    axios.post = originalPost;
    if (originalUrl === undefined) delete process.env.DEV2VEC_SERVICE_URL;
    else process.env.DEV2VEC_SERVICE_URL = originalUrl;
    if (originalFallback === undefined) delete process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED;
    else process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED = originalFallback;
  }
};

verifyMalformedWorkerDoesNotFallback()
  .then(() => console.log('PASS: Dev2Vec strict contract and classifier-primary role regression'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
