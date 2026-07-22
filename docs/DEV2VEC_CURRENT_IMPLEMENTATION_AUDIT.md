# Dev2Vec Current Implementation Audit

Audit date: 2026-07-22. Scope: all `src/`, the Dev2Vec Python service, scripts, tests, models, configuration, Docker and integration documentation. This is a read-only implementation audit: no production logic, package or environment was changed.

Legend: **Confirmed** = directly established from code; **Inferred** = consequence of several code paths; **Unknown** = cannot be established without runtime/training documentation.

## 1. Executive Summary

**Confirmed.** Dev2Vec is active in the authenticated repository-analysis flow (`POST /api/analysis/repositories/:repoId`) and role-match flows (`POST /api/analysis/role-matches`, legacy `GET .../role-matches`). `analysis.service.analyzeRepositoryCore()` collects a repository owned by the application's user record, filters commits to the linked GitHub identity, fetches commit details/code evidence and issues, builds the Node contract, invokes Python, maps the result, stores it in `AnalysisResult` and `RepoAnalysisSnapshot`, then returns a sanitized response (`src/routes/analysis.routes.js:70,216,256`; `src/services/analysis.service.js:629-899`).

The primary transport is a persistent HTTP worker when `DEV2VEC_SERVICE_URL` is set. A per-request `execFile()` process is the default when no URL is set and the fallback when the HTTP call fails (`src/services/dev2vec/dev2vec.service.js:122-143,221-350`). The worker loads artifacts once (`ml_service/app.py:19-29`) and exposes `/health` and `/infer` (`ml_service/app.py:46-85`).

The integration is substantial but not training-semantics-safe. Largest risks are: (1) whole-repository source/dependencies enter personal evidence; (2) issue fallback includes unrelated repository issues while status disables the issue vector; (3) user comments and PR evidence are not fetched; (4) Node validates only the output envelope, not dimensions/roles/ranks/probabilities/vectors; (5) repository analysis applies a deterministic effective-role resolver after classifier output, so the persisted career direction/skill mapping can differ from the top classifier role (`src/services/analysis.service.js:327-343`).

Training semantics are only documented locally as “contribution-gated repository context plus user commits and pull requests”, “issues authored, assigned, or commented”, and “dependencies and imports from user-touched file versions” (`ml_service/dataset/dataset_summary.json:2-6`). The current production builder conflicts with all three in material ways described below.

## 2. Runtime Flow

```text
POST /api/analysis/repositories/:repoId
  analysis.routes -> analysis.controller.analyzeRepository
→ analysis.service.analyzeRepositoryCore
  findRepositoryForUser + linked GithubAccount
→ loadRepositoryCommitsForAnalysis / fetchAndCacheRepositoryCommits
  filterUserContributionCommits -> fetch commit detail + touched file evidence
→ ensurePackageSourceEvidence / fetchRepositoryPackages
  repository-wide manifests, controlled directories and source text
→ getRepositoryIssueEvidence
  repository Issues API -> authored/assigned selection or repository fallback
→ buildDev2VecInputFromRepositoryAnalysis
  repoDocument + issueDocument + apiTokens + evidenceChannels + topN
→ runDev2VecInference
  HTTP POST /infer; optionally execFile(python, infer.py --input temp.json)
→ validateDev2VecOutput
→ buildDev2VecAnalysisPayload / dev2vecRoleMapper
  effective role, role cards, skill vector, summary
→ AnalysisResult.create -> createSnapshotFromAnalysisResult
→ sanitizeAnalysisSnapshot -> FE response
```

Entry/controller references: `src/controllers/analysis.controller.js:4-16,43-67`; core acquisition and inference: `src/services/analysis.service.js:646-837`; persistence/response: `src/services/analysis.service.js:842-899`.

Role matching can reuse saved `AnalysisResult.dev2vec`; single repo can rebuild evidence, while multi-repo builds from stored analyses (`src/services/analysis.service.js:967-1148,1317-1442`; `src/services/analysisSource.service.js:22-69,223-368`). Thus previously saved analysis is actively used.

## 3. Relevant File Inventory

