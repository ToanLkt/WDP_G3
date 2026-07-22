# Dev2Vec Integration — Final Contract

Production architecture is Node API → persistent Python HTTP worker (`GET /health`, `POST /infer`). When explicitly enabled, Node may fall back to `execFile(python, infer.py --input <temp>)` on transport failure. Malformed or contract-invalid HTTP success never falls back.

Current versions are model `dev2vec-demo-v4`, pipeline `dev2vec-analysis-pipeline-v10`, repo document v3, issue document v3 and API evidence v3. Python output is strictly validated before mapping. Prediction index zero is primary, `matchScore` is probability ×100, and Python skill statuses/recommendations remain authoritative.

Cache identity includes model/pipeline/builder/document/mapping/cache versions, topN and retained-evidence SHA-256. Persistence occurs only after validation and mapping. Snapshots omit full vectors. Public FE fields and nesting remain unchanged; deployment/health metadata is additive.

See [Evidence Contract](DEV2VEC_EVIDENCE_CONTRACT.md), [Deployment](DEV2VEC_DEPLOYMENT.md), and [Operations](DEV2VEC_OPERATIONS_RUNBOOK.md).
