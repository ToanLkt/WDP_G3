# 01. System Inventory

Scope: AS-BUILT backend architecture for Career Roadmap, based on source files under `src`, root configuration, `Dockerfile`, `docker-compose.yml`, and `ml_service`.

## Technology Stack

| Area | Status | Evidence | Notes |
|---|---|---|---|
| Runtime | CONFIRMED | `package.json:3-8`, `server.js:1-8` | Node.js CommonJS backend, entrypoint `server.js`. |
| Web framework | CONFIRMED | `package.json:28`, `src/app.js:1-2` | Express 4.21.2 with `cors`. |
| Database ODM | CONFIRMED | `package.json:31`, `src/config/database.js:1-11` | Mongoose 8.13.2 connects using `MONGO_URI` or `MONGODB_URI`. |
| API docs | CONFIRMED | `package.json:32-33`, `src/config/swagger.js:1-28`, `src/app.js:91-99` | `swagger-jsdoc` + `swagger-ui-express`, exposed at `/api/swagger`. |
| Auth | CONFIRMED | `src/middlewares/auth.middleware.js:1-44`, `src/utils/generateToken.js:1-13` | JWT bearer token, revoked-token lookup. |
| Password hashing | CONFIRMED | `package.json:26`, `src/services/auth.service.js` | `bcryptjs` dependency and auth service usage. |
| External HTTP client | CONFIRMED | `package.json:25`, `src/services/github/github.api.service.js:1`, `src/services/ai.service.js:1`, `src/services/youtube.service.js:1` | Axios is used for GitHub, Gemini-compatible LLM, YouTube. |
| AI provider | CONFIRMED | `src/services/ai.service.js:21-24`, `src/services/ai.service.js:136-218` | Default provider is Gemini via Google Generative Language REST API; configurable by env. |
| Dev2Vec ML service | CONFIRMED | `Dockerfile:3-16`, `src/services/dev2vec/dev2vec.service.js:1-24`, `ml_service/infer.py:192` | Backend executes Python inference script through `execFile`. |
| Docker local/deploy image | CONFIRMED | `Dockerfile:1-31`, `docker-compose.yml:1-19` | Node 20 image includes Python venv and `ml_service`; compose also starts MongoDB 7. |
| Render config | UNKNOWN | no `render.yaml` in `rg --files` output | Deployment to Render is not directly configured in repo. |

## Clients

| Client | Status | Evidence | Notes |
|---|---|---|---|
| Web frontend | CONFIRMED | `src/config/frontend.js:1-4`, `src/app.js:25-35` | Default allowed origin includes Vercel URL and localhost 5173. |
| Mobile client | INFERRED | `src/config/frontend.js:21-58`, `src/controllers/auth.controller.js:73`, `src/controllers/github.controller.js:28` | Mobile redirect URLs and non-http schemes are supported through env variables. |
| Admin client | INFERRED | `src/routes/admin.routes.js:16`, `src/middlewares/admin.middleware.js:1-38` | Admin routes exist and require admin role, but no separate admin frontend is present in backend repo. |

## Server Boundaries

| Boundary | Status | Evidence | Notes |
|---|---|---|---|
| REST API | CONFIRMED | `src/app.js:75-90` | Mounted under `/api/*` route groups. |
| Root endpoint | CONFIRMED | `src/app.js:45-56` | `GET /` returns links to Swagger and health. |
| Health endpoints | CONFIRMED | `src/app.js:58-73` | `GET /health` and `GET /api/health`. |
| CORS | CONFIRMED | `src/app.js:25-43`, `src/config/frontend.js:60-73` | Allows configured frontend origins, API base URL, localhost ports. |
| Error handling | CONFIRMED | `src/app.js:101-108`, `src/middlewares/error.middleware.js:1-12` | 404 handler followed by central error middleware. |
| Rate limiting | UNKNOWN | no `express-rate-limit` dependency or middleware found | Not implemented in confirmed code. |
| Scheduled jobs/queues | UNKNOWN | no `src/jobs`, queue dependency, or scheduler found | Scripts exist for tests/index repair, not runtime jobs. |

## Database

MongoDB is CONFIRMED by `mongoose.connect` and Mongoose schemas. Atlas is INFERRED only from env/config naming and project expectation; the code accepts any MongoDB URI and `docker-compose.yml` provisions local MongoDB.

