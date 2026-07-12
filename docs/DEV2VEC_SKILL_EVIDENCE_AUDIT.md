# Dev2Vec Skill Evidence Audit

Scope: audit source/config only. No source code was changed. `ml_service/` is noted as Dev2Vec/ML support and is not counted as backend API skill evidence unless the backend integrates it.

## REST API

### Evidence found

| Evidence | File | Notes |
|---|---|---|
| Express app is created and JSON parsing is enabled | `src/app.js:1`, `src/app.js:29`, `src/app.js:52` | Real Express setup, not dependency-only. |
| Root and health endpoints return JSON | `src/app.js:54`, `src/app.js:75`, `src/app.js:76` | Direct request/response handling. |
| Many route modules are mounted under `/api/*` | `src/app.js:78` to `src/app.js:95` | Auth, profiles, GitHub, repositories, analysis, snapshots, chat, roadmap, reports, skills, roles. |
| REST route methods exist across routes | `src/routes/auth.routes.js:56`, `src/routes/auth.routes.js:93`, `src/routes/github.routes.js:132`, `src/routes/profile.routes.js:136`, `src/routes/admin.routes.js:460` | POST/GET/DELETE/PATCH are used. I did not find meaningful `router.put`. |
| Protected routes use auth middleware | `src/routes/analysis.routes.js:64`, `src/routes/github.routes.js:61`, `src/routes/admin.routes.js:16` | API access control is wired into routes. |
| Controllers pass `req.params`, `req.body`, `req.query` into services | `src/controllers/analysis.controller.js:8` to `src/controllers/analysis.controller.js:12`, `src/controllers/chat.controller.js:33` | Clear controller/service separation. |
| Standard response helpers set status and JSON | `src/utils/response.js:1`, `src/utils/response.js:2`, `src/utils/response.js:10`, `src/utils/response.js:11` | Consistent response shape and HTTP status usage. |
| Error middleware converts thrown errors into API errors | `src/middlewares/error.middleware.js:1`, `src/middlewares/error.middleware.js:9`, `src/app.js:111` | Central error handling exists. |
| Validation middleware exists and is used | `src/middlewares/validate.middleware.js:1`, `src/middlewares/validate.middleware.js:14`, `src/routes/auth.routes.js:58`, `src/routes/roadmap.routes.js:136` | Basic request validation is present. |
| Swagger UI is configured and mounted | `src/app.js:3`, `src/app.js:96` to `src/app.js:99`, `src/config/swagger.js:38` | OpenAPI/Swagger docs are present. |

### Strength level

strong

### Why Dev2Vec may score it low

The skill should not be `not_found`: there are real Express routes, controllers, middleware, status responses, validation, and Swagger docs. A low score is more likely caused by analyzer/input limitations than missing source code. In particular, `src/services/dev2vec/dev2vecInputBuilder.service.js:371` builds `repoDocument` from summarized repo/package/commit parts and `src/services/dev2vec/dev2vecInputBuilder.service.js:377` sends `apiTokens`; it does not appear to include full route/controller source snippets. If Dev2Vec mostly sees package/config tokens and commit summaries, REST implementation evidence can be missed.

### Missing/Improvement points

- PUT routes were not found; PATCH/DELETE/GET/POST are covered.
- Validation exists, but it is not uniformly attached to every mutating route.
- Swagger comments exist in route files, but Dev2Vec may not ingest these files as source snippets.
- Suggested fix is primarily Dev2Vec input-builder/source extraction, not REST source code.

## Database

### Evidence found

| Evidence | File | Notes |
|---|---|---|
| Mongoose dependency exists | `package.json:31` | Dependency token exists. |
| MongoDB connection uses Mongoose | `src/config/database.js:1`, `src/config/database.js:11` | Real connection code. |
| Server connects DB before listen | `server.js:6`, `server.js:12`, `server.js:13` | `server.js` is the entrypoint; database connection is part of app startup. |
| Many schemas/models are defined | `src/models/User.js:4`, `src/models/AnalysisResult.js:52`, `src/models/Repository.js:3`, `src/models/RepoAnalysisSnapshot.js:92` | Real Mongoose modeling. |
| Indexes are defined | `src/models/User.js:101`, `src/models/Repository.js:98`, `src/models/RepoAnalysisSnapshot.js:172` to `src/models/RepoAnalysisSnapshot.js:174` | Basic indexing is present. |
| CRUD reads and writes in services | `src/services/auth.service.js:176`, `src/services/auth.service.js:185`, `src/services/analysis.service.js:340`, `src/services/profile.service.js:113` | `findOne`, `create`, and save/update flows are used. |
| Update operations exist | `src/services/admin.service.js:205`, `src/services/admin.service.js:224`, `src/services/learning.service.js:213`, `src/services/github/github.package.service.js:244` | Uses `findByIdAndUpdate` and `findOneAndUpdate`. |
| Populate is used for relational references | `src/services/admin.service.js:267`, `src/services/admin.service.js:317`, `src/services/chat.service.js:582` | Reference resolution is present. |
| Aggregation is used | `src/services/learning.service.js:233` | More than basic CRUD. |
| Index maintenance script exists | `scripts/fixLearningContentIndexes.js:33`, `scripts/fixLearningContentIndexes.js:52` | Operational DB script uses MongoDB indexes. |

