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
        "strengths": [
          "Repo có sử dụng Express.js để xây dựng backend API."
        ],
        "weaknesses": [
          "Repo chưa có CI/CD workflow.",
          "Repo chua co automated testing setup ro rang."
        ],
        "missingSkills": [
          "Testing",
          "CI/CD",
          "Code Quality"
        ],
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
        "missingSkills": [
          "Testing",
          "CI/CD"
        ],
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

## 4. Flow FE nên tích hợp

### Flow 1: User xem roadmap và cập nhật tiến độ

1. FE mở Roadmap Detail.
2. Gọi `GET /api/roadmaps/:roadmapId/progress`.
3. Hiển thị `overallProgress` và trạng thái từng skill.
4. User bấm cập nhật skill.
5. Gọi `PATCH /api/roadmaps/:roadmapId/progress/items`.
6. FE refetch progress hoặc cập nhật local state.

### Flow 2: User xem kết quả analysis sau khi scoring đã chuẩn hóa

1. FE gọi `GET /api/analysis/me` hoặc `GET /api/analysis/results/:repoId`.
2. Hiển thị scores.
3. Hiển thị strengths/weaknesses/missingSkills/recommendations.
4. Hiển thị checklist.

### Flow 3: User xem tiến bộ theo snapshot

1. User phân tích repo lần 1.
2. BE tạo snapshot.
3. User cập nhật repo và phân tích lại.
4. BE tạo snapshot mới.
5. FE gọi `GET /api/repositories/:repoId/progress-comparison`.
6. FE hiển thị `overallChange`, `improvements`, `resolvedMissingSkills`, `summary`.

### Flow 4: User so sánh thủ công 2 snapshot

1. FE gọi `GET /api/repositories/:repoId/snapshots`.
2. User chọn 2 snapshot.
3. FE gọi `POST /api/snapshots/compare`.
4. FE hiển thị kết quả compare.

---

## 5. Error handling FE cần chú ý

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

### Chưa đủ snapshot

Message từ BE:

```txt
At least two snapshots are required for comparison
```

FE message:

"Cần ít nhất 2 lần phân tích để xem tiến bộ."

---

## 6. Planned Next Backend Updates

Phần này chưa có API chính thức trong code hiện tại, chỉ là hướng backend dự kiến để FE biết trước phạm vi.

### dev2vec-inspired skillEvidence/skillVector

Dự kiến backend có thể bổ sung:

- `skillEvidence`: bằng chứng rule-based cho từng skill, ví dụ package, file, config, commit signal.
- `skillVector`: vector hoặc object đặc trưng hóa skill theo repo để so sánh tiến bộ ổn định hơn.
- Compare skill theo thời gian: skill nào mới xuất hiện, skill nào mạnh hơn, skill nào vẫn thiếu evidence.

FE chưa cần tích hợp phần này cho đến khi có endpoint chính thức.

---

## 7. Kết quả mong muốn

Sau khi đọc file này, FE cần nắm được:

- Cách tích hợp Roadmap Progress.
- Ý nghĩa `scores` mới trong Analysis.
- Cách lấy Snapshot History.
- Cách Compare Snapshot.
- Cách xử lý lỗi phổ biến cho các API mới.

File này cố ý không liệt kê lại các API cũ như Auth, GitHub OAuth, Chatbot, Repository fetch nếu không liên quan trực tiếp.
