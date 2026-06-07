# Career Roadmap Backend

Backend scaffold for the Personalized Career Orientation & Learning Roadmap Platform for Software Engineering Students.

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT authentication
- bcryptjs
- dotenv
- cors
- axios
- nodemon

## Folder Structure

```txt
career-roadmap-be/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── validators/
├── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Install

```bash
npm install
```

## Run

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Docker Usage

Start Docker Desktop first, then run:

```bash
npm run docker:up
```

Then open:

```txt
http://localhost:5000/api/swagger
```

Useful commands:

```bash
npm run docker:logs
npm run docker:down
npm run docker:restart
npm run docker:help
```

## Environment

Create a local `.env` file from `.env.example` and update the values for your machine.

MongoDB URI:

```txt
mongodb://127.0.0.1:27017/WDP
```

MongoDB local setup steps:

1. Open MongoDB Compass.
2. Connect to `mongodb://127.0.0.1:27017/WDP`.
3. Run backend.
4. Call register API.
5. MongoDB will auto-create `WDP` database and `users` collection when the first user is inserted.

Notes:

- You do not need to create collections manually.
- Collections are auto-created by Mongoose when the first document is written.
- If register has not been called yet, `users` may be empty or not visible.

## API Base URL

```txt
http://localhost:5000/api
```

## Swagger

Open Swagger UI here:

```txt
http://localhost:5000/api/swagger
```

## Authentication

Most APIs are protected.

After login, send JWT token in header:

```txt
Authorization: Bearer <JWT_TOKEN>
```

##### GET

/api/github/oauth: sẽ trả về 1 link connect, bấm vào connect với github

## Important Dependency Notes

### To use analysis correctly (truoc khi phan tich thi goi 2 api GET o duoi)

Before calling:

```http
POST /api/analysis/repositories/:repoId
```

you should call these first for the same repository:

```http
GET /api/github/repositories/:repoId/packages
GET /api/github/repositories/:repoId/commits
```

Reason:

- Analysis reads cached package/config data from `RepositoryPackage`
- Analysis reads cached commit data from `RepositoryCommit`
- If you skip those APIs, analysis still runs, but result quality will be weaker because package/config signals or commit signals may be missing

### To use AI feedback

Before calling:

```http
POST /api/ai-feedback/repositories/:repoId
```

you must already have at least one analysis snapshot:

```http
POST /api/analysis/repositories/:repoId
```

If not, API returns:

```txt
Please analyze repository before generating AI feedback.
```

### To use chat

Chat works best after:

```http
GET /api/github/repositories/:repoId/packages
GET /api/github/repositories/:repoId/commits
POST /api/analysis/repositories/:repoId
POST /api/ai-feedback/repositories/:repoId
```

Reason:

- Chat builds context from `StudentProfile`
- Chat uses synced repositories from database
- Chat uses analysis snapshots and skill signals
- Chat can still reply if Gemini is unavailable because backend has fallback response, but the answer quality depends on available GitHub analysis data

## Repository ID Recommendation

Many GitHub APIs accept:

- MongoDB repository `_id`
- GitHub numeric `githubRepoId`
- `owner/repo` full name for GitHub routes

Recommended approach:

- First call `GET /api/github/repositories`
- Then use the returned repository `_id` for later APIs

This is the safest and most consistent format across routes.

## API Groups and How to Use Them

### 1. Health

- `GET /api/health`
  Use to check whether backend is alive.

### 2. Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Use these first to obtain JWT token and inspect current user.

### 3. Profile

- `GET /api/profiles/me`
- `PATCH /api/profiles/me`

Profile is used later by AI feedback and chat context.

### 4. GitHub

- `GET /api/github/oauth`
- `GET /api/github/oauth/callback`
- `GET /api/github/me`
- `DELETE /api/github/disconnect`
- `GET /api/github/repositories`
- `GET /api/github/repositories/cached`
- `GET /api/github/repositories/:repoId`
- `GET /api/github/repositories/:repoId/packages`
- `GET /api/github/repositories/:repoId/packages/cached`
- `GET /api/github/repositories/:repoId/commits`
- `GET /api/github/repositories/:repoId/commits/cached`

Usage notes:

- `GET /api/github/repositories` syncs from GitHub to MongoDB
- `GET /api/github/repositories/cached` only reads local database
- `GET /api/github/repositories/:repoId/packages` fetches package/config files from GitHub and stores cache
- `GET /api/github/repositories/:repoId/packages/cached` reads local package cache only
- `GET /api/github/repositories/:repoId/commits` fetches commits from GitHub and stores cache
- `GET /api/github/repositories/:repoId/commits/cached` reads local commit cache only

Useful query params:

- `GET /api/github/repositories?includeForks=true`
- `GET /api/github/repositories?sync=false`
- `GET /api/github/repositories/:repoId/commits?perPage=50`
- `GET /api/github/repositories/:repoId/commits?includeStats=true`

Note:

- `includeStats=true` fetches extra commit stats and is heavier than normal commit fetch

### 5. Analysis

- `POST /api/analysis/repositories/:repoId`
- `GET /api/analysis/results/:repoId`
- `GET /api/analysis/me`