### Strength level

strong

### Why Dev2Vec may score it low

The skill should not be `not_found`: Mongoose connection, schemas, indexes, CRUD operations, populate, aggregate, and scripts are present. Low score is likely because Dev2Vec sees dependencies/configs but not enough model/service source. The input builder currently emphasizes package/config tokens and commit summaries (`src/services/dev2vec/dev2vecInputBuilder.service.js:357`, `src/services/dev2vec/dev2vecInputBuilder.service.js:371`) rather than reading `src/models/*` and DB-heavy service snippets.

### Missing/Improvement points

- No clear MongoDB transaction/session usage was found.
- Some indexes exist, but not every high-volume query path is obviously indexed from this audit alone.
- Suggested fix is to add model/service source extraction to Dev2Vec evidence before changing DB source code.

## Authentication

### Evidence found

| Evidence | File | Notes |
|---|---|---|
| Auth dependencies exist | `package.json:26`, `package.json:30` | `bcryptjs` and `jsonwebtoken`. |
| Register route and validation exist | `src/routes/auth.routes.js:56`, `src/routes/auth.routes.js:58` | Real endpoint with validation. |
| Login route and validation exist | `src/routes/auth.routes.js:93` | Real endpoint. |
| Password hashing on register | `src/services/auth.service.js:183` | Uses `bcrypt.hash(password, 10)`. |
| Password compare on login/change password | `src/services/auth.service.js:212`, `src/services/auth.service.js:531` | Real password verification. |
| JWT signing with expiration | `src/utils/generateToken.js:1`, `src/utils/generateToken.js:8`, `src/utils/generateToken.js:9` | Token expiry is `7d`. |
| Bearer token parsing and JWT verify | `src/middlewares/auth.middleware.js:9`, `src/middlewares/auth.middleware.js:21`, `src/middlewares/auth.middleware.js:22` | Real auth middleware. |
| Revoked token check/logout support | `src/middlewares/auth.middleware.js:23`, `src/services/auth.service.js:482`, `src/services/auth.service.js:493`, `src/models/RevokedToken.js:28` | Logout invalidates tokens via DB. |
| Protected user routes | `src/routes/auth.routes.js:237`, `src/routes/auth.routes.js:279`, `src/routes/auth.routes.js:300` | Logout/change password/me are protected. |
| Admin RBAC middleware | `src/routes/admin.routes.js:16`, `src/middlewares/admin.middleware.js:13`, `src/middlewares/admin.middleware.js:26` | Admin-only routes exist. |
| User role is modeled | `src/models/User.js:60`, `src/models/User.js:62` | Role enum exists. |

### Strength level

strong

### Why Dev2Vec may score it low

The skill should not be `not_found`: login/register, password hashing, JWT sign/verify, protected routes, token revocation, and admin RBAC are all present. A low score probably means source evidence is not being passed into Dev2Vec. If only package tokens such as `jsonwebtoken` and `bcryptjs` reach the model, it may classify the skill as dependency-only despite real middleware and service usage.

### Missing/Improvement points

- No refresh token flow was found.
- Token expiration exists, but advanced session/device management is not visible.
- RBAC is present for admin, but fine-grained permissions beyond role checks were not found.
- Suggested fix is mainly Dev2Vec input-builder/source extraction; source code is already above basic auth.

## Docker Basics

### Evidence found

| Evidence | File | Notes |
|---|---|---|
| Dockerfile exists with base image | `Dockerfile:1` | Uses `node:20-bookworm-slim`. |
| Workdir and production env are configured | `Dockerfile:3`, `Dockerfile:5` | Basic image setup. |
| Python/venv dependencies for Dev2Vec inference installed | `Dockerfile:14` to `Dockerfile:25` | Backend image includes ML inference runtime. |
| Node dependencies installed with npm ci | `Dockerfile:27`, `Dockerfile:28` | Production dependency install. |
| App copied, port exposed, start command set | `Dockerfile:30`, `Dockerfile:32`, `Dockerfile:34` | Runnable container config. |
| Docker Compose defines API service | `docker-compose.yml:1`, `docker-compose.yml:3`, `docker-compose.yml:5` | Builds app and maps `5000:5000`. |
| Compose defines MongoDB service and volume | `docker-compose.yml:13`, `docker-compose.yml:16`, `docker-compose.yml:18`, `docker-compose.yml:22` | Local DB container with persistent volume. |
| Compose uses environment file and dependency ordering | `docker-compose.yml:7`, `docker-compose.yml:9` | `.env.production` and `depends_on`. |
| `.dockerignore` excludes secrets, node_modules, tmp/build artifacts | `.dockerignore:1`, `.dockerignore:3`, `.dockerignore:5`, `.dockerignore:12`, `.dockerignore:17` | Basic Docker hygiene. |
| README documents Docker usage | `README.md:58`, `README.md:60`, `README.md:77` | Run instructions exist. |
| Dedicated Docker deploy docs exist | `docs/DEV2VEC_RENDER_DEPLOY.md:3`, `docs/DEV2VEC_RENDER_DEPLOY.md:57` | Deployment guidance exists. |

