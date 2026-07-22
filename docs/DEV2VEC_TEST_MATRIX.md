# Dev2Vec Test Matrix

| Area | Command | Real vs mocked |
| --- | --- | --- |
| Strict output/mapper | `npm run test:dev2vec-contract` | fixture output |
| Input/evidence Phase 2–4 | `npm run test:dev2vec-input-alignment`, `test:dev2vec-product-alignment` | fixture GitHub evidence |
| Node/Python parity | `npm run test:dev2vec-training-parity` | real Python extractors, shared fixture |
| Golden/missing channels | `npm run test:dev2vec-full-regression` | real artifacts/infer.py; mocked HTTP failure cases |
| Artifact integrity | `npm run test:dev2vec-artifacts` | real files/checksums |
| Deployment smoke | `npm run smoke:dev2vec` | real Python worker, HTTP and process fallback |
| Release gate | `npm run verify:dev2vec-release` | aggregate, no production GitHub |

Golden fixtures store role order/probability tolerance, skill arrays, sources and stats—never full vectors. Mongo persistence is contract-tested; no Mongo daemon or production GitHub API is required. See [Phase 5](DEV2VEC_PHASE5_TRAINING_PARITY_FULL_REGRESSION.md).
