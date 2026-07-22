#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
export DEV2VEC_PYTHON_BIN="${DEV2VEC_PYTHON_BIN:-python}"
npm run test:dev2vec-artifacts
npm run smoke:dev2vec
