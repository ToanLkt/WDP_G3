# Backend Role Bias Audit

## A. Current Flow

### Repository analysis API

1. Route: `POST /api/analysis/repositories/:repoId` calls `analysisController.analyzeRepository` (`src/routes/analysis.routes.js:64`).
2. Controller delegates to service (`src/controllers/analysis.controller.js:4-12`).
3. Service loads repository, GitHub account, package evidence, and commits (`src/services/analysis.service.js:362-367`).
4. If package/source evidence has no `sourceContent`, it refreshes packages/source snippets (`src/services/analysis.service.js:375-380,568-572`).
5. Package/source collector fetches GitHub contents from configured root files and directories (`src/services/github/github.package.service.js:102-158,294-388`).
6. Dev2Vec input is built with repository, package record, user commits, and `issues: []` (`src/services/analysis.service.js:384-391`).
7. Builder creates `repoDocument`, `issueDocument`, `apiTokens`, source stats, source feature evidence, and evidence preview (`src/services/dev2vec/dev2vecInputBuilder.service.js:681-789,875-929`).
8. Node writes a temp JSON input and calls `python ml_service/infer.py --input <tmpFile>` (`src/services/dev2vec/dev2vec.service.js:137-146,161-172,184-240`).
9. Python loads Doc2Vec repo/issue/api models, classifier, label encoder, metadata, and skill vectors (`ml_service/infer.py:114-124`).
10. Python infers `repoVector`, zero or real `issueVector`, `apiVector`, concatenates them, and ranks roles by `classifier.predict_proba` (`ml_service/infer.py:126-139`).
11. Python computes skill-gap cosine similarity against role skill prototypes (`ml_service/infer.py:72-90,153-155`).
12. Node maps predictions to analysis summary/skill vector and stores `AnalysisResult` + `RepoAnalysisSnapshot` (`src/services/analysis.service.js:216-356,416-421`; `src/services/snapshot.service.js:79-134`).

### Role match APIs

- `POST /api/analysis/role-matches` routes to `analysisController.generateRoleMatches` (`src/routes/analysis.routes.js:206`; `src/controllers/analysis.controller.js:56-64`).
- `GET /api/analysis/repositories/:repoId/role-matches` routes to `analysisController.getRepositoryRoleMatches` (`src/routes/analysis.routes.js:246`; `src/controllers/analysis.controller.js:43-51`).
- Single-repo role matching reuses cached `AnalysisResult.dev2vec` if present (`src/services/analysis.service.js:438-457,508-514`).
- If cache is absent, single-repo role matching rebuilds input with `issues: []` and reruns inference (`src/services/analysis.service.js:480-505,513-544`).
- Multi-repo role matching builds one combined input from stored analysis/source fields (`src/services/analysis.service.js:547-561,786-849`; `src/services/dev2vec/dev2vecInputBuilder.service.js:932-972`).
- Role catalog is read from `DEV2VEC_ROLES` (`src/routes/role.routes.js:49`; `src/controllers/role.controller.js:8-27`; `src/constants/dev2vecCatalog.js:4-50`).

## B. Confirmed Root Causes

### 1. The top-role score is classifier probability, not the skill similarity score

Status: CONFIRMED.

Evidence:
- Python ranks roles with `np.argsort(probabilities)[::-1]` from `classifier.predict_proba`, not by skill-gap cosine similarity (`ml_service/infer.py:138-150`).
- Skill similarity is calculated later only inside `build_skill_gap` for roles already selected by classifier (`ml_service/infer.py:80-111,153-155`).
- Node maps `prediction.probability` directly to `matchScore` (`src/services/dev2vec/dev2vecRoleMapper.service.js:61-80`).

Debug reproduction:

| Fixture | Rank 1 | Rank 2 | Rank 3 | Important observation |
|---|---|---|---|---|
| Frontend React/Vite | backend 0.316289 | frontend 0.213506 | mobile 0.162435 | Frontend skill similarities were strong-ish (`React UI 0.532`, `Frontend Testing 0.528`), while backend skills were all missing, but classifier still ranked backend first. |
| Mobile Expo/RN | mobile 0.254710 | backend 0.245485 | frontend 0.177660 | Mobile wins narrowly; backend remains very close despite backend skill similarities all missing. |
| Backend Express | backend 0.372658 | devops 0.210623 | data_scientist 0.148846 | Backend fixture behaves as expected. |

Conclusion: the failure is not primarily a sort bug in Node. It is an artifact/model scoring issue: classifier probability can disagree with role skill prototype similarity.

### 2. Issue channel is always empty in active repository analysis and single-repo role matching

Status: CONFIRMED.

Evidence:
- Repository analysis passes `issues: []` (`src/services/analysis.service.js:384-391`).
- Single-repo role matching also passes `issues: []` (`src/services/analysis.service.js:498-505`).
- Builder can build an issue document only if `payload.issues` exists (`src/services/dev2vec/dev2vecInputBuilder.service.js:743-750,777-781`).
- Python converts empty issue text to a 150-dimensional zero vector (`ml_service/infer.py:62-69,129-131`).

Impact:
- Every current runtime prediction effectively uses a 580-dimensional vector with the middle 150 dimensions zeroed.
- There is no denominator adjustment or retraining visible for "repo + api only" runtime inputs. The classifier was trained on combined repo + issue + api vectors (`ml_service/train.py:316-358`), so inference distribution may be shifted when issue evidence is absent.

### 3. API channel is dependency/package-token extraction, not true API-call/import extraction

Status: CONFIRMED.

Evidence:
- Runtime API tokens are normalized from package records, analysis packages/frameworks/languages/configs (`src/services/dev2vec/dev2vecInputBuilder.service.js:753-759`).
- Package parser detects package names and broad framework labels from `package.json` names (`src/services/github/github.parser.service.js:1-24,27-39`).
- Python creates `api_text = " ".join(api_tokens)` (`ml_service/infer.py:132-134`).
- No active AST/import/API-call parser is used in runtime source collection.

Impact:
- A frontend app that uses `fetch`, `axios`, auth SDKs, or API integration dependencies can receive signals that overlap with backend/API concepts.
- The channel name "api" is broader than true Dev2Vec API-call evidence.

### 4. Frontend/Mobile source evidence is underrepresented by the source collector/category heuristics

Status: HIGHLY LIKELY.

Evidence:
- Controlled source directories include generic backend-heavy paths such as `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/middlewares`, plus `src/config`, `src/utils`, `scripts`, `ml_service` (`src/services/github/github.package.service.js:12-22`).
- `inferSourceCategory` classifies `src/services/*` as `database`, and route/controller/app/swagger as `rest_api` (`src/services/dev2vec/dev2vecInputBuilder.service.js:316-337`).
- Category priority and quotas emphasize backend-style categories before general source: `rest_api`, `database`, `authentication`, `docker`, `testing` (`src/services/dev2vec/dev2vecInputBuilder.service.js:22-45,452-470`).
- There is no equivalent first-class category for frontend components/pages/hooks/assets or mobile screens/navigation/native folders.

Impact:
- Frontend projects with `src/services/api.ts`, auth helpers, or API clients can be categorized as `database` or backend-adjacent "general/config" evidence rather than frontend evidence.
- React/Vite dependencies do enter `apiTokens`, but component/page structure does not get a first-class frontend category like backend route/controller/model does.

### 5. Backend/general API keywords are broad, while frontend/mobile detection is narrower

Status: HIGHLY LIKELY.