| File | Responsibility | Main functions | Called by | Status |
| ---- | -------------- | -------------- | --------- | ------ |
| `src/routes/analysis.routes.js` | Public analysis/role routes | route registrations | `src/app.js:90` | active |
| `src/controllers/analysis.controller.js` | HTTP adapter | `analyzeRepository`, `generateRoleMatches` | routes | active |
| `src/services/analysis.service.js` | Orchestration, mapping, persistence/cache | `analyzeRepositoryCore`, `buildDev2VecAnalysisPayload`, role-match functions | controller/roadmap services | active |
| `src/services/analysis/analysis.engine.js` | Contribution identity filter plus old deterministic analysis | `getCommitUserMatchInfo`, `filterUserContributionCommits`, `buildAnalysisPayload` | analysis and commit services | active (mixed legacy/current) |
| `src/services/analysis/contributionCodeEvidence.service.js` | Select and parse user-touched file evidence | `selectContributionCodeEvidenceFiles`, `parseContributionCodeEvidence` | commit service | active |
| `src/services/github/github.repository.service.js` | User-scoped repository persistence/lookup | `getRepositories`, `findRepositoryForUser` | routes/services | active |
| `src/services/github/github.commit.service.js` | Commit list/detail/file fetch and cache | `fetchAndCacheRepositoryCommits`, `fetchAndCacheCommitDetailsForUserCommits` | analysis service | active |
| `src/services/github/github.issue.service.js` | Issue fetch/filter/cache | `getRepositoryIssueEvidence`, `selectRelevantIssues` | analysis service | active |
| `src/services/github/github.package.service.js` | Manifests and repository-wide source collection | `fetchRepositoryPackages`, `ensure` helpers | analysis service | active |
| `src/services/dev2vec/dev2vecInputBuilder.service.js` | Final evidence contract | `buildRepositoryEvidence`, `buildDev2VecInputFromRepositoryAnalysis` | analysis service | active |
| `src/services/dev2vec/sourceUsageParser.service.js` | Imports/API-call tokens | `parseSourceUsageEvidence` | builder/package service | active |
| `src/services/dev2vec/dev2vec.service.js` | HTTP/process invocation and Node validation | `runDev2VecInference`, `validateDev2VecOutput` | analysis service | active |
| `src/services/dev2vec/dev2vecRoleMapper.service.js` | Python-to-FE mapping | role/skill mapping functions | analysis service | active |
| `src/services/dev2vec/dev2vecCachePolicy.service.js` | Cache compatibility/fingerprint | `shouldUseCachedDev2Vec`, `shouldUseExactAnalysisCache` | analysis service | active |
| `src/services/dev2vec/dev2vecPipelineMetadata.service.js` | Pipeline/model version identity | `getCurrentDev2VecPipelineMetadata` | cache/input flows | active |
| `src/services/dev2vec/dev2vecStatus.service.js` | Artifact status | `getDev2VecStatus` | GitHub/status surface | active |
| `ml_service/app.py` / `infer.py` | Warm server and inference | `Handler`, `run_inference` | Node/start script | active |
| `src/models/AnalysisResult.js`, `RepoAnalysisSnapshot.js` | Persistent results and complete vectors | schemas | analysis/snapshot services | active |
| `src/services/roleMatching.service.js`, `analysis/analysis.scoring.js` | Older non-Dev2Vec scoring | legacy match/scoring functions | non-primary/older surfaces | legacy/uncertain |
| `scripts/testDev2Vec*.js`, `testGithubIssueEvidencePipeline.js`, `testRepositoryUserContributionEvidence.js`, `testSourceUsageEvidencePipeline.js` | Harness tests | script entry points | package/manual | test-only |

## 4. Repository Evidence Implementation

Repositories originate from GitHub `/user/repos`, default excluding forks, and are saved under `Repository.userId`; lookup always adds the authenticated application `userId` (`src/services/github/github.repository.service.js:36-66,68-95,97-168`). This list can contain owned, organization-accessible and contributed repositories returned by `/user/repos`; ownership/contribution is not gated at repository selection time. There is no minimum contribution threshold.

Commit list: default branch, `perPage=100`, default maximum 3 pages/300 API items (`src/services/github/github.commit.service.js:613-701`). Personal attribution matches author/committer login, GitHub author id, known verified email, then username-as-name fallback (`src/services/analysis/analysis.engine.js:198-255`). Only matched commits are passed to the primary builder (`src/services/analysis.service.js:694-723,790-801`). Commit messages and changed paths enter `repoDocument` (`dev2vecInputBuilder.service.js:1197-1203`). Commit details default to at most 30 user commits; file count is unlimited (`github.commit.service.js:22-33,55-75,437-611`). No PR list/title/body is fetched anywhere in the active analysis flow.

