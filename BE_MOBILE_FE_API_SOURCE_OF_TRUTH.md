# BE Mobile FE API Source Of Truth

Audit date: 2026-07-01

Scope checked: `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/validators`. Conclusions below are based on code, not only Swagger comments.

## 1. Roadmap APIs

### 1.1 Roadmap Detail

Use in mobile user flow:

```http
GET /api/roadmaps/{roadmapId}
```

Source:
- `src/routes/roadmap.routes.js`
- `src/controllers/roadmap.controller.js`
- `src/services/roadmap.service.js`
- `src/models/Roadmap.js`

Response shape:

```json
{
  "success": true,
  "message": "Roadmap fetched successfully",
  "data": {
    "roadmap": {
      "roadmapId": "...",
      "title": "...",
      "targetRole": "Backend Developer",
      "roleId": "backend-developer",
      "requestedLevel": "beginner",
      "effectiveLevel": "intermediate",
      "durationWeeks": 6,
      "language": "vi",
      "roadmapSource": {},
      "roleMatch": {},
      "skillGapSummary": [],
      "mainRoadmap": {
        "title": "...",
        "targetRole": "Backend Developer",
        "reason": "...",
        "phases": []
      },
      "alternativeRoadmaps": [],
      "progressSummary": {
        "totalItems": 0,
        "completedItems": 0,
        "inProgressItems": 0,
        "overallProgress": 0
      },
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

Confirmed:
- `mainRoadmap`: yes, compact response includes it.
- `alternativeRoadmaps`: yes, compact response includes it.
- `mainPath` / `supportingPaths`: still exist in `Roadmap` model for storage/legacy normalization, but are omitted from compact user response.
- Task key for FE: use `itemId`, not Mongo `_id`.
- Task fields in compact roadmap phases: `itemId`, `title`, `description`, `skillName`, `canonicalSkillName`, `category`, `targetRole`, `level`, `priority`, `week`, `estimatedHours`, `status`.

### 1.2 Roadmap Generate

Use in mobile user flow:

```http
POST /api/roadmaps/generate
```

Source:
- `src/routes/roadmap.routes.js`
- `src/controllers/roadmap.controller.js`
- `src/services/roadmap.service.js`
- `src/validators/roadmap.validator.js`
- `src/services/analysisSource.service.js`

Request body:

```json
{
  "targetRole": "Backend Developer",
  "roleId": "backend-developer",
  "level": "beginner",
  "durationWeeks": 6,
  "language": "vi",
  "useRoleMatching": true,
  "forceRegenerate": true,
  "sourceMode": "single_repo",
  "repoId": "repoId",
  "repoIds": ["repoId1", "repoId2"]
}
```

Rules:
- `targetRole` is required and must be in `TARGET_ROLES`.
- `roleId` is optional.
- `sourceMode` enum: `single_repo`, `all_analyzed_repos`, `selected_repos`.
- If `sourceMode` is omitted and `repoId` exists, BE uses `single_repo`.
- If `sourceMode` is omitted and `repoId` does not exist, BE uses `all_analyzed_repos`.
- `single_repo` requires `repoId`.
- `all_analyzed_repos` requires at least one analyzed repository, no `repoId` or `repoIds` required.
- `selected_repos` requires non-empty `repoIds`.
- `level` is optional fallback. BE overrides it with analysis-derived `summary.userLevel` when available, producing `effectiveLevel`.
- `forceRegenerate=false`: BE tries to return an existing active roadmap for same target/source/analysis set.
- `forceRegenerate=true`: BE archives matching active roadmap(s) for the source mode and creates a new one.

Response:
- Status `201` when generated.
- Status `200` when existing roadmap is fetched.
- Data shape is the same compact roadmap object as detail, without wrapping under `roadmap`.

### 1.3 Roadmap Progress

Use in mobile user flow:

```http
GET   /api/roadmaps/{roadmapId}/progress
PATCH /api/roadmaps/{roadmapId}/progress/items
POST  /api/roadmaps/{roadmapId}/progress/reset
```

Source:
- `src/routes/roadmap.routes.js`
- `src/controllers/roadmapProgress.controller.js`
- `src/services/roadmapProgress.service.js`
- `src/models/RoadmapProgress.js`

Conclusion:
- This is the main progress flow for FE mobile.
- FE should stop using local-only progress as source of truth.
- PATCH should use `itemId`.
- `skillName` is still accepted as backward-compatible fallback, but FE should treat it as deprecated because duplicate skill matches return `400`.

PATCH body:

```json
{
  "itemId": "main-2-1-api-testing",
  "status": "completed",
  "progressPercent": 100
}
```

Valid status:
- `not_started`
- `in_progress`
- `completed`

PATCH response:

```json
{
  "roadmapId": "...",
  "progressSummary": {
    "totalItems": 10,
    "completedItems": 1,
    "inProgressItems": 0,
    "overallProgress": 10
  },
  "items": [
    {
      "itemId": "main-2-1-api-testing",
      "title": "...",
      "skillName": "API Testing",
      "canonicalSkillName": "API Testing",
      "category": "Testing",
      "targetRole": "Backend Developer",
      "level": "intermediate",
      "priority": "high",
      "status": "completed",
      "progressPercent": 100,
      "startedAt": "...",
      "completedAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### 1.4 Roadmap Learning Integrated

Use in mobile roadmap learning flow:

```http
GET  /api/roadmaps/{roadmapId}/learning
GET  /api/roadmaps/{roadmapId}/learning/items/{itemId}
POST /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate
```

Source:
- `src/routes/roadmap.routes.js`
- `src/controllers/roadmapLearning.controller.js`
- `src/services/roadmapLearning.service.js`
- `src/services/learning.service.js`
- `src/models/LearningContent.js`
- `src/models/LearningResource.js`

Conclusion:
- This is the main learning flow for roadmap mobile.
- FE does not need direct `/api/learning/skills/*` in roadmap flow.
- `GET /roadmaps/{roadmapId}/learning` does not generate lessons. It checks availability only.
- `learningStatus` enum: `available`, `missing`.
- If missing, FE should call POST generate for that `itemId`.
- FE does not send `skillName`, `targetRole`, or `level` to integrated roadmap learning. BE derives them from the roadmap task and roadmap.

POST generate body:

```json
{
  "forceRegenerate": false,
  "includeResources": true
}
```

GET learning list response:

```json
{
  "roadmapId": "...",
  "sourceMode": "selected_repos",
  "language": "vi",
  "items": [
    {
      "itemId": "main-2-2-api-testing",
      "taskTitle": "...",
      "canonicalSkillName": "API Testing",
      "skillName": "API Testing",
      "targetRole": "Backend Developer",
      "level": "intermediate",
      "week": 2,
      "priority": "high",
      "learningStatus": "available"
    }
  ]
}
```

GET item / POST generate response fields:
- `roadmapId`
- `itemId`
- `task`: `title`, `description`, `skillName`, `canonicalSkillName`, `category`, `targetRole`, `level`, `week`, `priority`, `estimatedHours`
- `learning`: `skillName`, `canonicalSkillName`, `targetRole`, `level`, `language`, `title`, `overview`, `whyLearn`, `useCases`, `howToApply`, `examples`, `checklist`, `exercises`, `commonMistakes`, `nextSkills`, `resources`
- `personalizedContext`: `sourceMode`, `repoName`, `projectType`, `repositoryNames`, `practiceTask`, `roadmapReason`
- `progress`: `status`, `progressPercent`, or `null`

## 2. Learning APIs riêng lẻ

APIs:

```http
GET  /api/learning/skills/{skillName}
GET  /api/learning/skills/{skillName}/resources
POST /api/learning/skills/{skillName}/resources
POST /api/learning/skills/{skillName}/resources/search
POST /api/learning/skills/generate
```

Source:
- `src/routes/learning.routes.js`
- `src/controllers/learning.controller.js`
- `src/services/learning.service.js`
- `src/models/LearningContent.js`
- `src/models/LearningResource.js`

## Learning API conclusion

- User mobile roadmap flow: use `/api/roadmaps/{roadmapId}/learning/*`.
- Do not use in roadmap flow: direct `/api/learning/skills/*`.
- Reason: roadmap integrated APIs map content to `roadmapId` + `itemId`, derive `skillName/targetRole/level/language`, include personalized roadmap context, and can include progress.
- `/api/learning/skills/*` still exists as shared learning cache/content/resource API. It is suitable for admin/debug/manual seed/cache/resource search or non-roadmap learning surfaces.

## 3. Role APIs

### 3.1 Legacy Single-Repo Role Matches

```http
GET /api/analysis/repositories/{repoId}/role-matches
```

Source:
- `src/routes/analysis.routes.js`
- `src/controllers/analysis.controller.js`
- `src/services/analysis.service.js`

Conclusion:
- This is legacy single-repo role matching.
- New FE mobile should not prioritize it.
- Keep only for backward compatibility or a dedicated single-repo legacy screen.

### 3.2 Main Role Matches

```http
POST /api/analysis/role-matches
```

Source:
- `src/routes/analysis.routes.js`
- `src/controllers/analysis.controller.js`
- `src/services/analysis.service.js`
- `src/services/analysisSource.service.js`
- `src/services/roleMatching.service.js`

Conclusion:
- This is the main API for FE mobile to generate suggested role matches.
- It supports `sourceMode`: `single_repo`, `all_analyzed_repos`, `selected_repos`.

Request bodies:

```json
{
  "sourceMode": "single_repo",
  "repoId": "repoId",
  "limit": 5
}
```

```json
{
  "sourceMode": "all_analyzed_repos",
  "limit": 5
}
```

```json
{
  "sourceMode": "selected_repos",
  "repoIds": ["repoId1", "repoId2"],
  "limit": 5,
  "view": "summary"
}
```

Rules:
- `sourceMode` defaults to `single_repo` if `repoId` exists, otherwise `all_analyzed_repos`.
- `single_repo` requires `repoId`.
- `selected_repos` requires `repoIds`.
- `limit` defaults to `5`, max `20`.
- `includeDetails=true` or `view=detail` returns detailed role skill breakdown.

Compact response:

```json
{
  "sourceMode": "selected_repos",
  "analysisSource": {
    "type": "multi_repo_user_contribution_analysis",
    "sourceMode": "selected_repos",
    "totalRepositories": 3,
    "totalUserCommits": 11,
    "userLevel": "intermediate",
    "userReadinessScore": 61,
    "repositoryNames": ["WDP_G3"]
  },
  "matches": [
    {
      "roleId": "backend-developer",
      "roleName": "Backend Developer",
      "matchScore": 58.57,
      "matchLevel": "moderate",
      "matchLevelLabel": "Tạm phù hợp",
      "matchedSkillNames": ["Express.js"],
      "weakSkillNames": ["Node.js"],
      "missingSkillNames": ["Testing"],
      "recommendedNextSkills": ["Testing"]
    }
  ]
}
```

Detail match fields:
- `roleId`, `roleName`, `matchScore`, `matchLevel`, `matchLevelLabel`
- `matchedSkills`, `weakSkills`, `missingRequiredSkills`, `missingOptionalSkills`
- `recommendedNextSkills`

### 3.3 Role Catalog

```http
GET /api/roles/catalog
```

Source:
- `src/routes/role.routes.js`
- `src/controllers/role.controller.js`
- `src/constants/roleSkillVectors.js`

Use:
- Optional for dropdown/manual role selection.
- Role Match POST is enough for suggested roles.

Response:

```json
{
  "total": 0,
  "roles": [
    {
      "roleId": "backend-developer",
      "roleName": "Backend Developer",
      "description": "...",
      "category": "...",
      "level": "...",
      "requiredSkillCount": 0,
      "optionalSkillCount": 0
    }
  ]
}
```

## Role API conclusion

- Main API for suitable role suggestions: `POST /api/analysis/role-matches`.
- Standard dropdown/list API: `GET /api/roles/catalog`.
- Legacy not prioritized: `GET /api/analysis/repositories/{repoId}/role-matches`.
- When generating roadmap, FE should use `roleId` and `roleName` from role-match result or role catalog. Send `targetRole` as the role name and `roleId` as the stable role id.

## 4. Chat APIs

### 4.1 User Chat

Use:

```http
POST /api/chat/sessions
GET  /api/chat/sessions
GET  /api/chat/sessions/{sessionId}
POST /api/chat/sessions/{sessionId}/messages
```

Source:
- `src/routes/chat.routes.js`
- `src/controllers/chat.controller.js`
- `src/services/chat.service.js`
- `src/validators/chat.validator.js`
- `src/models/ChatSession.js`
- `src/models/ChatMessage.js`
- `src/models/ChatSetting.js`

User sends message:

```http
POST /api/chat/sessions/{sessionId}/messages
```

Body:

```json
{
  "message": "..."
}
```

When `effectiveMode=AI_AUTO`, response data includes:
- `mode`: `AI_AUTO`
- `effectiveMode`: `AI_AUTO`
- `modeSource`: `GLOBAL` or `SESSION`
- `status`: usually `active`
- `userMessage`
- `aiMessage`
- `assistantMessage`
- non-production debug only: `intent`, `contextSource`, `skillScoreSummary`

When `effectiveMode=MANUAL`, response data includes:
- `mode`: `MANUAL`
- `effectiveMode`: `MANUAL`
- `modeSource`: `GLOBAL` or `SESSION`
- `status`: `waiting_admin`
- `userMessage`
- `adminMessage`: `null`

Message response fields:
- `_id`
- `sessionId`
- `userId`
- `role`
- `senderType`
- `senderId`
- `content`
- `metadata`
- `createdAt`
- `updatedAt`

Enums:
- `senderType`: `USER`, `AI`, `ADMIN`
- `mode`: `AI_AUTO`, `MANUAL`
- `modeSource`: `GLOBAL`, `SESSION`
- `status`: `active`, `waiting_admin`, `answered`, `closed`

FE rules:
- Decide AI/MANUAL behavior using `effectiveMode`.
- Render message author using `senderType`.
- User can receive admin replies through `GET /api/chat/sessions/{sessionId}` because it returns all messages in the session, including `senderType=ADMIN`.

### 4.2 Admin Chat

Use:

```http
GET   /api/admin/chat/sessions
GET   /api/admin/chat/sessions/{sessionId}
POST  /api/admin/chat/sessions/{sessionId}/messages
PATCH /api/admin/chat/sessions/{sessionId}/mode
PATCH /api/admin/chat/sessions/{sessionId}/use-global-mode
GET   /api/admin/chat/settings
PATCH /api/admin/chat/settings
```

Source:
- `src/routes/admin.routes.js`
- `src/controllers/admin.controller.js`
- `src/services/chat.service.js`

Admin inbox:

```http
GET /api/admin/chat/sessions
```

Query filters supported:
- `status`
- `mode`
- `modeSource`
- `userId`
- `assignedAdminId`
- `page`
- `limit`

Admin detail:
- Returns `session` with `effectiveMode` and populated `user`.
- Returns `messages`.

Admin reply body:

```json
{
  "content": "Admin reply..."
}
```

After admin reply:
- `mode`: `MANUAL`
- `modeSource`: `SESSION`
- `status`: `answered`
- `assignedAdminId`: current admin
- `unreadByUser`: `true`

Patch session mode body:

```json
{
  "mode": "MANUAL",
  "reason": "Admin muốn hỗ trợ trực tiếp"
}
```

or:

```json
{
  "mode": "AI_AUTO"
}
```

Global settings patch body:

```json
{
  "mode": "MANUAL"
}
```

or:

```json
{
  "mode": "AI_AUTO"
}
```

`use-global-mode` response returns:
- `session` with `modeSource=GLOBAL`
- `mode` set to current global setting
- `effectiveMode` equal to current global setting

## Chat API conclusion

- User chat uses `/api/chat/sessions*`.
- Admin settings use `/api/admin/chat/settings`.
- Admin inbox/detail/reply use `/api/admin/chat/sessions*`.
- FE renders messages by `senderType`.
- FE determines AI/manual state by `effectiveMode`.

## 5. Analysis APIs

Use:

```http
GET  /api/analysis/me
POST /api/analysis/repositories/{repoId}
GET  /api/analysis/results/{repoId}
```

Source:
- `src/routes/analysis.routes.js`
- `src/controllers/analysis.controller.js`
- `src/services/analysis.service.js`
- `src/services/analysis/analysis.engine.js`
- `src/models/AnalysisResult.js`

POST analysis compact response fields:
- `analysisId`
- `snapshotId`
- `repository`: `repositoryId`, `githubRepoId`, `repoName`, `fullName`
- `analysisScope`: `type`, `githubUsername`, `totalRepoCommits`, `userCommits`, `activeDays`, `firstCommitDate`, `lastCommitDate`
- `summary`: `careerDirection`, `userLevel`, `userReadinessScore`, `overallScore`, `projectType`, `confidence`
- `topSkills`: `skill`, `canonicalSkillName`, `category`, `score`, `level`
- `missingSkills`: `skill`, `canonicalSkillName`, `category`, `priority`
- `strengths`: `string[]`
- `weaknesses`: `string[]`
- `recommendations`: `string[]`
- `createdAt`

GET latest analysis:

```http
GET /api/analysis/results/{repoId}
```

Response wraps the same compact analysis under:

```json
{
  "analysis": {}
}
```

GET my analysis:

```http
GET /api/analysis/me
```

Response:

```json
{
  "total": 0,
  "analyses": []
}
```

List item is compact and intentionally omits `strengths`, `weaknesses`, `recommendations`, and `createdAt`; it includes `analyzedAt`.

Confirmed:
- `analysisScope.userCommits`, `totalRepoCommits`, `activeDays` are always present as numbers with fallback `0`.
- `summary.userLevel` defaults to `beginner`; `userReadinessScore` defaults to `0`.
- `topSkills` and `missingSkills` are object arrays.
- `strengths`, `weaknesses`, `recommendations` are `string[]` for POST and GET detail result, not object arrays.
- Query `view=summary/detail` is supported.
- `includeEvidence=true` works only with `view=detail`; it adds `debug.skillVector`.

FE should render:
- analysis cards/list: `repository`, `analysisScope`, `summary`, `topSkills`, `missingSkills`, `analyzedAt`
- detail screen: also render `strengths`, `weaknesses`, `recommendations`
- debug/admin only: `scoreBreakdown`, `debug.skillVector`

FE should not assume list items from `/analysis/me` contain `strengths`, `weaknesses`, or `recommendations`.

## 6. Snapshot APIs

Use:

```http
GET  /api/repositories/{repoId}/progress-comparison
GET  /api/repositories/{repoId}/snapshots
GET  /api/snapshots/{snapshotId}
POST /api/snapshots/compare
```

Source:
- `src/routes/repository.routes.js`
- `src/routes/snapshot.routes.js`
- `src/controllers/snapshot.controller.js`
- `src/services/snapshot.service.js`
- `src/models/RepoAnalysisSnapshot.js`

`GET /api/repositories/{repoId}/progress-comparison` when not enough data:

```json
{
  "repositoryId": "...",
  "repoName": "...",
  "analysisScopeType": "user_contribution",
  "enoughData": false,
  "snapshotsCount": 1,
  "comparison": null
}
```

When enough data:
- Same shape as snapshot comparison result.
- `enoughData: true`
- fields: `repositoryId`, `repoName`, `fullName`, `analysisScopeType`, `fromSnapshot`, `toSnapshot`, `delta`, `skillChanges`, `newSkills`, `improvedSkills`, `weakerSkills`, `resolvedMissingSkills`, `newMissingSkills`

POST compare body:

```json
{
  "fromSnapshotId": "snapshotId1",
  "toSnapshotId": "snapshotId2"
}
```

Backward-compatible aliases:

```json
{
  "snapshotAId": "snapshotId1",
  "snapshotBId": "snapshotId2"
}
```

`snapshotAId/snapshotBId` are deprecated aliases per route comment and service fallback. FE should use `fromSnapshotId/toSnapshotId`.

FE usage:
- Timeline: `GET /api/repositories/{repoId}/snapshots`.
- First vs latest comparison: `GET /api/repositories/{repoId}/progress-comparison`.
- Manual comparison between selected snapshots: `POST /api/snapshots/compare`.

## 7. Correct FE Mobile Flow

### 7.1 User creates role matches

```text
User has analyzed repo(s)
  -> FE calls POST /api/analysis/role-matches
  -> FE displays matches
  -> User selects one role
  -> FE uses roleId + roleName to generate roadmap
```

Confirmed main API:

```http
POST /api/analysis/role-matches
```

### 7.2 User creates roadmap

```text
User selects role from role match or role catalog
  -> User selects sourceMode
  -> FE calls POST /api/roadmaps/generate
  -> FE receives roadmapId
  -> FE opens GET /api/roadmaps/{roadmapId}
```

### 7.3 User learns roadmap task

```text
FE opens roadmap detail
  -> GET /api/roadmaps/{roadmapId}
  -> GET /api/roadmaps/{roadmapId}/progress
  -> GET /api/roadmaps/{roadmapId}/learning
  -> User taps a task
  -> if learningStatus=available: GET /api/roadmaps/{roadmapId}/learning/items/{itemId}
  -> if learningStatus=missing: POST /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate
  -> User completes task
  -> PATCH /api/roadmaps/{roadmapId}/progress/items with itemId
```

### 7.4 Chat flow

User:

```text
POST /api/chat/sessions
  -> POST /api/chat/sessions/{sessionId}/messages
  -> if effectiveMode=AI_AUTO, render aiMessage
  -> if effectiveMode=MANUAL, show waiting_admin state
  -> GET /api/chat/sessions/{sessionId} to fetch messages including admin replies
```

Admin:

```text
GET /api/admin/chat/sessions?status=waiting_admin
  -> GET /api/admin/chat/sessions/{sessionId}
  -> POST /api/admin/chat/sessions/{sessionId}/messages
  -> optional PATCH /api/admin/chat/sessions/{sessionId}/mode
  -> optional PATCH /api/admin/chat/settings
```

## 8. Final Module Table

| Module | FE mobile nên dùng | Không nên dùng trong flow chính | Ghi chú |
|---|---|---|---|
| Role Match | `POST /api/analysis/role-matches` | `GET /api/analysis/repositories/{repoId}/role-matches` | GET repo role-match là legacy single-repo. |
| Role Catalog | `GET /api/roles/catalog` khi cần dropdown/manual role | Không bắt buộc nếu đã dùng role match | Generate roadmap nên gửi `roleId` + `targetRole`. |
| Learning | `/api/roadmaps/{roadmapId}/learning/*` | `/api/learning/skills/*` trong roadmap flow | Direct learning APIs phù hợp cache/admin/debug/manual seed. |
| Roadmap Progress | `/api/roadmaps/{roadmapId}/progress*` | local-only progress | Progress tracked by `itemId`. |
| Roadmap Detail | `GET /api/roadmaps/{roadmapId}` | đọc `mainPath/supportingPaths` từ response | Response compact dùng `mainRoadmap/alternativeRoadmaps`. |
| Chat | User: `/api/chat/sessions*`; Admin: `/api/admin/chat/*` | FE user gọi admin APIs | Render by `senderType`, behavior by `effectiveMode`. |
| Analysis | POST repo analysis, GET result, GET `/analysis/me` | render debug evidence in normal user UI | `/analysis/me` list item omits recommendations/strengths/weaknesses. |
| Snapshot | timeline: `/repositories/{repoId}/snapshots`; compare: `/progress-comparison` or `/snapshots/compare` | `snapshotAId/snapshotBId` for new FE | Use `fromSnapshotId/toSnapshotId`. |

## FE Mobile API Checklist

[ ] Replace hardcoded role suggestion with `POST /api/analysis/role-matches` if confirmed  
[ ] Use `/api/roles/catalog` only for dropdown/list if needed  
[ ] Use Roadmap Learning APIs, not `/api/learning/skills/*`, in roadmap flow  
[ ] Use Progress APIs, not local-only progress  
[ ] Use `itemId` for progress and learning  
[ ] Use `effectiveMode` for user chat behavior  
[ ] Use `senderType` to render `USER`/`AI`/`ADMIN`  
[ ] Add Admin Chat APIs/screens  

