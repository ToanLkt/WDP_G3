# 02. API Inventory

Base route mounts are defined in `src/app.js:75-90`. Swagger docs are generated from `src/routes/*.js` (`src/config/swagger.js:26`).

Legend: Auth `JWT` means `authMiddleware`; Role `admin` means `router.use(authMiddleware, adminMiddleware)` in `src/routes/admin.routes.js:16`; Swagger status is based on nearby `@swagger` blocks in route files.

| Method | Path | Auth | Role | Route | Controller | Service | Models | External system | Swagger status |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/` | none | public | `src/app.js:45` | inline | n/a | n/a | n/a | Undocumented |
| GET | `/health` | none | public | `src/app.js:68` | inline | n/a | n/a | n/a | Undocumented |
| GET | `/api/health` | none | public | `src/app.js:69` | inline | n/a | n/a | n/a | Undocumented |
| POST | `/api/auth/register` | none | public | `auth.routes.js:56` | `authController.register` | `auth.service` | `User`, `StudentProfile` | n/a | Documented |
| POST | `/api/auth/login` | none | public | `auth.routes.js:93` | `authController.login` | `auth.service` | `User` | n/a | Documented |
| POST | `/api/auth/google` | none | public | `auth.routes.js:152` | `authController.loginWithGoogle` | `auth.service` | `User`, `StudentProfile` | Google token/aud | Documented |
| POST | `/api/auth/github` | none | public | `auth.routes.js:190` | `authController.startGithubLogin` | `auth.service` | `GithubAuthState` | GitHub OAuth | Documented |
| GET | `/api/auth/github/callback` | none | public | `auth.routes.js:221` | `authController.handleGithubCallback` | `github.service` | `GithubAccount`, `StudentProfile`, `GithubAuthState` | GitHub OAuth/API | Documented |
| POST | `/api/auth/logout` | JWT | user | `auth.routes.js:237` | `authController.logout` | `auth.service` | `RevokedToken` | n/a | Documented |
| POST | `/api/auth/change-password` | JWT | user | `auth.routes.js:277` | `authController.changePassword` | `auth.service` | `User` | n/a | Documented |
| GET | `/api/auth/me` | JWT | user | `auth.routes.js:300` | `authController.getMe` | `auth.service` | `User` | n/a | Documented |
| POST | `/api/profiles` | JWT | user | `profile.routes.js:68` | `profileController.create` | `profile.service` | `StudentProfile`, `UserSettings` | n/a | Documented |
| GET | `/api/profiles/me` | JWT | user | `profile.routes.js:86` | `profileController.getMe` | `profile.service` | `StudentProfile` | n/a | Documented |
| PATCH | `/api/profiles/me` | JWT | user | `profile.routes.js:136` | `profileController.updateMe` | `profile.service` | `StudentProfile`, `User` | n/a | Documented |
| GET | `/api/dashboard/me` | JWT | user | `dashboard.routes.js:31` | `dashboardController.getMe` | `dashboard.service` | profile/repo/analysis/roadmap models | n/a | Documented |
| GET | `/api/notifications/me` | JWT | user | `notification.routes.js:44` | `notificationController.getMe` | `notification.service` | `Notification` | n/a | Documented |
| PATCH | `/api/notifications/:notificationId/read` | JWT | user | `notification.routes.js:64` | `notificationController.markAsRead` | `notification.service` | `Notification` | n/a | Documented |
| DELETE | `/api/notifications/:notificationId` | JWT | user | `notification.routes.js:84` | `notificationController.remove` | `notification.service` | `Notification` | n/a | Documented |
| GET | `/api/github/oauth` | JWT | user | `github.routes.js:61` | `githubController.startOAuth` | `github.service` | `GithubOAuthState` | GitHub OAuth | Documented |
| GET | `/api/github/oauth/callback` | none | public callback | `github.routes.js:98` | `githubController.handleOAuthCallback` | `github.service` | `GithubAccount`, `StudentProfile` | GitHub OAuth/API | Documented |
| GET | `/api/github/me` | JWT | user | `github.routes.js:116` | `githubController.getMe` | `github.service` | `GithubAccount` | n/a | Documented |
| DELETE | `/api/github/disconnect` | JWT | user | `github.routes.js:132` | `githubController.disconnect` | `github.service` | `GithubAccount`, `StudentProfile` | n/a | Documented |
| GET | `/api/github/repositories` | JWT | user | `github.routes.js:148` | `githubController.getRepositories` | `github.service` | `Repository` | GitHub API | Documented |
| GET | `/api/github/repositories/cached` | JWT | user | `github.routes.js:164` | `githubController.getCachedRepositories` | `github.service` | `Repository` | n/a | Documented |
| GET | `/api/github/repositories/:owner/:repo/packages/cached` | JWT | user | `github.routes.js:190` | `githubController.getCachedPackages` | `github.service` | `RepositoryPackage` | n/a | Documented |
| GET | `/api/github/repositories/:repoId/packages/cached` | JWT | user | `github.routes.js:191` | `githubController.getCachedPackages` | `github.service` | `RepositoryPackage` | n/a | Documented |
| GET | `/api/github/repositories/:owner/:repo/packages` | JWT | user | `github.routes.js:216` | `githubController.getPackages` | `github.service` | `RepositoryPackage` | GitHub contents API | Documented |
| GET | `/api/github/repositories/:repoId/packages` | JWT | user | `github.routes.js:217` | `githubController.getPackages` | `github.service` | `RepositoryPackage` | GitHub contents API | Documented |
| GET | `/api/github/repositories/:owner/:repo/commits/cached` | JWT | user | `github.routes.js:243` | `githubController.getCachedCommits` | `github.service` | `RepositoryCommit` | n/a | Documented |
| GET | `/api/github/repositories/:repoId/commits/cached` | JWT | user | `github.routes.js:244` | `githubController.getCachedCommits` | `github.service` | `RepositoryCommit` | n/a | Documented |
| GET | `/api/github/repositories/:owner/:repo/commits` | JWT | user | `github.routes.js:269` | `githubController.getCommits` | `github.service` | `RepositoryCommit` | GitHub API | Documented |
| GET | `/api/github/repositories/:repoId/commits` | JWT | user | `github.routes.js:270` | `githubController.getCommits` | `github.service` | `RepositoryCommit` | GitHub API | Documented |
| GET | `/api/github/repositories/:owner/:repo` | JWT | user | `github.routes.js:295` | `githubController.getRepositoryById` | `github.service` | `Repository` | n/a | Documented |
| GET | `/api/github/repositories/:repoId` | JWT | user | `github.routes.js:296` | `githubController.getRepositoryById` | `github.service` | `Repository` | n/a | Documented |
| GET | `/api/repositories/:repoId/snapshots` | JWT | user | `repository.routes.js:82` | `snapshotController.getRepositorySnapshots` | `snapshot.service` | `RepoAnalysisSnapshot` | n/a | Documented |
| GET | `/api/repositories/:repoId/progress-comparison` | JWT | user | `repository.routes.js:119` | `snapshotController.compareRepositoryProgress` | `snapshot.service` | `RepoAnalysisSnapshot` | n/a | Documented |
| GET | `/api/repositories/:repoId` | JWT | user | `repository.routes.js:121` | `repositoryController.getRepositoryById` | `repository.service` | `Repository` | n/a | Undocumented/partial |
| POST | `/api/analysis/repositories/:repoId` | JWT | user | `analysis.routes.js:64` | `analysisController.analyzeRepository` | `analysis.service` | `AnalysisResult`, `RepoAnalysisSnapshot`, `RepositoryPackage`, `RepositoryCommit` | Python Dev2Vec | Documented |
| POST | `/api/analysis/role-matches` | JWT | user | `analysis.routes.js:206` | `analysisController.generateRoleMatches` | `analysis.service` | `AnalysisResult` | Python Dev2Vec | Documented |
| GET | `/api/analysis/repositories/:repoId/role-matches` | JWT | user | `analysis.routes.js:246` | `analysisController.getRepositoryRoleMatches` | `analysis.service` | `AnalysisResult` | n/a | Documented |
| GET | `/api/analysis/results/:repoId` | JWT | user | `analysis.routes.js:284` | `analysisController.getAnalysisResults` | `analysis.service` | `AnalysisResult` | n/a | Documented |
| GET | `/api/analysis/me` | JWT | user | `analysis.routes.js:314` | `analysisController.getMyAnalysisResults` | `analysis.service` | `AnalysisResult` | n/a | Documented |
| POST | `/api/snapshots/compare` | JWT | user | `snapshot.routes.js:95` | `snapshotController.compareSnapshots` | `snapshot.service` | `RepoAnalysisSnapshot` | n/a | Documented |
| GET | `/api/snapshots/:snapshotId` | JWT | user | `snapshot.routes.js:132` | `snapshotController.getSnapshotById` | `snapshot.service` | `RepoAnalysisSnapshot` | n/a | Documented |
| GET | `/api/ai-feedback/me` | JWT | user | `aiFeedback.routes.js:29` | `aiFeedbackController.getMyFeedbacks` | `aiFeedback.service` | `AiFeedback` | n/a | Documented |
| POST | `/api/ai-feedback/repositories/:repoId` | JWT | user | `aiFeedback.routes.js:57` | `aiFeedbackController.generateRepositoryFeedback` | `aiFeedback.service` | `AiFeedback`, `AnalysisResult` | Gemini-compatible LLM | Documented |
| GET | `/api/ai-feedback/results/:repoId` | JWT | user | `aiFeedback.routes.js:83` | `aiFeedbackController.getRepositoryFeedback` | `aiFeedback.service` | `AiFeedback` | n/a | Documented |
| GET | `/api/ai/health` | JWT | user | `ai.routes.js:29` | `aiController.getAiHealth` | `ai.service` | n/a | Gemini-compatible LLM | Documented |
| POST | `/api/ai/analyze` | JWT | user | `ai.routes.js:31` | `aiController.analyzeWithAi` | `ai.service` | n/a | Gemini-compatible LLM | Undocumented/partial |
| POST | `/api/chat/sessions` | JWT | user | `chat.routes.js:44` | `chatController.createChatSession` | `chat.service` | `ChatSession` | n/a | Documented |
| GET | `/api/chat/sessions` | JWT | user | `chat.routes.js:60` | `chatController.getChatSessions` | `chat.service` | `ChatSession`, `ChatMessage` | n/a | Documented |
| GET | `/api/chat/sessions/:sessionId` | JWT | user | `chat.routes.js:84` | `chatController.getChatSessionDetail` | `chat.service` | `ChatSession`, `ChatMessage` | n/a | Documented |
| POST | `/api/chat/sessions/:sessionId/messages` | JWT | user | `chat.routes.js:165` | `chatController.sendChatMessage` | `chat.service` | `ChatSession`, `ChatMessage`, context models | Gemini-compatible LLM | Documented |
| POST | `/api/roadmaps/generate` | JWT | user | `roadmap.routes.js:133` | `roadmapController.generateRoadmap` | `roadmap.service` | `Roadmap`, `RoadmapProgress`, `AnalysisResult` | Gemini-compatible LLM | Documented |
| GET | `/api/roadmaps/me` | JWT | user | `roadmap.routes.js:457` | `roadmapController.getMyRoadmaps` | `roadmap.service` | `Roadmap` | n/a | Documented |
| GET | `/api/roadmaps/:roadmapId/progress` | JWT | user | `roadmap.routes.js:505` | `roadmapProgressController.getRoadmapProgress` | `roadmapProgress.service` | `RoadmapProgress` | n/a | Documented |
| PATCH | `/api/roadmaps/:roadmapId/progress/items` | JWT | user | `roadmap.routes.js:597` | `roadmapProgressController.updateRoadmapItemStatus` | `roadmapProgress.service` | `RoadmapProgress` | n/a | Documented |
| POST | `/api/roadmaps/:roadmapId/progress/reset` | JWT | user | `roadmap.routes.js:643` | `roadmapProgressController.resetRoadmapProgress` | `roadmapProgress.service` | `RoadmapProgress` | n/a | Documented |
| GET | `/api/roadmaps/:roadmapId/learning` | JWT | user | `roadmap.routes.js:679` | `roadmapLearningController.getRoadmapLearning` | `roadmapLearning.service` | `Roadmap`, `LearningContent` | n/a | Documented |
| GET | `/api/roadmaps/:roadmapId/learning/items/:itemId` | JWT | user | `roadmap.routes.js:726` | `roadmapLearningController.getRoadmapItemLearning` | `roadmapLearning.service` | `Roadmap`, `LearningContent` | n/a | Documented |
| POST | `/api/roadmaps/:roadmapId/learning/items/:itemId/generate` | JWT | user | `roadmap.routes.js:768` | `roadmapLearningController.generateRoadmapItemLearning` | `roadmapLearning.service` | `LearningContent`, `LearningResource` | Gemini, YouTube optional | Documented |
| GET | `/api/roadmaps/:roadmapId` | JWT | user | `roadmap.routes.js:811` | `roadmapController.getRoadmapDetail` | `roadmap.service` | `Roadmap` | n/a | Documented |
| PATCH | `/api/roadmaps/:roadmapId/archive` | JWT | user | `roadmap.routes.js:835` | `roadmapController.archiveRoadmap` | `roadmap.service` | `Roadmap` | n/a | Documented |
| POST | `/api/learning/skills/generate` | JWT | user | `learning.routes.js:60` | `learningController.generateLearningContent` | `learning.service` | `LearningContent` | Gemini-compatible LLM | Documented |
| GET | `/api/learning/skills/:skillName` | JWT | user | `learning.routes.js:123` | `learningController.getLearningContent` | `learning.service` | `LearningContent` | n/a | Documented |
| GET | `/api/learning/skills/:skillName/resources` | JWT | user | `learning.routes.js:253` | `learningController.getLearningResources` | `learning.service` | `LearningResource` | n/a | Documented |
| POST | `/api/learning/skills/:skillName/resources` | JWT | user | `learning.routes.js:254` | `learningController.saveLearningResource` | `learning.service` | `LearningResource` | n/a | Documented/partial |
| POST | `/api/learning/skills/:skillName/resources/search` | JWT | user | `learning.routes.js:365` | `learningController.searchAndCacheYoutubeResources` | `learning.service` | `LearningResource` | YouTube API | Documented |
| GET | `/api/progress/me` | JWT | user | `progress.routes.js:8` | `progressController.getMyProgress` | `progress.service` | roadmap/progress models | n/a | Undocumented |
| POST | `/api/reports` | JWT | user | `report.routes.js:54` | `reportController.createReport` | `report.service` | `Report`, `ReportStatusLog` | n/a | Documented |
| GET | `/api/skills/catalog` | JWT | user | `skill.routes.js:54` | `skillController.getCatalog` | catalog constants | n/a | n/a | Documented |
| GET | `/api/roles/catalog` | JWT | user | `role.routes.js:49` | `roleController.getCatalog` | role catalog constants | n/a | n/a | Documented |
| GET | `/api/admin/dev2vec/status` | JWT | admin | `admin.routes.js:121` | `adminController.getDev2VecStatus` | `dev2vecStatus.service` | n/a | Python artifacts/filesystem | Documented |
| GET | `/api/admin/chat/settings` | JWT | admin | `admin.routes.js:154` | `adminController.getChatSettings` | `chat.service` | `ChatSetting` | n/a | Documented |
| PATCH | `/api/admin/chat/settings` | JWT | admin | `admin.routes.js:155` | `adminController.updateChatSettings` | `chat.service` | `ChatSetting` | n/a | Documented/partial |
| GET | `/api/admin/chat/sessions` | JWT | admin | `admin.routes.js:201` | `adminController.getChatSessions` | `chat.service` | `ChatSession`, `ChatMessage` | n/a | Documented |
| GET | `/api/admin/chat/sessions/:sessionId` | JWT | admin | `admin.routes.js:221` | `adminController.getChatSessionDetail` | `chat.service` | `ChatSession`, `ChatMessage` | n/a | Documented |
| POST | `/api/admin/chat/sessions/:sessionId/messages` | JWT | admin | `admin.routes.js:251` | `adminController.sendChatSessionMessage` | `chat.service` | `ChatMessage`, `ChatSession` | n/a | Documented |
| PATCH | `/api/admin/chat/sessions/:sessionId/mode` | JWT | admin | `admin.routes.js:284` | `adminController.updateChatSessionMode` | `chat.service` | `ChatSession` | n/a | Documented |
| PATCH | `/api/admin/chat/sessions/:sessionId/use-global-mode` | JWT | admin | `admin.routes.js:304` | `adminController.useGlobalChatSessionMode` | `chat.service` | `ChatSession` | n/a | Documented |
| GET | `/api/admin/dashboard` | JWT | admin | `admin.routes.js:323` | `adminController.getDashboard` | `admin.service` | User/Repo/Analysis/Roadmap/Report | n/a | Documented |
| GET | `/api/admin/users` | JWT | admin | `admin.routes.js:363` | `adminController.getUsers` | `admin.service` | `User` | n/a | Documented |
| GET | `/api/admin/users/:userId` | JWT | admin | `admin.routes.js:386` | `adminController.getUserById` | `admin.service` | `User` | n/a | Documented |
| PATCH | `/api/admin/users/:userId/status` | JWT | admin | `admin.routes.js:423` | `adminController.updateUserStatus` | `admin.service` | `User`, `Notification` | n/a | Documented |
| PATCH | `/api/admin/users/:userId/role` | JWT | admin | `admin.routes.js:460` | `adminController.updateUserRole` | `admin.service` | `User`, `Notification` | n/a | Documented |
| GET | `/api/admin/github/repositories` | JWT | admin | `admin.routes.js:490` | `adminController.getRepositories` | `admin.service` | `Repository` | n/a | Documented |
| GET | `/api/admin/github/repositories/:repoId` | JWT | admin | `admin.routes.js:513` | `adminController.getRepositoryById` | `admin.service` | `Repository` | n/a | Documented |
| GET | `/api/admin/analysis` | JWT | admin | `admin.routes.js:543` | `adminController.getAnalysis` | `admin.service` | `AnalysisSnapshot` | n/a | Documented |
| GET | `/api/admin/analysis/:analysisId` | JWT | admin | `admin.routes.js:566` | `adminController.getAnalysisById` | `admin.service` | `AnalysisSnapshot` | n/a | Documented |
| GET | `/api/admin/ai-feedback` | JWT | admin | `admin.routes.js:596` | `adminController.getAiFeedback` | `admin.service` | `AiFeedback` | n/a | Documented |
| GET | `/api/admin/ai-feedback/:feedbackId` | JWT | admin | `admin.routes.js:619` | `adminController.getAiFeedbackById` | `admin.service` | `AiFeedback` | n/a | Documented |
| GET | `/api/admin/roadmaps` | JWT | admin | `admin.routes.js:654` | `adminController.getRoadmaps` | `admin.service` | `Roadmap` | n/a | Documented |
| GET | `/api/admin/roadmaps/:roadmapId` | JWT | admin | `admin.routes.js:677` | `adminController.getRoadmapById` | `admin.service` | `Roadmap` | n/a | Documented |
| PATCH | `/api/admin/roadmaps/:roadmapId/status` | JWT | admin | `admin.routes.js:714` | `adminController.updateRoadmapStatus` | `admin.service` | `Roadmap` | n/a | Documented |
| GET | `/api/admin/reports` | JWT | admin | `admin.routes.js:753` | `adminController.getReports` | `admin.service` | `Report` | n/a | Documented |
| GET | `/api/admin/reports/:reportId` | JWT | admin | `admin.routes.js:776` | `adminController.getReportById` | `admin.service` | `Report`, `ReportStatusLog` | n/a | Documented |
| PATCH | `/api/admin/reports/:reportId/status` | JWT | admin | `admin.routes.js:816` | `adminController.updateReportStatus` | `admin.service` | `Report`, `ReportStatusLog`, `Notification` | n/a | Documented/partial |
