# Dev2Vec FE Migration Notes

## 1. Tóm tắt cho FE

- BE đã chuyển role/skill scoring chính sang Dev2Vec.
- FE vẫn dùng phần lớn response cũ: `success`, `message`, `data`, các field roadmap/chat/feedback chính không đổi.
- Thay đổi lớn nhất: roleId mới, role matches tối đa 3, `contextSource` có thể là `dev2vec`.
- FE không nên tự tính score hoặc tự thêm role ngoài response API.
- Fullstack/AI Engineer không phải role riêng trong model role-match hiện tại.

## 2. Role ID hiện tại

| roleId | roleName |
|---|---|
| backend | Backend Developer |
| frontend | Frontend Developer |
| mobile | Mobile Developer |
| devops | DevOps Engineer |
| data_scientist | Data Scientist |

Các roleId cũ như `backend-developer`, `fullstack-developer`, `ai-engineer` chỉ còn nên xem là dữ liệu cũ/alias, không dùng trong flow chính mới.

## 3. Flow FE chính

1. Analyze repo: `POST /api/analysis/repositories/:repoId`
2. Get role matches: `POST /api/analysis/role-matches`
3. User chọn role từ `data.matches[]`
4. Generate roadmap: `POST /api/roadmaps/generate`

## 4. POST /api/analysis/repositories/:repoId

- Request chính: path `repoId`, optional query `view=summary|detail`, `includeEvidence=true|false`.
- Response chính nằm ở `data`.
- Field FE thường dùng: `analysisId`, `snapshotId`, `repository`, `summary`, `topSkills`, `missingSkills`, `strengths`, `weaknesses`, `recommendations`.
- `summary` có `careerDirection`, `userLevel`, `userReadinessScore`, `overallScore`, `projectType`, `confidence`.
- `scoreBreakdown` chỉ có khi `view=detail`.
- `debug.skillVector` / Dev2Vec debug chỉ dùng debug/admin, không nên là UI contract chính.

## 5. POST /api/analysis/role-matches

Body FE nên gửi:

```json
{
  "sourceMode": "single_repo",
  "repoId": "...",
  "limit": 3
}
```

- `sourceMode`: `single_repo`, `all_analyzed_repos`, hoặc `selected_repos`.
- Với `selected_repos`, gửi `repoIds: ["..."]`.
- FE nên gửi `limit: 3`; BE trả tối đa 3 matches.
- Field FE cần dùng trong `data.matches[]`: `roleId`, `roleName`, `matchScore`, `matchLevelLabel`, `matchedSkillNames`, `weakSkillNames`, `missingSkillNames`, `recommendedNextSkills`, `scoringMethod`.
- Optional/debug: `probability`, `rank`, `modelVersion`, `vectorSources`, `sourceStats`.
- `data.analysisSource` giúp hiển thị nguồn phân tích nhưng không bắt buộc để render role cards.

## 6. GET /api/analysis/repositories/:repoId/role-matches

- Endpoint legacy single-repo, vẫn dùng Dev2Vec.
- FE nên ưu tiên `POST /api/analysis/role-matches` cho flow mới.
- Query hữu ích: `limit=3`, optional `targetRole`, optional `includeDetails=true`.
- Response chính: `data.topRole`, `data.matches[]`, `data.repositoryId`, `data.repoName`, `data.fullName`, `data.analyzedAt`.
- Không kỳ vọng endpoint này trả đủ multi-repo context.

## 7. POST /api/roadmaps/generate

Body mẫu:

```json
{
  "sourceMode": "single_repo",
  "repoId": "...",
  "roleId": "backend",
  "targetRole": "Backend Developer",
  "level": "beginner",
  "durationWeeks": 6,
  "language": "vi",
  "useRoleMatching": true
}
```

