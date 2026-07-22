# Dev2Vec Phase 2 — User-attributed GitHub Evidence

Date: 2026-07-22

## 1. Summary

Before Phase 2, any repository selected from the linked account could provide Dev2Vec context without a minimum verified contribution, production had no pull-request acquisition, issue relevance only covered authored/assigned, and an unrelated repository-wide issue fallback existed.

After Phase 2, a repository becomes personal Dev2Vec evidence only after at least five changed lines from identity-verified user commits and/or user-authored PRs. PR acquisition is author-only. Issues are selected only when authored, assigned or commented by the linked user; only that user's comments are retained. The unrelated fallback is removed. Phase 1 strict output validation, topN 1..3 and classifier-primary behavior remain unchanged.

## 2. Files Changed

| File | Function/responsibility |
| --- | --- |
| `src/services/github/github.contribution.service.js` | Pure identity-aware contribution selection, line aggregation and gate summary |
| `src/services/github/github.pullRequest.service.js` | PR list/detail/files acquisition, author filtering, normalization and status |
| `src/services/github/github.issue.service.js` | authored/assigned/commented relations, linked-user comment acquisition, no fallback |
| `src/services/analysis.service.js` | Active orchestration, gate application, attributed metadata persistence/fingerprint |
| `src/services/dev2vec/dev2vecInputBuilder.service.js` | Gate fail-safe, PR evidence hand-off, issue document/status consistency |
| `src/services/dev2vec/dev2vecPipelineMetadata.service.js` | Pipeline/evidence/issue versions for cache invalidation |
| `scripts/testDev2VecGithubEvidencePhase2.js` | Contribution, PR, issue and builder integration fixtures |
| `scripts/testGithubIssueEvidencePipeline.js` | New no-fallback and commented-issue assertions |
| `package.json` | `test:dev2vec-github-evidence` command |

Phase 1 files/tests remain part of the same uncommitted worktree and were not reverted.

## 3. Contribution Gate

Formula:

```text
verifiedChangedLines = sum(valid additions) + sum(valid deletions)
accepted = identity verified AND evidence has numeric stats AND verifiedChangedLines >= 5
```

Only selected user commits and author-verified PRs are counted. Finite non-negative additions/deletions are required as a pair; missing values add zero and increment `missingStatsCount`. Repository size, total LOC and teammate activity are never substitutes.

Identity attribution reuses the existing strict order: author/committer login, GitHub user ID, verified email, then the existing username/name fallback. Metadata names are normalized to `github_login`, `github_user_id`, `verified_email`, and `username_name_fallback`.

The summary shape contains `verified`, `accepted`, `status`, threshold, additions/deletions/changed lines, user commit/PR counts, deduplicated paths, attribution methods, missing-stat count, selected commit SHAs and selected PR number/update timestamps. Status is `available`, `insufficient_contribution`, or `contribution_unverified`.

Dev2Vec evidence limits are 15 commits and 20 changed files per commit. The global GitHub commit-list behavior is not changed because other product features consume it. If the gate fails, the builder forces `repoDocument=""`, `apiTokens=[]`, and repo channel false; the repository remains in DB/UI.

## 4. Pull Request Evidence

Flow and endpoints:

```text
GET /repos/{owner}/{repo}/pulls?state=all&per_page=30&sort=updated&direction=desc
→ filter linked username as PR author
→ stable sort updated/created descending, PR number tie-break
→ deduplicate number and select at most 5
→ GET /pulls/{number}
→ GET /pulls/{number}/files?per_page=20
```

Normalized records contain only number, bounded title/body, state, author login, timestamps, additions/deletions, changed-file count, up to 20 deduplicated paths, `relation: "authored"`, and identity verification. Review request, assignment, merge action and teammate PRs are not author evidence.

Fetch status is `available`, `empty`, `fetch_failed`, `rate_limited`, `not_authorized`, or `identity_missing`. A PR failure returns empty PR evidence and metadata; it does not throw out sufficient commit evidence or crash analysis. Full GitHub PR payloads are not persisted.

## 5. Issue Evidence

At most 30 non-PR issue records are inspected and at most 20 relevant issues are selected. Relations are stored deterministically in `authored`, `assigned`, `commented` order. An issue may have multiple relations without duplication.

When an issue has comments, the comment endpoint is queried with bounded sequential requests. Only comments whose author login equals the linked username are retained, ordered deterministically and capped at three. Stored comments contain bounded sanitized body and created/updated timestamps. Teammate comments never reach `issueDocument`.

