# Dev2Vec End-to-End Business Flow and API Consumer Audit

**Audit date:** 2026-07-23  
**Scope:** current working tree after Dev2Vec phases 1-6  
**Method:** static trace of mounted route -> middleware -> controller -> service -> model/query -> mapper/DTO, plus repository-local contract/regression checks. No production GitHub or Gemini call was made.

## 1. Executive summary

The contribution-scoped repository analysis write path is materially aligned with Dev2Vec v4. It verifies the linked GitHub identity, gates evidence on `contributionSummary.accepted === true` and at least five verified changed lines, builds the three 230/150/200 channels, validates the Python response, treats `rolePredictions[0]` as primary, preserves up to three predictions, persists provenance, and creates a vector-redacted snapshot.

The product as a whole is **not yet end-to-end version-safe**. Most downstream selectors choose the newest record by timestamp and user/repository scope but do not require the current model, pipeline, document-builder, and API-evidence versions. The most serious semantic divergences are the legacy dashboard, broad whole-account context in AI mentor chat, and synthetic multi-repository aggregation that is not a trained Dev2Vec input contract.

| Classification | Endpoints |
| --- | ---: |
| CORRECT | 32 |
| PARTIALLY_CORRECT | 16 |
| INCORRECT | 5 |
| LEGACY_BUT_SAFE | 9 |
| UNREACHABLE | 0 |
| NOT_VERIFIED | 0 |
| **Total** | **62** |

There is **no confirmed Critical cross-user/IDOR finding** in the audited paths. Four High themes require remediation before describing the whole product as Dev2Vec-v4 aligned: stale incompatible records can become “latest”; multi-repo inference uses a synthetic merged legacy `skillVector`; chat sends repository-wide/package/legacy account context; and dashboard reads the legacy snapshot model and legacy career fields.

## 2. Expected contract and versions

Runtime metadata is centralized in `src/services/dev2vec/dev2vecPipelineMetadata.service.js` and resolves to:

- model: `dev2vec-demo-v4` (artifact metadata/runtime service);
- pipeline: `dev2vec-analysis-pipeline-v10`;
- repository document: `dev2vec-repo-document-v3-python-cleaner-parity`;
- issue document: `dev2vec-issue-document-v3-python-cleaner-parity`;
- API evidence: `dev2vec-api-evidence-v3-python-toml-parity`.

One stale public metadata constant remains: `src/constants/dev2vecCatalog.js` advertises `dev2vec-demo-v1` through the role catalog controller. It does not change inference, but it can mislead consumers.

## 3. Route and middleware topology

`src/app.js:96-113` mounts every audited router under `/api`. User endpoints apply `authMiddleware`; `/api/admin` applies both `authMiddleware` and `adminMiddleware` at router level. Controllers are thin adapters and pass `req.user`, params/query/body into services. No listed endpoint was found unmounted or unreachable.

The main response mappers are `sanitizeAnalysisSnapshot`, Dev2Vec role mappers, roadmap response normalizers, snapshot `formatSnapshotResponse`, AI feedback response mapper, chat session/message mappers, and admin formatters. Public DTO fields were not changed by this audit.

## 4. Repository analysis flow

`POST /api/analysis/repositories/:repoId` traces through `analysisController.analyzeRepository` to `analysis.service.analyzeRepository`. `findRepositoryForUser` binds the repository to the authenticated user and the service loads that user's linked `GithubAccount`. Contribution selection is performed by the GitHub contribution/commit/PR/issue services; repository/API source comes only from attributed touched files and issue evidence keeps qualifying user relations/comments.

The input builders reject insufficient contribution evidence. The strict Dev2Vec service validates channel dimensions, model output, prediction count/ranks/probabilities, and Python skill-gap fields. `buildPersistedAnalysis` maps the first prediction to the public career direction; persistence stores `dev2vec`, `analysisProvenance`, scope and cache metadata, and `createSnapshotFromAnalysisResult` creates `RepoAnalysisSnapshot` without the three raw vectors in the public snapshot DTO.

