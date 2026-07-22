# Dev2Vec Operations Runbook

## Startup and shutdown

Run `npm start`. The supervisor starts Python, waits up to about 30 seconds for artifact-ready health, then starts Node. With fallback disabled, readiness failure stops the release. SIGTERM/SIGINT stops accepting Node requests, closes HTTP/Mongo, signals both children and enforces a ten-second ceiling.

## Troubleshooting

- Artifact checksum/version/dimension failure: do not replace individual files. Restore the entire known-good artifact directory and rerun `npm run test:dev2vec-artifacts`.
- Worker unavailable: inspect redacted status and latency, verify port/body/timeout/concurrency settings, then run `npm run smoke:dev2vec`. Fallback is a temporary degraded mode.
- Health degraded: check `/live`, then Mongo readiness and worker `/health`. Health never calls GitHub.
- GitHub rate-limited: evidence refresh is unavailable and must not be called an exact cache hit. Retry after the reported reset; do not bypass attribution.
- Cache mismatch: allow lazy rebuild. Manual bulk deletion is normally unnecessary because versions isolate releases.

## Rollback

Rollback application code as one release. v10 and older records remain readable, but version comparison prevents incompatible exact reuse. Roll back artifacts atomically—Doc2Vec models, classifier, encoder, skill files, metadata and manifest together. There is no destructive database migration; additive metadata is ignored by old code and missing metadata triggers rebuild in new code.

## Operational limits and logging

Worker body 10 MiB; HTTP/process timeout 30 seconds; process buffer 10 MiB; concurrency one; repo/issue documents 50k/30k; topN three; Mongo document ceiling 16 MiB. GitHub limits are documented in the evidence contract.

Production debug/observability logs are off by default. When enabled, events contain IDs, status, versions, cache state, timing and counts—not documents, tokens, vectors, code, bodies, stdout/stderr or credentials.