Source evidence has two different scopes:

- contribution code: eligible files from matched commit details; file versions/added patch text are cached and attributed to user commits (`contributionCodeEvidence.service.js:3-12,56-102`; `github.commit.service.js:328-429`);
- repository package/source scan: up to 60 text files, 4,000 chars/file, depth 2, across a fixed directory/root list, independent of user touches (`github.package.service.js:19-25,26-123,248-335`).

`repoDocument` combines repository name/fullName/description/topics/language/default branch/README, all package/manifests, user commit messages/paths, stored analysis parts, API tokens, general repository source snippets and user-contribution snippets (`dev2vecInputBuilder.service.js:1145-1252`). Therefore whole-repository evidence is treated as personal model input. README, description, topics and languages are included. There is no active PR evidence and no changed-line minimum.

Limits: `repoDocument` nominal default 50,000 chars, metadata gets one third of that (`dev2vecInputBuilder.service.js:7,1243-1245`); repository scan 60 files × 4,000 chars by default; source parser additionally defaults to 60 files, 4,000 chars/file, 80,000 total chars and 600 tokens (`sourceUsageParser.service.js:1-7`). Builder source selection uses category quotas and total limits defined at `dev2vecInputBuilder.service.js:11-211`; commit API default 300 list items and details default 30.

## 5. Issue Evidence Implementation

Issues come from `GET /repos/{owner}/{repo}/issues`, state all, newest updated first; PR-shaped objects are removed (`github.issue.service.js:174-216,81-106`). Defaults are 2 pages × 50, but fetch stops/caps at 40 items; body 1,200 chars, cache 30 minutes, timeout 8 seconds, one retry (`github.issue.service.js:10-38`).

Direct relevance is only user-authored or user-assigned. The service does not fetch comments, cannot recognize “user commented”, and normalized issues have no comment bodies (`github.issue.service.js:66-106`). If any direct issue exists, all repository-fallback issues are dropped. If none exists, all normalized repository issues become fallback evidence (`github.issue.service.js:124-137`). Builder supports at most three comment strings if supplied by some stored/other source, but the active GitHub fetch never supplies them (`dev2vecInputBuilder.service.js:356-389,1112-1114`).

`issueDocument` comprises title, up to 12 labels, state, sanitized body, and up to 3 comments, lowercased, builder cap 30,000 chars. Active fetch itself caps document-related config at 12,000 but does not directly build the document; its `documentMaxChars` is currently not forwarded to the builder. It is empty for no selected issues or issues without usable fields, missing account/repo identity, fetch failure, or legacy snapshots without issues.

Status comes from `getIssueChannelStatus()`: success + `relevantCount>0` => `available`; success with zero selected => `empty`; success with fallback-only selected => `no_user_relevant_issues`; failures => unavailable/fetch status (`src/services/analysis.service.js:952-966`). Builder status override wins over actual text (`dev2vecInputBuilder.service.js:479-506`).

| Fetched issues | Relevant issues | issueDocument | channelStatus.issue | Expected `vectorSources.issues` |
| -------------: | --------------: | ------------- | ------------------- | ----------------------------- |
| 0 | 0 | empty | `empty` | false |
| >0 | >0 authored/assigned | non-empty normally | `available` | true |
| >0 | 0; repository fallback selected | **non-empty** | `no_user_relevant_issues` | **false** |
| fetch failed/account missing | 0 | empty | unavailable/error-derived | false |
| cached legacy analysis without metadata | depends on snapshot | may be non-empty | `legacy_snapshot` | false |

This confirms both “content present but channel false” (fallback/legacy). An “available but empty” state is possible if an externally supplied override says `available`; the builder does not reconcile override with document content.

## 6. API Token Implementation

Tokens combine all `RepositoryPackage` records, their dependency/dev/peer dependency keys, frameworks/configs/languages/detected files, cached source imports/API-call tokens, and stored analysis package/framework fields (`dev2vecInputBuilder.service.js:401-471,1224-1236`). This is not limited to user-touched files.

