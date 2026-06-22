# FE Integration Guide - Recent Backend Updates

File này chỉ ghi lại các API/backend updates mới gần đây để FE tích hợp, không phải tài liệu toàn bộ hệ thống.

---

## 1. Roadmap Progress Tracking

Mục đích: cho phép FE hiển thị và cập nhật tiến độ học của user trong từng roadmap.

Ghi chú logic:

- Progress được lưu ở collection riêng `RoadmapProgress`.
- Không lưu trực tiếp trong `Roadmap`.
- Mỗi roadmap item/skill có status:
  - `not_started` = 0%
  - `in_progress` = 50%
  - `completed` = 100%
- `overallProgress` là trung bình `progressPercent` của tất cả skill trong roadmap.

### 1.1 GET roadmap progress

Endpoint:

```http
GET /api/roadmaps/:roadmapId/progress
Authorization: Bearer <token>
```

FE dùng khi:

- Mở màn Roadmap Detail.
- Cần hiển thị progress tổng và trạng thái từng skill.

Response mẫu:

```json
{
  "success": true,
  "message": "Roadmap progress fetched successfully",
  "data": {
    "roadmapId": "665f1f000000000000000001",
    "overallProgress": 25,
    "items": [
      {
        "skillName": "HTML",
        "normalizedSkillName": "html",
        "status": "completed",
        "progressPercent": 100,
        "startedAt": "2026-06-18T00:00:00.000Z",
        "completedAt": "2026-06-18T00:00:00.000Z",
        "updatedAt": "2026-06-18T00:00:00.000Z"
      },
      {
        "skillName": "CSS",
        "normalizedSkillName": "css",
        "status": "not_started",
        "progressPercent": 0,
        "startedAt": null,
        "completedAt": null,
        "updatedAt": "2026-06-18T00:00:00.000Z"
      }
    ]
  }
}
```

FE nên hiển thị:

- Progress bar tổng từ `overallProgress`.
- Badge trạng thái từng skill.
- Nút cập nhật trạng thái.

### 1.2 PATCH update roadmap item progress

Endpoint:

```http
PATCH /api/roadmaps/:roadmapId/progress/items
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "skillName": "HTML",
  "status": "completed"
}
```

Allowed status:

- `not_started`
- `in_progress`
- `completed`

FE dùng khi:

- User bấm "Bắt đầu học".
- User bấm "Đang học".
- User bấm "Hoàn thành".
- User đổi lại trạng thái skill.

Response mẫu:

```json
{
  "success": true,
  "message": "Roadmap item progress updated successfully",
  "data": {
    "roadmapId": "665f1f000000000000000001",
    "overallProgress": 50,
    "items": [
      {
        "skillName": "HTML",
        "normalizedSkillName": "html",
        "status": "completed",
        "progressPercent": 100,
        "startedAt": "2026-06-18T00:00:00.000Z",
        "completedAt": "2026-06-18T00:00:00.000Z"
      }
    ]
  }
}
```

Ghi chú cho FE: sau khi PATCH thành công, FE nên update local state bằng response trả về hoặc refetch `GET /api/roadmaps/:roadmapId/progress`.

### 1.3 POST reset roadmap progress

Endpoint:

```http
POST /api/roadmaps/:roadmapId/progress/reset
Authorization: Bearer <token>
```

FE dùng khi user muốn reset toàn bộ tiến độ roadmap.

Response mẫu:

```json
{
  "success": true,
  "message": "Roadmap progress reset successfully",
  "data": {
    "roadmapId": "665f1f000000000000000001",
    "overallProgress": 0,
    "items": [
      {
        "skillName": "HTML",
        "normalizedSkillName": "html",
        "status": "not_started",
        "progressPercent": 0,
        "startedAt": null,
        "completedAt": null
      }
    ]
  }
}
```

---

## 2. Analysis Scoring đã chuẩn hóa

Mục đích: FE hiểu ý nghĩa các điểm trong `scores` của analysis result.

API liên quan:

