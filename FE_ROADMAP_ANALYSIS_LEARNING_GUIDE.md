# FE Roadmap, Analysis, Learning Guide

Tài liệu này mô tả contract hiện tại của Backend cho các phần FE đang dùng nhiều nhất:
Analysis, Role/Skill Catalog, Roadmap Generate, Roadmap Progress, Roadmap Learning,
Shared Learning và Snapshots.

Nguồn tham chiếu là code hiện tại trong `src/services`, `src/controllers`, `src/routes`,
`src/constants` và `src/utils`. Nếu một chi tiết chưa thấy rõ trong code, tài liệu ghi rõ
`Cần kiểm tra thêm` hoặc `Chưa thấy trong code`.

## Quy ước chung

- Các API bên dưới đều cần `Authorization: Bearer <token>` trừ khi route gốc có ghi khác.
- Response được bọc bởi `successResponse`, thường có dạng:

```json
{
  "success": true,
  "message": "string",
  "data": {},
  "errorCode": null
}
```

- Analysis/Roadmap/Snapshot cho FE hiện ưu tiên `analysisScope.type = "user_contribution"`.
- FE không nên đọc raw DB fields như `_id`, `userId`, `__v`, `rawAnalysis`, root `skillVector`,
  `packages`, `configs`, `checklist`, `sourceContextSummary` trong các response compact.

---

## 1. Analysis - Phân tích theo commit của current user

### API chính

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `POST` | `/api/analysis/repositories/{repoId}` | Tạo analysis mới cho repo, dựa trên commit của current user |
| `GET` | `/api/analysis/results/{repoId}` | Lấy latest analysis của current user trong repo |
| `GET` | `/api/analysis/me` | Lấy latest analysis theo từng repo của current user |
| `GET` | `/api/analysis/repositories/{repoId}/role-matches` | Tính role matches từ latest skillVector của repo |

Query hỗ trợ:

| Query | Default | Ý nghĩa |
| --- | --- | --- |
| `view=summary|detail` | `summary` | `detail` thêm `scoreBreakdown`, `analysisScope.analyzedCommitShas` |
| `includeEvidence=true` | `false` | Chỉ có tác dụng với `view=detail`, trả `debug.skillVector` |

### Luồng khi user bấm "Phân tích repo"

Trong `src/services/analysis.service.js`:

1. BE gọi `findRepositoryForUser(user, repoId)` để đảm bảo repo thuộc current user.
2. BE load:
   - `GithubAccount` theo `userId`
   - `RepositoryPackage` theo `userId + repositoryId`
   - `RepositoryCommit` theo `userId + repositoryId`
3. Nếu chưa connect GitHub, trả lỗi `GitHub account is not connected`.
4. BE gọi `filterUserContributionCommits(commits, githubAccount)`.
5. Chỉ `contributionScope.userCommits` được truyền vào `buildAnalysisPayload`.
6. BE lưu `AnalysisResult`, sau đó tạo `RepoAnalysisSnapshot` qua `createSnapshotFromAnalysisResult`.

Với repo nhiều contributor, analysis không dùng commit của người khác để tính skill/readiness.
`totalRepoCommits` là tổng commit loaded của repo trong cache; `userCommits` là số commit match với current user.

### Cách lọc commit của user

Trong `filterUserContributionCommits`:

- Match theo GitHub login/username nếu có.
- Match theo GitHub user id nếu có.
- Match theo author email trong account connected.
- Match theo committer login nếu có.

Kết quả trả vào `analysisScope`:

```json
{
  "type": "user_contribution",
  "githubUsername": "string",
  "totalRepoCommits": 13,
  "userCommits": 11,
  "activeDays": 6,
  "firstCommitDate": "date",
  "lastCommitDate": "date",
  "analyzedCommitShas": ["sha"],
  "userLevel": "intermediate"
}
```

### Skill vector được tính từ tín hiệu nào

Trong `buildAnalysisPayload` và các helper analysis:

- `RepositoryPackage`: languages, frameworks, packages, configs, detected package/config files.
- `RepositoryCommit`: commit messages, touched files, active days, first/last commit date.
- Rules trong `src/services/analysis/analysis.rules.js`: package skill map, commit rules, file rules, scoring rules.
- Checklist: README, `.env.example`, Docker, Docker Compose, CI/CD, testing, linting, formatter, package file.
- File/touched path dùng cho readiness `projectCompletenessScore`.

Các skill được chuẩn hóa bằng:

- `canonicalizeSkillName()` trong `src/utils/skillCanonicalizer.js`
- category lấy từ `getCanonicalSkillCategory()`
- catalog gốc nằm ở `src/constants/canonicalSkills.js`

Skill vector item lưu trong DB có các field dài:

