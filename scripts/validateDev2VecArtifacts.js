const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const python = process.env.DEV2VEC_PYTHON_BIN || (process.platform === 'win32'
  ? path.join(root, '.venv', 'Scripts', 'python.exe') : 'python');
const script = [
  'from pathlib import Path',
  'from ml_service.artifact_integrity import validate_artifact_set',
  `print(validate_artifact_set(Path(${JSON.stringify(process.env.DEV2VEC_ARTIFACTS_DIR || 'ml_service/artifacts')})))`,
].join('; ');
execFileSync(python, ['-c', script], { cwd: root, stdio: 'inherit', windowsHide: true });
console.log('PASS: Dev2Vec atomic artifact manifest, checksums, version and dimensions');
