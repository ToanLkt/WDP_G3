$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
if (-not (Test-Path '.\.venv\Scripts\python.exe')) { throw 'Create .venv with py -3.12 -m venv .venv first.' }
$env:DEV2VEC_PYTHON_BIN = (Resolve-Path '.\.venv\Scripts\python.exe').Path
npm run test:dev2vec-artifacts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run smoke:dev2vec
exit $LASTEXITCODE
