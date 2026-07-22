# Dev2Vec Remediation Batch 2 — Role Options, Roadmap Provenance and AI Context Boundaries

## 1. Summary

Batch 2 removes synthetic multi-repository inference from authoritative product flows. A repository's rank-1 Python classifier prediction remains its primary role; portfolio options are rank-1 predictions already produced independently for other compatible, owned repositories. Roadmaps bind to exactly one authoritative role source. Roadmap/chat prompts now separate authoritative Dev2Vec evidence from general technical repository context.

## 2. Files changed

- Role selection: `dev2vecRoleCandidate.service.js`, `analysis.service.js`, `analysisSource.service.js`.
- Roadmap: `roadmap.service.js`, `roadmap.validator.js`, `ai/roadmap.prompt.js`.
- Chat: `chat.service.js`, `chatSkillContext.service.js`, `ai/chatContext.prompt.js`, `chat.validator.js`.
- Versioning: pipeline metadata, compatibility and cache-policy services.
- Tests/release: `testDev2VecRoleRoadmapChatBatch2.js`, related regression fixtures, package/release scripts.

## 3. Previous synthetic multi-repo behavior

The previous active POST role-match and roadmap flows could merge `skillVector` values with a 60% max/40% mean rule, derive readiness/level in Node, build a synthetic 580-dimensional input and invoke Python as if the portfolio were one trained sample. That path had no training-parity contract.

`mergeMultiRepoAnalysisContext`, `mergeUserContributionAnalyses` and `buildDev2VecInputFromAnalysisSource` remain only as explicitly deprecated compatibility helpers. There is no active role-match or roadmap call to them and no active portfolio call to `runDev2VecInference`.

## 4. New per-repository role option contract

`dev2vecRoleCandidate.service.js` accepts current repository ID, compatible analyses and a candidate limit. It returns `primaryRole`, up to two `additionalRoleOptions`, and additive aggregation metadata. Each role carries its source repository/analysis/snapshot, model/pipeline version, selection type and the unmerged Python gap from that source analysis.

## 5. Candidate selection algorithm

1. Select the current repository's latest compatible rank-1 prediction as primary.
2. Take only rank 1 from every other eligible repository.
3. Exclude the current primary role ID.
4. Deduplicate by role ID, preferring higher probability, then newer analysis, then deterministic repository ID.
5. Sort by probability descending, analysis date descending and role ID.
6. Return at most two. No rank-2 fill and no synthetic fallback are used.

Compatibility, `userId`, and repository archived/deleted flags are enforced by the pure aggregator and the upstream owned-repository selectors.

## 6. API role-match behavior

The single-repository GET retains the existing `topRole` and `matches` prediction order/fields and adds `roleSelection`, `primaryRole` and `additionalRoleOptions`.

POST `single_repo` retains normal repository Dev2Vec behavior. `selected_repos` and `all_analyzed_repos` now return an existing role array made from per-repository rank-1 predictions plus:

- `aggregationMode=repository_primary_roles`;
- `classifierInferencePerformed=false`;
- `authoritativeScope=per_repository_dev2vec`;
- `sourceRepositoryCount`.

Without a current repository, the highest deterministic candidate is labeled `portfolio_suggestion`, not a combined classifier result.

## 7. Roadmap selected-role contract

Legacy requests containing only `repoId` use that repository's compatible rank-1 role. New requests may add `selectedRoleId`, `sourceRepositoryId`, `sourceAnalysisId` or `sourceSnapshotId`, and `currentRepositoryId`.

The service verifies user ownership, v12 compatibility, analysis/snapshot relationship and `selectedRoleId === sourceAnalysis.dev2vec.rolePredictions[0].roleId`. Arbitrary roles, cross-user sources and incompatible history are rejected before prompt generation.

## 8. Roadmap provenance

The roadmap's mixed `roadmapSource` retains old fields and adds authoritative:

- selected role and selection type;
- source repository, analysis and snapshot IDs;
- model, pipeline and all three document/evidence versions;
- evidence fingerprint.

The roadmap gap is built from that source analysis and selected role only. Even when the UI presents a portfolio, one analysis remains the authoritative skill source.

## 9. Roadmap prompt boundary

The prompt has four named sections:

- `AUTHORITATIVE_ROLE_AND_SKILL_GAP`;
- `USER_CONTRIBUTION_SUMMARY`;
- `GENERAL_PROJECT_CONTEXT`;
- `PRIOR_FEEDBACK_CONTEXT`.

Only the authoritative section may decide role/main-path skills. General metadata/packages are capped and may suggest project examples only. Prior feedback cannot override current classifier/gap output. Existing post-generation skill enforcement remains enabled.

## 10. Chat context types

Personal career/skill claims use only compatible `AnalysisResult`, selected contribution summary, classifier predictions, Python gaps and roadmap/progress. Technical repository questions may additionally receive a separately labeled `TECHNICAL_REPOSITORY_CONTEXT`.

Prompt hard rules prohibit package/README/architecture context from changing a role or matched/weak/missing status, or from being claimed as user contribution. Responses add `contextSources` and `dev2vecAuthoritative`; existing session/message/context fields remain.

## 11. Data minimization

- A pinned session queries only its selected repository/analysis.
- Whole-repository packages are loaded only for an explicitly selected repository and repository-review intent.
- Global career chat uses compact compatible analysis summaries and loads no account-wide package inventory.
- Comparison requires explicit `repositoryIds` (2–5), remains user scoped and uses only compatible analyses.
- Prompts contain no raw source, raw vectors, full documents, patches, tokens or issue/PR/comment bodies.
- Message metadata stores provenance/source labels rather than prompt payloads.

## 12. AI constraints

Both prompts state that AI may explain, compare candidates and suggest projects, but cannot override primary role, reorder model output, reclassify Python statuses, add authoritative gap skills or call general packages personal evidence.

## 13. FE/API compatibility

Existing role fields (`roleId`, `roleName`, `matchScore`, match levels and skill arrays), roadmap response structure, and chat DTO fields/types/nesting are retained. New role selection, aggregation, provenance and context-source fields are optional/additive. Existing `repoId` roadmap requests remain supported.

## 14. Version impact

- Pipeline: v11 -> `dev2vec-analysis-pipeline-v12`.
- New: `repository-primary-role-selection-v1`, `ai-context-boundary-v1`, `roadmap-source-provenance-v1`.
- Model/artifacts: unchanged `dev2vec-demo-v4`.
- Repository/issue/API evidence versions and dimensions: unchanged.

v11 and older records remain history and require re-analysis before becoming authoritative in v12 consumers.

## 15. Tests

`npm run test:dev2vec-role-roadmap-chat` contains 45 checks covering deterministic candidates, aggregate API semantics, roadmap validation/provenance, prompt boundaries, chat minimization, ownership, closed/manual behavior and DTO compatibility. It is included in `verify:dev2vec-release` alongside Batch 1 and Phase 1–6 gates.

Executed result: Batch 2 45/45, Batch 1 40/40, role matching, roadmap, end-to-end, chat context/mode, soft-delete, learning and the full release gate all passed. The release gate also passed training parity, golden/full regression, artifact integrity and local worker/HTTP/process-fallback smoke tests.

## 16. Known limitations

- Deprecated synthetic helpers remain exported for historical tests/compatibility but have no active authoritative caller.
- Explicit comparison now requires clients to send `repositoryIds`; natural-language repository-name inference is intentionally removed from the authoritative comparison path.
- Technical repository context currently exposes compact metadata/package names, not architecture derived from source bodies.
- No historical roadmap migration is performed; existing provenance remains readable while new roadmaps use v1 provenance.