```json
{
  "skill": "Node.js",
  "canonicalSkillName": "Node.js",
  "normalizedSkillName": "node.js",
  "category": "Backend",
  "score": 0.75,
  "level": "strong",
  "evidence": [],
  "sources": [],
  "lastCalculatedAt": "date"
}
```

FE summary không nhận full `skillVector`. Chỉ nhận `topSkills` và `missingSkills`.
`debug.skillVector` chỉ có khi gọi `view=detail&includeEvidence=true`.

### Strengths, weaknesses, missingSkills, recommendations

Trong `buildAnalysisPayload`:

- `strengths` lấy từ package/framework/config signals, file rules, commit analysis và sau đó được tinh chỉnh bởi `generateAnalysisInsightsFromSkillVector`.
- `weaknesses` lấy từ commit analysis, thiếu testing/deployment/docs/code-quality tooling và skillVector insights.
- `missingSkills` lấy từ checklist, scores thấp, skillVector missing và fallback rule-based.
- `recommendations` lấy từ missing skills, docs/deployment/testing signals và skillVector insights.
- Analysis chưa thấy dùng role catalog/target role để sinh strengths/weaknesses. Role matching chủ yếu dùng ở Roadmap và endpoint role-matches.

Wording với `analysisScope.type = "user_contribution"` được đổi qua `contributionWording`, ví dụ:

- `Bạn có đóng góp...`
- `Phần commit của bạn cho thấy...`
- `Chưa thấy đóng góp rõ về...`

### Công thức `userReadinessScore` và `userLevel`

Trong `calculateUserReadiness`:

```text
userReadinessScore =
  skillScore * 0.45
+ contributionScore * 0.25
+ commitQualityScore * 0.15
+ projectCompletenessScore * 0.10
- missingCriticalPenalty
```

Thành phần:

- `skillScore`: average score của top 5 skill không missing, nhân 100.
- `contributionScore`: dựa trên `commitSummary.totalCommits` và `activeDays`.
- `commitQualityScore = 70 - vagueCommitRatio * 50 + conventionalCommitRatio * 30`, clamp 0-100.
- `projectCompletenessScore`:
  - Nếu có touched files: code +40, config/api/db +20, test +15, docs/swagger/readme +10, deploy/docker/ci +15.
  - Nếu không có file changed: fallback từ checklist, confidence `medium` hoặc `low`.
- `missingCriticalPenalty`: hiện áp dụng cho career có `backend`, tối đa 20. Thiếu Testing, CI/CD, Clean Code, Database, REST API, Auth sẽ bị trừ.

Band:

| Score | userLevel |
| --- | --- |
| `< 45` | `beginner` |
| `45-79` | `intermediate` |
| `>= 80` | `advanced` |

Guardrail advanced:

- Không lên `advanced` nếu user commits `< 10`.
- Không lên `advanced` nếu strong skills `< 4`.
- Không lên `advanced` nếu thiếu Testing.
- Không lên `advanced` nếu thiếu Clean Code/Code Quality.
- Nếu present skills `< 3`, advanced bị hạ xuống intermediate.

### Analysis response compact cho FE

`POST /api/analysis/repositories/{repoId}` summary trả:

```json
{
  "analysisId": "...",
  "snapshotId": "...",
  "repository": {
    "repositoryId": "...",
    "githubRepoId": 123,
    "repoName": "WDP_G3",
    "fullName": "owner/WDP_G3"
  },
  "analysisScope": {
    "type": "user_contribution",
    "githubUsername": "owner",
    "totalRepoCommits": 13,
    "userCommits": 11,
    "activeDays": 6,
    "firstCommitDate": "...",
    "lastCommitDate": "..."
  },
  "summary": {
    "careerDirection": "Backend Developer",
    "userLevel": "intermediate",
    "userReadinessScore": 66,
    "overallScore": 70,
    "projectType": "Backend API",
    "confidence": "high"
  },
  "topSkills": [],
  "missingSkills": [],
  "strengths": [],
  "weaknesses": [],
  "recommendations": [],
  "createdAt": "..."
}
```

`GET /api/analysis/me` trả list item gọn, không có strengths/weaknesses/recommendations/createdAt,
thay bằng `analyzedAt`.

### Field FE không nên dùng mặc định

- `rawAnalysis`
- full `skillVector`
- `skillEvidence`
- `evidence`, `sources`, `lastCalculatedAt`
- `packages`, `configs`, `checklist`
- `skillSignals`, `careerSignals`
- `debug` nếu không bật `view=detail&includeEvidence=true`

---