- `POST /api/analysis/repositories/:repoId`
- `GET /api/analysis/results/:repoId`
- `GET /api/analysis/me`

Phần này không mô tả lại toàn bộ Analysis API cũ, chỉ tập trung vào field `scores`.

`scores` hiện được tính bằng rule-based scoring, không dùng AI/Gemini để chấm điểm.

Các field score:

- `techStackScore`: mức độ rõ ràng và phù hợp của tech stack.
- `documentationScore`: README, `.env.example`, Swagger/OpenAPI/API docs.
- `commitQualityScore`: số commit, số ngày active, vague commit ratio, conventional commit ratio.
- `deploymentScore`: Docker, Docker Compose, env config, deployment config, CI/CD.
- `testingScore`: testing framework, test script, testing signal.
- `portfolioReadinessScore`: mức độ sẵn sàng đưa repo vào portfolio.
- `overallScore`: điểm tổng hợp có trọng số từ các score con.

Công thức tổng:

```txt
overallScore =
techStackScore * 0.25
+ documentationScore * 0.15
+ commitQualityScore * 0.15
+ deploymentScore * 0.15
+ testingScore * 0.15
+ portfolioReadinessScore * 0.15
```

Response mẫu rút gọn:

```json
{
  "success": true,
  "message": "My analysis results fetched successfully",
  "data": {
    "analyses": [
      {
        "_id": "analysis_id",
        "repoName": "WDP_G3",
        "careerDirection": "Backend Developer",
        "strengths": ["Repo có sử dụng Express.js để xây dựng backend API."],
        "weaknesses": [
          "Repo chưa có CI/CD workflow.",
          "Repo chua co automated testing setup ro rang."
        ],
        "missingSkills": ["Testing", "CI/CD", "Code Quality"],
        "recommendations": [
          "Nên bổ sung unit test hoặc testing framework như Jest, Vitest, JUnit, Cypress hoặc Playwright."
        ],
        "scores": {
          "techStackScore": 100,
          "documentationScore": 100,
          "commitQualityScore": 65,
          "deploymentScore": 70,
          "testingScore": 0,
          "portfolioReadinessScore": 80,
          "overallScore": 72
        },
        "checklist": {
          "hasReadme": true,
          "hasEnvExample": true,
          "hasDocker": true,
          "hasDockerCompose": true,
          "hasCICD": false,
          "hasTesting": false,
          "hasLinting": false,
          "hasFormatter": false,
          "hasPackageFile": true
        }
      }
    ]
  }
}
```

FE nên hiển thị:

- `overallScore` là điểm lớn nhất.
- Score con dạng progress bar hoặc score card.
- `strengths` ở section "Điểm mạnh".
- `weaknesses` ở section "Điểm yếu".
- `missingSkills` ở section "Kỹ năng còn thiếu".
- `recommendations` ở section "Gợi ý cải thiện".
- `checklist` dạng tick/cross.

Gợi ý UI:

- Nếu `testingScore = 0`, hiển thị cảnh báo "Repo chưa có automated testing".
- Nếu `deploymentScore >= 70`, hiển thị badge "Có tín hiệu triển khai tốt".
- Nếu `overallScore >= 70`, hiển thị "Portfolio-ready khá tốt".
- Nếu `overallScore < 40`, hiển thị "Cần bổ sung dữ liệu và cấu trúc repo".

---

## 3. Repo Analysis Snapshot & Progress Comparison

Mục đích: cho phép FE hiển thị lịch sử các lần phân tích repo và so sánh user đã cải thiện như thế nào.

Giải thích:

- Mỗi lần user phân tích repo thành công bằng `POST /api/analysis/repositories/:repoId`, BE tạo một `RepoAnalysisSnapshot`.
- Snapshot lưu lại scores, checklist, missingSkills, strengths, weaknesses tại thời điểm phân tích.
- FE có thể lấy danh sách snapshot và so sánh 2 snapshot.
- FE cũng có thể gọi API compare tự động snapshot đầu tiên và mới nhất.

