# 07. Evidence Map

| Claim | Status | Evidence file | Lines | Notes |
|---|---|---|---|---|
| Backend entrypoint is `server.js` | CONFIRMED | `package.json`, `server.js` | `package.json:5-9`, `server.js:1-31` | `npm start` runs `node server.js`. |
| Express app mounts REST route groups | CONFIRMED | `src/app.js` | `75-90` | Auth, GitHub, analysis, roadmap, learning, chat, admin, etc. |
| Swagger is exposed at `/api/swagger` | CONFIRMED | `src/app.js`, `src/config/swagger.js` | `91-99`, `1-28` | OpenAPI 3.0.0. |
| CORS allowlist includes configured origins and localhost | CONFIRMED | `src/app.js`, `src/config/frontend.js` | `25-43`, `1-73` | Includes Vercel default origin. |
| Database uses MongoDB through Mongoose | CONFIRMED | `src/config/database.js` | `1-18` | URI env variables are `MONGO_URI` or `MONGODB_URI`. |
| JWT auth and revoked-token check exist | CONFIRMED | `src/middlewares/auth.middleware.js`, `src/utils/generateToken.js` | `1-44`, `1-13` | Bearer token only. |
| Admin routes require admin middleware | CONFIRMED | `src/routes/admin.routes.js`, `src/middlewares/admin.middleware.js` | `16`, `1-38` | All admin routes after `router.use`. |
| GitHub OAuth/API integration exists | CONFIRMED | `src/services/github/github.api.service.js` | `35-105` | Token, user, repos, content. |
| Gemini-compatible LLM integration exists | CONFIRMED | `src/services/ai.service.js` | `21-24`, `136-218` | Uses `LLM_*` variables. |
| YouTube API integration exists | CONFIRMED | `src/services/youtube.service.js` | `3`, `63-76` | Requires `YOUTUBE_API_KEY`. |
| Dev2Vec Python inference is invoked by backend | CONFIRMED | `src/services/dev2vec/dev2vec.service.js` | `1-24`, `161-204` | Uses `execFile`. |
| Docker image includes Python and ML deps | CONFIRMED | `Dockerfile` | `1-31` | Python venv and `ml_service/requirements.txt`. |
| Compose starts local MongoDB | CONFIRMED | `docker-compose.yml` | `1-19` | `mongo:7` service. |
| Render deployment config exists | UNKNOWN | repo root | n/a | No `render.yaml` found. |
| MongoDB Atlas is used | INFERRED | `src/config/database.js` | `5` | Code accepts Atlas URI, but does not prove provider. |
| Web client origin is configured | CONFIRMED | `src/config/frontend.js` | `1-4` | Default Vercel URL. |
| Mobile redirects are supported | INFERRED | `src/config/frontend.js` | `21-58` | Non-http scheme validation. |
| Rate limiting is implemented | UNKNOWN | `package.json`, `src/app.js` | n/a | No dependency/middleware evidence. |
| Email/cloud storage/webhooks exist | UNKNOWN | source search | n/a | No implementation found. |
| Shared learning cache exists | CONFIRMED | `src/models/LearningContent.js` | `79-84` | Unique canonical skill/language index. |
| OAuth states expire by TTL | CONFIRMED | `src/models/GithubAuthState.js`, `src/models/GithubOAuthState.js` | `29`, `34` | `expireAfterSeconds: 0`. |
| Repository cache is unique per user/GitHub repo | CONFIRMED | `src/models/Repository.js` | `98` | Compound unique index. |
| Commit cache is unique per user/repo/sha | CONFIRMED | `src/models/RepositoryCommit.js` | `29` | Compound unique index. |
| Package cache is unique per user/repo | CONFIRMED | `src/models/RepositoryPackage.js` | `46` | Compound unique index. |
| Chat has user and admin flows | CONFIRMED | `src/routes/chat.routes.js`, `src/routes/admin.routes.js`, `src/services/chat.service.js` | `44-165`, `154-304`, `340-780` | User sessions/messages and admin settings/messages. |