## 2. Role Catalog, Skill Catalog, Role Matching

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/roles/catalog` | Danh sách role FE có thể chọn |
| `GET` | `/api/skills/catalog` | Danh sách canonical skills |
| `GET` | `/api/analysis/repositories/{repoId}/role-matches` | So skillVector của repo với role vectors |

### Role catalog

`GET /api/roles/catalog` lấy từ `ROLE_SKILL_VECTORS` trong `src/constants/roleSkillVectors.js`.
Response role item:

```json
{
  "roleId": "backend-developer",
  "roleName": "Backend Developer",
  "description": "...",
  "category": "...",
  "level": "...",
  "requiredSkillCount": 10,
  "optionalSkillCount": 5
}
```

FE dùng `roleId` khi generate roadmap. `targetRole` vẫn là field required.

### Skill catalog

`GET /api/skills/catalog` lấy từ `listCanonicalSkills()` trong `src/utils/skillCanonicalizer.js`.
Skill catalog dùng để:

- canonicalize alias về `canonicalSkillName`
- lấy `category`
- tránh FE hiển thị nhiều tên khác nhau cho cùng một skill

### Role matching

Trong `src/services/roleMatching.service.js`:

- SkillVector được map theo `canonicalSkillName`.
- Role vector gồm `requiredSkills` và `optionalSkills`.
- Mỗi requirement có `minScore`, `weight`, `importance`.
- Nếu `userScore >= requiredMinScore`: matched.
- Nếu `userScore > 0` nhưng chưa đủ: weak.
- Nếu score 0: missing required hoặc missing optional.

Điểm match:

```text
requiredScoreRaw = weighted average required skills
optionalScoreRaw = weighted average optional skills
coverageRaw = matchedSkills / allRequirements
matchScore = requiredScoreRaw * 0.7 + optionalScoreRaw * 0.15 + coverageRaw * 0.15
```

`matchScore` trả theo thang 0-100.

`matchLevel`:

| Score | matchLevel | matchLevelLabel |
| --- | --- | --- |
| `>= 85` | `excellent` | `Rất phù hợp` |
| `>= 70` | `good` | `Phù hợp tốt` |
| `>= 50` | `moderate` | `Tạm phù hợp` |
| `>= 30` | `low` | `Phù hợp thấp` |
| `< 30` | `very_low` | `Chưa phù hợp` |

### skillGapSummary trong Roadmap

Roadmap gọi `buildRoadmapSkillGapFromAnalysis()`:

- Chạy role matching với `includeDetails=true`.
- Chọn role theo `roleId`, `targetRole`, alias, hoặc matchScore cao nhất.
- Tạo gap từ:
  - missing required skills: priority 1
  - weak skills: priority 2
  - recommended next skills: priority 3
  - analysis missing skills: priority 4
- Không đưa skill đã có score `>= 0.7` vào gap.
- Response `formatSkillGapSummary` canonicalize category và round score/gap tối đa 3 chữ số.
- Nếu missing mà gap/requiredScore bị 0, fallback `requiredScore = 0.4`.

FE không cần gọi role-matches trước khi generate roadmap. `POST /api/roadmaps/generate`
tự chạy role matching nội bộ nếu `useRoleMatching !== false`.

---

## 3. Roadmap Generate

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `POST` | `/api/roadmaps/generate` | Generate hoặc fetch roadmap |
| `GET` | `/api/roadmaps/{roadmapId}` | Roadmap detail compact |
| `GET` | `/api/roadmaps/me` | Danh sách roadmap compact |
| `PATCH` | `/api/roadmaps/{roadmapId}/archive` | Archive roadmap |

### sourceMode

| sourceMode | Ý nghĩa |
| --- | --- |
| `single_repo` | Dùng latest user-contribution analysis của một repo |
| `all_analyzed_repos` | Dùng latest user-contribution analysis của tất cả repo đã phân tích |
| `selected_repos` | Dùng latest user-contribution analysis của các repo FE chọn |

Backward compatibility:

- Không gửi `sourceMode` nhưng có `repoId` => `single_repo`.
- Không gửi `sourceMode` và không có `repoId` => `all_analyzed_repos`.

### Request body mẫu

Single repo:

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
  "repoId": "repoId"
}
```

All analyzed repos:

```json
{
  "targetRole": "Backend Developer",
  "roleId": "backend-developer",
  "level": "beginner",
  "durationWeeks": 6,
  "language": "vi",
  "useRoleMatching": true,
  "forceRegenerate": true,
  "sourceMode": "all_analyzed_repos"
}
```

Selected repos:

```json
{
  "targetRole": "Backend Developer",
  "roleId": "backend-developer",
  "level": "beginner",
  "durationWeeks": 6,
  "language": "vi",
  "useRoleMatching": true,
  "forceRegenerate": true,
  "sourceMode": "selected_repos",
  "repoIds": ["repoId1", "repoId2"]
}
```

### Validate theo mode

- `single_repo`: bắt buộc `repoId`, nếu chưa analysis trả:
  `Please analyze this repository first before generating roadmap.`
