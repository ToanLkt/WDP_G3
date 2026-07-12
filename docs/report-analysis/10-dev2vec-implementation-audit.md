# Dev2Vec Implementation Audit

## 1. Final conclusion

- dev2vec:Repos: CONFIRMED. Runtime builds a real `repoDocument` from repository metadata, package/config evidence, commit summaries, changed file paths, and selected source/documentation snippets, then `ml_service/infer.py` loads `doc2vec_repo.model` and creates `repoVector`.
- dev2vec:Issues: PARTIALLY CONFIRMED. The Python model and vector path exist, but current backend runtime passes `issues: []`, so `issueDocument` is empty for repository analysis and single-repo role matching. Issue evidence is not currently implemented in the active backend flow.
- dev2vec:APIs: PARTIALLY CONFIRMED. Runtime creates `apiTokens` from package/dependency/framework/config/language tokens and infers `apiVector` with `doc2vec_api.model`. It is not true API-call extraction from source code or commit diffs.
- dev2vec:RIAs: CONFIRMED in model inference. `infer.py` concatenates `repoVector + issueVector + apiVector` into a 580-dimensional `combinedVector`, then uses that vector for classifier probability and skill prototype cosine similarity. In current runtime the issue segment is normally a zero vector.
- Current mechanism: a backend rule-based evidence builder creates `repoDocument`, empty or optional `issueDocument`, and `apiTokens`; Node writes a temp JSON input; Python loads three pre-trained Doc2Vec models and a classifier; Python concatenates vectors, predicts roles, and computes skill gaps by cosine similarity; Node maps the result to analysis snapshots and role match responses.

## 2. Evidence usage matrix