Manifests/config candidates include package.json, requirements, environment/pyproject/Pipfile, Maven/Gradle, pubspec, Prisma, app/vite/next/angular/tailwind/postcss configs, Docker/Compose, CI, env example, README and workflows (`github.package.service.js:406-438`). Explicit parsers exist for `package.json` and `requirements.txt`; other files mainly provide content/source-usage signals (`github.package.service.js:4-12,514-524`).

Import syntax covers JS/TS dynamic/static import and require; Python import/from; Dart, Swift, Java/Kotlin, C#, Go, PHP and Ruby. API-call regexes cover selected JS, Python, mobile, Java/.NET and DevOps calls (`sourceUsageParser.service.js:117-205`). Tokens are prefixed (`import:`, API categories), lowercased, character-filtered, deduplicated in insertion order, not sorted; no minimum frequency is applied (`sourceUsageParser.service.js:19-45,208-247`; builder lines 392-471). Dependency and import tokens are distinguishable only by import prefix; raw dependency names remain unprefixed. Internal relative JS imports are normalized and can remain as noise; filenames, languages and configs can also become tokens.

## 7. Dev2Vec Input Contract Produced by Node

Only six fields cross the transport because `normalizeDev2VecInput()` strips builder diagnostics (`dev2vec.service.js:93-104`):

```json
{
  "requestId": "analysis-<userId>-<repositoryId>-<timestamp>",
  "repoDocument": "<lowercased metadata, packages, commit messages/paths and bounded source evidence>",
  "issueDocument": "issue title: ...\nlabels: ...\nstate: ...\nbody: ...",
  "apiTokens": ["express", "import:axios", "server_route:express.get"],
  "evidenceChannels": {
    "availableChannels": { "repo": true, "issue": true, "api": true },
    "channelStatus": { "repo": "available", "issue": "available", "api": "available" }
  },
  "topN": 3
}
```

| Field | Built by | Source | Empty condition | Notes |
| ----- | -------- | ------ | --------------- | ----- |
| requestId | input builder/analysis service | request context/UUID | never after normalization | sanitized only for temp filename |
| repoDocument | `buildRepositoryEvidence` | metadata, packages, commits, source | all sources empty | default cap 50k |
| issueDocument | `buildIssueDocument` | selected issues | no usable issue | default cap 30k |
| apiTokens | `normalizeApiTokens` | manifests + whole-repo imports/API calls | none parsed | deduped, insertion ordered |
| evidenceChannels | `buildChannelAvailability` | status override, else content | object always produced | override can contradict content |
| topN | both Node normalizers | caller limit | defaults 3 | builder/process permit 1..5, but role API `getTopN()` caps at 3 (`analysis.service.js:910`) |

Builder records `repoTextLength`, `issueTextLength`, and `apiTokenCount` before transport (`dev2vecInputBuilder.service.js:1414-1419`). Process mode logs them; HTTP mode does not log these sizes in this client (`dev2vec.service.js:343-347`). Python treats availability flags as authoritative and replaces disabled channel text/tokens with empty inference input (`infer.py:446-460`).

## 8. Python Invocation

HTTP: URL `DEV2VEC_SERVICE_URL`, POST `/infer`, timeout `DEV2VEC_SERVICE_TIMEOUT_MS` falling back to 30s, max response bytes from `DEV2VEC_MAX_BUFFER_BYTES`. `/health` is used by app health/status, not as a preflight before every inference (`dev2vec.service.js:122-143`; `src/app.js:28,67-76`). HTTP failure falls back to process by default; there is no retry.

Process: `execFile(pythonBin, [inferPath, '--input', tmpFile])`; payload is a JSON temp file under `tmp/`; stdout JSON and stderr are separate; stderr is logged; temp cleanup occurs in `finally` (`dev2vec.service.js:197-243,300-350`). Timeout is 30s and max buffer 10 MiB by default. Python defaults to `python`; Docker sets `/opt/venv/bin/python`. There is no `python3.12` hard-code (`dev2vec.service.js:11-15,254-267`; `Dockerfile:7-16`). `windowsHide:true` supports Windows CLI behavior. No second fallback/retry after process failure.

## 9. Python Output Validation

Node checklist (`dev2vec.service.js:146-181`):