- `all_analyzed_repos`: cần ít nhất một user-contribution analysis, nếu không có trả:
  `Please analyze at least one repository before generating a multi-repo roadmap.`
- `selected_repos`: bắt buộc `repoIds` array có ít nhất 1 item. Nếu repo chưa analysis:
  `Some selected repositories have not been analyzed yet.` và có `missingRepoIds` trong error.

### Luồng generate

Trong `src/services/roadmap.service.js`:

1. Chọn source theo `sourceMode`.
2. Load latest user-contribution analysis.
3. Nếu multi repo, merge context:
   - group skillVector theo `canonicalSkillName`
   - `combinedScore = maxScore * 0.6 + averageScore * 0.4`
   - level lấy level mạnh nhất theo rank `missing < weak < developing < strong`
   - readiness score weighted average theo `max(userCommits, 1)`
   - userLevel theo score: `<45 beginner`, `<80 intermediate`, `>=80 advanced`
   - activeDays hiện đang sum, chưa thấy logic unique active days trong code
4. Tạo `roadmapSource`.
5. Tính `effectiveLevel = analysis.summary.userLevel || requestedLevel || "beginner"`.
6. Nếu có skillVector và `useRoleMatching !== false`, chạy `buildRoadmapSkillGapFromAnalysis`.
7. Nếu `forceRegenerate=false`, tìm active roadmap cũ cùng user/target/sourceMode/analysisIds.
8. Nếu không có roadmap cũ, build prompt, gọi Gemini qua `generateRoadmapResponse`.
9. Parse JSON, fallback nếu AI không trả đúng JSON.
10. Normalize mainRoadmap/alternativeRoadmaps, itemId, category, skillGapSummary.
11. Save `Roadmap` và khởi tạo `progressSummary`.

### forceRegenerate

- `false`: fetch roadmap cũ nếu source hiện tại vẫn match.
  - single repo: sourceMode single_repo, analysisId match.
  - all analyzed repos: sourceMode all_analyzed_repos, analysisIds set match.
  - selected repos: sourceMode selected_repos, repositoryIds và analysisIds set match.
- `true`: archive active roadmap cũ cùng user + targetRole + sourceMode, sau đó generate mới.

### Response compact

```json
{
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
  "mainRoadmap": {},
  "alternativeRoadmaps": [],
  "progressSummary": {},
  "createdAt": "...",
  "updatedAt": "..."
}
```

Không trả root raw DB object:

- `_id`, `userId`, `__v`
- `mainPath`
- `supportingPaths`
- `sourceContextSummary`

### roadmapSource

Single repo:

```json
{
  "type": "user_contribution_analysis",
  "sourceMode": "single_repo",
  "analysisId": "...",
  "snapshotId": "...",
  "repositoryId": "...",
  "repoName": "WDP_G3",
  "fullName": "owner/WDP_G3",
  "githubUsername": "owner",
  "totalRepoCommits": 13,
  "userCommits": 11,
  "activeDays": 6,
  "userLevel": "intermediate",
  "userReadinessScore": 66,
  "careerDirection": "Backend Developer",
  "projectType": "Backend API"
}
```

Multi repo:

```json
{
  "type": "multi_repo_user_contribution_analysis",
  "sourceMode": "all_analyzed_repos",
  "analysisIds": ["..."],
  "repositoryIds": ["..."],
  "repositories": [],
  "githubUsername": "owner",
  "totalRepositories": 3,
  "totalRepoCommits": 40,
  "totalUserCommits": 19,
  "activeDays": 14,
  "userLevel": "intermediate",
  "userReadinessScore": 70,
  "careerDirection": "Backend Developer",
  "projectType": "Multi-repo portfolio"
}
```

### itemId format

Code dùng index 1-based:

- Main task: `main-{phaseIndex+1}-{taskIndex+1}-{canonicalSkillSlug}`
- Alternative task: `alt-{pathIndex+1}-task-{taskIndex+1}-{canonicalSkillSlug}`

Ví dụ:

- `main-1-1-clean-code`
- `main-2-1-api-testing`
- `alt-1-task-1-docker`

Title không được truncate. Nếu suggested task là `"Tiêu đề: Mô tả..."`, BE tách title trước dấu `:`
và description sau dấu `:` nhưng không slice mất chữ.

### Archive

`PATCH /api/roadmaps/{roadmapId}/archive` set `status = archived`, không xóa DB.
Response hiện tại:

```json
{
  "roadmapId": "...",
  "status": "archived"
}
```

FE không nên hiển thị archived roadmap trong active list mặc định.

---

