# 03. Model Inventory

Evidence anchor: Mongoose schema/model declarations are listed in `src/models` and confirmed by `rg -n "mongoose.model|new mongoose.Schema|index" src/models`.

## User

- Source: `src/models/User.js:4-101`.
- Purpose: application account.
- Key fields: identity fields (`email`, `password`, `fullName/name`), role/status fields, auth/profile metadata.
- Relationships: referenced by many models through `userId` or `user`.
- Indexes/constraints: model uses schema-level fields; exact unique/required constraints are in source lines `4-101`.
- CRUD services: `auth.service`, `admin.service`, `profile.service`.

## StudentProfile

- Source: `src/models/StudentProfile.js:3-51`.
- Purpose: student academic/career/GitHub profile.
- Relationships: logical one-to-one with user through user id; referenced by chat context and profile services.
- CRUD services: `profile.service`, `auth.service`, `github.service`, `chat.service`.

## UserSettings

- Source: `src/models/UserSettings.js:3-53`.
- Purpose: per-user settings/preferences.
- Relationships: logical user relation.
- CRUD services: profile/settings creation paths.

## RevokedToken

- Source: `src/models/RevokedToken.js:3-28`.
- Purpose: JWT logout/revocation list.
- Relationships: logical relation to token/user.
- CRUD services: `auth.service`; read by `auth.middleware`.

## GithubAccount

- Source: `src/models/GithubAccount.js:3-56`.
- Purpose: stores connected GitHub account profile/token metadata for a user.
- Relationships: user ownership; referenced by Repository.
- CRUD services: `github.service`, `github.account.service`, `github.oauth.service`.
- External data source: GitHub profile and OAuth token exchange.

## GithubAuthState / GithubOAuthState

- Sources: `src/models/GithubAuthState.js:3-31`, `src/models/GithubOAuthState.js:3-36`.
- Purpose: short-lived OAuth state records for auth login and GitHub connect flows.
- TTL behavior: `expiresAt` TTL indexes at `GithubAuthState.js:29` and `GithubOAuthState.js:34`.
- CRUD services: `auth.service`, `github.oauth.service`.

## Repository

- Source: `src/models/Repository.js:3-100`.
- Purpose: cached GitHub repository metadata per user.
- Important fields: user/repo identifiers, owner/name/fullName, privacy/fork flags, language/topics/readme/metadata, `githubAccountId`.
- Relationships: `userId` and `githubAccountId`; parent for RepositoryPackage, RepositoryCommit, AnalysisResult, snapshots, roadmaps.
- Indexes: unique `{ userId, githubRepoId }` at `Repository.js:98`.
- CRUD services: `github.repository.service`, `repository.service`, `admin.service`.

## RepositoryPackage

- Source: `src/models/RepositoryPackage.js:3-48`.
- Purpose: cached dependency/package/config evidence extracted from repository files.
- Relationships: user/repository logical or ObjectId relation.
- Indexes: unique `{ userId, repositoryId }` at `RepositoryPackage.js:46`.
- CRUD services: `github.package.service`, `analysis.service`.

## RepositoryCommit

- Source: `src/models/RepositoryCommit.js:3-31`.
- Purpose: cached commit evidence for a repository/user.
- Relationships: user/repository relation.
- Indexes: unique `{ userId, repositoryId, sha }` at `RepositoryCommit.js:29`.
- CRUD services: `github.commit.service`, `analysis.service`.

## AnalysisResult

- Source: `src/models/AnalysisResult.js:3-107`.
- Purpose: persisted repository analysis output and role/skill assessment.
- Embedded documents: `skillEvidenceSchema` at `AnalysisResult.js:3`, `skillVectorSchema` at `AnalysisResult.js:33`.
- Relationships: user/repository logical references.
- Indexes: `{ userId, repositoryId }`, `{ userId, analyzedAt }` at `AnalysisResult.js:102-103`.
- CRUD services: `analysis.service`, `analysisSource.service`, `roadmap.service`, `aiFeedback.service`.
- Denormalized snapshot: stores repository, skill, recommendation, and Dev2Vec-derived outputs.

## AnalysisSnapshot

- Source: `src/models/AnalysisSnapshot.js:3-104`.
- Purpose: snapshot-style analysis record used in admin/chat context.
- Relationships: user/repository logical refs.
- Indexes: `{ userId, repositoryId }`, `{ userId, analyzedAt }` at `AnalysisSnapshot.js:101-102`.
- CRUD services: analysis/snapshot/admin/chat contexts.

## RepoAnalysisSnapshot

- Source: `src/models/RepoAnalysisSnapshot.js:3-181`.
- Purpose: detailed repo analysis snapshot created from analysis results.
- Embedded documents: scores, commit summary, checklist, skill evidence, skill vector at `RepoAnalysisSnapshot.js:3-96`.
- Relationships: user/repository, `analysisResultId`.
- Indexes: `{ userId, repositoryId, createdAt }`, `{ userId, githubRepoId, createdAt }`, `{ analysisResultId }` at `RepoAnalysisSnapshot.js:177-179`.
- CRUD services: `snapshot.service`, `analysis.service`, `aiFeedback.service`.

## AiFeedback