### 3.1 GET repository snapshots

Endpoint:

```http
GET /api/repositories/:repoId/snapshots
Authorization: Bearer <token>
```

FE dùng khi:

- Mở màn "Lịch sử phân tích".
- Hiển thị các lần phân tích của một repo.

Response mẫu:

```json
{
  "success": true,
  "message": "Repository snapshots fetched successfully",
  "data": {
    "total": 2,
    "snapshots": [
      {
        "_id": "snapshot_id_2",
        "repositoryId": "repo_id",
        "repoName": "WDP_G3",
        "fullName": "ToanLkt/WDP_G3",
        "careerDirection": "Backend Developer",
        "overallScore": 67,
        "scores": {
          "techStackScore": 100,
          "documentationScore": 100,
          "commitQualityScore": 50,
          "deploymentScore": 70,
          "testingScore": 0,
          "portfolioReadinessScore": 80,
          "overallScore": 67
        },
        "missingSkills": ["Testing", "CI/CD"],
        "analyzedAt": "2026-06-18T00:00:00.000Z",
        "createdAt": "2026-06-18T00:00:00.000Z"
      }
    ]
  }
}
```

FE nên hiển thị:

- Ngày phân tích.
- `overallScore`.
- `missingSkills`.
- `careerDirection`.
- Button "Xem chi tiết".
- Button "So sánh với lần khác".

### 3.2 GET snapshot detail

Endpoint:

```http
GET /api/snapshots/:snapshotId
Authorization: Bearer <token>
```

FE dùng khi user bấm vào một snapshot để xem chi tiết.

Response:

```json
{
  "success": true,
  "message": "Snapshot fetched successfully",
  "data": {
    "_id": "snapshot_id",
    "repoName": "WDP_G3",
    "fullName": "ToanLkt/WDP_G3",
    "projectType": "Backend API",
    "careerDirection": "Backend Developer",
    "languages": ["javascript"],
    "frameworks": ["Express.js", "MongoDB/Mongoose"],
    "packages": ["express", "mongoose", "jsonwebtoken"],
    "configs": ["Docker", "Docker Compose"],
    "strengths": [],
    "weaknesses": [],
    "missingSkills": ["Testing", "CI/CD"],
    "recommendations": [],
    "scores": {
      "overallScore": 67
    },
    "checklist": {
      "hasReadme": true,
      "hasTesting": false
    },
    "commitSummary": {
      "totalCommits": 13,
      "activeDays": 6
    },
    "analyzedAt": "2026-06-18T00:00:00.000Z"
  }
}
```

FE nên hiển thị tương tự màn Analysis Result, nhưng có nhãn "Kết quả tại thời điểm phân tích".

### 3.3 POST compare snapshots

Endpoint:

```http
POST /api/snapshots/compare
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "fromSnapshotId": "old_snapshot_id",
  "toSnapshotId": "new_snapshot_id"
}
```

FE dùng khi user chọn 2 lần phân tích để so sánh.

Response mẫu:

```json
{
  "success": true,
  "message": "Snapshots compared successfully",
  "data": {
    "repositoryId": "repo_id",
    "repoName": "WDP_G3",
    "fullName": "ToanLkt/WDP_G3",
    "fromSnapshotId": "old_snapshot_id",
    "toSnapshotId": "new_snapshot_id",
    "fromDate": "2026-06-01T00:00:00.000Z",
    "toDate": "2026-06-18T00:00:00.000Z",
    "overallBefore": 45,
    "overallAfter": 67,
    "overallChange": 22,
    "scoreChanges": [
      {
        "key": "testingScore",
        "label": "Testing",
        "before": 0,
        "after": 40,
        "change": 40,
        "status": "improved"
      }
    ],
    "improvements": [],
    "regressions": [],
    "unchanged": [],
    "improvedChecklist": ["Docker", "Testing"],
    "regressedChecklist": [],
    "stillMissingChecklist": ["CI/CD"],
    "alreadyPresentChecklist": ["README", ".env.example"],
    "resolvedMissingSkills": ["Testing"],
    "remainingMissingSkills": ["CI/CD"],
    "newMissingSkills": [],
    "summary": "Repo đã cải thiện tổng thể +22 điểm so với lần phân tích trước."
  }
}
```

