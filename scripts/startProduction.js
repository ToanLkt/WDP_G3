const { spawn } = require('child_process');
const http = require('http');

const pythonBin = process.env.DEV2VEC_PYTHON_BIN || 'python';
const servicePort = process.env.DEV2VEC_SERVICE_PORT || '8001';
process.env.DEV2VEC_SERVICE_URL = process.env.DEV2VEC_SERVICE_URL || `http://127.0.0.1:${servicePort}`;

const children = [];
let shuttingDown = false;
const start = (command, args, name, env = process.env) => {
  const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[supervisor] ${name} exited`, { code, signal });
    shutdown(code || 1);
  });
  return child;
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
const waitForWorker = (attempts = 60) => new Promise((resolve, reject) => {
  let remaining = attempts;
  const probe = () => {
    const request = http.get(`${process.env.DEV2VEC_SERVICE_URL}/health`, { timeout: 1000 }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (response.statusCode === 200 && payload.status === 'ok' && payload.artifactStatus === 'ready') return resolve();
        } catch (_) { /* retry bounded below */ }
        if (--remaining > 0) return setTimeout(probe, 500);
        reject(new Error('Dev2Vec worker readiness timed out'));
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => {
      if (--remaining > 0) return setTimeout(probe, 500);
      reject(new Error('Dev2Vec worker readiness unavailable'));
    });
  };
  probe();
});

(async () => {
  start(pythonBin, ['ml_service/app.py'], 'dev2vec-service', {
    ...process.env,
    PYTHONHASHSEED: process.env.PYTHONHASHSEED || '0',
    DEV2VEC_SERVICE_HOST: '127.0.0.1',
    DEV2VEC_SERVICE_PORT: servicePort,
  });
  try {
    await waitForWorker();
    console.log('[supervisor] Dev2Vec worker ready');
  } catch (error) {
    if (!['true', '1'].includes(String(process.env.DEV2VEC_SERVICE_FALLBACK_ENABLED || 'true').toLowerCase())) return shutdown(1);
    console.warn('[supervisor] worker unavailable; Node will use configured process fallback');
  }
  start(process.execPath, ['server.js'], 'node-api');
})().catch(() => shutdown(1));