Verdict: the write path is **CORRECT**. The two read paths are **PARTIALLY_CORRECT**: `getAnalysisResults` and `getMyAnalysisResults` filter by user/repository but sort solely by timestamps. They do not require v4/v10/current builder versions or even `analysisScope.type=user_contribution`, so a later incompatible record may mask the valid analysis. Their response does expose metadata when present, but that is observability, not selection safety.

## 5. Role matching flow

The single-repository legacy GET is compatibility-safe at the DTO boundary and calls `getDev2VecOutputForSingleRepo`; its cache policy can rebuild contribution evidence and rejects incompatible cache metadata. Rank order comes from the Python prediction array, `topN` is clamped to three, and `matchScore` is probability times 100 in `dev2vecRoleMapper.service.js`.

`POST /api/analysis/role-matches` is correct for `single_repo`, but the same endpoint is **PARTIALLY_CORRECT overall** because `all_analyzed_repos` and `selected_repos` call `mergeMultiRepoAnalysisContext`. That function combines stored `skillVector` values with a 60% max/40% mean formula, derives level/readiness in Node, merges old strengths/missing skills/career direction, then runs a generated multi-repo input. This aggregation is not part of the trained 3-channel per-repository semantics and cannot be claimed as model-parity inference.

Role/skill catalogs are metadata only and do not override classifier output. The role catalog's advertised `dev2vec-demo-v1` version is stale, hence its partial classification.

## 6. Roadmap generation flow

`generateRoadmap` requires at least one owned, previously analyzed repository and records `roadmapSource.analysisId/analysisIds`, repository IDs, attached snapshot IDs, requested/resolved role IDs and Dev2Vec metadata. Single-repo role and skill-gap selection comes from the mapped Dev2Vec output; Python statuses and `recommendedNextSkills` feed `buildRoadmapSkillGapFromAnalysis`. The service enforces Dev2Vec gap skills after LLM/fallback generation, so AI prose cannot silently replace the chosen skills.

The flow is **PARTIALLY_CORRECT** for three reasons:

1. source selectors require `user_contribution` but not current v4/v10/builder versions;
2. multi-repo source uses the synthetic merged `skillVector` described above;
3. `buildRoadmapGithubContext` additionally loads repository-wide `RepositoryPackage`, legacy analysis fields, `SkillSignal`, and prior AI feedback for the generation prompt. Post-generation enforcement limits semantic drift, but the extra context is not personal Dev2Vec evidence.

There is no “roadmap without analysis” fallback. Existing roadmap reuse is keyed to analysis provenance; old roadmaps are not silently remapped. Read/archive/delete operations enforce `userId` and soft-delete/status rules and are **CORRECT**.

## 7. Learning flow

Roadmap learning does not run Dev2Vec directly. `getUserRoadmapOrThrow` enforces roadmap ownership; tasks are extracted from the persisted roadmap; `buildLearningQueryFromTask` preserves the task's canonical skill and target role. Generation adds explanatory gap context but cannot select a different package-derived skill. Progress is joined by the roadmap item ID.

The shared `/api/learning/skills/*` APIs manage canonical shared content/resources. They are intentionally not contribution-scoped and do not mutate analysis, role, roadmap source, or progress. All nine learning endpoints are **CORRECT** for this contract.

## 8. Roadmap progress flow

`RoadmapProgress` is created only after loading an owned roadmap. Updates resolve an existing persisted item (ambiguity by skill name is rejected), mutate only learning status/percentage/timestamps, and recompute progress deterministically. Reset does not regenerate the roadmap or analysis. These three endpoints are **CORRECT**.

This is **learning completion progress**, not repository skill evolution. Repository progress comparison is a separate snapshot flow; UI copy should preserve that distinction.

## 9. Snapshot and repository progress flow

All snapshot queries require authenticated `userId`, the owned repository where applicable, and `analysisScope.type=user_contribution`. Explicit comparison also requires both snapshots to belong to the same repository. Snapshot DTOs omit vector payloads and expose role/skill/source metadata.

All four endpoints are **PARTIALLY_CORRECT** because queries do not filter current model/pipeline/evidence versions. First/latest repository comparison can therefore compare incompatible historical generations. The comparison is deterministic Dev2Vec/skill-vector change plus user commit/active-day deltas; it does not infer a skill solely from changed LOC. The LOC/activity deltas should be labeled as contribution metrics, not skill proof.