## 4. Roadmap Progress

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{roadmapId}/progress` | Lấy task-level progress |
| `PATCH` | `/api/roadmaps/{roadmapId}/progress/items` | Update một roadmap item |
| `POST` | `/api/roadmaps/{roadmapId}/progress/reset` | Reset toàn bộ item về not_started |

Progress key logic là `userId + roadmapId + itemId`.

Không tick theo `skillName` làm key chính vì:

- Một skill có thể xuất hiện trong nhiều task.
- Một user có thể có nhiều roadmap dùng cùng skill.
- `skillName` fallback vẫn còn trong code nhưng FE không nên dùng. Nếu match nhiều item, BE trả:
  `Multiple roadmap items match this skillName. Please use itemId.`

### GET progress response

```json
{
  "roadmapId": "...",
  "progressSummary": {
    "totalItems": 12,
    "completedItems": 3,
    "inProgressItems": 1,
    "overallProgress": 25
  },
  "items": [
    {
      "itemId": "main-2-1-api-testing",
      "title": "Full task title",
      "skillName": "API Testing",
      "canonicalSkillName": "API Testing",
      "category": "Testing",
      "targetRole": "Backend Developer",
      "level": "intermediate",
      "priority": "high",
      "status": "not_started",
      "progressPercent": 0,
      "startedAt": null,
      "completedAt": null,
      "updatedAt": "..."
    }
  ]
}
```

### PATCH body FE nên dùng

```json
{
  "itemId": "main-2-1-api-testing",
  "status": "completed"
}
```

Status hợp lệ:

- `not_started`
- `in_progress`
- `completed`

`progressPercent`:

- `completed` => 100
- `in_progress` => body `progressPercent` nếu có, clamp 1-99; nếu không có thì 50
- `not_started` => 0

Progress độc lập với Learning. Learning không update progress.

---

## 5. Shared Learning cũ

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/learning/skills/{skillName}` | Get shared learning content |
| `POST` | `/api/learning/skills/generate` | Generate shared learning content |
| `GET` | `/api/learning/skills/{skillName}/resources` | Get cached resources |
| `POST` | `/api/learning/skills/{skillName}/resources/search` | Load/search resources and cache |
| `POST` | `/api/learning/skills/{skillName}/resources` | Seed/update resource manually |

Các API này vẫn giữ, không xóa.

Shared learning cache theo identity:

```text
canonicalSkillName + targetRole + level + language
```

Trong code identity được normalize thành:

- `normalizedSkillName`
- `normalizedTargetRole`
- `level`
- `language`

Shared learning dùng lại cho nhiều roadmap/task/user. FE roadmap không nên gọi trực tiếp shared API làm flow chính.
Nên dùng Roadmap Learning API để BE tự lấy task context theo `roadmapId + itemId`.

Resources:

- `getLearningResources` đọc cache.
- `searchAndCacheYoutubeResources` ưu tiên cache, sau đó curated catalog, sau đó YouTube API nếu có `YOUTUBE_API_KEY`.
- Nếu không có catalog hợp lệ và không có YouTube key, code có thể trả 500:
  `No valid catalog resources found and YOUTUBE_API_KEY is not configured`.

---

## 6. Roadmap Learning mới

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/roadmaps/{roadmapId}/learning` | Check learning availability cho tất cả task |
| `GET` | `/api/roadmaps/{roadmapId}/learning/items/{itemId}` | Get learning content cho một task |
| `POST` | `/api/roadmaps/{roadmapId}/learning/items/{itemId}/generate` | Generate/fetch shared learning cho skill của task |

Roadmap Learning là lớp map shared learning vào `roadmapId + itemId`.

### GET `/learning`

Không generate content. Chỉ trả status:

```json
{
  "roadmapId": "...",
  "sourceMode": "single_repo",
  "language": "vi",
  "items": [
    {
      "itemId": "main-2-1-api-testing",
      "taskTitle": "Full task title",
      "canonicalSkillName": "API Testing",
      "skillName": "API Testing",
      "targetRole": "Backend Developer",
      "level": "intermediate",
      "week": 3,
      "priority": "high",
      "learningStatus": "available"
    }
  ]
}
```

`taskTitle` lấy từ task title đầy đủ, không truncate.

### GET `/learning/items/{itemId}`

Nếu content đã có cache:

```json
{
  "roadmapId": "...",
  "itemId": "main-2-1-api-testing",
  "task": {
    "title": "Full task title",
    "description": "...",
    "skillName": "API Testing",
    "canonicalSkillName": "API Testing",
    "category": "Testing",
    "targetRole": "Backend Developer",
    "level": "intermediate",
    "week": 3,
    "priority": "high",
    "estimatedHours": 15
  },
  "learning": {
    "skillName": "API Testing",
    "canonicalSkillName": "API Testing",
    "targetRole": "Backend Developer",
    "level": "intermediate",
    "language": "vi",
    "title": "...",
    "overview": "...",
    "whyLearn": "...",
    "useCases": [],
    "howToApply": "...",
    "examples": [],
    "checklist": [],
    "exercises": [],
    "commonMistakes": [],
    "nextSkills": [],
    "resources": []
  },
  "personalizedContext": {
    "sourceMode": "single_repo",
    "repoName": "WDP_G3",
    "projectType": "Backend API",
    "repositoryNames": [],
    "practiceTask": "Ap dung bai hoc nay bang cach hoan thanh task: Full task title trong roadmap.",
    "roadmapReason": "..."
  },
  "progress": {
    "status": "not_started",
    "progressPercent": 0
  }
}
```

Nếu chưa có content, trả 404:

```text
Learning content not found. Please generate it first.
```

Query:

- `includeResources=true|false`, default `true`.

### POST `/learning/items/{itemId}/generate`

FE chỉ cần gửi:

```json
{
  "forceRegenerate": false,
  "includeResources": true
}
```

BE tự lấy từ roadmap task:

- `canonicalSkillName`
- `targetRole`
- `level`
- `language`
- task title/description/week
- roadmap source mode, repoName, projectType
- skill gap reason nếu có

BE gọi shared learning generator/cache. Nếu `forceRegenerate=false` và đã có shared content,
BE không gọi AI lại.

FE không nên auto generate toàn bộ task khi mở roadmap. Chỉ generate khi user bấm "Học ngay" và item đang `missing`.

---

## 7. Snapshots

### API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/repositories/{repoId}/snapshots` | List snapshot history compact |
| `GET` | `/api/snapshots/{snapshotId}` | Get one compact snapshot |
| `GET` | `/api/repositories/{repoId}/progress-comparison` | Compare first vs latest snapshot |
| `POST` | `/api/snapshots/compare` | Compare two snapshots |

