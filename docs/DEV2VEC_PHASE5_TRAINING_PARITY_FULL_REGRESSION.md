# Dev2Vec Phase 5 — Training Parity and Full Regression

## 1. Summary

Phase 5 validates production evidence against the executable Python extractors, then validates inference, strict Node contract, product mapping, cache, persistence, snapshots, public role shape, observability redaction and missing-channel behavior. The parity suite found three input defects and fixed them with versioned cache invalidation.

## 2. Files Changed

- `test/fixtures/dev2vec-parity/core-parity.json`: shared GitHub/evidence fixture.
- `golden-inputs.json` and `golden-expected.json`: four artifact-locked inference cases without full vectors.
- `ml_service/tests/export_extractor_fixture_result.py`: Python extractor oracle.
- `testDev2VecTrainingParityPhase5.js`: Node/Python parity and matrix variants.
- `testDev2VecFullRegressionPhase5.js`: golden, missing-channel, transport, contract, cache, persistence and public-shape regression.
- `trainingTextCleaner.js`: Python-compatible document cleaning.
- Repo/issue/API builders: parity fixes and version bumps.
- Pipeline metadata: v10 cache invalidation.

## 3. Parity Method

The same JSON fixture is loaded by Node and Python. Python calls the real `api_document.extract_api_tokens`, `repo_document.build_repo_document`, `issues_document.build_issue_document`, and reproduces the selection loops from the extractor around those pure functions. Node calls production contribution, repository, issue and API builders.

Contribution fields and API token arrays are compared exactly. Issue documents are compared exactly after common deterministic ordering. Repository documents are compared through strict required/forbidden semantic tokens because Node retains section labels while Python joins plain parts. Both sides enforce the same cleaning and length limits. Diffs/assertions never print full documents or source.

## 4. Fixture Catalog

- `core-parity`: user/teammate commits, authored/teammate PRs, relevant/unrelated issues, user/team comments, touched/untouched evidence and every supported dependency format.
- `all-channels`: golden repo + issue + API inference.
- `repo-only`: missing issue/API golden inference.
- `issue-only`: contribution-gated repo/API absent.
- `no-channels`: all zero-vector channels.
- Derived deterministic matrices cover four gate boundaries, three additional identity methods, 17 manifest/config formats, eight import language groups, 4/5/6 and aggregate frequency, issue/comment/count limits, five role-context inputs, cache changes and failure paths. In total there are five persisted scenarios and more than 50 derived cases/assertion groups.

## 5. Contribution Parity

Exact parity is asserted for acceptance, verified changed lines, selected commit SHAs, selected PR numbers and retained changed paths. Boundary 4/5, missing stats, commit+PR aggregation, teammate exclusion, PR-only contribution, login, GitHub ID, verified email and username/name fallback are covered. Repository ownership is not treated as contribution.

## 6. Repo Document Parity

Both sides retain repository identity, description, topics/languages, README, selected user commit messages, selected authored PR title/body and selected paths. Both exclude teammate evidence, untouched repository source, URLs, HTML markup, fenced code and legacy/model output. Documents remain deterministic and at most 50,000 characters.

Python does not append fetched source bodies to `repoDocument`; it uses them only for API extraction. Phase 5 therefore removed attributed source bodies from the Node repository document while keeping attributed files available for API extraction.

## 7. Issue Document Parity

Authored, assigned and commented relations, labels and at most three user comments are retained. Unrelated issues, PR-shaped acquisition objects and teammate comments are excluded by acquisition/builder boundaries. Duplicate repository/number entries are removed, at most 20 relevant issues are used, and the document is capped at 30,000 characters. The shared fixture produces an exact Node/Python issue document match.

## 8. API Token Parity

The final sorted arrays are compared with `deepStrictEqual`; no token allowlist or broad ignore is used. Coverage includes npm/composer manifests, npm/yarn/pnpm locks, requirements, pyproject/Pipfile, Maven/Gradle, Pub, Gem, Go, Cargo, Dockerfile, workflows and JS/TS, Python, Java, Kotlin, Scala, Dart, C#, Rust, Ruby and Go imports.

Dependencies are strong evidence. Imports are counted once per touched file over the aggregate scope and retained at frequency five. Relative imports and untouched manifests are excluded. Scoped npm packages, subpaths, dotted Python imports, case folding, deduplication and sorting match Python exactly.

## 9. Full Integration Regression

The regression builds production-shaped inputs, invokes real `infer.py` artifacts through the Node client, performs strict validation and product mapping, constructs cache/persistence/snapshot objects and checks public role fields. Five three-channel role-context fixtures ensure backend, frontend, mobile, DevOps and data-scientist evidence remains available without asserting an unstable semantic role outcome.

HTTP worker success, malformed worker output, process failure, dimension mismatch, exact cache, changed evidence, persistence rejection and snapshot behavior are covered. Existing route/backend/role/snapshot suites supply controller/service mocks without production GitHub access.