- [x] output object
- [x] `success === true` (and explicit model error handling)
- [x] `rolePredictions` is an array
- [x] `skillGaps` is a non-array object
- [x] `vectorDims` is an object
- [ ] exact dimensions 230/150/200/580
- [ ] prediction length 1..3 (or consistent with requested topN)
- [ ] `roleId` belongs to catalog
- [ ] rank integer/unique/in range
- [ ] probability finite and bounded
- [ ] `skillGaps[prediction.roleId]` exists
- [ ] vectors object/arrays present
- [ ] each vector has correct dimension and finite elements

Python itself asserts source/combined vector dimensions before returning (`infer.py:453-465`) but Node does not protect against a malformed/compromised HTTP worker response.

## 10. FE/API Mapping

`matchScore = round(probability * 100, 2)` and `matchLevel` thresholds are 85/70/50/30 (`dev2vecRoleMapper.service.js:18-35,74-94`). Skill gap lookup correctly uses `skillGaps[prediction.roleId]` (`:69-72,106-116`). FE compatibility fields include role identity, match score/level/label, matched/weak/missing/recommended skill names, probability/rank/model fields, vectorSources and sourceStats; detail mode adds skill arrays (`analysis.service.js:1161-1182`).

Skill scores are prototype similarity ×100, not role probability (`dev2vecRoleMapper.service.js:257-307`). Role score is classifier/final Python probability, not skill similarity on the Node side. However Python `rank_roles()` may apply metadata-defined role scoring/calibration before returning `finalRoleScore` (`infer.py:468-494`), so “probability” is not guaranteed to be raw classifier probability.

Repository analysis then resolves an `effectiveRole` from classifier output plus contribution/project context and maps summary/skills against that role (`analysis.service.js:285-343`). This can change persisted/returned career direction and selected skill gap relative to rank 1. Role-card endpoints map Python predictions directly. No `NEXT_SKILL_PRIORITY` symbol was found. Skill priority/thresholds remain hard-coded in mapper (60 present, 20 weak, missing priority medium), but do not alter role card scores (`dev2vecRoleMapper.service.js:13-16,262-307`).

## 11. Legacy Logic and Conflicts

| file / function | logic | currently reachable? | risk |
| --- | --- | --- | --- |
| `analysis/analysis.engine.js:259-619`, `buildAnalysisPayload` | checklist, keyword/rule and old score calculations | helper module active; primary Dev2Vec path uses identity helpers and some old analysis metadata | confusing duplicated semantics; old fields can feed `repoDocument` |
| `analysis/analysis.scoring.js` | deterministic score weights | uncertain outside primary Dev2Vec inference | future caller may present old score as model result |
| `roleMatching.service.js` | older role match formulas | uncertain/legacy; primary analysis routes use `analysis.service` | duplicate pipeline |
| `dev2vecInputBuilder.service.js:533-1093` | keyword/category feature detection | yes | affects evidence preview/project/effective-role context, not Python role probability directly |
| `analysis.service.js:285-343` / effective-role resolver | chooses effective role from model + deterministic contribution context | yes | can override top classifier role for persisted analysis summary/skills |
| `dev2vecRoleMapper.service.js:13-16,262-307` | fixed skill thresholds/priorities | yes | FE skill state differs if training thresholds change |
| `github.issue.service.js:133-136` | unrelated repo-issue fallback | yes | conflicts with personal evidence semantics, though status currently suppresses vector |

No active required/optional scoring formula or `NEXT_SKILL_PRIORITY` was found in the Dev2Vec role-card mapper; `missingOptionalSkills` is always empty (`dev2vecRoleMapper.service.js:96-101`).

## 12. Tests and Observability

Relevant script tests exist for input builder, evidence taxonomy, channel availability, role mapper, issue pipeline, source parser, repository contribution, multi-repo regression, cache/performance, timeout/error behavior and backend pipeline. Python has contract/calibration/skill-gap tests (`scripts/testDev2Vec*.js`; `scripts/testGithubIssueEvidencePipeline.js`; `scripts/testRepositoryUserContributionEvidence.js`; `ml_service/validate_contract.py`; `ml_service/test_role_ranking_calibration.py`).

Coverage represented in scripts: issue available/missing and repository fallback; API missing/repo-only; topN; vector dimensions/contract; mapper; HTTP timeout/fallback; Python error; malformed envelope. The most important missing/weak assertions are strict Node output validation, commented-by-user issue acquisition, PR acquisition, and proof that only user-touched dependencies reach production input.