- Source: `src/models/AiFeedback.js:3-110`.
- Purpose: AI-generated feedback for repository analysis.
- Relationships: user/repository/snapshot relation.
- Indexes: `{ userId, repositoryId }`, `{ userId, generatedAt }`, `{ analysisSnapshotId }` at `AiFeedback.js:106-108`.
- CRUD services: `aiFeedback.service`, `admin.service`.
- External system: Gemini-compatible LLM with fallback parser.

## Roadmap

- Source: `src/models/Roadmap.js:3-200`.
- Purpose: generated career learning roadmap.
- Embedded documents: resources (`Roadmap.js:3`), tasks (`Roadmap.js:24`), phases (`Roadmap.js:64`), supporting paths (`Roadmap.js:92`).
- Relationships: user relation; can be generated from analysis source/repo context.
- CRUD services: `roadmap.service`, `roadmapLearning.service`, `admin.service`.
- Denormalized snapshot: roadmap stores generated tasks/resources rather than normalizing every task.

## RoadmapProgress

- Source: `src/models/RoadmapProgress.js:3-100`.
- Purpose: per-user progress state for roadmap tasks.
- Embedded documents: progress items at `RoadmapProgress.js:3`.
- Relationships: user + roadmap.
- Indexes: unique `{ userId, roadmapId }` at `RoadmapProgress.js:98`.
- CRUD services: `roadmapProgress.service`, `progress.service`.

## LearningContent

- Source: `src/models/LearningContent.js:3-84`.
- Purpose: reusable generated learning content by canonical skill/language/context.
- Embedded documents: examples (`LearningContent.js:3`) and exercises (`LearningContent.js:12`).
- Cache behavior: unique index at `LearningContent.js:79-84` supports shared skill content reuse.
- CRUD services: `learning.service`, `roadmapLearning.service`.
- External system: Gemini-compatible LLM.

## LearningResource

- Source: `src/models/LearningResource.js:3-87`.
- Purpose: cached learning/video/resource search results.
- Relationships: logical skill/category/source relation.
- Indexes: compound index at `LearningResource.js:78-83`; unique URL at `LearningResource.js:85`.
- CRUD services: `learning.service`, `learningResourceCatalog.service`.
- External system: YouTube API when searching.

## SkillSignal

- Source: `src/models/SkillSignal.js:3-34`.
- Purpose: skill signal context for chat/analysis.
- Relationships: user/repository/skill logical relation.
- CRUD services: chat/skill context services.

## ChatSession

- Source: `src/models/ChatSession.js:3-77`.
- Purpose: user-admin/AI chat session metadata.
- Key concerns: `userId`, title/status/mode/admin mode ownership fields, timestamps.
- Relationships: parent of ChatMessage; referenced by admin chat routes.
- CRUD services: `chat.service`.

## ChatMessage

- Source: `src/models/ChatMessage.js:3-49`.
- Purpose: messages inside chat sessions.
- Relationships: session/user/admin/sender relation as declared in schema.
- CRUD services: `chat.service`.
- Persisted outputs: user messages, assistant messages, admin messages.

## ChatSetting

- Source: `src/models/ChatSetting.js:3-22`.
- Purpose: global chat mode/settings.
- CRUD services: `chat.service`, admin chat routes.

## Notification

- Source: `src/models/Notification.js:3-70`.
- Purpose: in-app notifications.
- Relationships: `user`.
- Indexes: `{ user, createdAt }`, `{ user, isRead }`, `{ user, type }` at `Notification.js:66-68`.
- CRUD services: `notification.service`, `admin.service`.

## Report / ReportStatusLog

- Sources: `src/models/Report.js:3-67`, `src/models/ReportStatusLog.js:3-39`.
- Purpose: user report/ticket and status history.
- Relationships: report belongs to user; logs belong to report/admin.
- Indexes: report status log by `{ reportId, createdAt }` at `ReportStatusLog.js:37`.
- CRUD services: `report.service`, `admin.service`.

## Relationship Classification

| Relationship | Type | Evidence |
|---|---|---|
| User -> Repository | reference/logical owner | `Repository.js:3-100`, `Repository.js:98` |
| User -> StudentProfile | logical one-to-one | `StudentProfile.js:3-51`, `profile.service` |
| Repository -> RepositoryPackage/RepositoryCommit | reference/logical by repositoryId | `RepositoryPackage.js:46`, `RepositoryCommit.js:29` |
| Repository -> AnalysisResult/RepoAnalysisSnapshot | reference/logical by repositoryId/githubRepoId | `AnalysisResult.js:102`, `RepoAnalysisSnapshot.js:177-179` |
| AnalysisResult -> RepoAnalysisSnapshot | reference/logical through `analysisResultId` | `RepoAnalysisSnapshot.js:179` |
| Roadmap -> RoadmapProgress | reference/logical by roadmapId | `RoadmapProgress.js:98` |
| Roadmap -> phases/tasks/resources | embedded | `Roadmap.js:3-114` |
| LearningContent -> examples/exercises | embedded | `LearningContent.js:3-20` |
| ChatSession -> ChatMessage | reference/logical by sessionId | `ChatSession.js:3-77`, `ChatMessage.js:3-49` |
| GithubAuthState/GithubOAuthState | TTL cache | `GithubAuthState.js:29`, `GithubOAuthState.js:34` |
| LearningContent/LearningResource | cache collections | `LearningContent.js:79-84`, `LearningResource.js:78-85` |