PR-shaped Issues API objects remain excluded. An issue with no relation is excluded. The old repository-wide fallback has been removed completely. Successful zero-repository-issue results use `empty`; successful inspection with no user-relevant issue uses `no_user_relevant_issues`. Authentication, rate and fetch failures map to `not_authorized`, `rate_limited`, and `fetch_failed`; missing linked identity maps to `identity_missing`.

The builder fail-safe guarantees that non-available issue status yields an empty document and false channel. Conversely, an `available` override with empty document is downgraded to `empty` and false. Comment fetch failures are counted; if they leave no verifiable relevant issue, the issue acquisition is marked unavailable instead of pretending it is empty.

## 6. Data Flow

```text
linked GitHub identity
→ list commits (global behavior retained)
→ identity-filter commits
→ fetch details/code evidence
→ select max 15 commits × 20 paths
→ fetch max 5 user-authored PRs × 20 paths
→ calculate verified contribution summary
→ apply >=5 changed-line gate
→ fetch max 30 issues and linked-user comments
→ select max 20 authored/assigned/commented issues
→ pass attributed commits/PRs/issues plus gate metadata to input builder
→ Python only sees repository/API channels when gate passed
```

`AnalysisResult.rawAnalysis` stores the bounded contribution summary, PR evidence metadata/normalized records and issue relation/comment metadata. Cache metadata stores an evidence fingerprint containing the summary, selected commit SHAs, PR numbers/update timestamps, issue numbers/update timestamps and user-comment update timestamps.

## 7. Cache/Version Impact

- `analysisPipelineVersion`: v6 → `dev2vec-analysis-pipeline-v7`
- `evidenceBuilderVersion`: v5 → `dev2vec-evidence-builder-v6-user-attributed`
- `issueEvidenceVersion`: v1 → `github-issue-evidence-v2-user-comments`
- Python `modelVersion`: unchanged

The existing cache comparison checks all these versions, so v6 analyses are not reused as if they had Phase 2 semantics. Repository fingerprint behavior remains; the bounded evidence fingerprint is persisted for audit/rebuild comparison. A full issue/PR-only proactive cache refresh redesign remains Phase 4 work.

## 8. Tests

Mock/fixture coverage includes threshold boundaries, teammate exclusion, commit+PR aggregation, missing stats, identity mismatch, organization and owner scenarios, 15×20 commit limits, author-only PR selection/deduplication/5×20 limits, normalized PR fields, rate-limit behavior, all issue relations, user-only comments, multi-relation deduplication, 30/20/3 issue limits, PR-shaped issue exclusion, no fallback, gate-to-builder suppression, accepted org repository flow, v7 versioning, and all Phase 1 regression suites.

All required checks passed:

- `npm run test:dev2vec-contract`
- `npm run test:dev2vec-input`
- `npm run test:dev2vec-evidence-taxonomy`
- `npm run test:dev2vec-github-evidence`
- `node scripts/testDev2VecChannelAvailability.js`
- `node scripts/testDev2VecRoleMapper.js`
- `node scripts/testGithubIssueEvidencePipeline.js`
- `node scripts/testRepositoryUserContributionEvidence.js`
- `npm run test:backend-analysis-pipeline`
- `.venv\Scripts\python.exe ml_service\validate_contract.py`
- `node --check` for every changed/created JavaScript file
- `git diff --check`

The channel harness received local process permission because it launches the repository's Python inference subprocess. The logged issue 403 is an intentional mocked rate-limit fixture. No production GitHub API was called.

## 9. Known Limitations

- Whole-repository package/source collection still exists after a gate passes; Phase 3 will restrict final `repoDocument` composition.
- Final `apiTokens` still include repository-wide dependencies/imports after a gate passes; Phase 3 will align them to user-touched files and training frequency.
- PR evidence currently persists inside the flexible analysis raw metadata rather than a dedicated collection.
- PR detail/file acquisition is deliberately sequential and bounded; partial per-PR failure reports fetch failure for the PR channel rather than returning partially normalized PRs.
- Cache v7 invalidates v6, but proactive revalidation on issue/comment-only changes without a new analysis request belongs to Phase 4.

## 10. Training Alignment Checklist

- [x] contribution threshold
- [x] user-attributed commits
- [x] user-authored PRs
- [x] PR changed paths
- [x] authored issues
- [x] assigned issues
- [x] commented issues
- [x] user comments only
- [x] unrelated issue fallback removed
- [ ] final repoDocument aligned
- [ ] final apiTokens aligned