Primary collections/models found:

`User`, `StudentProfile`, `UserSettings`, `RevokedToken`, `GithubAccount`, `GithubAuthState`, `GithubOAuthState`, `Repository`, `RepositoryPackage`, `RepositoryCommit`, `AnalysisResult`, `AnalysisSnapshot`, `RepoAnalysisSnapshot`, `AiFeedback`, `Roadmap`, `RoadmapProgress`, `LearningContent`, `LearningResource`, `SkillSignal`, `ChatSession`, `ChatMessage`, `ChatSetting`, `Notification`, `Report`, `ReportStatusLog`.

## External Systems

| System | Status | Evidence | Env vars | Notes |
|---|---|---|---|---|
| GitHub OAuth/API | CONFIRMED | `src/services/github/github.api.service.js:35-105`, `src/services/auth.service.js:69-82` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` | OAuth token exchange, profile, repo, content fetch. |
| Google login | CONFIRMED | `src/services/auth.service.js:247` | `GOOGLE_CLIENT_ID` | Aud check is implemented when env is set. |
| Gemini-compatible LLM | CONFIRMED | `src/services/ai.service.js:21-24`, `src/services/ai.service.js:170-178` | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | Generates roadmap, chat, feedback, learning content. |
| YouTube Data API | CONFIRMED | `src/services/youtube.service.js:3`, `src/services/youtube.service.js:63-76`, `src/services/learning.service.js:427` | `YOUTUBE_API_KEY` | Search resources for learning content. |
| Python ML runtime | CONFIRMED | `src/services/dev2vec/dev2vec.service.js:161-204`, `Dockerfile:3-16` | `DEV2VEC_*` | Executes `ml_service/infer.py`. |
| Email, notification provider, cloud storage, webhooks, vector DB | UNKNOWN | no matching code/dependency found | n/a | Notifications are stored in MongoDB, no external push/email provider found. |

## Deployment

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Local Node run | CONFIRMED | `package.json:8-9`, `server.js:8-15` | `npm run dev` or `npm start`; default port 5000. |
| Docker image | CONFIRMED | `Dockerfile:1-31` | Installs Node deps and Python ML deps; exposes 5000. |
| Docker Compose | CONFIRMED | `docker-compose.yml:1-19` | Runs API and local `mongo:7`; API env file `.env.production`. |
| Production start command | CONFIRMED | `package.json:9`, `Dockerfile:31` | `npm start`. |
| Render deployment | UNKNOWN | no `render.yaml`; no Render-specific deploy config in repo | Dockerfile could be used manually on Render, but code does not confirm. |
| MongoDB Atlas | INFERRED | `src/config/database.js:5`, `.env.example` names Mongo URI | Code is compatible with Atlas, not Atlas-specific. |

## Confirmed / Inferred / Unknown

| Claim | Status | Evidence | Notes |
|---|---|---|---|
| Backend uses Node.js and Express | CONFIRMED | `package.json:3-8`, `src/app.js:1` | Main server is Express. |
| Database is MongoDB via Mongoose | CONFIRMED | `src/config/database.js:1-11`, `src/models/*` | Atlas deployment not proven. |
| Backend deployed on Render | UNKNOWN | no `render.yaml` | Requires external deployment evidence. |
| Dockerfile/Compose exist | CONFIRMED | `Dockerfile:1`, `docker-compose.yml:1` | Docker Compose includes local Mongo. |
| Swagger/OpenAPI exists | CONFIRMED | `src/config/swagger.js:1-28`, `src/app.js:91-99` | OpenAPI 3.0.0. |
| Web and mobile clients share REST API | INFERRED | `src/config/frontend.js:1-58` | Web origins confirmed; mobile redirect support confirmed. |
| GitHub integration exists | CONFIRMED | `src/services/github/github.api.service.js:35-105` | OAuth/API. |
| AI service is Gemini-compatible | CONFIRMED | `src/services/ai.service.js:21-24` | Default model `gemini-2.0-flash`. |
| Shared learning cache exists | CONFIRMED | `src/models/LearningContent.js:79-84`, `src/services/learning.service.js` | Unique canonical skill/language index. |