Evidence:
- Backend REST API aliases include very general terms: `API`, `Endpoint`, `Route`, `Controller`, `Swagger`, `OpenAPI`, `Express.js`, `Node.js` (`src/constants/dev2vecCatalog.js:52-57`).
- Mobile has `API Integration` as one of its own skills, but classifier top role is still independent of that skill gap (`src/constants/dev2vecCatalog.js:65-69`; `ml_service/infer.py:138-155`).
- Feature evidence only has explicit buckets for `REST API`, `Database`, `Authentication`, `Docker Basics`, `API Testing`, and `Documentation`; no React/Vite/Mobile feature buckets are used to rebalance role predictions (`src/services/dev2vec/dev2vecInputBuilder.service.js:593-629`).

Impact:
- The UI-side "Frontend Web App" or framework tags are stored/displayed, but the model probability is not constrained or calibrated by a frontend/mobile feature detector.

### 6. Cached Dev2Vec result can return old role predictions

Status: CONFIRMED.

Evidence:
- `hasCachedDev2VecResult` returns true when stored `analysis.dev2vec.rolePredictions` and `skillGaps` exist (`src/services/analysis.service.js:438-443`).
- Single-repo role matching returns `buildDev2VecOutputFromAnalysis(analysis)` without rerunning inference (`src/services/analysis.service.js:508-514`).
- There is no `forceRegenerate` option on role match APIs in `analysis.routes.js`.

Impact:
- If a repository was analyzed before a model/input-builder change, role-match endpoints can keep returning the old `AnalysisResult.dev2vec`.
- Reanalyzing with `POST /api/analysis/repositories/:repoId` creates a new `AnalysisResult`, but role-match reads the latest by `analyzedAt`; there is no explicit cache invalidation endpoint for old role match output.

## C. Possible But Unconfirmed Causes

### 1. Training artifact calibration favors Backend on short repo/api-only inputs

Status: HIGHLY LIKELY, not fully proven without retraining diagnostics.

Evidence:
- Dataset is balanced by label count: 15 samples per role (`ml_service/artifacts/model_metadata.json:25-33`).
- However, the minimal frontend fixture still produced backend rank 1 despite frontend skill prototype similarities being higher than backend similarities.
- Classifier is trained on concatenated vectors, while production often has zero issue channel (`ml_service/train.py:332-358`; `ml_service/infer.py:129-138`).

Interpretation:
- The classifier likely learned boundaries that do not handle short frontend/mobile repo+api-only inputs well.
- This is a model/data calibration issue, not a hard-coded backend fallback.

### 2. Multi-repo role matching may lose raw source evidence

Status: POSSIBLE.

Evidence:
- Multi-repo input builder reads `source.analysis?.packages`, `frameworks`, `languages`, etc. (`src/services/dev2vec/dev2vecInputBuilder.service.js:941-961`).
- Stored `AnalysisResult.packages` are strings, not the full `RepositoryPackage.detectedFiles` source snippets (`src/models/AnalysisResult.js:73-94`).

Impact:
- Multi-repo matching may use less source structure than single-repo analysis, increasing dependence on broad package/language tokens.

## D. Why Backend Often Ranks First

1. Final rank is the classifier probability, not the strongest skill similarity. The frontend fixture had frontend prototype similarity evidence, but backend probability still ranked first.
2. Issue vectors are usually zero in runtime. The classifier still expects a 580-dimensional RIAs-style vector, so missing issue evidence can shift predictions.
3. API/dependency tokens are broad. Frontend/mobile apps often include API/auth/testing/general JavaScript/TypeScript evidence that overlaps with backend training vocabulary.
4. Backend-oriented source categories are richer than frontend/mobile categories. The builder explicitly models REST API, database, authentication, Docker, and testing evidence, but not component/page/hook/native navigation as first-class role evidence.
5. Cached `AnalysisResult.dev2vec` can preserve older predictions until the repo is reanalyzed.

## E. Differences From The Intended Dev2Vec Design

- The active backend does not collect GitHub issues or PR history for runtime analysis; `issueDocument` is empty.
- The "API" channel is dependency/framework/config token extraction, not true API-call extraction from source or commits.
- Role ranking is a Logistic Regression classifier over concatenated vectors, while skill gaps use cosine similarity after the role ranking step.
- Source evidence extraction uses heuristic path/category rules, not AST parsing for imports/API calls.
- No runtime debug output exposes repo/issue/api contribution per role; only final classifier probability and skill-gap similarity are returned.