Snapshot là lịch sử phân tích user-contribution tại từng thời điểm.

Mặc định chỉ query:

- current `userId`
- same repository
- `analysisScope.type = "user_contribution"`

### GET snapshots

Query:

- `page`, default 1
- `limit`, default 20, max 100
- `view=summary|detail`, default summary
- `includeEvidence=true`, chỉ có tác dụng khi `view=detail`

Response:

```json
{
  "repositoryId": "...",
  "repoName": "WDP_G3",
  "fullName": "owner/WDP_G3",
  "analysisScopeType": "user_contribution",
  "snapshots": [
    {
      "snapshotId": "...",
      "analysisId": "...",
      "repository": {},
      "analysisScope": {},
      "summary": {},
      "topSkills": [],
      "missingSkills": [],
      "createdAt": "...",
      "analyzedAt": "..."
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 20,
    "page": 1
  }
}
```

### Snapshot detail

`GET /api/snapshots/{snapshotId}` trả:

```json
{
  "snapshot": {
    "snapshotId": "...",
    "analysisId": "...",
    "repository": {},
    "analysisScope": {},
    "summary": {},
    "topSkills": [],
    "missingSkills": [],
    "createdAt": "...",
    "analyzedAt": "..."
  }
}
```

Không trả raw skillVector/packages/configs/checklist mặc định.

### Progress comparison

`GET /api/repositories/{repoId}/progress-comparison`:

- Nếu ít hơn 2 snapshot, trả 200:

```json
{
  "repositoryId": "...",
  "repoName": "WDP_G3",
  "analysisScopeType": "user_contribution",
  "enoughData": false,
  "snapshotsCount": 1,
  "comparison": null
}
```

- Nếu đủ data, trả:

```json
{
  "repositoryId": "...",
  "repoName": "WDP_G3",
  "fullName": "owner/WDP_G3",
  "analysisScopeType": "user_contribution",
  "enoughData": true,
  "fromSnapshot": {
    "snapshotId": "...",
    "createdAt": "...",
    "userReadinessScore": 45,
    "userLevel": "beginner"
  },
  "toSnapshot": {
    "snapshotId": "...",
    "createdAt": "...",
    "userReadinessScore": 66,
    "userLevel": "intermediate"
  },
  "delta": {
    "userReadinessScore": 21,
    "levelChanged": true,
    "fromLevel": "beginner",
    "toLevel": "intermediate",
    "userCommitsDelta": 8,
    "activeDaysDelta": 3
  },
  "skillChanges": [],
  "newSkills": [],
  "improvedSkills": [],
  "weakerSkills": [],
  "resolvedMissingSkills": [],
  "newMissingSkills": []
}
```

Skill trend:

- `improved` nếu delta `> 0.05`
- `weaker` nếu delta `< -0.05`
- `unchanged` nếu ở giữa

### POST compare

Request chính:

```json
{
  "fromSnapshotId": "665f1f000000000000000001",
  "toSnapshotId": "665f1f000000000000000002"
}
```