## 10. AI feedback flow

Generation enforces owned repository and resolves an owned analysis/snapshot/roadmap through `currentContext.service.js`. It requires Dev2Vec-shaped analysis, passes primary/top roles, Python gap/recommendations, contribution/source metadata, and persists user/repository/analysis/snapshot/roadmap provenance. The parser/fallback is constrained not to override model role/gap conclusions. No repository source bodies or package inventory are directly loaded by `aiFeedback.service.js`.

The flow remains **PARTIALLY_CORRECT**: `resolveCurrentContext` selects latest by timestamp without current version validation and explicitly falls back to legacy `AnalysisSnapshot` when no `AnalysisResult` is found. GET-by-repository computes an additive `isStale` signal, but still returns the old feedback; `/me` does not calculate the signal. Admin reads are protected but likewise do not validate provenance versions.

## 11. AI mentor chat flow

Session CRUD is user-owned, soft deletion is per-user, closed sessions reject new messages, and explicitly selected repository/analysis/snapshot/roadmap IDs are checked by `resolveCurrentContext`. Session pinning records repository, analysis and snapshot provenance. Admin chat routes are separately protected by admin middleware and distinguish AI, user and admin sender types.

The AI message endpoint is **INCORRECT for personal Dev2Vec semantics**. Even when a selected Dev2Vec context exists, non-explicit/global and comparison/CV paths call `buildUserGithubContext`, which loads every owned repository, repository-wide `RepositoryPackage` records, timestamp-latest legacy analysis fields and `SkillSignal`s. `currentContext.service.js` may also fall back to legacy `AnalysisSnapshot`. This may be legitimate technical mentoring context, but it is currently labeled `contextSource: dev2vec` and is not sharply separated from personal skill evidence. It must not influence role/skill-gap conclusions.

No cross-user source was found: all broad queries still carry `userId`. The risk is semantic/privacy minimization inside one user's private repositories, not confirmed cross-user leakage.

## 12. Dashboard flow

`GET /api/dashboard/me` is **INCORRECT**. `dashboard.service.js` imports legacy `AnalysisSnapshot`, counts/analyzes it without version/scope filters, builds skills from legacy strengths/weaknesses/signals, and chooses career from latest feedback `careerSuggestion/careerDirection` or legacy `careerDirection`. It does not use v10 `AnalysisResult.dev2vec.rolePredictions[0]`, Python gap statuses, compatible snapshots, or actual `RoadmapProgress`. Archived roadmaps are also not excluded (`isDeleted` is checked, `status=active` is not).

## 13. GitHub supporting APIs

Repository, commits and package endpoints consistently resolve an owned repository/account and persist cache rows scoped by `userId` and `repositoryId`. They intentionally return repository-wide data for browsing/diagnostics and are classified **LEGACY_BUT_SAFE** with respect to Dev2Vec. The primary analysis builder does not automatically use their whole-repo package/source payload as personal evidence; it rebuilds attributed touched-file evidence. Their unsafe consumers are the roadmap/chat context builders described above.

## 14. Admin APIs

Admin endpoints are read-only in the listed audit scope and are protected globally. Repository/user views are appropriate administrative data. Dev2Vec status reads runtime/artifact metadata and health diagnostics without triggering analysis.

However, admin analysis list/detail use the legacy `AnalysisSnapshot` model, not the current `AnalysisResult`/`RepoAnalysisSnapshot`; admin dashboard inherits legacy counts. These are **INCORRECT** as Dev2Vec-v4 observability. Admin roadmap views expose source/snapshot provenance but do not validate or clearly flag incompatible versions, so they are **PARTIALLY_CORRECT**. Admin repository endpoints remain **LEGACY_BUT_SAFE** supporting views.

## 15. Data model source-of-truth matrix