| Evidence type | Collected | Stored | Used in vectorization | Used in scoring | Status | File | Lines |
|---|---:|---:|---:|---:|---|---|---|
| README | Yes, if present in repository fields or fetched as Markdown file | Repository fields / `RepositoryPackage.detectedFiles` | Yes, in `repoDocument` source/docs sections | Indirectly through repo vector and documentation heuristics | CONFIRMED | `src/services/dev2vec/dev2vecInputBuilder.service.js` | 279-287, 688-703, 550-566, 875-929 |
| Repository description | Yes from GitHub repo sync | `Repository.description`, `Repository.rawData` | Yes, in `repoParts` and `repoDocument` | Indirectly through repo vector/classifier | CONFIRMED | `src/services/github/github.repository.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 41-60; 688-703 |
| Repository metadata | Yes from `/user/repos` | `Repository` model | Yes: name, fullName, topics, language, branch | Indirectly through repo vector/classifier | CONFIRMED | `src/services/github/github.repository.service.js`; `src/models/Repository.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 41-60; 688-703 |
| Topics / tags | Yes from GitHub repo object | `Repository.topics` | Yes in `repoParts` | Indirectly | CONFIRMED | `src/services/github/github.repository.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 51-52; 688-703 |
| Programming languages | Primary language from repo sync; additional languages from package detection | `Repository.language`, `RepositoryPackage.languages`, `AnalysisResult.languages` | Yes in `repoParts` and `apiTokens` candidate sources | Indirectly and in feature heuristics | CONFIRMED | `src/services/github/github.repository.service.js`; `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 51; 303-330, 362-379; 688-730, 753-759 |
| Packages / dependencies | Yes from package files | `RepositoryPackage.packages`, `detectedFiles`, `rawData` | Yes as `apiTokens` and repo text | Yes through API vector and classifier | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 294-316, 362-388; 251-276, 753-759, 897-929 |
| Config files | Yes from configured package/config paths and source root files | `RepositoryPackage.packageFiles`, `configs`, `detectedFiles` | Yes in repo document/source evidence and api token candidates | Indirectly | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 23-45, 278-340, 362-388; 316-337, 544-570 |
| File paths | Yes from package/source crawl and commit details | `RepositoryPackage.detectedFiles`, `RepositoryCommit.files` | Yes in repo document and source evidence | Yes indirectly and in repo feature heuristics | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/github/github.commit.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 102-158; 74-91; 291-338, 632-639, 733-739 |
| Project structure | Partially, via selected directories and file paths/content snippets | `RepositoryPackage.detectedFiles` | Yes, as source evidence sections | Indirectly | PARTIALLY USED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 12-22, 112-158; 483-570 |
| Commit messages | Yes from GitHub commits endpoint | `RepositoryCommit.message` | Yes in repo document commit summaries | Indirectly | CONFIRMED | `src/services/github/github.commit.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 37-70, 97-108; 544-547, 733-739 |
| Commit file changes | Yes only when commits are fetched with `includeStats` for first 30 commits | `RepositoryCommit.files`, `changedFiles` count | Yes if stored files exist | Indirectly | PARTIALLY USED | `src/services/github/github.commit.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 74-91; 632-639, 733-739 |
| API calls | No AST/call parser found in runtime | Not stored as API calls | No | No | NOT IMPLEMENTED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 294-316, 753-759 |
| Framework signals | Yes from package parser and keyword heuristics | `RepositoryPackage.frameworks`; `repoFeatureEvidence` | Yes as api tokens/repo text | Yes through feature adjustment in skill mapping | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js`; `src/services/dev2vec/dev2vecRoleMapper.service.js` | 294-316, 362-379; 593-629; 188-218 |
| Issue title/body | Builder supports it, but runtime passes empty arrays | Not stored in backend issue model; no issue collection found | No in active runtime | No in active runtime | NOT IMPLEMENTED | `src/services/analysis.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 384-391, 498-505; 743-750, 897-910 |
| Pull request data | No active backend PR crawler found | Not stored | No | No | NOT IMPLEMENTED | `rg issue/pull_request` audit | N/A |
| Branches | Default branch stored from repo metadata | `Repository.defaultBranch` | Yes in `repoParts` | Indirectly | PARTIALLY USED | `src/services/github/github.repository.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 53; 688-703 |
| Test files | Source crawler selects test paths/scripts if present | `RepositoryPackage.detectedFiles` | Yes in repo document testing section | Yes indirectly and via API Testing feature heuristic | CONFIRMED | `src/services/dev2vec/dev2vecInputBuilder.service.js` | 330, 368, 459, 621-624 |
| Docker / deployment files | Yes via package/config/source crawler | `RepositoryPackage.detectedFiles`, `configs` | Yes in repo document Docker section | Yes indirectly and via Docker feature heuristic | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 23-45, 331-334; 316, 366, 560-564, 617-620 |
| Package names | Yes | `RepositoryPackage.packages` | Yes as `apiTokens` | Yes through API vector | CONFIRMED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 294-316, 362-379; 261-276, 753-759 |
| Import statements | Not parsed separately | Not stored separately | Only if import text appears inside selected source snippets in repoDocument | Not as API vector tokens | PARTIALLY USED | `src/services/github/github.package.service.js`; `src/services/dev2vec/dev2vecInputBuilder.service.js` | 51-61, 496-510, 544-570 |

## 3. Dev2Vec model audit

| Component | Implemented? | Model/file | Input | Output | Evidence |
|---|---|---|---|---|---|
| dev2vec:Repos | Yes | `ml_service/artifacts/doc2vec_repo.model` | `repoDocument` | 230-dim `repoVector` | `ml_service/infer.py:116-128`, `src/services/dev2vec/dev2vecInputBuilder.service.js:897-900` |
| dev2vec:Issues | Model yes; active evidence no | `ml_service/artifacts/doc2vec_issue.model` | `issueDocument`, but active runtime sends empty issue arrays | 150-dim zero vector when empty | `ml_service/infer.py:117,129-131,169-177`; `src/services/analysis.service.js:388,502` |
| dev2vec:APIs | Dependency/API-token vector yes; true API-call extraction no | `ml_service/artifacts/doc2vec_api.model` | `" ".join(apiTokens)` | 200-dim `apiVector` | `ml_service/infer.py:118,132-134`; `src/services/dev2vec/dev2vecInputBuilder.service.js:753-759,897-902` |
| dev2vec:RIAs | Yes | `ml_service/infer.py` | repo + issue + api vectors | 580-dim `combinedVector` | `ml_service/infer.py:134-138,153-165`; `ml_service/validate_contract.py:43-52` |
| Current project vector pipeline | Yes | Node builder + Python artifacts | repository/package/commit/source evidence to JSON payload | role predictions, vectors, skill gaps | `src/services/analysis.service.js:384-421`; `src/services/dev2vec/dev2vec.service.js:184-240` |

## 4. End-to-end call chain

1. API route: `POST /api/analysis/repositories/:repoId` calls `analysisController.analyzeRepository` in `src/routes/analysis.routes.js:64`.
2. Controller: `analysisController.analyzeRepository` delegates to `analysisService.analyzeRepository` in `src/controllers/analysis.controller.js:4-12`.
3. Service loads data: `analysis.service.js` loads repository, GitHub account, package record, and commits from `RepositoryPackage` and `RepositoryCommit` in `src/services/analysis.service.js:362-367`.
4. Evidence collector: if package/source evidence is missing, it calls `fetchRepositoryPackages` in `src/services/analysis.service.js:375-380,568-572`.
5. GitHub package/source collection: `fetchRepositoryPackages` fetches GitHub contents, package files, Markdown docs, controlled source directories, and stores `RepositoryPackage` in `src/services/github/github.package.service.js:102-158,294-388`.
6. Dev2Vec input builder: `buildDev2VecInputFromRepositoryAnalysis` receives repository, package record, user commits, and `issues: []` in `src/services/analysis.service.js:384-391`.
7. Evidence document construction: builder creates `repoDocument`, `issueDocument`, `apiTokens`, `sourceStats`, and `evidencePreview` in `src/services/dev2vec/dev2vecInputBuilder.service.js:681-789,875-929`.
8. Python execution: Node normalizes input, writes `tmp/dev2vec-input-*.json`, and runs `python ml_service/infer.py --input <tmpFile>` in `src/services/dev2vec/dev2vec.service.js:65-75,137-146,161-172,184-240`.
9. Model inference: Python loads three Doc2Vec models, classifier, label encoder, metadata, and skill vectors in `ml_service/infer.py:114-124`.
10. Vector output: Python infers `repoVector`, `issueVector`, `apiVector`, concatenates `combinedVector`, then predicts classifier probabilities in `ml_service/infer.py:126-139`.
11. Similarity: Python computes cosine similarity between `combinedVector` and skill prototypes in `ml_service/infer.py:72-90,153-155`.
12. Analysis result: Node builds `AnalysisResult` payload and stores vectors, predictions, skill gaps, source stats, and evidence preview in `src/services/analysis.service.js:216-356,416-421`.
13. Role match response: `mapDev2VecOutputToRoleMatches` maps classifier predictions to match cards in `src/services/dev2vec/dev2vecRoleMapper.service.js:61-113`; role-match endpoints call it in `src/services/analysis.service.js:475-477,758-762,835-839`.

## 5. Exact evidence documents

Runtime JSON sent to Python contains only:

```js
{
  requestId,
  repoDocument: evidence.repoDocument,
  issueDocument: evidence.issueDocument,
  apiTokens: evidence.apiTokens,
  topN
}
```

Evidence:
- `src/services/dev2vec/dev2vec.service.js:65-75` normalizes exactly these fields.
- `src/services/dev2vec/dev2vec.service.js:137-146` writes this JSON to a temp file.
- `src/services/dev2vec/dev2vec.service.js:161-172` passes the temp file to `infer.py`.

`repoDocument` structure:

```text
## Repository metadata
<repository name/fullName/description/topics/language/branch/readme/package/commit metadata>