## 10. Public API Compatibility

Explicit assertions preserve the types and nesting of `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`, `matchedSkillNames`, `weakSkillNames`, `missingSkillNames` and `recommendedNextSkills`. Rank one remains primary. Live and snapshot records retain role predictions, skill gaps, vector sources, source stats, model and pipeline metadata. Existing analysis, role-match, legacy role-match, snapshot/history and backend pipeline suites remain active.

## 11. Missing-channel Regression

All-channel, repo-only, issue-only and zero-channel inputs assert vector lengths 230/150/200/580, exact `vectorSources`, final source stats and a zero vector for every disabled channel. Prediction count remains at most three. The Node-built channel-availability suite additionally covers repo+API without issues.

## 12. Cache and Performance Regression

Fingerprint tests cover exact evidence, changed issue/comment metadata, token order stability, unrelated issue exclusion, topN and version mismatches. Exact hits are represented without Python execution in the pure cache policy; changed evidence requires a miss. Refresh unavailable/stale states are covered by Phase 4 tests. Existing bounded-concurrency and source-cache tests remain enabled.

## 13. Persistence and Security Regression

Valid output passes the persistence barrier; missing predictions fail before storage/snapshot. Vector policy true/false, snapshot vector omission, fingerprint/version persistence and MongoDB's 16 MiB bound are asserted. Full documents, token arrays, source, bodies, comments, credentials, vectors and stdout/stderr are rejected from structured events.

## 14. Golden Model Fixtures

The golden set targets `dev2vec-demo-v4`, records fixture/builder versions, vector sources, source stats, top-three role order/probabilities and top-role skill arrays. Full vectors are not stored. Probability tolerance is `0.002`, based on observed small Doc2Vec inference variation across fresh Python processes; role order and all skill arrays remain exact.

## 15. Failure-path Regression

Strict suites cover `DEV2VEC_OUTPUT_CONTRACT_INVALID`, malformed dimensions/ranks/probabilities/vectors and missing skill gaps. Full regression covers worker malformed success and process launch failure. Existing GitHub fixtures cover rate-limit/unavailable metadata, contribution unverified and no relevant issues. Errors do not pass persistence and redacted events retain request/error identifiers.

## 16. Deliberate Deviations

- Node accepts verified GitHub ID/email/name attribution in addition to training crawler login matching. This is a stricter identity-aware product capability; selected evidence still must pass changed-line verification.
- Node sorts selected issues deterministically, whereas Python relies on GitHub's requested updated order. Canonical results match for equivalent API responses and order changes cannot introduce unrelated evidence.
- Node rejects URLs and internal aliases as API tokens even though Python's low-level normalizer does not explicitly reject every URL-shaped string. No supported dependency/import fixture relies on URL tokens; this implements the documented training intent.
- Node uses explicit section labels in repository text. Required and forbidden tokenizable content matches Python.

## 17. Version Impact

Parity uncovered production input changes, so the pipeline is bumped from v9 to `dev2vec-analysis-pipeline-v10`. Repository/issue documents are v3 Python-cleaner parity, and API evidence is v3 Python TOML parity. Model/artifact versions are unchanged. v9 caches are invalidated.

## 18. Test Commands and Results

The package exposes `test:dev2vec-training-parity`, `test:dev2vec-full-regression`, and aggregate `test:dev2vec-phase5`. Required Phase 1–5 suites, channel availability, role mapper, GitHub issue/contribution/source regressions, backend pipeline, Python contract validation, JavaScript syntax, Python compile and Git diff checks are run before completion.

## 19. Known Limitations

Tests use mocked acquisition normalization rather than a live GitHub HTTP server or database. Active service/controller suites mock persistence instead of requiring a MongoDB daemon. There is no webhook/scheduled freshness validation. Process-level model probabilities require the documented tolerance, while order and skill arrays remain exact.

## 20. Final Matrix

| Area | Training source | Node source | Fixture | Result |
| --- | --- | --- | --- | --- |
| Contribution gate | `github_fetcher.py` | contribution service | core + gate variants | pass |
| Repo document | `repo_document.py` | repo builder | core + limits/order | pass |
| Issue document | `issues_document.py` | issue builder | core + issue matrix | pass |
| API tokens | `api_document.py` | API builder | all formats/languages | exact pass |
| Missing channels | `infer.py` | Node transport/validation | four golden inputs | pass |
| Model regression | artifacts/infer | Node client/mapper | four golden outputs | pass |
| Cache/persistence | production contracts | policy/services | Phase 4–5 matrices | pass |
| Public response | mapper/routes/snapshot | mapper/snapshot | role/backend suites | pass |

- [x] contribution, repository, issue and exact API parity
- [x] missing-channel and golden model regression
- [x] cache freshness and persistence regression
- [x] observability redaction and route/FE compatibility
- [x] no production GitHub calls
- [x] model/artifacts/training dataset unchanged