FE nên hiển thị:

- Card tổng: `overallBefore`, `overallAfter`, `overallChange`.
- Danh sách score cải thiện.
- Danh sách score giảm.
- Checklist đã cải thiện.
- Missing skills đã xử lý.
- Missing skills còn lại.
- Summary tiếng Việt từ BE.

Gợi ý UI:

- Nếu `overallChange > 0`: màu xanh/positive.
- Nếu `overallChange = 0`: màu trung tính.
- Nếu `overallChange < 0`: cảnh báo.
- `improvements` có thể hiển thị dạng "Testing +40".
- `resolvedMissingSkills` hiển thị badge "Đã cải thiện".
- `remainingMissingSkills` hiển thị badge "Cần tiếp tục học".

### 3.4 GET repository progress comparison

Endpoint:

```http
GET /api/repositories/:repoId/progress-comparison
Authorization: Bearer <token>
```

FE dùng khi:

- Muốn tự động so sánh snapshot đầu tiên và snapshot mới nhất.
- Màn "Tiến bộ của repo" không cần user chọn 2 snapshot thủ công.

Nếu đủ snapshot, response giống API compare.

Nếu chưa đủ 2 snapshot:

```json
{
  "success": false,
  "message": "At least two snapshots are required for comparison",
  "data": null
}
```

FE nên hiển thị:

"Cần ít nhất 2 lần phân tích để xem tiến bộ. Hãy phân tích lại repo sau khi bạn cập nhật project."

---

## 4. Learning Content & Learning Resources

Mục đích: cho phép FE mở màn chi tiết học cho từng skill trong roadmap, lấy nội dung học bằng tiếng Việt và lấy video/resource phù hợp.

Ghi chú logic:

- `LearningContent` dùng chung theo `skillName + targetRole + level + language`, không lưu theo user.
- Default `language` cho LearningContent là `vi`.
- `GET` content chỉ đọc DB, không gọi Gemini.
- `POST /generate` mới gọi Gemini nếu DB chưa có hoặc `forceRegenerate = true`.
- `LearningResource` dùng chung theo `skillName + targetRole + level + language + type`, không lưu theo user.
- `GET resources` chỉ đọc DB, không đọc catalog, không gọi YouTube.
- `POST resources/search` chạy flow: DB cache -> catalog curated URL thật -> YouTube API.
- Catalog URL dạng `TODO_*` bị bỏ qua, không cache vào MongoDB.
- YouTube fallback chỉ lấy tối đa 4 video, chấm điểm, cache và trả về 1 video tốt nhất.

### 4.1 GET learning content

Endpoint:

```http
GET /api/learning/skills/:skillName?targetRole=Frontend%20Developer&level=beginner&language=vi
Authorization: Bearer <token>
```

FE dùng khi:

- User bấm vào skill trong roadmap.
- FE muốn kiểm tra DB đã có nội dung học chưa.

Response khi có content:

```json
{
  "success": true,
  "message": "Learning content found",
  "data": {
    "skillName": "HTML",
    "targetRole": "Frontend Developer",
    "level": "beginner",
    "language": "vi",
    "title": "HTML cơ bản cho Frontend Developer",
    "overview": "Phần này giúp bạn nắm cách xây dựng cấu trúc trang web bằng HTML.",
    "whyLearn": "HTML là nền tảng để xây dựng giao diện web.",
    "useCases": [
      "Tạo layout trang",
      "Xây dựng form",
      "Tổ chức nội dung có ngữ nghĩa"
    ],
    "howToApply": "Áp dụng semantic HTML khi chia layout và viết form.",
    "examples": [
      {
        "title": "Form đăng nhập cơ bản",
        "code": "<form><input type=\"email\" /></form>",
        "explanation": "Ví dụ này minh họa cách tạo form nhập email."
      }
    ],
    "checklist": ["Hiểu semantic tags", "Biết tạo form", "Biết liên kết CSS"],
    "exercises": [
      {
        "title": "Tạo trang giới thiệu bản thân",
        "description": "Dùng HTML để tạo trang có heading, paragraph, image và link."
      }
    ],
    "commonMistakes": ["Dùng quá nhiều div không có ngữ nghĩa"],
    "nextSkills": ["CSS", "JavaScript"]
  }
}
```