Executed during this audit (2026-07-22): `npm run test:dev2vec-input`, `npm run test:dev2vec-evidence-taxonomy`, `testDev2VecChannelAvailability.js`, `testDev2VecRoleMapper.js`, `testGithubIssueEvidencePipeline.js`, `testRepositoryUserContributionEvidence.js`, `testSourceUsageEvidencePipeline.js`, and `.venv/Scripts/python.exe ml_service/validate_contract.py` all passed. The channel-availability harness initially could not create its Python child process in the filesystem sandbox (`EPERM`); rerunning that same harness with approved process permission passed. The issue fixture intentionally logged a mocked GitHub 403/rate-limit branch and still passed. No production GitHub API was called.

Observability includes app `/health`, worker `/health`, timing phase logs, GitHub call metrics, cache hit reasons, optional debug sizes and worker mode. Debug logging stores/previews evidence paths and bounded snippets in DB; full vectors are persisted. Process stderr is logged. Full `repoDocument`/`apiTokens` are not normally logged, but malformed stdout preview and Python stderr can expose up to 500 chars/error content (`dev2vec.service.js:184-193,312-328`).

## 13. Current Environment and Configuration

| Variable | Default | Use / risk |
| --- | --- | --- |
| `DEV2VEC_ENABLED` | true | disables all inference |
| `DEV2VEC_SERVICE_URL` | empty (examples/Docker may set localhost:8001) | selects HTTP worker |
| `DEV2VEC_SERVICE_TIMEOUT_MS` | 30000 | HTTP timeout |
| `DEV2VEC_SERVICE_FALLBACK_ENABLED` | true | process fallback can mask worker outage/cold latency |
| `DEV2VEC_PYTHON_BIN` | `python` | platform interpreter; Docker overrides absolute venv path |
| `DEV2VEC_INFER_PATH` | `ml_service/infer.py` | process entry |
| `DEV2VEC_TIMEOUT_MS` | 30000 | process timeout |
| `DEV2VEC_MAX_BUFFER_BYTES` | 10485760 | axios/exec buffer |
| `DEV2VEC_ARTIFACTS_DIR` | `ml_service/artifacts` | status lookup; `infer.py/app.py` use local artifacts path directly |
| `DEV2VEC_SERVICE_HOST/PORT/MAX_BODY_BYTES/CONCURRENCY` | 127.0.0.1/8001/10MiB/1 | worker binding/load |
| `DEV2VEC_SOURCE_MAX_FILES/MAX_CHARS_PER_FILE/FETCH_CONCURRENCY/MAX_FILES_PER_CATEGORY` | 60/4000/6/6 | repository-wide scan; module-load constants require restart |
| `GITHUB_COMMIT_MAX_PAGES` | 3 | up to 300 commit-list items |
| `GITHUB_COMMIT_DETAIL_MAX_COMMITS` | 30 | user commit detail coverage |
| `GITHUB_COMMIT_DETAIL_MAX_FILES`, `...CODE_MAX_FILES_PER_COMMIT` | 0/unlimited | potentially high GitHub I/O |
| `GITHUB_COMMIT_FILE_MAX_BYTES` | 100000 | per file |
| `GITHUB_COMMIT_TOTAL_PATCH_MAX_CHARS/TOTAL_CONTENT_MAX_BYTES` | 500000/2000000 | request evidence budget |
| `GITHUB_ISSUE_MAX_PAGES/PER_PAGE/MAX_ITEMS` | 2/50/40 | fetch cap means only newest 40 inspected |
| `GITHUB_ISSUE_BODY_MAX_CHARS/FETCH_TIMEOUT_MS/CACHE_TTL_MS/FETCH_RETRIES` | 1200/8000/1800000/1 | issue channel behavior |
| `ANALYSIS_CACHE_ENABLED`, `ANALYSIS_INCREMENTAL_ENABLED` | true | reuse/incremental behavior |
| `DEV2VEC_DEBUG`, `*_TIMING_DEBUG`, role/skill/contribution debug flags | false | additional non-secret diagnostics |

Values are derived from `dev2vec.service.js:11-15,245-267`, `github.commit.service.js:22-83`, `github.issue.service.js:10-38`, `github.package.service.js:19-25`, `app.py:15-19`, Docker and env example files. No real secret values were copied.

## 14. Findings by Severity

### Critical

None confirmed solely from static source.

### High