- FE lấy `roleId` và `targetRole` từ selected match.
- Với multi-repo, dùng `sourceMode: "all_analyzed_repos"` hoặc `selected_repos` + `repoIds`.
- Field response cần dùng: `roadmapId`, `title`, `roleId`, `targetRole`, `roleMatch`, `skillGapSummary`, `mainRoadmap`, `alternativeRoadmaps`, `progressSummary`.
- `roadmapSource` có `modelVersion`, `scoringMethod`, `vectorSources`, `sourceStats` khi có Dev2Vec metadata.
- `mainRoadmap.phases[].tasks[]` là phần FE render roadmap chính.

## 8. Catalog APIs

- `GET /api/roles/catalog`: trả 5 role Dev2Vec trong `data.roles[]`.
- Field role: `roleId`, `roleName`, `description`, `category`, `level`, `modelRoleLabel`, `modelVersion`, `isSupportedByModel`, `scoringMethod`.
- `GET /api/skills/catalog`: trả skill prototype Dev2Vec trong `data.skills[]`.
- Field skill: `name`, `category`, `aliases`, `defaultLevel`, `tags`.
- FE nên lấy dropdown/filter từ API hoặc fallback static tương ứng 5 role ở mục 2.

## 9. Chat API note

Endpoint: `POST /api/chat/sessions/:sessionId/messages`

- Request giữ `message`; optional body có thể có `repoId`/`repositoryId` nếu FE muốn gợi ý repo context.
- Response contract chính không đổi: `mode`, `effectiveMode`, `modeSource`, `status`, `userMessage`, `aiMessage`, `assistantMessage`.
- `contextSource` chỉ xuất hiện ngoài production/debug và hiện có thể là `dev2vec`.
- Swagger cũ còn example `contextSource: "skillVector"`; FE không nên chỉ check `"skillVector"`.
- `skillScoreSummary` là optional/debug, có thể chứa `modelVersion`, `scoringMethod`, counts và issue info.

## 10. AI Feedback note

Endpoints:
- `POST /api/ai-feedback/repositories/:repoId`
- `GET /api/ai-feedback/results/:repoId`
- `GET /api/ai-feedback/me`

- Field feedback cũ vẫn giữ: `summary`, `strengthFeedback`, `weaknessFeedback`, `learningAdvice`, `nextSteps`, `recommendedTopics`, `careerSuggestion`, `portfolioAdvice`, `riskNotes`.
- `POST` cần repo đã analyze bằng Dev2Vec trước.
- `GET /results/:repoId` trả feedback đã lưu, không gọi AI lại.
- `GET /me` trả list latest feedback theo repo trong `data.feedbacks[]`.
- Optional `metadata` có thể có `analysisSource`, `analysisRecordType`, `modelVersion`, `scoringMethod`, `rolePrediction`, `vectorSources`, `sourceStats`.
- FE không bắt buộc hiển thị `metadata`, nhưng không được crash nếu field này xuất hiện.

## 11. Checklist FE cần sửa

- Replace hard-coded old roleId.
- Role cards render từ API `matches[]`.
- Roadmap request gửi `selectedRole.roleId` và `selectedRole.roleName`.
- Chat chấp nhận `contextSource="dev2vec"`.
- AI Feedback chấp nhận `metadata.analysisSource="dev2vec"`.
- Không tự thêm Fullstack/AI role vào role matches.
- Không kỳ vọng role matches luôn có 5 role.
- Không tự tính `matchScore`; hiển thị score BE trả về.

## 12. Error codes cần xử lý

- `DEV2VEC_MODEL_UNAVAILABLE`: Dev2Vec bị tắt hoặc chưa sẵn sàng.
- `DEV2VEC_INFERENCE_FAILED`: inference lỗi từ model/service.
- `DEV2VEC_INVALID_OUTPUT`: output Dev2Vec không đúng format BE cần.
- `DEV2VEC_ANALYSIS_REQUIRED`: cần chạy `POST /api/analysis/repositories/:repoId` trước.
