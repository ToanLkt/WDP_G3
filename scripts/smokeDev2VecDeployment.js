const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { runDev2VecInference } = require('../src/services/dev2vec/dev2vec.service');

const root = path.resolve(__dirname, '..');
const python = process.env.DEV2VEC_PYTHON_BIN || (process.platform === 'win32'
  ? path.join(root, '.venv', 'Scripts', 'python.exe') : 'python');
const port = String(process.env.DEV2VEC_SMOKE_PORT || 18765);
const serviceUrl = `http://127.0.0.1:${port}`;
const input = {
  requestId: 'deployment-smoke', repoDocument: 'backend api controller database',
  issueDocument: 'fix authentication token endpoint', apiTokens: ['express', 'mongodb', 'jsonwebtoken'], topN: 3,
  evidenceChannels: { availableChannels: { repo: true, issue: true, api: true }, channelStatus: { repo: 'available', issue: 'available', api: 'available' } },
};
const waitForHealth = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await axios.get(`${serviceUrl}/health`, { timeout: 1000 }); if (response.data?.status === 'ok') return response.data; } catch (_) { /* bounded retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Smoke worker readiness timed out');
};
const waitForExit = (child, timeoutMs = 10000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Worker did not stop gracefully')), timeoutMs);
  child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
});

(async () => {
  const worker = spawn(python, ['ml_service/app.py'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEV2VEC_SERVICE_HOST: '127.0.0.1', DEV2VEC_SERVICE_PORT: port, DEV2VEC_SERVICE_CONCURRENCY: '1', PYTHONHASHSEED: '0' },
  });
  let stderr = '';
  worker.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const health = await waitForHealth();
    assert.strictEqual(health.artifactVersion, 'dev2vec-demo-v4');
    assert.strictEqual(health.artifactStatus, 'ready');
    const started = Date.now();
    const direct = await axios.post(`${serviceUrl}/infer`, input, { timeout: 30000, maxBodyLength: 10 * 1024 * 1024 });
    assert.strictEqual(direct.status, 200);
    assert.strictEqual(direct.data.success, true);
    assert.strictEqual(direct.data.modelVersion, 'dev2vec-demo-v4');
    assert.deepStrictEqual(direct.data.vectorDims, { repo: 230, issue: 150, api: 200, combined: 580 });
    assert(direct.data.rolePredictions.length >= 1 && direct.data.rolePredictions.length <= 3);
    assert(Date.now() - started < 30000);

    const previousUrl = process.env.DEV2VEC_SERVICE_URL;
    const previousFallback = process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED;
    try {
      process.env.DEV2VEC_SERVICE_URL = serviceUrl;
      assert.strictEqual((await runDev2VecInference(input)).modelVersion, 'dev2vec-demo-v4');
      process.env.DEV2VEC_SERVICE_URL = 'http://127.0.0.1:1';
      process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED = 'true';
      assert.strictEqual((await runDev2VecInference({ ...input, requestId: 'deployment-fallback' })).modelVersion, 'dev2vec-demo-v4');
      assert.strictEqual(fs.existsSync(path.join(root, 'tmp', 'dev2vec-input-deployment-fallback.json')), false);
    } finally {
      if (previousUrl === undefined) delete process.env.DEV2VEC_SERVICE_URL; else process.env.DEV2VEC_SERVICE_URL = previousUrl;
      if (previousFallback === undefined) delete process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED; else process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED = previousFallback;
    }
  } finally {
    if (worker.exitCode === null) worker.kill('SIGTERM');
    await waitForExit(worker).catch((error) => { worker.kill('SIGKILL'); throw error; });
  }
  assert.strictEqual(stderr.includes('GITHUB_TOKEN'), false);
  console.log('PASS: Dev2Vec worker health, HTTP inference, Node HTTP mode, process fallback, cleanup and SIGTERM');
})().catch((error) => { console.error(error); process.exit(1); });
