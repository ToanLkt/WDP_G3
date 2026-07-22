# Dev2Vec Phase 1 Contract Alignment

Date: 2026-07-22

## 1. Files changed

- `src/services/dev2vec/dev2vec.service.js`: strict v4 output validation, stable contract error and topN clamp.
- `src/services/dev2vec/dev2vecInputBuilder.service.js`: builder topN clamp.
- `src/services/dev2vec/dev2vecPipelineMetadata.service.js`: pipeline version v6 invalidates cached results created with role-override semantics.
- `src/services/analysis.service.js`: classifier rank-1 is authoritative; analysis request topN is 3; deterministic role is explanatory metadata only.
- `src/routes/analysis.routes.js`: Swagger limit default/minimum/maximum aligned to 3/1/3.
- `scripts/testDev2VecInputBuilder.js`: expected maximum topN updated.
- `scripts/testDev2VecStrictContract.js`: new contract and classifier-primary regression harness.
- `scripts/testBackendAnalysisPipelineFixes.js`: previous override expectation replaced with classifier-primary expectation.
- `package.json`: `test:dev2vec-contract` script.

No GitHub evidence extraction, Python model, artifact, threshold, dataset or skill-scoring implementation was changed.

## 2. Contract validation added

`validateDev2VecOutput()` now rejects anything outside the shared v4 contract with HTTP-facing error code `DEV2VEC_OUTPUT_CONTRACT_INVALID`:

- plain-object envelope; `success === true`; non-empty model version;
- required object/array sections;
- exact dimensions 230/150/200/580;
- exact vector lengths and finite numeric values;
- combined vector order `repo + issue + api`;
- 1–3 unique, valid roles with consecutive ordered ranks and non-increasing probabilities in 0..1;
- corresponding skill gap, string arrays, and valid detail objects/status/similarity;
- boolean source flags and non-negative finite source statistics;
- unavailable source requires its source vector to be all zero.

Messages identify the failing field and never include vector values. A successful but malformed HTTP response is considered a contract violation and is not retried through process fallback. Validation happens before mapping or persistence, so a malformed output cannot become a successful FE response or `AnalysisResult`.

## 3. topN normalization

All active Dev2Vec boundaries now use minimum 1, maximum 3, default 3:

- input builder;
- transport input normalizer;
- repository analysis (`topN: 3` instead of 5);
- role-match public flow (already capped to 3);
- Swagger defaults and maxima.

Legacy/non-production performance fixtures still intentionally contain `topN: 5` to exercise clamping. The separate legacy `roleMatching.service.js` uses its own non-Dev2Vec catalog limit and was not changed.

## 4. Effective-role behavior before and after

Before Phase 1, `buildDev2VecAnalysisPayload()` could replace classifier rank 1 with a deterministic role derived from repository/project keywords and changed-file counts. That replacement controlled `careerDirection`, summary scores and selected skill gap.

After Phase 1:

- `rolePredictions[0]` supplies the official primary `roleId`/role name;
- `careerDirection`, summary and selected skill gap use that primary role;
- prediction order and probability are unchanged;
- deterministic `resolveEffectiveRole()` still runs for explanation and is stored at `rawAnalysis.explanatoryRoleContext` (`roleId`, `roleName`, `reason`, `source`);
- contextual `projectType` inference is preserved because it is descriptive project metadata, not role ranking.

No new public FE field was introduced.

## 5. Backward-compatibility impact

The response shape remains compatible. Behavior is intentionally stricter:

- malformed outputs formerly accepted by Node now return a 502 contract error;
- callers requesting more than three predictions receive three;
- saved analysis career direction can change where deterministic context previously overrode Python rank 1;
- existing explanatory signals remain in debug/raw metadata, but no longer choose the primary skill gap.

This invalidates behavioral snapshots that asserted deterministic override; affected regression assertions were updated. `analysisPipelineVersion` is bumped from v5 to v6, so the existing cache policy rejects v5 cached analyses and regenerates them under classifier-primary semantics. No cache schema or data migration is required.

## 6. Tests

The Phase 1 harness covers:

1. valid output passes;
2. wrong dimensions and vector lengths fail;
3. non-finite vector values fail;
4. incorrect concat order fails;
5. prediction count 0 or 4 fails;
6. invalid/duplicate role IDs fail;
7. invalid/non-consecutive ranks fail;
8. out-of-range probability fails;
9. missing skill-gap key and invalid detail status fail;
10. unavailable source with non-zero vector fails;
11. topN 0 clamps to 1 and 4/5/20 clamp to 3 at builder and transport layers;
12. classifier rank 1 remains repository analysis primary even when deterministic context prefers another role;
13. malformed HTTP success is rejected without process fallback;
14. existing valid fixtures continue to run.

All required checks passed:

- `npm run test:dev2vec-contract`
- `npm run test:dev2vec-input`
- `npm run test:dev2vec-evidence-taxonomy`
- `node scripts/testDev2VecChannelAvailability.js`
- `node scripts/testDev2VecRoleMapper.js`
- `npm run test:backend-analysis-pipeline`
- `.venv\Scripts\python.exe ml_service\validate_contract.py`

The channel harness was run with process permission because it launches the local Python inference child process. No GitHub production API was called.

## 7. Deliberately deferred to Phase 2–4

- GitHub issue-comment acquisition and user-comment attribution;
- pull request acquisition;
- repository/contribution gate and minimum contribution threshold;
- whole-repository source scan scope;
- API token/dependency/import semantics;
- Python inference/model/artifacts;
- role or skill thresholds/formulas;
- training dataset and retraining;
- cache migration/version rollout policy.
