# 05. Diagram Specification

## Overall System Architecture

Actors/nodes:

- Web Client: confirmed by default Vercel/frontend origins.
- Mobile Client: inferred from mobile redirect handling.
- Admin Client: inferred from admin route group.
- Express API: Node/Express server.
- MongoDB: Mongoose database.
- GitHub API: OAuth, profile, repositories, contents, commits.
- Gemini LLM: REST AI provider.
- YouTube API: learning resource search.
- Dev2Vec Python: local process executing `ml_service/infer.py`.

Relationships:

- Clients call Express API over REST.
- Express API reads/writes MongoDB.
- Express API calls GitHub and YouTube through Axios.
- Express API calls Gemini-compatible endpoint through Axios.
- Express API executes Dev2Vec Python locally through child process.

Do not include all endpoints in this diagram.

## Use Case Diagram

Actors:

- Student/User
- Admin
- GitHub
- AI Provider
- YouTube
- Dev2Vec Runtime

User capabilities:

- Register/login/logout
- Connect GitHub
- Import/cache repositories
- Analyze repository
- View role matches
- Generate roadmap
- Track roadmap progress
- Generate/view learning content
- Manage learning resources
- Chat with AI/admin
- Create report

Admin capabilities:

- View dashboard
- Manage users
- Review repositories/analysis/feedback/roadmaps/reports
- Manage chat mode/settings and respond to chats
- Check Dev2Vec status

## MongoDB Collection Relationship Diagram

Represent Mongoose models as collections. Use embedded notes for:

- `Roadmap` embeds phases, tasks, resources, supporting paths.
- `RoadmapProgress` embeds progress items.
- `LearningContent` embeds examples and exercises.
- `AnalysisResult` and `RepoAnalysisSnapshot` embed skill evidence/vector/checklist/scores.

Relationship types:

- Solid references/logical object id relations: user to owned resources, repository to packages/commits/analysis/snapshots.
- Dashed logical relations: GitHub numeric IDs, fullName strings, canonical skill names.
- Cache stereotype: `LearningContent`, `LearningResource`, `GithubAuthState`, `GithubOAuthState`, `RepositoryPackage`, `RepositoryCommit`.

## Deployment Diagram

Separate production and local:

- Production: Render or external host is UNKNOWN in repo. Show generic production container/runtime if drawing manually; mark Render as unconfirmed unless external evidence is added.
- Local Docker: `docker-compose.yml` starts `api` and `mongo`.
- API container includes Node backend, Python venv, `ml_service`, and exposes 5000.
- Mongo local container uses `mongo:7`.
- Production MongoDB Atlas is compatible but not confirmed by source.

## Backend Layered Architecture

Layers:

- Entry/bootstrap: `server.js`, `src/app.js`
- Routes: `src/routes/*.routes.js`
- Middleware: auth, admin, validation, error
- Controllers: request/response coordination
- Services: business logic, GitHub/AI/learning/analysis/chat/admin
- Models: Mongoose schemas
- External adapters: GitHub API, Gemini LLM, YouTube API, Dev2Vec Python
- Utilities/constants/validators/config

## Sequence Diagrams

Use real endpoint names:

- Repository analysis: `POST /api/analysis/repositories/:repoId`
- Role match + roadmap: `POST /api/analysis/role-matches`, `POST /api/roadmaps/generate`
- Learning: `POST /api/roadmaps/:roadmapId/learning/items/:itemId/generate`, `POST /api/learning/skills/generate`
- Chat: `POST /api/chat/sessions/:sessionId/messages`, admin `/api/admin/chat/sessions/:sessionId/messages`

Notes:

- Add `cache` notes only where Mongo cache collections or cached routes exist.
- Add `fallback` notes for LLM fallback and Dev2Vec error handling only in sequence text.
- PlantUML DBML cannot represent every embedded Mongoose subdocument perfectly; embedded documents are noted in comments and stereotypes for manual diagrams.net cleanup if needed.