Response khi chưa có:

```json
{
  "success": false,
  "message": "Learning content not found. Please generate it first.",
  "data": null
}
```

FE nên xử lý:

- Nếu 200: hiển thị nội dung học.
- Nếu 404: hiển thị nút "Tạo nội dung học" và gọi API generate.

### 4.2 POST generate learning content

Endpoint:

```http
POST /api/learning/skills/generate
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "skillName": "HTML",
  "targetRole": "Frontend Developer",
  "level": "beginner",
  "language": "vi",
  "forceRegenerate": false
}
```

FE dùng khi:

- GET content trả 404.
- User muốn tạo nội dung học cho skill.
- Admin/dev muốn generate lại nội dung bằng `forceRegenerate = true`.

Response khi content đã có:

```json
{
  "success": true,
  "message": "Learning content already exists",
  "data": {
    "skillName": "HTML",
    "targetRole": "Frontend Developer",
    "level": "beginner",
    "language": "vi",
    "title": "HTML cơ bản cho Frontend Developer"
  }
}
```

Response khi generate mới:

```json
{
  "success": true,
  "message": "Learning content generated successfully",
  "data": {
    "skillName": "HTML",
    "targetRole": "Frontend Developer",
    "level": "beginner",
    "language": "vi",
    "title": "HTML cơ bản cho Frontend Developer",
    "overview": "..."
  }
}
```

Ghi chú cho FE:

- Nội dung natural language mặc định là tiếng Việt.
- Code trong `examples.code` vẫn là code thật, không dịch.
- Sau khi generate thành công, FE có thể render trực tiếp response hoặc refetch GET content.

### 4.3 GET learning resources

Endpoint:

```http
GET /api/learning/skills/:skillName/resources?targetRole=Frontend%20Developer&level=beginner&language=en&type=video
Authorization: Bearer <token>
```

FE dùng khi:

- Mở màn Skill Learning Detail.
- Cần lấy video/resource đã cache trong DB.

Response khi có resource:

```json
{
  "success": true,
  "message": "Learning resources fetched successfully",
  "data": [
    {
      "skillName": "HTML",
      "targetRole": "Frontend Developer",
      "level": "beginner",
      "language": "en",
      "type": "video",
      "title": "HTML Tutorial for Beginners",
      "url": "https://www.youtube.com/watch?v=UB1O30fR-EE",
      "provider": "YouTube",
      "thumbnailUrl": "",
      "channelTitle": "",
      "source": "curated",
      "score": 95
    }
  ]
}
```

Response khi chưa có:

```json
{
  "success": true,
  "message": "No learning resources found",
  "data": []
}
```

FE nên xử lý:

- Nếu `data` có item: hiển thị danh sách video/resource.
- Nếu `data` rỗng: hiển thị nút "Tìm video học" và gọi API search/cache.

### 4.4 POST search/cache learning resources

Endpoint:

```http
POST /api/learning/skills/:skillName/resources/search
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "targetRole": "Frontend Developer",
  "level": "beginner",
  "language": "en"
}
```

Flow backend:

1. Check MongoDB cache.
2. Nếu DB có resource phù hợp, trả về ngay.
3. Nếu DB chưa có, check curated catalog trong source code.
4. Catalog item có URL `TODO_*` sẽ bị bỏ qua.
5. Nếu có catalog URL thật, cache vào DB với `source = "curated"`.
6. Nếu catalog không có URL hợp lệ, fallback YouTube API.
7. YouTube lấy tối đa 4 video, tính score, chỉ cache/trả 1 video tốt nhất.

