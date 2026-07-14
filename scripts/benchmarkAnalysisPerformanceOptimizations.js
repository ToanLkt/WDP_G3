const { execFile, spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const python = process.env.DEV2VEC_PYTHON_BIN || 'python';
const fixture = {
  requestId: 'local-benchmark',
  repoDocument: 'express router controller mongoose schema validation docker jest authentication',
  issueDocument: 'fix api validation database query and integration tests',
  apiTokens: ['express', 'mongoose', 'jsonwebtoken', 'jest'],
  evidenceChannels: { availableChannels: { repo: true, issue: true, api: true }, channelStatus: { repo: 'available', issue: 'available', api: 'available' } },
  topN: 5,
};
const measure = async (fn) => { const started = performance.now(); await fn(); return Math.round(performance.now() - started); };
const waitHealth = async (url) => {
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(`${url}/health`); if (response.ok) return; } catch (_) { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('service startup timeout');
};
const main = async () => {
  const tmp = path.resolve('tmp', 'dev2vec-benchmark.json');
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(fixture));
  const env = { ...process.env, PYTHONHASHSEED: '0' };
  const processMs = [];
  for (let i = 0; i < 3; i += 1) processMs.push(await measure(() => execFileAsync(python, ['ml_service/infer.py', '--input', tmp], { env, maxBuffer: 20 * 1024 * 1024 })));
  const port = 18124;
  const url = `http://127.0.0.1:${port}`;
  const worker = spawn(python, ['ml_service/app.py'], { env: { ...env, DEV2VEC_SERVICE_PORT: String(port) }, stdio: 'ignore', windowsHide: true });
  const serviceMs = [];
  try {
    await waitHealth(url);
    for (let i = 0; i < 3; i += 1) serviceMs.push(await measure(() => fetch(`${url}/infer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fixture) })));
  } finally {
    worker.kill('SIGTERM');
    await fs.unlink(tmp).catch(() => {});
  }
  const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  console.log(JSON.stringify({
    benchmarkType: 'LOCAL_FIXTURE_NO_GITHUB_NO_MONGODB',
    processModeMs: processMs,
    persistentServiceMs: serviceMs,
    processAverageMs: average(processMs),
    persistentServiceAverageMs: average(serviceMs),
    inferenceImprovementPct: Math.round((1 - average(serviceMs) / average(processMs)) * 100),
    unchangedRepository: { mode: 'MOCK_POLICY', githubCallsAfterHeadCheck: 0, pythonCalls: 0 },
    limitations: 'Not Render or production timing; excludes GitHub, MongoDB, network and cold container startup.',
  }, null, 2));
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