Recommended flow:

1. Sync repositories
2. Fetch package/config cache
3. Fetch commit cache
4. Run analysis
5. Read latest analysis result

### 6. AI Feedback

- `POST /api/ai-feedback/repositories/:repoId`
- `GET /api/ai-feedback/results/:repoId`
- `GET /api/ai-feedback/me`

Recommended flow:

1. Finish analysis first
2. Generate AI feedback
3. Read latest AI feedback result

### 7. Chat

- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:sessionId`
- `POST /api/chat/sessions/:sessionId/messages`

Create session body example:

```json
{
  "title": "Tu van GitHub cua toi"
}
```

Send message body example:

```json
{
  "message": "Dua tren GitHub cua toi, toi nen hoc gi tiep theo?"
}
```

Recommended flow:

1. Create chat session
2. Send message into that session
3. Load session detail to show message history

### 8. Roadmaps

- `POST /api/roadmaps/generate`
- `GET /api/roadmaps/me`
- `GET /api/roadmaps/:roadmapId`
- `PATCH /api/roadmaps/:roadmapId/archive`

Generate roadmap body example:

```json
{
  "targetRole": "Backend Developer",
  "forceRegenerate": false
}
```

Supported target roles:

- `Frontend Developer`
- `Backend Developer`
- `Fullstack Developer`
- `Mobile Developer`
- `Tester / QA Engineer`
- `DevOps Beginner`
- `Data Analyst`
- `AI / Machine Learning Beginner`

Roadmap generation uses GitHub context from profile, repositories, analysis snapshots, skill signals and AI feedback. If `LLM_API_KEY` is missing or Gemini fails, the API still creates a fallback roadmap for MVP demo.

### 9. Placeholder or Scaffold Endpoints

These routes exist, but current service implementation is still scaffold-only or returns ready payload:

- `GET /api/repositories/:repoId`
- `POST /api/ai/analyze`
- `GET /api/progress/me`

Use Swagger to verify their current response before integrating them on frontend/mobile.

## Common Testing Sequence for Postman

If you want one realistic end-to-end test sequence, use this order:

1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. Copy JWT token
4. `PATCH /api/profiles/me`
5. `GET /api/github/oauth`
6. Open `authorizeUrl` and complete GitHub OAuth
7. `GET /api/github/repositories`
8. Copy one repository `_id`
9. `GET /api/github/repositories/:repoId/packages`
10. `GET /api/github/repositories/:repoId/commits`
11. `POST /api/analysis/repositories/:repoId`
12. `GET /api/analysis/results/:repoId`
13. `POST /api/ai-feedback/repositories/:repoId`
14. `GET /api/ai-feedback/results/:repoId`
15. `POST /api/chat/sessions`
16. `POST /api/chat/sessions/:sessionId/messages`
17. `POST /api/roadmaps/generate`
18. `GET /api/roadmaps/me`

## Notes

- Swagger UI is the best place to inspect request/response schema quickly.
- For analysis quality, always fetch package/config cache and commit cache before running analysis.
- For chat quality, always analyze repository first.
- Some endpoints are already functional, while some are still scaffold-only as noted above.

## Deployment

### MongoDB Atlas

1. Create a free MongoDB Atlas cluster.
2. Create a database user and password.
3. Create or choose a database name, for example `career-roadmap-db`.
4. In Network Access, allow the deploy platform IP range. For Render/Railway demos, `0.0.0.0/0` is commonly used, but restrict it when possible.
5. Use a connection string with the database name:

```txt
mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority&appName=<app-name>
```

### Render or Railway

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

The production start script uses `node server.js`. Do not use `nodemon` for production.

### Environment Variables

Set these variables on Render/Railway:

- `NODE_ENV`
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `GITHUB_API_BASE_URL`
- `GITHUB_TOKEN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `FRONTEND_URL`
- `CLIENT_URL`
- `LLM_PROVIDER`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_BASE_URL`
- `API_BASE_URL`

`MONGODB_URI` is also supported for backward compatibility, but `MONGO_URI` is preferred.

For the current Render/Vercel deployment, set:

```txt
API_BASE_URL=https://career-roadmap-api-zs7y.onrender.com
FRONTEND_URL=https://web-project-seven-rust.vercel.app
CLIENT_URL=https://web-project-seven-rust.vercel.app
GITHUB_CALLBACK_URL=https://career-roadmap-api-zs7y.onrender.com/api/github/oauth/callback
```

### Test After Deploy

- `GET /health`
- `GET /api/health`
- `GET /api/swagger`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Frontend Handoff

Send the frontend team:

- Base URL: `https://career-roadmap-api-zs7y.onrender.com/api`
- Swagger URL: `https://career-roadmap-api-zs7y.onrender.com/api/swagger`
- Authorization header format:

```txt
Authorization: Bearer <token>
```

### Security Note

Do not commit `.env`, `.env.local`, or `.env.production`. If any secret is exposed or was committed, rotate the MongoDB password, JWT secret, GitHub credentials, and LLM API keys before deployment.
