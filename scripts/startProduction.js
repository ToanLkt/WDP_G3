const { spawn } = require('child_process');

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
  setTimeout(() => process.exit(exitCode), 2000).unref();
};

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
start(pythonBin, ['ml_service/app.py'], 'dev2vec-service', {
  ...process.env,
  PYTHONHASHSEED: process.env.PYTHONHASHSEED || '0',
  DEV2VEC_SERVICE_HOST: '127.0.0.1',
  DEV2VEC_SERVICE_PORT: servicePort,
});
start(process.execPath, ['server.js'], 'node-api');