`snapshotAId/snapshotBId` vẫn được code accept như deprecated aliases, nhưng không nên hiển thị trong FE.
Nếu gửi cả hai cặp, code ưu tiên `fromSnapshotId/toSnapshotId`.

Nếu thiếu cả from/to và A/B:

```text
fromSnapshotId and toSnapshotId are required.
```

---

## 8. Flow FE tổng thể

### A. Flow phân tích repo

1. User connect GitHub nếu cần.
2. User chọn repo từ GitHub/repository list.
3. FE gọi `POST /api/analysis/repositories/{repoId}`.
4. FE render analysis summary từ response compact.
5. FE có thể gọi `GET /api/analysis/results/{repoId}` để refetch latest analysis.
6. FE có thể gọi `GET /api/repositories/{repoId}/snapshots` để xem lịch sử.

### B. Flow tạo roadmap

1. User chọn `targetRole`.
2. User chọn `sourceMode`:
   - `single_repo`
   - `all_analyzed_repos`
   - `selected_repos`
3. FE gọi `POST /api/roadmaps/generate`.
4. FE nhận `roadmapId`.
5. FE render roadmap compact, skill gaps, progress summary.

### C. Flow mở roadmap detail

Gọi song song:

1. `GET /api/roadmaps/{roadmapId}`
2. `GET /api/roadmaps/{roadmapId}/progress`
3. `GET /api/roadmaps/{roadmapId}/learning`

### D. Flow học task

1. User bấm "Học ngay" trên task.
2. Nếu `learningStatus = available`: gọi `GET /api/roadmaps/{roadmapId}/learning/items/{itemId}`.
3. Nếu `learningStatus = missing`: gọi `POST /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate`.
4. Sau khi học xong: gọi `PATCH /api/roadmaps/{roadmapId}/progress/items`.

### E. Flow tạo lại roadmap

1. User bấm regenerate.
2. FE gửi `forceRegenerate=true`.
3. BE archive roadmap cũ cùng sourceMode/targetRole và tạo roadmap mới.
4. FE dùng `roadmapId` mới.

### F. Flow so sánh tiến bộ

1. User phân tích repo nhiều lần.
2. FE gọi `GET /api/repositories/{repoId}/progress-comparison`.
3. Nếu `enoughData=false`, hiển thị empty state.
4. Nếu đủ data, hiển thị score delta, level change, improved/weaker/new/resolved missing skills.

---

## 9. Gợi ý FE render

### Analysis

- Summary card: careerDirection, projectType, userLevel, userReadinessScore, confidence.
- User level badge: beginner/intermediate/advanced.
- Top skills: skill name, category, score, level.
- Missing skills: skill, category, priority.
- Strengths/weaknesses/recommendations: tối đa 3 câu mỗi nhóm.

### Roadmap

- Roadmap source mode badge:
  - Single repo
  - All analyzed repos
  - Selected repos
- Role match block: matchScore, matchLevelLabel.
- Skill gap summary: priority, currentScore, requiredScore, gap, reason.
- Phases/tasks: dùng `itemId` làm key.
- Alternative roadmaps: dùng `alt-*` itemIds.
- Archived roadmap: không hiển thị trong active list mặc định.

### Progress

- Checkbox/status theo item.
- Completed => checked, in_progress => partial/progress, not_started => unchecked.
- PATCH bằng `itemId`.

### Learning

- `learningStatus=available`: button "Học ngay".
- `learningStatus=missing`: button "Tạo bài học".
- Không auto generate tất cả item.
- Sau generate thành công, có thể refetch `GET /learning` hoặc update local status.

### Snapshots

- Nếu đủ data: chart userReadinessScore theo thời gian.
- Hiển thị skill improved/weaker/new/resolvedMissing.
- Nếu `enoughData=false`: empty state "Cần ít nhất 2 lần phân tích để so sánh".

---

## 10. Những điểm Codex đã kiểm tra trong code

### Files đã kiểm tra

- `src/services/analysis.service.js`
- `src/services/analysis/analysis.engine.js`
- `src/services/analysis/analysis.rules.js` (tham chiếu signals/rules)
- `src/services/roleMatching.service.js`
- `src/services/roadmapSkillGap.service.js`
- `src/services/roadmap.service.js`
- `src/services/roadmapProgress.service.js`
- `src/services/roadmapLearning.service.js`
- `src/services/learning.service.js`
- `src/services/snapshot.service.js`
- `src/controllers/role.controller.js`
- `src/controllers/skill.controller.js`
- `src/routes/analysis.routes.js`
- `src/routes/roadmap.routes.js`
- `src/routes/learning.routes.js`
- `src/routes/snapshot.routes.js`
- `src/routes/repository.routes.js`
- `src/constants/roleSkillVectors.js`
- `src/constants/canonicalSkills.js`
- `src/utils/skillCanonicalizer.js`

### API đã confirm theo code

