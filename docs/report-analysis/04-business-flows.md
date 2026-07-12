# 04. Business Flows

## 1. Authentication

Flow: Client -> `/api/auth/register` or `/api/auth/login` -> validators -> `auth.controller` -> `auth.service` -> `User`/`StudentProfile` -> JWT response.

- Sync/async: async DB operations.
- Auth: public for register/login/google/github start/callback; JWT for logout/change-password/me.
- Authorization: `authMiddleware` validates Bearer token and revoked token (`src/middlewares/auth.middleware.js:1-44`).
- Persisted outputs: user, profile, revoked token on logout.
- External: Google aud check if `GOOGLE_CLIENT_ID`; GitHub OAuth token/profile in callback.
- Error path: missing JWT secret, invalid/revoked token, validation errors.

## 2. GitHub Connection / Synchronization

Flow: Client -> `/api/github/oauth` -> `authMiddleware` -> `githubController.startOAuth` -> `github.service` -> `GithubOAuthState` -> redirect to GitHub. Callback -> `/api/github/oauth/callback` -> GitHub token/profile -> `GithubAccount` + `StudentProfile` update -> frontend/mobile redirect.

- Sync/async: async HTTP + DB.
- External: GitHub OAuth and GitHub user API (`src/services/github/github.api.service.js:35-65`).
- Cache/persist: OAuth state TTL (`GithubOAuthState.js:34`), account record.
- Fallback/error: invalid state/code or GitHub error redirects with frontend error params.

## 3. Repository Import

Flow: Client -> `/api/github/repositories` -> `authMiddleware` -> `githubController.getRepositories` -> `github.service`/`github.repository.service` -> GitHub repositories API -> upsert `Repository` records -> response.

- Sync/async: async HTTP + DB.
- External: GitHub repo API (`src/services/github/github.api.service.js:65-85`).
- Persisted outputs: `Repository`.
- Cache behavior: `/api/github/repositories/cached` reads MongoDB only.

## 4. Repository Analysis

Flow: Client -> `POST /api/analysis/repositories/:repoId` -> `authMiddleware` -> `analysisController.analyzeRepository` -> `analysis.service.analyzeRepository` -> read `Repository`, `GithubAccount`, `RepositoryPackage`, `RepositoryCommit` -> `analysis.engine` and Dev2Vec input builder -> Python `ml_service/infer.py` via `dev2vec.service` -> create `AnalysisResult` -> create `RepoAnalysisSnapshot` -> response.

- Sync/async: request waits for analysis and Python inference.
- Authorization: repository ownership check in GitHub utility/service layer.
- External: local Python process, not remote HTTP.
- Persisted outputs: `AnalysisResult`, `RepoAnalysisSnapshot`.
- Error path: missing GitHub account, missing repository, Dev2Vec disabled/unavailable/invalid output (`src/services/dev2vec/dev2vec.service.js:184-245`).

## 5. Analysis Snapshot

Flow: analysis result -> `snapshot.service.createSnapshotFromAnalysisResult` -> `RepoAnalysisSnapshot`; client can query `/api/repositories/:repoId/snapshots`, `/api/snapshots/:snapshotId`, and compare `/api/snapshots/compare`.

- Sync/async: async MongoDB operations.
- Persisted outputs: snapshot documents.
- Relationship: snapshot is denormalized and linked to analysis result by `analysisResultId`.

## 6. Role Catalog

Flow: Client -> `GET /api/roles/catalog` -> `authMiddleware` -> `roleController.getCatalog` -> role constants/catalog -> response.

- Persisted outputs: none.
- External: none.

## 7. Role Match Generation

Flow: Client -> `POST /api/analysis/role-matches` -> `authMiddleware` -> `analysisController.generateRoleMatches` -> `analysis.service` -> resolve analysis source -> Dev2Vec input/inference or existing analysis context -> map output to role matches -> response/persisted analysis context.

- Sync/async: async DB + optional Python inference.
- Inputs: repo id(s), source mode, target role depending on request.
- Error path: no analysis source, Dev2Vec inference failure.

## 8. Roadmap Generation

Flow: Client -> `POST /api/roadmaps/generate` -> `authMiddleware` -> `roadmapController.generateRoadmap` -> `roadmap.service` -> resolve contribution/skill gap context -> build roadmap prompt -> `ai.service.generateRoadmapResponse` -> parse/fallback -> create `Roadmap` + `RoadmapProgress` -> response.

- Sync/async: request waits for LLM.
- External: Gemini-compatible LLM.
- Persisted outputs: `Roadmap`, `RoadmapProgress`.
- Fallback: roadmap service contains parser/fallback behavior if LLM result is invalid or unavailable.

