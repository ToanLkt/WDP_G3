# Dev2Vec Remediation Batch 1 — Version-safe Consumers

## 1. Summary

Batch 1 centralizes the definition of a current Dev2Vec record and applies it to analysis reads, current context, snapshots, dashboard, admin analysis/dashboard, AI feedback and role catalog metadata. Timestamp order is now evaluated only inside the compatible generation. Historical snapshots remain readable but cannot silently become current or participate in a cross-generation comparison.

The model and artifacts remain `dev2vec-demo-v4`. The consumer change invalidates old “current/latest” cache semantics, so the analysis pipeline is bumped from v10 to `dev2vec-analysis-pipeline-v11` and adds `dev2vec-consumer-compatibility-v1`. Repository, issue and API evidence document versions are unchanged.

## 2. Files changed

- Compatibility/versioning: `src/services/dev2vec/dev2vecCompatibility.service.js`, `dev2vecPipelineMetadata.service.js`, `dev2vecCachePolicy.service.js`.
- Consumers: `analysis.service.js`, `analysisSource.service.js`, `currentContext.service.js`, `snapshot.service.js`, `dashboard.service.js`, `admin.service.js`, `aiFeedback.service.js`.
- Catalog: `src/constants/dev2vecCatalog.js`.
- Tests/scripts: `scripts/testDev2VecVersionSafeConsumersBatch1.js`, affected version/context regression assertions, `package.json`.
- Documentation: this file.

## 3. Compatibility contract

`dev2vecCompatibility.service.js` is the single source for:

- current version projection and persisted metadata extraction;
- pure analysis/snapshot compatibility checks;
- compatible Mongo query builders;
- latest compatible analysis/snapshot selectors;
- snapshot generation comparison;
- additive compatibility response metadata.

A current record must have `analysisScope.type=user_contribution` and exact current values for model, pipeline, repository document, issue document, API evidence, evidence builder, mapping and cache-policy versions. Missing metadata is incompatible rather than implicitly trusted.

## 4. Analysis read behavior

`GET /api/analysis/results/:repoId` retains repository ownership and the existing `analysis` field. It now selects only a compatible record and adds `analysisStatus`, `reason` and `compatibility`. No compatible row yields `analysis_required`; existing old history is distinguished as `incompatible_analysis_history`.

`GET /api/analysis/me` groups history by repository and chooses the newest compatible row inside each group. An incompatible newer timestamp cannot mask an older compatible record. A repository with only old history remains in the array as a typed analysis-required entry. Existing compatible analysis DTO fields are unchanged; version fields are additive.

## 5. Snapshot version response

Snapshot history and detail keep all existing fields and add:

- `modelVersion`, `pipelineVersion`;
- repository/issue/API evidence document versions;
- `isCurrentVersion`, `isCompatible`, `isComparableWithCurrent`.

History/detail still allow an owner to inspect old snapshots. Old snapshots are explicitly marked incompatible.

## 6. Snapshot comparison rules

Explicit comparison retains user and same-repository checks. Before any delta is built it requires equal model, pipeline, repository document, issue document, API evidence, builder, mapping and cache-policy versions, plus contribution scope. Mismatch returns HTTP 409 with error code/status `incompatible_snapshot_versions` and left/right version metadata in the existing `errors` envelope.

Repository progress comparison queries only current-compatible snapshots. Fewer than two yields `insufficient_compatible_snapshots`; otherwise response adds `comparisonStatus=comparable` and `comparisonVersion`. It never falls back to v8/v9/v10 versus v11 deltas.

## 7. Dashboard migration

Before Batch 1, dashboard used legacy `AnalysisSnapshot`, legacy `careerDirection`, legacy strengths/weaknesses and a roadmap's embedded progress value.

After Batch 1 it uses:

- latest compatible `AnalysisResult` and snapshot;
- classifier rank 1 for `suggestedCareerPath` and Python order for optional `topRoles`;
- Python matched/weak/missing/recommended skill-gap fields;
- active, non-deleted roadmap and `RoadmapProgress`;
- feedback linked to the current analysis only.

Existing keys/nesting remain. `dev2vecStatus`, model/pipeline version, top roles and current snapshot/feedback indicators are additive.

## 8. Admin migration

Admin analysis list/detail now query `AnalysisResult`, not legacy `AnalysisSnapshot`. Responses label compatibility and show safe model/pipeline, role/gap, vector-source and source-stat metadata. Raw analysis, raw vectors, documents, API token arrays and evidence bodies are not exposed by the admin mapper.

Admin dashboard preserves its old groups and adds compatible/incompatible analysis and current/legacy snapshot counts. Legacy `AnalysisSnapshot` is used only for the legacy count, never as the authoritative current analysis source.

## 9. AI feedback current-context behavior

Feedback generation resolves only a compatible `AnalysisResult`; `currentContext.service.js` no longer imports or falls back to legacy `AnalysisSnapshot`. Missing/incompatible history produces a typed analysis-required conflict before Gemini is invoked.

New feedback persists model, pipeline, document/evidence versions and evidence fingerprint with its analysis/snapshot provenance. Repository detail, `/me`, and admin feedback views use one stale evaluator. Stale reasons cover missing current analysis, changed analysis ID, version change, evidence fingerprint change and incompatible/missing source snapshot. GET never regenerates feedback.

## 10. Role catalog fix

The role catalog no longer hard-codes `dev2vec-demo-v1`. Its existing `modelVersion` field now obtains `dev2vec-demo-v4` from central runtime pipeline metadata.

## 11. API compatibility

No named role/skill field was renamed or retyped. Existing dashboard, snapshot, admin and feedback fields/nesting remain. New status/version/provenance fields are optional and additive. Typed conflicts use the existing error envelope and place structured details in `errors`.

## 12. Tests

`npm run test:dev2vec-version-safe-consumers` contains 40 Batch 1 checks covering current/old metadata, selection policy, analysis typed states, snapshot response/comparison, dashboard source, admin redaction/migration, feedback generation/staleness and catalog v4 metadata.

The Phase 2–5 assertions that intentionally hard-coded v10 were advanced to v11. The chat context-pinning regression now asserts absence of the forbidden legacy current-context fallback; AI chat's broader context behavior itself is not changed in this batch.

Executed result: the 40-check Batch 1 suite, current-context harness, end-to-end flow, roadmap skill-gap, learning canonicalization and the full `verify:dev2vec-release` gate all passed. The release gate now includes the Batch 1 suite and transitively covers contract/input/evidence, Phase 2–5 parity/regression, backend pipeline, artifact integrity and local deployment smoke checks.

## 13. Version impact

- Model/artifacts: unchanged, `dev2vec-demo-v4`.
- Pipeline: `dev2vec-analysis-pipeline-v10` -> `dev2vec-analysis-pipeline-v11`.
- Consumer compatibility: new `dev2vec-consumer-compatibility-v1`.
- Evidence/document formats and dimensions: unchanged.

Existing v10 records remain history but are intentionally not current-compatible. Users need one new analysis to create the first v11 analysis/snapshot.

## 14. Known limitations

- No database migration rewrites old records; this is deliberate to retain audit history.
- Admin pagination does not merge legacy `AnalysisSnapshot` rows into the current analysis list; legacy volume is exposed as a dashboard count.
- Live Mongo data/index behavior and production provider configuration require deployment smoke validation.
- Feedback generated before full provenance metadata is conservatively stale.

## 15. Remaining Batch 2 work

Multi-repository role/roadmap aggregation remains outside training semantics and is unchanged except that its selected analyses must now be compatible. AI mentor chat still needs a separate technical-repository-context boundary so whole-repository packages and legacy account summaries cannot be described as personal Dev2Vec evidence.