## API/dependency tokens
<apiTokens joined by spaces>

## Commit summaries
- <sha> <message> <changed files>

## Source evidence: REST API
FILE: ...
CATEGORY: ...
KEYWORDS: ...
SNIPPET:
...

## Source evidence: Database
...

## Source evidence: Authentication
...

## Source evidence: Docker/Deploy
...

## Source evidence: Testing
...

## Documentation evidence
...

## ML service evidence
...

## Additional source/config evidence
...
```

Evidence: `src/services/dev2vec/dev2vecInputBuilder.service.js:544-570`.

`issueDocument` structure if data is provided:

```text
<issue title> <issue body> <labels> <comments>
```

Evidence: `src/services/dev2vec/dev2vecInputBuilder.service.js:743-750,777-781`.

Current active repository analysis sends:

```js
issues: []
```

Evidence: `src/services/analysis.service.js:384-391` and `src/services/analysis.service.js:498-505`. Therefore `issueDocument` is currently an empty string, `infer.py` emits a zero `issueVector`, and `vectorSources.issues` is `false` for this flow (`ml_service/infer.py:62-69,129-131,169-177`).

`apiDocument` is not a named field. Runtime uses:

```python
api_text = " ".join(api_tokens)
api_vector = infer_source(api_model, api_text, VECTOR_DIMS["api"], 1103)
```

Evidence: `ml_service/infer.py:132-134`. The backend field is `apiTokens`, not `apiDocument`.

## 6. Slide-safe wording

A. If saying the project uses one integrated vector pipeline:

> The project applies a Dev2Vec-inspired integrated pipeline: repository evidence and dependency/API tokens are transformed into Doc2Vec vectors, concatenated into one 580-dimensional representation, then used for role classification and skill-gap similarity.

B. If saying the project has multiple evidence types but not three fully active evidence crawlers:

> The backend uses separate Doc2Vec artifacts for repository, issue, and dependency/API-token channels, but the active runtime currently provides repository and dependency/package evidence; issue evidence is not yet crawled by the backend and usually becomes a zero-vector segment.

RECOMMENDED: B.

C. If the code truly had full Repos, Issues, APIs, and RIAs:

> The project implements the original Dev2Vec RIA flow: repository text, issue history, and API-call evidence are embedded by separate models, concatenated into RIAs, and used by a classifier for role matching.

Do not use C for the current codebase because active runtime does not collect issues and does not parse true API calls.

## 7. Claims to avoid

- "The project trains three Dev2Vec models during production requests." Training exists in `ml_service/train.py`, but production calls only `ml_service/infer.py`.
- "The backend currently crawls issue history for role matching." Active service passes `issues: []`.
- "The project parses true API calls from source code or commits." Runtime uses package/dependency/framework/config/language tokens and source snippets, not AST/call extraction.
- "The project uses pull request data." No active PR crawler/storage path was found.
- "The issue vector is based on live GitHub issues." Current repository analysis sends an empty issue input.
- "All three evidence sources are equally active." The issue channel exists technically but is not populated in the active backend flow.
- "Commit file changes are always available." They are stored only when commit detail fetch is requested with `includeStats`, and then only for the first 30 commits.

## 8. Recommended slide content

### Vận dụng Dev2Vec trong dự án

- Thu thập repository evidence từ GitHub: metadata, topics, language, package/config files, documentation/source snippets, commit messages, and changed file paths when available.
- Xây dựng input cho ML service gồm `repoDocument`, `issueDocument`, and `apiTokens`.
- Sử dụng ba Doc2Vec artifacts: repository 230 dimensions, issue 150 dimensions, dependency/API-token 200 dimensions.
- Ghép ba vector thành `combinedVector` 580 dimensions để dự đoán role bằng classifier.
- Tính cosine similarity giữa `combinedVector` và skill prototypes để sinh matched skills, weak skills, missing skills, and recommended next skills.
- Giới hạn hiện tại: backend chưa crawl GitHub issues/PRs trong runtime, nên issue evidence thường rỗng; API channel hiện là dependency/package/framework token extraction, không phải parser API-call từ source code.

Slide-safe one-liner:

> Dự án triển khai pipeline Dev2Vec-inspired với ba vector channel và vector ghép 580 chiều, nhưng runtime hiện chủ yếu dựa trên repository evidence và dependency/API-token evidence; issue evidence chưa được crawl trong backend.

