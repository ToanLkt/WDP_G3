# Dev2Vec Phase 3 — Training-aligned Input Builder

## 1. Summary

Phase 3 makes the three production model channels follow the training extractors. Repository and API channels now require an accepted contribution gate and use only selected, user-attributed evidence. The issue channel remains independent and user-attributed.

## 2. Files Changed

- `repoDocumentBuilder.service.js`: deterministic repository-context and contribution document.
- `apiEvidenceBuilder.service.js`: dependency/import extraction from attributed files.
- `issueDocumentBuilder.service.js`: deterministic user-relevant issue document.
- `dev2vecInputBuilder.service.js`: canonical channel integration, availability, diagnostics, and final stats.
- GitHub contribution/PR/code evidence services: retain bounded evidence text and provenance.
- Pipeline metadata/cache policy/analysis orchestration: v8 metadata and retained-evidence fingerprinting.
- Phase 3 and updated Phase 1–2 regression scripts.

## 3. Final Repo Document Contract

The contribution gate must be accepted. Context contains repository name/full name, description, topics, languages, branch and README. Contribution sections contain at most 15 selected commit messages, five selected authored PRs, 20 paths per contribution, and bounded text for up to ten attributed files. Output is cleaned, lowercased, deterministic, deduplicated, and capped at 50,000 characters with a 12,000-character context budget and 38,000-character contribution budget.

Whole-repository source, package inventories, old scores, prior inference output, career direction, role predictions and skill-gap output are excluded.

## 4. Contribution-scoped Source Evidence

Files enter through selected commit details or selected authored PR files. Every normalized item records path, source type/id, touched-by-user provenance, bounded evidence content and change counts. Deduplication uses normalized path; the longest content wins, with deterministic source/id tie-breaking. Changed paths remain independently deduplicated.

## 5. Final API Token Contract

Only attributed file content/patches are parsed. Dependency support covers npm/composer manifests, npm/yarn/pnpm locks, Python requirements/Pipfile/pyproject, Gemfile, Maven/Gradle, Pub, Go, Cargo, Dockerfile, and GitHub workflows. Imports cover JS/TS, Python, JVM languages, Dart, C#, Rust, Ruby and Go.

Tokens are lowercased, trimmed, canonicalized to package roots, deduplicated, and sorted. Relative imports, URLs, aliases and malformed values are removed. Scoped npm imports retain `@scope/package`. Legacy category tokens such as `import:`, `server_route:` and `database_call:` are diagnostics only and never model API input.

## 6. Issue Document Contract

Only issues with authored, assigned, or commented relations are retained. The document contains relations, title, body, labels and at most three user comments. It is ordered deterministically, deduplicated by repository/number, limited to 20 issues, lowercased, and capped at 30,000 characters. General/team comments are not used.

## 7. Channel Availability Contract

Repository availability requires an accepted gate and non-empty final repository text. API availability requires the gate and non-empty final tokens. Issue availability requires non-empty final issue text. Invalid overrides cannot create content/status contradictions. `repoTextLength`, `issueTextLength`, and `apiTokenCount` are calculated from the final transport payload.

## 8. Removed Legacy Input Sources

Personal model input no longer consumes whole-repository packages, dependency inventories, controlled-directory scans, unattributed source, teammate contributions, old deterministic scoring, generated summaries, old model output, or category-prefixed source-usage tokens. Existing repository-wide analysis remains available for non-model diagnostics and UI behavior.

## 9. API/FE Compatibility

No public FE field name, type, or nesting changed. In particular, role/match/skill-gap response fields remain intact. New metadata is optional and additive.

## 10. Pipeline and Cache Version Impact

The pipeline is `dev2vec-analysis-pipeline-v8`; evidence builder is `dev2vec-evidence-builder-v7-training-aligned`. Repository, API and issue document versions are explicit. Cache comparison includes these versions, so v7 inputs are stale. The analysis fingerprint includes accepted selection, retained paths/issues and sorted final API tokens. Python model/artifact versions are unchanged.

## 11. Tests

`test:dev2vec-input-alignment` covers gate behavior, attribution, leakage, deterministic limits, dependency/import normalization, 4/5/6 import thresholds, issue limits, final stats and v8 metadata. Existing contract, input, taxonomy, GitHub evidence, role mapper, issue, contribution, source-usage and backend pipeline suites remain regression coverage. Tests use fixtures/mocks and do not call the production GitHub API.

## 12. Known Limitations

Patch-only dependency files must contain enough intact syntax for their parser. Evidence freshness is version/fingerprint protected, while proactive invalidation remains Phase 4. Import regexes intentionally mirror the training extractor and are not full language parsers.

## 13. Training Alignment Checklist

- [x] repository gate enforced
- [x] repository context only after gate
- [x] user commit messages and authored PR title/body
- [x] user changed paths and touched source/config only
- [x] no whole-repository source or prior model output in personal input
- [x] user-touched dependencies/imports only
- [x] import frequency at least five
- [x] tokens lowercase, deduplicated, sorted
- [x] issue document user-attributed only
- [x] channel availability and final source stats consistent
- [x] FE response contract preserved
