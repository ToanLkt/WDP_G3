const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const commands = [
  ['npm', ['run', 'test:dev2vec-contract']],
  ['npm', ['run', 'test:dev2vec-input']],
  ['npm', ['run', 'test:dev2vec-evidence-taxonomy']],
  ['npm', ['run', 'test:dev2vec-github-evidence']],
  ['npm', ['run', 'test:dev2vec-input-alignment']],
  ['npm', ['run', 'test:dev2vec-product-alignment']],
  ['npm', ['run', 'test:dev2vec-version-safe-consumers']],
  ['npm', ['run', 'test:dev2vec-role-roadmap-chat']],
  ['npm', ['run', 'test:dev2vec-phase5']],
  ['node', ['scripts/testDev2VecChannelAvailability.js']],
  ['node', ['scripts/testDev2VecRoleMapper.js']],
  ['node', ['scripts/testGithubIssueEvidencePipeline.js']],
  ['node', ['scripts/testRepositoryUserContributionEvidence.js']],
  ['node', ['scripts/testSourceUsageEvidencePipeline.js']],
  ['npm', ['run', 'test:backend-analysis-pipeline']],
  ['npm', ['run', 'test:dev2vec-artifacts']],
  ['npm', ['run', 'smoke:dev2vec']],
  [process.env.DEV2VEC_PYTHON_BIN || (process.platform === 'win32' ? path.join(root, '.venv', 'Scripts', 'python.exe') : 'python'), ['ml_service/validate_contract.py']],
  [process.env.DEV2VEC_PYTHON_BIN || (process.platform === 'win32' ? path.join(root, '.venv', 'Scripts', 'python.exe') : 'python'), ['-m', 'py_compile', 'ml_service/artifact_integrity.py', 'ml_service/tests/export_extractor_fixture_result.py']],
  ['git', ['diff', '--check']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: process.env, shell: process.platform === 'win32' && command === 'npm' });
  if (result.status !== 0) {
    if (result.error) console.error('Release command failed to start:', result.error.message);
    process.exit(result.status || 1);
  }
}
const changed = spawnSync('git', ['diff', '--name-only', '--', '*.js'], { cwd: root, encoding: 'utf8' }).stdout || '';
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', '*.js'], { cwd: root, encoding: 'utf8' }).stdout || '';
for (const file of `${changed}\n${untracked}`.split(/\r?\n/).filter(Boolean)) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('PASS: Dev2Vec release gate');