Response khi DB đã có cache:

```json
{
  "success": true,
  "message": "Learning resources already cached",
  "data": [
    {
      "title": "HTML Tutorial for Beginners",
      "url": "https://www.youtube.com/watch?v=UB1O30fR-EE",
      "source": "curated",
      "score": 95
    }
  ]
}
```

Response khi load từ catalog:

```json
{
  "success": true,
  "message": "Learning resources loaded from catalog and cached successfully",
  "data": [
    {
      "title": "HTML Tutorial for Beginners",
      "url": "https://www.youtube.com/watch?v=UB1O30fR-EE",
      "source": "curated",
      "score": 95
    }
  ]
}
```

Response khi search YouTube thành công:

```json
{
  "success": true,
  "message": "Best YouTube resource searched and cached successfully",
  "data": [
    {
      "title": "HTML Tutorial for Beginners",
      "url": "https://www.youtube.com/watch?v=example",
      "provider": "YouTube",
      "source": "youtube_api",
      "score": 60
    }
  ]
}
```

Response khi YouTube không có video đủ liên quan:

```json
{
  "success": true,
  "message": "No relevant YouTube resources found",
  "data": []
}
```

Response khi thiếu key và không có catalog hợp lệ:

```json
{
  "success": false,
  "message": "No valid catalog resources found and YOUTUBE_API_KEY is not configured",
  "data": null
}
```

FE nên xử lý:

- Sau khi search/cache thành công, render `data` hoặc refetch GET resources.
- Nếu thiếu key, hiển thị message cấu hình backend, không retry liên tục.
- Nếu `No relevant YouTube resources found`, hiển thị trạng thái rỗng và gợi ý thử skill/level khác.

### 4.5 POST seed learning resource thủ công

Endpoint:

```http
POST /api/learning/skills/:skillName/resources
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "title": "HTML Tutorial for Beginners",
  "url": "https://www.youtube.com/watch?v=UB1O30fR-EE",
  "provider": "YouTube",
  "type": "video",
  "language": "en",
  "level": "beginner",
  "targetRole": "Frontend Developer",
  "tags": ["html", "frontend", "web"],
  "source": "curated",
  "score": 95
}
```

FE thường không cần gọi API này cho user thường. API này phù hợp cho admin/dev tool để seed resource thật vào DB.

Response mẫu:

```json
{
  "success": true,
  "message": "Learning resource saved successfully",
  "data": {
    "skillName": "HTML",
    "targetRole": "Frontend Developer",
    "level": "beginner",
    "language": "en",
    "type": "video",
    "title": "HTML Tutorial for Beginners",
    "url": "https://www.youtube.com/watch?v=UB1O30fR-EE",
    "source": "curated",
    "score": 95
  }
}
```

### 4.6 Flow FE gợi ý cho Skill Learning Detail

1. User bấm skill trong Roadmap Detail.
2. FE gọi `GET /api/learning/skills/:skillName?targetRole=...&level=...&language=vi`.
3. Nếu 404, FE hiển thị nút generate hoặc tự gọi `POST /api/learning/skills/generate` tùy UX.
4. FE gọi `GET /api/learning/skills/:skillName/resources?targetRole=...&level=...&language=en&type=video`.
5. Nếu resource rỗng, FE gọi `POST /api/learning/skills/:skillName/resources/search`.
6. FE hiển thị content tiếng Việt và video/resource.

---

## 5. Flow FE nên tích hợp

### Flow 1: User xem roadmap và cập nhật tiến độ

1. FE mở Roadmap Detail.
2. Gọi `GET /api/roadmaps/:roadmapId/progress`.
3. Hiển thị `overallProgress` và trạng thái từng skill.
4. User bấm cập nhật skill.
5. Gọi `PATCH /api/roadmaps/:roadmapId/progress/items`.
6. FE refetch progress hoặc cập nhật local state.

