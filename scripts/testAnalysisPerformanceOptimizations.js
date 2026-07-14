const assert = require('assert');
const { spawn, execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const {
  getCacheMetadata,
  shouldUseExactAnalysisCache,
  shouldUseCachedDev2Vec,
} = require('../src/services/dev2vec/dev2vecCachePolicy.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const { decideIncrementalAnalysis } = require('../src/services/analysis/analysisIncrementalPolicy.service');
const { runWithConcurrency } = require('../src/services/github/github.package.service');
const { runDev2VecInference } = require('../src/services/dev2vec/dev2vec.service');

const execFileAsync = promisify(execFile);
const python = process.env.DEV2VEC_PYTHON_BIN || 'python';
const fixture = {
  requestId: 'performance-regression-fixture',
  repoDocument: 'express router controller mongoose schema validation docker jest authentication',
  issueDocument: 'fix api validation and database query tests',
  apiTokens: ['express', 'mongoose', 'jsonwebtoken', 'jest'],
  evidenceChannels: {
    availableChannels: { repo: true, issue: true, api: true },
    channelStatus: { repo: 'available', issue: 'available', api: 'available' },
  },
  topN: 5,
};

const compare = (left, right, trail = 'output') => {
  if (typeof left === 'number' && typeof right === 'number') {
    assert(Math.abs(left - right) <= 1e-6, `${trail}: float mismatch`);
    return;
  }
  assert.strictEqual(Array.isArray(left), Array.isArray(right), `${trail}: array mismatch`);
  if (Array.isArray(left)) {
    assert.strictEqual(left.length, right.length, `${trail}: length mismatch`);
    left.forEach((value, index) => compare(value, right[index], `${trail}[${index}]`));
    return;
  }
  if (left && typeof left === 'object') {
    assert.deepStrictEqual(Object.keys(left).sort(), Object.keys(right || {}).sort(), `${trail}: fields mismatch`);
    Object.keys(left).forEach((key) => compare(left[key], right[key], `${trail}.${key}`));
    return;
  }
  assert.strictEqual(left, right, `${trail}: value mismatch`);
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
};

const waitForHealth = async (url) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const result = await requestJson(`${url}/health`);
      if (result.status === 200) return result.body;
    } catch (_) { /* service is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Persistent service did not become healthy');
};

const main = async () => {
  const metadata = getCurrentDev2VecPipelineMetadata({ generatedAt: new Date('2026-01-01') });
  const fingerprint = {
    defaultBranch: 'main', latestCommitSha: 'head-2',
    pushedAt: new Date('2026-01-01'), updatedAtGithub: new Date('2026-01-01'),
  };
  const analysis = {
    dev2vec: { rolePredictions: [{}], skillGaps: {}, cacheMetadata: { ...metadata, repositoryFingerprint: fingerprint } },
  };
  const repository = { defaultBranch: 'main', defaultBranchSha: 'head-2', pushedAt: fingerprint.pushedAt, updatedAtGithub: fingerprint.updatedAtGithub };
  assert.strictEqual(getCacheMetadata(null), null);
  assert.deepStrictEqual(shouldUseCachedDev2Vec({ analysis: null, repository, currentMetadata: metadata }), { useCache: false, reason: 'cache_missing' });
  assert.deepStrictEqual(shouldUseExactAnalysisCache({ analysis: null, repository, currentHeadSha: 'head-2' }), { useCache: false, reason: 'cache_missing' });
  assert.strictEqual(shouldUseCachedDev2Vec({ analysis: { dev2vec: null }, repository, currentMetadata: metadata }).reason, 'cache_incomplete');
  assert.strictEqual(
    shouldUseCachedDev2Vec({
      analysis: { dev2vec: { rolePredictions: [{}], skillGaps: {} } },
      repository,
      currentMetadata: metadata,
    }).reason,
    'legacy_cache'
  );
  assert.strictEqual(shouldUseExactAnalysisCache({ analysis, repository, currentHeadSha: 'head-2' }).useCache, true);
  assert.strictEqual(shouldUseExactAnalysisCache({ analysis, repository, currentHeadSha: 'head-2', forceRegenerate: true }).useCache, false);
  assert.strictEqual(shouldUseExactAnalysisCache({ analysis, repository: { ...repository, pushedAt: null }, currentHeadSha: 'head-2' }).useCache, false);

  const commits = [{ sha: 'head-3' }, { sha: 'head-2' }, { sha: 'head-1' }];
  const baseIncremental = { enabled: true, latestAnalysis: analysis, currentHeadSha: 'head-3', previousFingerprint: fingerprint, currentBranch: 'main', metadataCompatible: true, commits };
  assert.strictEqual(decideIncrementalAnalysis({ enabled: true, latestAnalysis: null, currentHeadSha: 'head-3', commits }).reason, 'first_analysis');
  assert.strictEqual(decideIncrementalAnalysis({ ...baseIncremental, latestAnalysis: null, forceRegenerate: true }).reason, 'forced_full_analysis');
  assert.deepStrictEqual(decideIncrementalAnalysis(baseIncremental).newCommitShas, ['head-3']);
  assert.strictEqual(decideIncrementalAnalysis({ ...baseIncremental, currentBranch: 'develop' }).reason, 'branch_changed');
  assert.strictEqual(decideIncrementalAnalysis({ ...baseIncremental, commits: [{ sha: 'head-3' }] }).reason, 'history_rewrite_or_known_head_unreachable');
  assert.strictEqual(decideIncrementalAnalysis({ ...baseIncremental, metadataCompatible: false }).reason, 'version_changed');
  assert.strictEqual(decideIncrementalAnalysis({ ...baseIncremental, forceRegenerate: true }).reason, 'forced_full_analysis');

  const paths = ['package.json', 'README.md', 'package.json'];
  const unique = [...new Set(paths.map((value) => value.toLowerCase()))];
  let active = 0;
  let maxActive = 0;
  await runWithConcurrency(unique, 2, async () => {
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1;
  });
  assert.strictEqual(unique.length, 2);
  assert(maxActive <= 2);

  const tmp = path.resolve('tmp', 'dev2vec-equality-fixture.json');
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(fixture));
  const deterministicEnv = { ...process.env, PYTHONHASHSEED: '0' };
  const oldResult = await execFileAsync(python, ['ml_service/infer.py', '--input', tmp], { maxBuffer: 20 * 1024 * 1024, env: deterministicEnv });
  const oldOutput = JSON.parse(oldResult.stdout);

  const port = 18123;
  const url = `http://127.0.0.1:${port}`;
  const worker = spawn(python, ['ml_service/app.py'], {
    env: { ...deterministicEnv, DEV2VEC_SERVICE_PORT: String(port), DEV2VEC_SERVICE_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const workerExited = new Promise((resolve) => worker.once('exit', resolve));
  try {
    const health = await waitForHealth(url);
    assert.strictEqual(health.artifactLoadCount, 1);
    assert.strictEqual(health.vectorDimension, 580);
    const first = await requestJson(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) });
    const second = await requestJson(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) });
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    compare(oldOutput, first.body);
    compare(first.body, second.body);
    const concurrent = await Promise.all([
      requestJson(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) }),
      requestJson(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) }),
    ]);
    concurrent.forEach((result) => { assert.strictEqual(result.status, 200); compare(first.body, result.body); });
    const healthAfter = await requestJson(`${url}/health`);
    assert.strictEqual(healthAfter.body.artifactLoadCount, 1);
    const malformed = await fetch(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.strictEqual(malformed.status, 400);
    process.env.DEV2VEC_SERVICE_URL = url;
    process.env.DEV2VEC_SERVICE_TIMEOUT_MS = '5000';
    const clientServiceOutput = await runDev2VecInference(fixture);
    compare(oldOutput, clientServiceOutput);
  } finally {
    worker.kill('SIGTERM');
    await Promise.race([workerExited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await fs.unlink(tmp).catch(() => {});
  }
  process.env.DEV2VEC_SERVICE_URL = 'http://127.0.0.1:18125';
  process.env.DEV2VEC_SERVICE_TIMEOUT_MS = '100';
  process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED = 'true';
  const fallbackOutput = await runDev2VecInference(fixture, { pythonBin: python });
  compare(oldOutput, fallbackOutput);
  delete process.env.DEV2VEC_SERVICE_URL;
  console.log('PASS: analysis cache, incremental policy, bounded fetch, Python preload and output equality');
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