### Strength level

moderate

### Why Dev2Vec may score it low

Docker should not be `not_found`: Dockerfile, docker-compose, `.dockerignore`, scripts, README, and deploy docs exist. Low score is likely from analyzer/input builder not mapping config files to Docker Basics strongly enough, or from treating Docker files as generic configs. `src/services/analysis.service.js:256` and `src/services/analysis.service.js:257` already derive `hasDocker` and `hasDockerCompose`, so a score of 0 points to mapper/prompt/input evidence loss rather than absent files.

### Missing/Improvement points

- No Docker `HEALTHCHECK` instruction was found.
- Compose does not show explicit API environment variables beyond `env_file`.
- Compose `depends_on` does not wait for MongoDB health.
- Suggested fix may include score mapper/input evidence changes; source/config is enough for moderate Docker Basics, not strong production Docker.

## API Testing

### Evidence found

| Evidence | File | Notes |
|---|---|---|
| Test-like scripts exist in package scripts | `package.json:16` to `package.json:22` | These are Node scripts for skill/vector/roadmap logic, not API endpoint tests. |
| Script files exist under `scripts/` | `scripts/testSkillVectorBuilder.js`, `scripts/testRoleMatching.js`, `scripts/testRoadmapSkillGap.js` | Internal logic checks. |
| No Jest/Supertest/Vitest/Mocha/Chai dependencies found | `package.json` | `devDependencies` only contains `nodemon`. |
| No `npm test` script found | `package.json` | Only named script checks. |
| No `request(app)`/Supertest endpoint tests found | repo search | No evidence of API integration tests. |
| Analyzer checks for testing only from packages | `src/services/analysis.service.js:259` | Since no test framework package exists, backend testing signal will be false. |

### Strength level

weak

### Why Dev2Vec may score it low

API Testing may legitimately score low. There are internal script checks, but I did not find a test framework, endpoint tests, integration tests, CI workflow, or Supertest usage. This should not be conflated with REST API strength: REST API is strong, while API Testing is weak/not enough for endpoint-testing evidence.

### Missing/Improvement points

- Add `jest` or `vitest` plus `supertest`.
- Add endpoint tests for auth, protected routes, validation errors, and analysis endpoints.
- Add a standard `npm test` script.
- Add CI workflow if this skill should be considered stronger.
- This is a source/test gap, not just a Dev2Vec analyzer gap.

## Summary table

| Skill | Evidence level | Key evidence | Likely Dev2Vec issue | Suggested fix |
|---|---|---|---|---|
| REST API | strong | `src/app.js`, `src/routes/*`, `src/controllers/*`, response/error/validation middleware, Swagger | Analyzer/input builder likely sees package/config tokens but not route/controller snippets | Fix `dev2vecInputBuilder` to include source file paths/snippets for app/routes/controllers/middlewares; if evidence is present but score remains 0, fix skill score mapper/prompt wording. |
| Database | strong | `src/config/database.js`, `src/models/*`, CRUD/populate/aggregate in services, indexes | Analyzer/input builder likely misses `src/models/*` and DB service snippets | Fix `dev2vecInputBuilder` to ingest model/service source evidence; mapper should not output 0 when Mongoose schemas and CRUD are present. |
| Authentication | strong | `auth.routes`, `auth.service`, `auth.middleware`, `admin.middleware`, JWT, bcrypt, revoked tokens, roles | Analyzer may only see `jsonwebtoken`/`bcryptjs` tokens, not real auth flows | Fix `dev2vecInputBuilder` source extraction for auth routes/service/middleware; adjust score mapper if clear JWT/bcrypt middleware evidence still maps to missing. |
| Docker Basics | moderate | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, README/docs Docker instructions | Docker configs may be treated as generic config, or config evidence may not feed the skill mapper | Fix score mapper/input evidence for Dockerfile/compose paths; optionally improve source with healthcheck for stronger score. |
| API Testing | weak | Node script checks only; no Jest/Supertest/API endpoint tests found | Score low is mostly accurate; not just analyzer failure | Fix source/tests by adding API test framework and endpoint tests; then ensure `dev2vecInputBuilder` includes test files and package test dependencies. |

## Main conclusion

REST API, Database, Authentication, and Docker Basics should not be reported as `not_found`. The main issue for those four skills is likely analyzer/input-builder/mapper evidence loss, especially because `dev2vecInputBuilder` appears to build model input from package/config tokens, commit summaries, and normalized repo text rather than full source snippets from routes/controllers/models/middleware.

API Testing is different: the repository has some script-level checks, but it lacks clear API endpoint tests and test framework dependencies. A low API Testing score is mostly a real source/test coverage gap.