- Analysis:
  - `POST /api/analysis/repositories/{repoId}`
  - `GET /api/analysis/results/{repoId}`
  - `GET /api/analysis/me`
  - `GET /api/analysis/repositories/{repoId}/role-matches`
- Catalog:
  - `GET /api/roles/catalog`
  - `GET /api/skills/catalog`
- Roadmap:
  - `POST /api/roadmaps/generate`
  - `GET /api/roadmaps/me`
  - `GET /api/roadmaps/{roadmapId}`
  - `PATCH /api/roadmaps/{roadmapId}/archive`
- Progress:
  - `GET /api/roadmaps/{roadmapId}/progress`
  - `PATCH /api/roadmaps/{roadmapId}/progress/items`
  - `POST /api/roadmaps/{roadmapId}/progress/reset`
- Learning:
  - Shared `/api/learning/skills/*`
  - Roadmap Learning `/api/roadmaps/{roadmapId}/learning/*`
- Snapshots:
  - `GET /api/repositories/{repoId}/snapshots`
  - `GET /api/repositories/{repoId}/progress-comparison`
  - `GET /api/snapshots/{snapshotId}`
  - `POST /api/snapshots/compare`

### Cần test manual

- GitHub commit cache có đủ `author`, `committer`, `files` để filter/touched file scoring chính xác.
- `POST /api/roadmaps/generate` với AI thật, đặc biệt parsing JSON fallback.
- Roadmap Learning generate thật với Gemini và resources khi có/không có `YOUTUBE_API_KEY`.
- Snapshot compare trên dữ liệu DB thật đã có nhiều lần analysis.
- Existing old roadmap/snapshot data có thể thiếu field mới; formatter compact xử lý được phần lớn, nhưng nên test với data cũ.

### Chưa thấy hoặc cần kiểm tra thêm

- Chưa thấy Roadmap service fetch GitHub commits trực tiếp; nó dùng analysis đã lưu.
- Chưa thấy logic unique active days khi merge multi repo; code hiện sum `activeDays`.
- Chưa thấy FE-specific validation schema ngoài Swagger/comments; validate roadmap body nằm trong `src/validators/roadmap.validator.js`.
- Chưa thấy endpoint riêng để bulk-generate Roadmap Learning cho toàn bộ tasks; hiện chỉ generate từng item.

---

## Manual test checklist cho FE/BE

### Analysis single repo

- Connect GitHub.
- Sync repo/commits/packages nếu flow yêu cầu.
- `POST /api/analysis/repositories/{repoId}`.
- Verify:
  - `analysisScope.type = user_contribution`
  - `userCommits <= totalRepoCommits`
  - có `summary.userLevel`, `summary.userReadinessScore`
  - không có root `skillVector/rawAnalysis/packages/configs/checklist`

### Roadmap sourceMode single_repo

- Body có `sourceMode=single_repo`, `repoId`.
- Verify:
  - `roadmapSource.type = user_contribution_analysis`
  - `roadmapSource.sourceMode = single_repo`
  - có `analysisId`
  - `effectiveLevel` lấy từ analysis nếu có

### Roadmap sourceMode all_analyzed_repos

- Body có `sourceMode=all_analyzed_repos`.
- Verify:
  - `roadmapSource.type = multi_repo_user_contribution_analysis`
  - `analysisIds.length >= 1`
  - `repositories.length >= 1`
  - `totalUserCommits` là tổng user commits từ analyses

### Roadmap sourceMode selected_repos

- Body có `sourceMode=selected_repos`, `repoIds`.
- Verify:
  - `repositoryIds` match repoIds chọn
  - repo chưa analysis trả 400 và có `missingRepoIds`

### Progress PATCH bằng itemId

```json
{
  "itemId": "main-2-1-api-testing",
  "status": "completed"
}
```

Verify:

- item status completed
- progressPercent 100
- progressSummary updated

### Roadmap learning GET list

- `GET /api/roadmaps/{roadmapId}/learning`
- Verify:
  - itemId không rỗng
  - taskTitle full, không bị truncate
  - learningStatus `available` hoặc `missing`

### Roadmap learning POST generate item

```json
{
  "forceRegenerate": false,
  "includeResources": true
}
```

Verify:

- FE không gửi skillName.
- BE tự lấy skill từ task.
- Response có `task`, `learning`, `personalizedContext`.
- Gọi lại GET item learning trả cached content.

### Snapshot progress comparison

- Analyze cùng repo ít nhất 2 lần.
- `GET /api/repositories/{repoId}/progress-comparison`.
- Verify:
  - Nếu đủ data: `enoughData=true`
  - Có `delta.userReadinessScore`
  - Có `skillChanges`, `improvedSkills`, `weakerSkills`
  - Nếu chỉ có 0/1 snapshot: `enoughData=false`