| Model | Created by | Main consumers | User scoped | Repo scoped | Versioned | Risk |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `GithubAccount` | OAuth/account service | evidence builders | Yes | No | No | Linked identity source; token selected explicitly |
| `Repository` | GitHub repository sync | all repo flows | Yes | Yes | No | Ownership anchor |
| `RepositoryCommit` | commit cache | analysis/UI | Yes | Yes | No | Whole cache; attribution must occur downstream |
| `RepositoryCommitCodeEvidence` | commit hydrator | contribution builder | Yes | Yes | No | Must remain selected-commit scoped |
| `RepositoryIssue` | issue service | issue builder | Yes | Yes | Partial diagnostics | Relation/comment filtering required |
| `RepositoryPackage` | package scanner | GitHub UI, roadmap/chat context | Yes | Yes | Cache metadata | Whole-repo data; not personal evidence |
| `AnalysisResult` | v10 analysis | role/roadmap/context | Yes | Yes | Nested metadata | Current source, but selectors often do not filter version |
| `RepoAnalysisSnapshot` | analysis persistence | comparison/context | Yes | Yes | Nested metadata | Correct snapshot family; selection not version-safe |
| `AnalysisSnapshot` | legacy path | dashboard/admin/context fallback | Yes | Yes | No current contract | High stale/semantic risk |
| `Roadmap` | roadmap generation | learning/progress/chat/admin | Yes | Optional/multi | Provenance mixed object | Multi-repo and prompt-context risks |
| `RoadmapProgress` | progress service | roadmap/dashboard context | Yes | Via roadmap | No | Learning progress only |
| `LearningContent/Resource` | shared learning service | learning APIs | Shared | No | Content keys | Must not alter roadmap skill |
| `AiFeedback` | feedback service | feedback/dashboard/admin | Yes | Yes | Metadata object | Staleness is advisory, not selection filter |
| `ChatSession/Message` | chat service | user/admin chat | Yes | Optional | Pinned IDs | Prompt may include broad whole-account context |

## 16. API audit matrix

Legend: C = CORRECT, P = PARTIALLY_CORRECT, I = INCORRECT, L = LEGACY_BUT_SAFE. “Scoped” means contribution-scoped where Dev2Vec applies; `n/a` means supporting metadata/content.