**D2V-H01 — Repository-wide evidence is attributed to a user.** File/function: `github.package.service.addControlledSourceEvidenceFiles` and `dev2vecInputBuilder.buildRepositoryEvidence` (`:287-335`; `:1207-1252`). Current behavior: scans controlled directories/manifests across the repository and merges tokens/snippets into personal input without requiring a matched commit touch. Impact: role/skills may describe teammates or upstream project rather than the user; contradicts local training summary.

**D2V-H02 — Training issue semantics are incomplete.** File/function: `github.issue.service.getRelevanceType/normalizeGithubIssue` (`:73-106`). Evidence: only authored/assigned; no comment endpoint or comment bodies. Impact: user-commented evidence is lost and training/production distributions diverge.

### Medium

**D2V-M01 — Fallback issue document contradicts channel status.** Files: `github.issue.service.selectRelevantIssues` (`:133-136`), `analysis.service.getIssueChannelStatus` (`:952-966`), builder availability (`:479-506`). Behavior: unrelated issue text is built, but status disables inference. Impact: misleading stats/persistence and fragile future behavior if status changes.

**D2V-M02 — Node output validation is shallow.** File/function: `dev2vec.service.validateDev2VecOutput` (`:146-181`). Missing dimensions, vector, role, rank, probability and gap-key validation. Impact: malformed worker response can persist invalid data or silently map to zeros.

**D2V-M03 — PR evidence absent.** Active GitHub services fetch commits, issues and repository contents, but no pull request list/detail/files; Issues API deliberately discards PR objects (`github.issue.service.js:81-84`). Impact: production `repoDocument` misses training-described user PR titles/bodies and changed paths.

**D2V-M04 — Effective role can override classifier rank 1 in repository analysis.** `analysis.service.buildDev2VecAnalysisPayload` (`:285-343`). Impact: analysis summary/skill vector can disagree with role-match cards and Python ranking.

### Low

**D2V-L01 — topN contract is inconsistent.** Builder/invoker allow 1..5 (`dev2vecInputBuilder.service.js:244-248`; `dev2vec.service.js:29-35`), public role service caps 3 (`analysis.service.js:910`), Swagger advertises limits up to 20/5. Impact: confusing API behavior.

**D2V-L02 — API tokens retain broad/noisy categories.** Builder token candidates include languages/configs/file names and relative imports, no frequency threshold or sort (`:401-471`). Impact: avoidable OOV/noise versus training.

**D2V-L03 — HTTP inference does not emit the same size summary as process mode.** `dev2vec.service.js:269-298,343-347`. Impact: asymmetric monitoring.

### Informational

**D2V-I01 — Full vectors are stored.** `analysis.service.js:534-550`; schemas store `dev2vec` as Object. This supports reuse but increases document/storage footprint.

**D2V-I02 — Cache includes model/pipeline versions and repository fingerprint.** `dev2vecCachePolicy.service.js:28-118`. It invalidates on model/scoring/builder versions and repository head/timestamps; issue-only changes without repository fingerprint changes may remain cached until a forced/rebuilt analysis.

## 15. Unknowns Requiring Manual Confirmation

- Whether organization/contributed repositories returned by `/user/repos` are intended analysis targets and whether a minimum contribution is required.
- Exact authoritative training extractor/limits; `dataset_summary.json` is evidence but not a complete specification.
- Whether `finalRoleScore` calibration is intended to be exposed as classifier `probability`.
- Whether production sets `DEV2VEC_SERVICE_URL`, so actual deployed mode cannot be concluded from source alone.
- Whether GitHub OAuth scopes expose private/org repositories and verified emails in every deployment.
- Whether MongoDB document size remains safe for full 580-dimensional vectors plus previews under real data.

## 16. Recommended Comparison Checklist

- [ ] contribution gate
- [x] user-attributed commits
- [ ] user-attributed PRs
- [ ] user-attributed issues (authored/assigned yes; commented no)
- [ ] user comments only
- [ ] user-touched dependencies/imports
- [ ] document limits
- [x] token normalization
- [x] topN = 3 on public role flow (builder still accepts up to 5)
- [x] missing channel fallback
- [ ] evidence channel consistency
- [ ] output validation
- [ ] no legacy role override
- [ ] FE mapping consistency
- [x] production inference only (no training called by API path)

The unchecked items are comparison/action items, not patch proposals. This audit made no production-code change.
