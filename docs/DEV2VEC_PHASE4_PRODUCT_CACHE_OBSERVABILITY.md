# Dev2Vec Phase 4 — Product, Cache, Persistence and Observability

## 1. Summary

Previously, role cards already used classifier probabilities, but the analysis skill vector could reclassify Python skill statuses through Node thresholds. Cache reuse depended primarily on repository HEAD and could precede issue/PR/comment refresh. Persistence retained full issue/PR objects, and observability was spread across debug logs.

Phase 4 makes rank-one Python prediction and Python skill-gap output authoritative, moves exact-cache decisions after retained-evidence refresh, persists versioned fingerprints and bounded evidence summaries, and adds redacted structured inference diagnostics.

## 2. Files Changed

- `dev2vecRoleMapper.service.js`: direct prediction order and Python skill statuses/recommendations.
- `dev2vecCachePolicy.service.js`: canonical SHA-256 evidence fingerprint and normalized cache states.
- `dev2vecPipelineMetadata.service.js`: pipeline v9, mapping and cache-policy versions.
- `analysis.service.js`: refreshed-evidence cache decision, safe persistence, vector policy and inference event.
- `dev2vecPersistence.service.js`: persistence validation, vector policy and size estimator.
- `dev2vecObservability.service.js`: safe event whitelist and internal counters.
- `snapshot.service.js`: validates source analysis before snapshot creation.
- `dev2vec.service.js`: removes stdout/stderr content previews.
- `dev2vecStatus.service.js` and `app.js`: safe model/pipeline/transport health metadata.
- `testDev2VecProductAlignmentPhase4.js`: Phase 4 regression suite.

## 3. Public API Compatibility

The existing role and skill-gap response names, types and nesting remain unchanged, including `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`, `matchedSkillNames`, `weakSkillNames`, `missingSkillNames`, `recommendedNextSkills`, `roleMatch` and `skillGapSummary`. Optional metadata remains additive. Empty list fields remain arrays.

## 4. Role Mapping Contract

Prediction order is preserved exactly and rank one is primary. `matchScore` is `Math.round(probability * 10000) / 100`. Match levels are presentation categories only and never reorder, filter, or modify probability. Repository context and cached career direction cannot override the primary role.

## 5. Skill Mapping Contract

`skillGaps[roleId]` is the source of truth. Python `matched`, `weak`, and `missing` classifications are retained in `dev2vecStatus`; legacy `level` is presentation-only (`strong`, `weak`, `missing`). Similarity is converted to a percentage for display without changing status. `recommendedNextSkills` retains Python order.

## 6. Removed Legacy Product Logic

The active model-backed analysis no longer constructs catalog-wide skill states using Node similarity thresholds. Hard-coded missing/weak ordering does not replace Python recommendations. Effective-role diagnostics may remain explanatory but do not replace classifier rank one.

## 7. Cache Contract

Pipeline v9 cache identity includes model, pipeline, evidence builder, repository/API/issue document, mapping and cache-policy versions, `topN`, and a SHA-256 retained-evidence fingerprint. The canonical fingerprint includes gate acceptance, verified changed lines, selected commit SHAs, selected PR timestamps, retained paths, relevant issue timestamps, user-comment timestamps and final sorted API tokens. Arrays are normalized deterministically.

Active analysis refreshes retained issue/PR/comment evidence before exact comparison. States include `exact_hit`, `version_mismatch`, `model_changed`, `topn_changed`, `evidence_changed`, `refresh_unavailable`, `stale_fallback`, `cache_disabled`, and `cache_missing`. Refresh failure is never labeled exact.

## 8. Persistence Contract

The persisted Dev2Vec source of truth contains validated role predictions, skill gaps, vector sources, final source stats, model/pipeline/mapping/cache versions, fingerprint and bounded contribution/evidence counts. Full repo/issue documents, API-token arrays, source files, issue bodies and comment bodies are not persisted in Dev2Vec cache metadata.

Full vectors remain enabled by default for backward compatibility. `DEV2VEC_PERSIST_VECTORS=false` disables them for new live results. Snapshots intentionally omit full vectors. Persistence validation runs before `AnalysisResult.create`; snapshot creation validates the saved analysis. The worst-case regression fixture remains well below MongoDB's 16 MiB document limit.

## 9. Observability Contract

A whitelisted structured event records request/repository/user IDs, versions, transport/cache/inference status, timings, final channel availability and lengths, bounded evidence counts, top role/probability and fingerprint prefix. Internal counters cover inference, failure, cache and channel presence. Emission is enabled with `DEV2VEC_OBSERVABILITY_LOG=true`.

Events never accept full documents, token lists, vectors, source code, bodies, comments or credentials. Python parse errors retain byte counts and error codes, not stdout/stderr contents.

## 10. Health/Status Behavior

Health/status includes enabled state, worker reachability, model version, pipeline version, mapping/cache versions, artifact readiness and transport mode. It does not call GitHub or expose tokens, secret environment values or configured filesystem paths.

## 11. Version Impact

- Pipeline: `dev2vec-analysis-pipeline-v8` → `dev2vec-analysis-pipeline-v9`.
- Mapping: `dev2vec-product-mapping-v1`.
- Cache policy: `dev2vec-cache-policy-v1-evidence-fingerprint`.
- Python model and Phase 3 document/API evidence versions are unchanged.

All v8 records are incompatible with v9 and rebuild rather than masquerading as fresh results.

## 12. Tests

`npm run test:dev2vec-product-alignment` covers role/skill mapping, old FE fields, fingerprint order stability and invalidation, cache states, persistence validation/vector policy/size, snapshot policy, event redaction/counters, and health metadata. Phase 1–3 suites and Python contract validation remain mandatory regression coverage.

## 13. Known Limitations

No webhook or scheduled GitHub freshness monitor is added. Exact hits require the active request to refresh evidence metadata, which prioritizes correctness over minimum API work. The internal counters are process-local; a future metrics backend can consume the same event semantics. Existing v8 records are rebuilt lazily rather than bulk-migrated.

## 14. Checklist

- [x] FE field names, types and nesting preserved
- [x] matchScore equals probability × 100
- [x] classifier rank one remains primary
- [x] skill status and recommendations come from Python
- [x] no Node reclassification of model skill status
- [x] cache includes model/pipeline/builder/mapping/topN/fingerprint
- [x] issue/PR/user-comment changes invalidate cache
- [x] snapshot/live source metadata stays consistent
- [x] malformed result never persists
- [x] structured redacted logs and counters added
- [x] sensitive model/evidence content is not logged
- [x] Python model/artifacts unchanged