## 9. Roadmap Learning Availability

Flow: Client -> `GET /api/roadmaps/:roadmapId/learning` or `/items/:itemId` -> `authMiddleware` -> `roadmapLearningController` -> `roadmapLearning.service` -> load `Roadmap` -> map task skills to shared `LearningContent`/resources -> response.

- Sync/async: async DB reads.
- Cache: uses shared learning collections keyed by canonical skill/context.
- Persisted outputs: none for read endpoints.

## 10. Learning Content Generation

Flow: Client -> `POST /api/learning/skills/generate` or roadmap item generate endpoint -> `authMiddleware` -> `learningController`/`roadmapLearningController` -> `learning.service` -> check `LearningContent` cache -> Gemini-compatible LLM on cache miss/force regenerate -> optional resource search via YouTube -> save `LearningContent`/`LearningResource` -> response.

- Sync/async: async DB + LLM + optional YouTube.
- Cache hit/miss: confirmed by shared unique index in `LearningContent.js:79-84`; force/regenerate behavior is implemented in service layer.
- External: Gemini LLM; YouTube if resource search is requested and `YOUTUBE_API_KEY` exists.

## 11. User-Admin Chat

User flow: Client -> `POST /api/chat/sessions` -> `ChatSession`; Client -> `POST /api/chat/sessions/:sessionId/messages` -> create user `ChatMessage` -> load profile/repo/package/snapshot/skill context -> if effective mode is AI, call `generateChatResult` -> create assistant `ChatMessage` -> update session.

Admin flow: Admin -> `/api/admin/chat/*` -> `authMiddleware` + `adminMiddleware` -> `chat.service` -> read/update `ChatSession`, create admin `ChatMessage`, update mode/global setting.

- Sync/async: async DB + optional LLM.
- Authorization: users can access owned sessions; admins can access admin endpoints.
- Persisted outputs: `ChatSession`, `ChatMessage`, `ChatSetting`.
- Modes: global and per-session mode controls are confirmed by admin chat endpoints and `chat.service`.

## 12. Admin Management

Flow: Admin client -> `/api/admin/*` -> `authMiddleware` -> `adminMiddleware` -> `admin.controller` -> `admin.service`/`chat.service`/`dev2vecStatus.service` -> models -> response.

- Authorization: admin middleware (`src/routes/admin.routes.js:16`, `src/middlewares/admin.middleware.js:1-38`).
- Managed entities: users, repositories, analysis, AI feedback, roadmaps, reports, chat, Dev2Vec status.
- Persisted outputs: user status/role updates, roadmap status, report status logs, notifications.

## Dev2Vec / Analysis Pipeline Comparison

| Pipeline element | Status | Evidence | Notes |
|---|---|---|---|
| Repository metadata/readme/topics/language/package/config/file paths | IMPLEMENTED | `src/services/dev2vec/dev2vecInputBuilder.service.js:279-875`, `ml_service/extractors/repo_document.py:13-108` | Backend builds evidence from repository/package/commit data; ML extractor also supports repo document generation. |
| Commit evidence | IMPLEMENTED | `RepositoryCommit.js:3-31`, `analysis.service.js:363-384` | Commits are read and filtered by contribution scope. |
| Issue resolving history | ADAPTED / PARTIAL | `ml_service/extractors/issues_document.py:17-44` | ML extractor exists, but backend analysis flow primarily uses cached repo/package/commit evidence. |
| API usage document | ADAPTED / PARTIAL | `ml_service/extractors/api_document.py`, `dev2vecInputBuilder.service.js` | Evidence extraction exists; backend maps package/config/source hints. |
| Embeddings / Doc2Vec artifacts | IMPLEMENTED | `ml_service/artifacts/doc2vec_repo.model`, `doc2vec_issue.model`, `doc2vec_api.model`; `Dockerfile:10-16` | Artifacts are shipped and used by Python inference. |
| Cosine similarity / role vectors | IMPLEMENTED | `src/services/dev2vec/dev2vecRoleMapper.service.js`, `src/constants/roleSkillVectors.js` | Backend maps ML output to role matches/skill gaps. |
| Heuristic weights/classifiers | IMPLEMENTED | `ml_service/artifacts/role_classifier.joblib`, `ml_service/train.py`; analysis rules/scoring services | Hybrid ML + heuristics. |
| LLM-generated role assessment | NOT PRIMARY | `analysis.service` uses Dev2Vec; LLM used for roadmap/feedback/chat/learning | Do not label backend analysis as pure LLM. |
| Research-standard Dev2Vec | APPROXIMATED | combined evidence above | Current system adapts Dev2Vec ideas; it is not proven to reproduce the original research pipeline exactly. |