| Method | Endpoint | Active | Main source/consumer | Scoped | v10 safe | Ownership | Status | Severity |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| POST | `/api/analysis/repositories/:repoId` | Yes | live attributed evidence -> Python -> `AnalysisResult` | Yes | Yes | Yes | C | - |
| GET | `/api/analysis/me` | Yes | timestamp-latest `AnalysisResult` per repo | Partial | No | Yes | P | High |
| GET | `/api/analysis/results/:repoId` | Yes | timestamp-latest `AnalysisResult` | Partial | No | Yes | P | High |
| GET | `/api/analysis/repositories/:repoId/role-matches` | Yes | cache-safe single-repo Dev2Vec mapper | Yes | Yes | Yes | C | - |
| POST | `/api/analysis/role-matches` | Yes | single repo or synthetic merged analyses | Partial | Partial | Yes | P | High |
| GET | `/api/roles/catalog` | Yes | static catalog (`v1` label) | n/a | No | Yes | P | Low |
| GET | `/api/skills/catalog` | Yes | static metadata | n/a | n/a | Yes | C | - |
| POST | `/api/roadmaps/generate` | Yes | analysis + Dev2Vec gap + broad AI context | Partial | No | Yes | P | High |
| GET | `/api/roadmaps/me` | Yes | owned persisted roadmaps | inherited | inherited | Yes | C | - |
| GET | `/api/roadmaps/:roadmapId` | Yes | owned persisted roadmap | inherited | inherited | Yes | C | - |
| DELETE | `/api/roadmaps/:roadmapId` | Yes | owned roadmap soft delete | n/a | n/a | Yes | C | - |
| PATCH | `/api/roadmaps/:roadmapId/archive` | Yes | owned roadmap status | n/a | n/a | Yes | C | - |
| GET | `/api/roadmaps/:roadmapId/learning` | Yes | owned roadmap tasks | inherited | inherited | Yes | C | - |
| GET | `/api/roadmaps/:roadmapId/learning/items/:itemId` | Yes | owned roadmap item + shared content | inherited | inherited | Yes | C | - |
| POST | `/api/roadmaps/:roadmapId/learning/items/:itemId/generate` | Yes | fixed roadmap skill + LLM | inherited | inherited | Yes | C | - |
| GET | `/api/learning/skills/:skillName` | Yes | shared canonical content | n/a | n/a | Yes | C | - |
| GET | `/api/learning/skills/:skillName/resources` | Yes | shared resources | n/a | n/a | Yes | C | - |
| POST | `/api/learning/skills/:skillName/resources` | Yes | shared resources | n/a | n/a | Yes | C | - |
| POST | `/api/learning/skills/:skillName/resources/search` | Yes | YouTube resource cache | n/a | n/a | Yes | C | - |
| POST | `/api/learning/skills/generate` | Yes | requested canonical skill | n/a | n/a | Yes | C | - |
| GET | `/api/roadmaps/:roadmapId/progress` | Yes | `RoadmapProgress` | inherited | n/a | Yes | C | - |
| PATCH | `/api/roadmaps/:roadmapId/progress/items` | Yes | owned persisted progress item | inherited | n/a | Yes | C | - |
| POST | `/api/roadmaps/:roadmapId/progress/reset` | Yes | owned progress reset | inherited | n/a | Yes | C | - |
| GET | `/api/repositories/:repoId/snapshots` | Yes | contribution snapshots, all versions | Yes | No | Yes | P | High |
| GET | `/api/snapshots/:snapshotId` | Yes | contribution snapshot by ID | Yes | No | Yes | P | Medium |
| POST | `/api/snapshots/compare` | Yes | two owned same-repo snapshots | Yes | No | Yes | P | High |
| GET | `/api/repositories/:repoId/progress-comparison` | Yes | first/latest contribution snapshots | Yes | No | Yes | P | High |
| GET | `/api/ai-feedback/me` | Yes | latest feedback per owned repo | inherited | No | Yes | P | Medium |
| POST | `/api/ai-feedback/repositories/:repoId` | Yes | current-context Dev2Vec + LLM | Partial | No | Yes | P | High |
| GET | `/api/ai-feedback/results/:repoId` | Yes | latest feedback + stale flag | inherited | No | Yes | P | Medium |
| GET | `/api/admin/ai-feedback` | Yes | admin feedback list | inherited | No | Admin | P | Medium |
| GET | `/api/admin/ai-feedback/:feedbackId` | Yes | admin feedback detail | inherited | No | Admin | P | Medium |
| POST | `/api/chat/sessions` | Yes | owned optional pinned context | inherited | inherited | Yes | C | - |
| GET | `/api/chat/sessions` | Yes | owned sessions | n/a | n/a | Yes | C | - |
| GET | `/api/chat/sessions/:sessionId` | Yes | owned session/messages | n/a | n/a | Yes | C | - |
| DELETE | `/api/chat/sessions/:sessionId` | Yes | per-user soft delete | n/a | n/a | Yes | C | - |
| POST | `/api/chat/sessions/:sessionId/messages` | Yes | Dev2Vec plus whole-account legacy/package context | No | No | Yes | I | High |
| GET | `/api/admin/chat/settings` | Yes | global chat setting | n/a | n/a | Admin | C | - |
| PATCH | `/api/admin/chat/settings` | Yes | global chat setting | n/a | n/a | Admin | C | - |
| GET | `/api/admin/chat/sessions` | Yes | admin session list | n/a | n/a | Admin | C | - |
| GET | `/api/admin/chat/sessions/:sessionId` | Yes | admin session detail | n/a | n/a | Admin | C | - |
| POST | `/api/admin/chat/sessions/:sessionId/messages` | Yes | manual admin reply | n/a | n/a | Admin | C | - |
| PATCH | `/api/admin/chat/sessions/:sessionId/close` | Yes | close state | n/a | n/a | Admin | C | - |
| PATCH | `/api/admin/chat/sessions/:sessionId/mode` | Yes | session mode | n/a | n/a | Admin | C | - |
| PATCH | `/api/admin/chat/sessions/:sessionId/use-global-mode` | Yes | reset mode source | n/a | n/a | Admin | C | - |
| GET | `/api/dashboard/me` | Yes | legacy analysis/feedback/roadmap fields | No | No | Yes | I | High |
| GET | `/api/github/repositories` | Yes | live/cached owned repo browsing | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/cached` | Yes | owned repo cache | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/:repoId` | Yes | owned repository | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/:repoId/commits` | Yes | whole-repo commit UI/cache | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/:repoId/commits/cached` | Yes | whole-repo commit cache | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/:repoId/packages` | Yes | whole-repo package diagnostics | No | n/a | Yes | L | - |
| GET | `/api/github/repositories/:repoId/packages/cached` | Yes | whole-repo package cache | No | n/a | Yes | L | - |
| GET | `/api/admin/analysis` | Yes | legacy `AnalysisSnapshot` list | No | No | Admin | I | High |
| GET | `/api/admin/analysis/:analysisId` | Yes | legacy `AnalysisSnapshot` detail | No | No | Admin | I | High |
| GET | `/api/admin/github/repositories` | Yes | admin repository inventory | No | n/a | Admin | L | - |
| GET | `/api/admin/github/repositories/:repoId` | Yes | admin repository detail | No | n/a | Admin | L | - |
| GET | `/api/admin/roadmaps` | Yes | roadmap + optional snapshot provenance | inherited | No | Admin | P | Medium |
| GET | `/api/admin/roadmaps/:roadmapId` | Yes | roadmap/progress/provenance | inherited | No | Admin | P | Medium |
| GET | `/api/admin/users/:userId` | Yes | admin user detail | n/a | n/a | Admin | C | - |
| GET | `/api/admin/dashboard` | Yes | legacy aggregate models | No | No | Admin | I | High |
| GET | `/api/admin/dev2vec/status` | Yes | runtime/artifact health | n/a | Yes | Admin | C | - |

## 17. Correct flows

- Contribution acquisition and single-repository analysis: `analysis.service.js`, `github.contribution.service.js`, `contributionCodeEvidence.service.js`.
- Training-aligned document/API builders and strict inference validation: `dev2vecInputBuilder.service.js`, three builder services, `dev2vec.service.js`.
- Primary/top-three and Python skill-gap mapping: `dev2vecRoleMapper.service.js`.
- Owned roadmap CRUD, roadmap-derived learning, and deterministic learning progress.
- Snapshot ownership and same-repository comparison constraints.
- Chat session lifecycle and admin access separation.

## 18. Partially correct flows

- Analysis reads, analysis-source selection and current-context selection: user-scoped but not version-compatible selection.
- Multi-repo role/roadmap: contribution analyses are user-owned, but their vectors/levels are synthesized in Node outside trained semantics.
- Roadmap generation: correct role/gap enforcement, but broad package/legacy prompt context and missing version gate.
- Snapshot comparison: correct scope/ownership, incompatible generations may be mixed.
- AI feedback: correct provenance and constrained output, legacy/stale current-context selection remains.
- Admin roadmap/feedback: access is correct; version status is not authoritative.

## 19. Incorrect or legacy flows

| Flow | Current behavior | Expected | Root cause / impact | Recommended fix / compatibility |
| --- | --- | --- | --- | --- |
| AI chat message | Mixes selected Dev2Vec data with whole-account packages, old analyses and signals | Separate technical-repo context from personal evidence | Broad prompt can imply package ownership/skill and is mislabeled Dev2Vec | Add typed prompt sections and prohibit broad context from role/gap; keep response fields additive |
| User dashboard | Reads legacy `AnalysisSnapshot` and `careerDirection` | Compatible v10 current context and rank-1 role | Stale/wrong role, skills, progress | Switch internal query/mapper; preserve existing card fields |
| Admin analysis list/detail | Reads legacy snapshot model | Current `AnalysisResult`/snapshot with versions | Operations cannot see authoritative v10 result | Use current model and additive provenance fields |
| Admin dashboard | Aggregates legacy sources | Version-aware current data | Misleading operational counts | Replace internal sources; retain DTO keys |
| Multi-repo semantics | Merges `skillVector`/levels in Node | Explicitly trained portfolio model or presentation-only aggregate | Output looks model-authoritative without parity | Disable classifier claim or create a separately trained contract |

The nine whole-repository GitHub/admin repository APIs are legacy/supporting but safe by themselves. They become unsafe only when a downstream consumer treats their data as personal skill evidence.

## 20. Ownership and security findings

- No confirmed IDOR was found in A-K. Repository operations use `findRepositoryForUser`; roadmap/progress/learning/chat/snapshot queries bind `userId`; explicit snapshot comparison binds both user and repository; admin routes have router-level admin middleware.
- AI feedback verifies the selected context belongs to the requested repository or a roadmap source repository.
- Chat's broad context is still restricted to the current user, but sends more private repository metadata/package context than necessary. This is a privacy-minimization High finding, not demonstrated cross-user exposure.
- Admin details intentionally expose other users' records to administrators. Raw analysis/vector exposure should remain role-protected and audited; snapshot DTOs already omit raw vectors.

## 21. Stale cache and snapshot findings

The cache used by the primary analysis write/single-repo matching path is version- and fingerprint-aware. The unsafe pattern is downstream Mongo selection:

- `AnalysisResult.findOne(...).sort({analyzedAt:-1, createdAt:-1})` in analysis reads and current context;
- analysis-source service adds contribution scope but not v4/v10/builder compatibility;
- snapshot list/comparison filters contribution scope but not generation compatibility;
- feedback/latest/admin/dashboard queries select by date without current provenance requirements;
- legacy `AnalysisSnapshot` fallback remains active in current context.

A shared `buildCompatibleDev2VecQuery()` (or explicit post-query compatibility validator) should become the single selection policy. Historical endpoints may still return incompatible rows, but must label them and must not call them current.

## 22. AI context boundary findings

- **Roadmap:** extra whole-repo packages/legacy context enters the LLM prompt, while deterministic post-processing preserves Dev2Vec gap skills. Partial, not fully wrong.
- **Feedback:** no direct whole-source/package fetch; analysis provenance is persisted. Legacy/latest selection remains.
- **Chat:** broad context is intentional for technical mentoring but currently conflated with `contextSource=dev2vec`. It needs a `technical_repository_context` boundary, explicit privacy minimization, and a hard rule that only compatible Dev2Vec context may state role/gap.

## 23. Public FE compatibility risks

- Switching dashboard/admin sources may change values and ordering even if keys remain stable; announce semantic correction.
- Version filtering may make previously visible “latest” results absent. Return a typed `analysis_required`/`incompatible_history` state rather than silently falling back.
- Multi-repo behavior cannot be corrected invisibly if consumers rely on generated scores; preserve DTO shape but add `scoringMethod`, `aggregationMode`, and authoritative/non-authoritative status.
- Role catalog model version must be corrected without renaming catalog fields.
- Snapshot comparisons across versions should return a 409/typed warning, not silently reorder or drop fields.

## 24. Prioritized fix plan

| Priority | Files | Expected change | Test needed | API impact |
| --- | --- | --- | --- | --- |
| P0 | `chat.service.js`, `chatContext.prompt.js`, `currentContext.service.js` | Separate technical repository context, remove legacy fallback for skill claims, minimize prompt data | prompt fixture proving packages cannot alter role/gap; ownership/privacy tests | Additive metadata only |
| P1 | `analysisSource.service.js`, `analysis.service.js`, `roadmap.service.js` | Stop presenting synthetic multi-repo merge as trained Dev2Vec inference | single vs multi source contract tests | Preserve envelope; mark unsupported/non-authoritative or return typed 400 |
| P1 | `dashboard.service.js`, `admin.service.js` | Replace legacy analysis sources with compatible current results/snapshots and actual progress | dashboard/admin v10 source fixtures | Same fields, corrected values |
| P2 | `currentContext.service.js`, `snapshot.service.js`, `aiFeedback.service.js` | Centralize compatible v4/v10/builder query; label historical rows | mixed-version database fixtures | Additive version/stale flags; possible typed 409 |
| P2 | `roadmap.service.js`, `analysisSource.service.js`, `Roadmap.js` | Persist/validate complete source versions per repo | provenance and regeneration tests | Additive provenance |
| P3 | `dev2vecCatalog.js`, role controller | Remove stale v1 metadata constant | catalog contract test | Correct value only |
| P3 | legacy `AnalysisSnapshot` consumers | Deprecate after migration/read compatibility window | migration and rollback tests | No field deletion in first release |

## 25. Final verdict by product flow

| Product flow | Verdict | Can release as v4-aligned | Required fix |
| --- | --- | ---: | --- |
| Repository analysis write | CORRECT | Yes | None blocking |
| Analysis history/current reads | PARTIALLY_CORRECT | No | Version-compatible selection |
| Top-3 single-repo matching | CORRECT | Yes | Correct catalog label |
| Multi-repo role matching | PARTIALLY_CORRECT | No | Separate/disable untrained aggregation claim |
| Roadmap generation | PARTIALLY_CORRECT | No | Version gate and prompt boundary; multi-repo semantics |
| Learning | CORRECT | Yes | Keep roadmap provenance visible |
| Learning progress | CORRECT | Yes | Clarify terminology |
| Repository snapshots/comparison | PARTIALLY_CORRECT | No | Compatible-version comparison policy |
| AI feedback | PARTIALLY_CORRECT | No | Remove legacy fallback; enforce current context |
| AI mentor chat | INCORRECT | No | Separate broad technical context from personal evidence |
| Dashboard | INCORRECT | No | Replace legacy source and progress calculation |
| GitHub support APIs | LEGACY_BUT_SAFE | Yes | Prevent personal-evidence reuse |
| Admin observability | PARTIALLY_CORRECT | No | Current analysis models and version labels |

## 26. Known unverified areas

- Live Mongo data distribution, indexes, and presence of incompatible historical rows.
- Production-only environment variables and deployment secret wiring.
- Live GitHub attribution behavior, rate limits, and private-repository permissions.
- Production Gemini response behavior and provider-side data retention.
- Docker/runtime networking and persistent volume state.

These are operationally unverified, not endpoint classifications: endpoint classifications above describe the traceable code behavior.

## 27. Validation and recommended next phase

The audit should be followed by a narrowly scoped remediation phase, not a new feature phase: first establish one version-compatible current-analysis selector and AI context boundary, then migrate dashboard/admin consumers, then decide product semantics for multi-repository scoring.

Validation commands for this audit/release baseline:

```powershell
npm run test:dev2vec-contract
npm run test:dev2vec-input
npm run test:dev2vec-evidence-taxonomy
npm run test:dev2vec-github-evidence
npm run test:dev2vec-input-alignment
npm run test:dev2vec-product-alignment
npm run test:dev2vec-training-parity
npm run test:dev2vec-full-regression
npm run test:dev2vec-artifacts
npm run smoke:dev2vec
npm run verify:dev2vec-release
npm run test:backend-analysis-pipeline
npm run test:role-matching
npm run test:roadmap-skill-gap
npm run test:learning-canonicalization
npm run test:end-to-end-flow
npm run test:chat-context-pinning
npm run test:chat-mentor-context
git diff --check
```

### Executed results

- `npm run verify:dev2vec-release`: **PASS**. This transitively passed strict contract, input/taxonomy, user-attributed evidence, input alignment, product alignment, Node/Python training parity, full regression/golden inference, backend pipeline, artifact checks and the local worker/HTTP/process-fallback smoke test. The first sandboxed attempt could not spawn `.venv\Scripts\python.exe` (`EPERM`); the authorized local rerun passed. The logged GitHub 403 is an intentional fixture/fallback scenario, not a production API call.
- `npm run test:role-matching`: **PASS**.
- `npm run test:roadmap-skill-gap`: **PASS** (all roadmap/canonical skill cases).
- `npm run test:learning-canonicalization`: **PASS**.
- `npm run test:end-to-end-flow`: **PASS**.
- `npm run test:chat-context-pinning`: **PASS**.
- `npm run test:chat-mentor-context`: **PASS**.
- `npm run test:chat-mode-effective`: **PASS**.
- `npm run test:soft-delete-close-policies`: **PASS**.
- Audit matrix count check: **PASS**, 62 endpoint rows and exact classification totals.
- `git diff --check`: **PASS**; Git printed existing LF/CRLF conversion warnings only.

This audit made no model, artifact, training dataset, production business-flow, or public FE response-field change.