## F. Minimal Fix Proposals, Awaiting Confirmation

No source patch has been applied.

Recommended patch direction:

1. Add a model-debug utility or admin-only debug mode that prints, per role: classifier probability, skill-gap average similarity, repo/api/issue vector source availability, and top evidence features.
2. Add frontend/mobile feature buckets in `detectRepoFeatureEvidence` and source categorization:
   - Frontend: React/Vue/Angular/Next/Vite, components/pages/hooks/context/assets, JSX/TSX, CSS/SCSS/Tailwind.
   - Mobile: React Native/Expo/Flutter/Dart, `android/`, `ios/`, `app.json`, `eas.json`, navigation packages.
3. Calibrate final role ranking without hard-coding roles:
   - Combine classifier probability with role-specific prototype similarity, or
   - Retrain classifier with production-like inputs where issue channel is missing, or
   - Train/use a classifier variant for available channel sets.
4. Add `forceRegenerate` or `ignoreCachedDev2Vec` to role-match APIs, or document that users must rerun repository analysis before trusting role matches after model changes.
5. Rename or document `apiTokens` as dependency/framework tokens unless true API-call/import extraction is implemented.

Avoid:
- Do not force `Frontend Web App` to Frontend directly.
- Do not add arbitrary frontend/mobile bonus scores.
- Do not change response contract unless adding optional debug fields.

## G. Regression Tests To Add

Add production-pipeline tests that run through `buildDev2VecInputFromRepositoryAnalysis` and `runDev2VecInference`:

1. Frontend fixture:
   - package: `react`, `react-dom`, `vite`, `react-router-dom`, `tailwindcss`
   - files: `src/components/App.tsx`, `src/pages/Home.tsx`, `src/hooks/useAuth.ts`
   - assertion: frontend rank should beat backend when no backend framework/database/server route evidence exists.

2. Mobile fixture:
   - package: `react-native`, `expo`, `@react-navigation/native`
   - files: `app.json`, `eas.json`, `src/screens/Home.tsx`, `android/`, `ios/`
   - assertion: mobile rank should beat backend when no Express/Nest/database backend evidence exists.

3. Backend fixture:
   - package: `express`, `mongoose`, `jsonwebtoken`, `bcrypt`
   - files: `src/routes`, `src/controllers`, `src/models`
   - assertion: backend rank should remain highest.

4. Cache regression:
   - Existing `AnalysisResult.dev2vec` should be reused only when desired.
   - A forced regeneration path should rerun input builder and `infer.py`.

## H. Debug Output From This Audit

Command used:

```powershell
.\.venv\Scripts\python.exe - << equivalent inline script
from ml_service.infer import run_inference
run_inference(payload, Path('ml_service/artifacts'))
```

Summary:

| role | frontend fixture score | mobile fixture score | backend fixture score |
|---|---:|---:|---:|
| backend | 0.316289 rank 1 | 0.245485 rank 2 | 0.372658 rank 1 |
| frontend | 0.213506 rank 2 | 0.177660 rank 3 | not top 3 |
| mobile | 0.162435 rank 3 | 0.254710 rank 1 | not top 3 |
| devops | not top 3 | not top 3 | 0.210623 rank 2 |
| data_scientist | not top 3 | not top 3 | 0.148846 rank 3 |

Frontend fixture skill similarities:

- Backend skills: all missing, max `REST API 0.332393`.
- Frontend skills: all weak, `React UI 0.532230`, `Frontend Testing 0.528029`, `Component Design 0.413454`, `State Management 0.401309`, `Responsive Design 0.357730`.

This is the strongest reproduction that the current top-role bug is in model probability/ranking calibration, not in the displayed skill-gap similarity mapper.