### Flow 2: User mở Skill Learning Detail

1. FE lấy hoặc generate LearningContent tiếng Việt.
2. FE lấy LearningResource từ DB.
3. Nếu resource rỗng, FE gọi search/cache.
4. FE hiển thị bài học, ví dụ code, checklist, exercises và video.

### Flow 3: User xem kết quả analysis sau khi scoring đã chuẩn hóa

1. FE gọi `GET /api/analysis/me` hoặc `GET /api/analysis/results/:repoId`.
2. Hiển thị scores.
3. Hiển thị strengths/weaknesses/missingSkills/recommendations.
4. Hiển thị checklist.

### Flow 4: User xem tiến bộ theo snapshot

1. User phân tích repo lần 1.
2. BE tạo snapshot.
3. User cập nhật repo và phân tích lại.
4. BE tạo snapshot mới.
5. FE gọi `GET /api/repositories/:repoId/progress-comparison`.
6. FE hiển thị `overallChange`, `improvements`, `resolvedMissingSkills`, `summary`.

### Flow 5: User so sánh thủ công 2 snapshot

1. FE gọi `GET /api/repositories/:repoId/snapshots`.
2. User chọn 2 snapshot.
3. FE gọi `POST /api/snapshots/compare`.
4. FE hiển thị kết quả compare.

---

## 6. Error handling FE cần chú ý

### 401 Unauthorized

Nguyên nhân:

- Thiếu token.
- Token hết hạn.

FE message:

"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."

### 404 Not Found

Nguyên nhân:

- Roadmap không tồn tại hoặc không thuộc user hiện tại.
- Snapshot không tồn tại hoặc không thuộc user hiện tại.
- Progress item không nằm trong roadmap.

FE message:

"Không tìm thấy dữ liệu phù hợp."

### 400 Bad Request

Nguyên nhân:

- Status progress không hợp lệ.
- Thiếu `skillName`.
- Compare 2 snapshot khác repo.
- Body thiếu `fromSnapshotId` hoặc `toSnapshotId`.

FE message:

"Dữ liệu gửi lên chưa hợp lệ. Vui lòng thử lại."

### 500 Missing backend config

Trường hợp LearningResource search fallback YouTube nhưng backend chưa có key:

```txt
No valid catalog resources found and YOUTUBE_API_KEY is not configured
```

FE message:

"Backend chưa cấu hình YouTube API key và chưa có video curated hợp lệ cho skill này."

### Chưa đủ snapshot

Message từ BE:

```txt
At least two snapshots are required for comparison
```

FE message:

"Cần ít nhất 2 lần phân tích để xem tiến bộ."

---

## 7. Planned Next Backend Updates

Phần này chưa có API chính thức trong code hiện tại, chỉ là hướng backend dự kiến để FE biết trước phạm vi.

### dev2vec-inspired skillEvidence/skillVector

Dự kiến backend có thể bổ sung:

- `skillEvidence`: bằng chứng rule-based cho từng skill, ví dụ package, file, config, commit signal.
- `skillVector`: vector hoặc object đặc trưng hóa skill theo repo để so sánh tiến bộ ổn định hơn.
- Compare skill theo thời gian: skill nào mới xuất hiện, skill nào mạnh hơn, skill nào vẫn thiếu evidence.

FE chưa cần tích hợp phần này cho đến khi có endpoint chính thức.

---

## 8. Kết quả mong muốn

Sau khi đọc file này, FE cần nắm được:

- Cách tích hợp Roadmap Progress.
- Cách tích hợp LearningContent và LearningResource.
- Ý nghĩa `scores` mới trong Analysis.
- Cách lấy Snapshot History.
- Cách Compare Snapshot.
- Cách xử lý lỗi phổ biến cho các API mới.

File này cố ý không liệt kê lại các API cũ như Auth, GitHub OAuth, Chatbot, Repository fetch nếu không liên quan trực tiếp.
