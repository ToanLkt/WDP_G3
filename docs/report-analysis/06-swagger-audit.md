# 06. Swagger Audit

## Setup

| Item | Status | Evidence |
|---|---|---|
| Package | CONFIRMED | `package.json:32-33` |
| OpenAPI version | CONFIRMED | `src/config/swagger.js:5` declares `3.0.0` |
| Swagger source glob | CONFIRMED | `src/config/swagger.js:26` uses `./src/routes/*.js` |
| Swagger route | CONFIRMED | `src/app.js:91-99` exposes `/api/swagger` |
| Security scheme | CONFIRMED | `src/config/swagger.js:18-25` defines bearer JWT |
| Global security | CONFIRMED | `src/config/swagger.js:26` sets bearerAuth globally |

## Coverage Summary

Most route files contain `@swagger` blocks and tags. Confirmed tags include Auth, Profiles, Dashboard, Notifications, GitHub, Analysis, Roles, Snapshots, AI Feedback, AI, Chat, Roadmaps, Learning, Reports, Skills, Admin.

## Important Coverage Gaps / Partial Docs

| Endpoint | Route evidence | Swagger status | Note |
|---|---|---|---|
| `GET /` | `src/app.js:45` | Missing | Root endpoint is outside route glob. |
| `GET /health` | `src/app.js:68` | Missing | Outside route glob. |
| `GET /api/health` | `src/app.js:69` | Missing | Outside route glob. |
| `GET /api/repositories/:repoId` | `src/routes/repository.routes.js:121` | Missing/partial | Nearby Swagger docs cover snapshot/progress endpoints, not this final repository route. |
| `POST /api/ai/analyze` | `src/routes/ai.routes.js:31` | Partial | File has AI health swagger; analyze route lacks an adjacent block in extracted route evidence. |
| `GET /api/progress/me` | `src/routes/progress.routes.js:8` | Missing | No `@swagger` evidence in route file grep output. |
| Some admin PATCH/report routes | `src/routes/admin.routes.js:714`, `src/routes/admin.routes.js:816` | Partial | Swagger blocks exist nearby; verify schemas manually before screenshots. |

## Schema Accuracy Risks

- Swagger docs are generated from comments in route files, not from Mongoose schemas. Schema drift can occur.
- Models with large embedded structures (`Roadmap`, `AnalysisResult`, `RepoAnalysisSnapshot`, `LearningContent`) are most likely to drift from response examples.
- Auth security is global in OpenAPI but public routes explicitly override with `security: []` in several auth/GitHub callback blocks.

## Recommended Screenshots For Report

1. `/api/swagger` top page showing title/version and server URL.
2. Auth tag expanded for login/register/JWT route contrast.
3. GitHub tag expanded for OAuth/repositories/packages/commits.
4. Analysis/Roles tag expanded for repository analysis and role matching.
5. Roadmaps/Learning tags expanded for roadmap item learning generation.
6. Admin tag expanded to show admin-only management surface.

Do not include secrets in screenshots. If deployed Swagger uses a production base URL, redact it if required by report policy.
