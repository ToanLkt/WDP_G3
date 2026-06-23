# Hướng dẫn FE tích hợp flow dev2vec-inspired

Tài liệu này mô tả contract Frontend cần dùng sau các cập nhật Analysis, Snapshot, Role Matching, Roadmap và Learning.

## 1. Tổng quan

```text
GitHub Repo
→ Analysis
→ skillEvidence
→ skillVector
→ strengths / weaknesses / missingSkills / recommendations
→ Snapshot lưu skillVector
→ Snapshot Compare theo skillVector
→ Role Matching: skillVector vs roleVector
→ Roadmap ưu tiên skill gap
→ Learning dùng canonicalSkillName
```

Các nguyên tắc chính:

- `skillVector` là nguồn dữ liệu kỹ năng chuẩn.
- `canonicalSkillName` là tên skill dùng xuyên suốt hệ thống.
- FE nên ưu tiên `canonicalSkillName`; BE vẫn canonicalize lại để an toàn.
- Roadmap mô tả học gì, không cung cấp học liệu chi tiết.
- Learning API cung cấp nội dung và resources cho từng skill.
- Các API cần Bearer token như các API protected hiện tại.

## 2. Canonical Skill Catalog

```http
GET /api/skills/catalog
```

FE có thể dùng catalog để autocomplete, hiển thị gợi ý hoặc debug mapping.

Ví dụ alias:

```text
Code Quality              → Clean Code
CICD / CI CD              → CI/CD
JWT Auth                  → JWT Authentication
docker-compose            → Docker Compose
OpenAPI                   → Swagger
Environment Configuration → Environment Variables
MongoDB/Mongoose          → Mongoose
```

Response rút gọn:

```json
{
  "success": true,
  "data": {
    "total": 67,
    "skills": [
      {
        "name": "Clean Code",
        "category": "Code Quality",
        "aliases": ["Code Quality"],
        "defaultLevel": "intermediate",
        "tags": ["clean-code", "quality"]
      }
    ]
  }
}
```

## 3. Analysis và skillVector

Các API:

```http
POST /api/analysis/repositories/:repoId
GET  /api/analysis/results/:repoId
GET  /api/analysis/me
```

Analysis mới có `skillVector`:

```json
{
  "canonicalSkillName": "Testing",
  "normalizedSkillName": "testing",
  "category": "Testing",
  "score": 0,
  "level": "missing",
  "evidence": ["Detected as missing skill in analysis"],
  "sources": ["missing_signal"]
}
```

Level:

```text
missing | weak | developing | strong
```

Score nằm trong khoảng `0..1`:

```js
const percent = Math.round(skill.score * 100);
```

FE vẫn dùng các field cũ:

```js
analysis.strengths;
analysis.weaknesses;
analysis.missingSkills;
analysis.recommendations;
```

Nội dung của chúng hiện được sinh từ `skillVector`. Không có các field như `vectorStrengths` hoặc `oldStrengths`.

### Evidence

Mặc định Analysis API không trả `skillEvidence`.

```http
POST /api/analysis/repositories/:repoId?includeEvidence=true
GET  /api/analysis/results/:repoId?includeEvidence=true
GET  /api/analysis/me?includeEvidence=true
```

Chỉ nên bật evidence cho màn debug hoặc giải thích kỹ thuật.

## 4. Snapshot

### Danh sách snapshot

```http
GET /api/repositories/:repoId/snapshots
```

Mỗi item có summary gọn:

```json
{
  "skillVectorSummary": {
    "totalSkills": 18,
    "strongSkills": 13,
    "developingSkills": 2,
    "weakSkills": 0,
    "missingSkills": 3
  }
}
```

Snapshot cũ có thể trả `totalSkills: 0`. FE có thể xác định:

```js
const hasSkillVector = snapshot.skillVectorSummary.totalSkills > 0;
```

### Snapshot detail

```http
GET /api/snapshots/:snapshotId
```

- Mặc định có `skillVector`, không có `skillEvidence`.
- Dùng `?includeEvidence=true` khi cần evidence.

## 5. Snapshot Compare

```http
POST /api/snapshots/compare
GET  /api/repositories/:repoId/progress-comparison
```

Các root field so sánh score/checklist cũ vẫn được giữ. Phần mới:

```json
{
  "skillVectorComparison": {
    "skillSummary": {},
    "topImprovedSkills": [],
    "topRegressedSkills": [],
    "newSkills": [],
    "resolvedMissingSkills": [],
    "remainingMissingSkills": ["CI/CD", "Clean Code"],
    "newMissingSkills": [],
    "summary": "..."
  }
}
```

Mặc định response compact, không có full `skillChanges`.

```http
?includeSkillDetails=true
?includeSkillDetails=true&includeEvidence=true
```

- `includeSkillDetails=true`: thêm các mảng chi tiết.
- `includeEvidence=true` chỉ có tác dụng khi details được bật.
- Màn tổng quan nên dùng response mặc định.

Với snapshot cũ không có vector, status `new` chỉ có nghĩa hệ thống mới ghi nhận skill đó, không khẳng định user vừa học xong.

## 6. Role Matching

```http
GET /api/roles/catalog
GET /api/analysis/repositories/:repoId/role-matches
```

Query hỗ trợ:

```http
?limit=3
?targetRole=Backend Developer
?includeDetails=true
```

Response:

```json
{
  "topRole": {
    "roleId": "backend-developer",
    "roleName": "Backend Developer",
    "matchScore": 58.57,
    "matchLevel": "moderate",
    "matchLevelLabel": "Tạm phù hợp"
  },
  "matches": []
}
```

Match compact có score, counts, `recommendedNextSkills`, `topMatchedSkills`, `topMissingSkills` và summary.

`includeDetails=true` thêm:

- `matchedSkills`
- `weakSkills`
- `missingRequiredSkills`
- `missingOptionalSkills`

Match level:

| Level | Label |
|---|---|
| `excellent` | Rất phù hợp |
| `good` | Phù hợp tốt |
| `moderate` | Tạm phù hợp |
| `low` | Phù hợp thấp |
| `very_low` | Chưa phù hợp |

FE không cần tự tính role match từ `careerSignals`.

## 7. Roadmap Generate

Endpoint không đổi:

```http
POST /api/roadmaps/generate
```

Body đề xuất:

```json
{
  "repoId": "REPO_ID",
  "targetRole": "Backend Developer",
  "level": "beginner",
  "durationWeeks": 6,
  "language": "vi"
}
```

BE tự lấy latest Analysis, chạy Role Matching và ưu tiên skill gap. FE không cần gọi role-matches trước.

Metadata roadmap mới:

```json
{
  "roadmapSource": "role_matching",
  "roleMatch": {
    "roleId": "backend-developer",
    "roleName": "Backend Developer",
    "matchScore": 58.57,
    "matchLevel": "moderate",
    "matchLevelLabel": "Tạm phù hợp"
  },
  "skillGapSummary": {
    "totalGaps": 10,
    "missingRequiredCount": 7,
    "weakSkillCount": 1,
    "recommendedNextSkills": ["Testing", "API Testing", "Clean Code"],
    "prioritySkills": ["Testing", "API Testing", "Clean Code", "CI/CD"]
  }
}
```

Roadmap cũ có thể không có metadata này.

### Roadmap task

```json
{
  "title": "Học và thực hành với Jest và Supertest",
  "description": "Viết unit test và API test cho Express.js.",
  "skillTags": ["Testing", "API Testing", "Node.js"],
  "skillName": "Testing",
  "canonicalSkillName": "Testing",
  "targetRole": "Backend Developer",
  "category": "Testing",
  "priority": 1,
  "status": "not_started",
  "estimatedHours": 20,
  "resources": []
}
```

FE không nên phụ thuộc vào `task.resources`. Roadmap mới luôn để resources rỗng; học liệu lấy qua Learning API.

Các API roadmap khác không đổi:

```http
GET   /api/roadmaps/:roadmapId
GET   /api/roadmaps/me
GET   /api/roadmaps/:roadmapId/progress
PATCH /api/roadmaps/:roadmapId/progress/items
POST  /api/roadmaps/:roadmapId/progress/reset
PATCH /api/roadmaps/:roadmapId/archive
```

Khi update progress, FE nên gửi canonical skill:

```json
{
  "skillName": "Clean Code",
  "status": "in_progress"
}
```

## 8. Learning API canonicalization

Không có route mới:

```http
GET  /api/learning/skills/:skillName
POST /api/learning/skills/generate
GET  /api/learning/skills/:skillName/resources
POST /api/learning/skills/:skillName/resources
POST /api/learning/skills/:skillName/resources/search
```

Tất cả endpoint canonicalize skill trước khi query/generate/save/cache.

Ví dụ:

```text
Code Quality   → Clean Code
CICD           → CI/CD
JWT Auth       → JWT Authentication
docker-compose → Docker Compose
OpenAPI        → Swagger
```

Response có metadata:

```json
{
  "requestedSkillName": "Code Quality",
  "skillName": "Clean Code",
  "canonicalSkillName": "Clean Code",
  "normalizedSkillName": "clean code",
  "targetRole": "Backend Developer",
  "level": "beginner",
  "language": "vi"
}
```

### Lấy hoặc generate content

```http
GET /api/learning/skills/Testing?targetRole=Backend Developer&level=beginner&language=vi
```

Nếu trả `404`, gọi:

```http
POST /api/learning/skills/generate
Content-Type: application/json
```

```json
{
  "skillName": "Testing",
  "targetRole": "Backend Developer",
  "level": "beginner",
  "language": "vi",
  "forceRegenerate": false
}
```

### Learning resources

```http
GET /api/learning/skills/Testing/resources?targetRole=Backend Developer&level=beginner&language=en&type=video
```

Response resources nằm trong:

```js
data.resources
```

Nếu rỗng:

```http
POST /api/learning/skills/Testing/resources/search
Content-Type: application/json
```

```json
{
  "targetRole": "Backend Developer",
  "level": "beginner",
  "language": "en"
}
```

Lưu ý contract hiện tại:

- Resource `type` chỉ gồm `video`, `article`, `docs`.
- Search kiểm tra cache, sau đó catalog curated; nếu không có thì tìm YouTube.
- API hiện chưa hỗ trợ `forceRefresh` hoặc `includeYoutube`.
- Không nên giả định search luôn trả mixed docs và video trong cùng một lần gọi.

## 9. Flow Roadmap → Learning

```js
const skillName = task.canonicalSkillName || task.skillName;
const targetRole = task.targetRole || roadmap.targetRole;
const level = "beginner";
const language = "vi";
```

1. GET learning content.
2. Nếu `404`, POST generate.
3. GET resources.
4. Nếu `data.resources` rỗng, POST resources/search.
5. Hiển thị kết quả search hoặc gọi GET resources lại.

FE không cần tự map alias.

## 10. Backward compatibility

FE cần xử lý:

- Analysis cũ có thể chưa có `skillVector`.
- Snapshot cũ có thể có `skillVectorSummary.totalSkills = 0`.
- Roadmap cũ có thể thiếu `roadmapSource`, `roleMatch`, `skillGapSummary`, `canonicalSkillName`.
- Roadmap cũ có thể còn resource trong task.
- Learning cũ có thể từng lưu alias; BE có fallback đọc dữ liệu này.

Fallback đề xuất:

```js
const skillName = item.canonicalSkillName || item.skillName;
```

Chỉ render role/skill-gap card khi metadata tồn tại.

## 11. Checklist FE

- Analysis: group `skillVector` theo level, hiển thị score phần trăm.
- Không yêu cầu evidence mặc định.
- Snapshot: dùng `skillVectorSummary`, xử lý `totalSkills = 0`.
- Compare: dùng compact response; chỉ tải details khi user mở rộng.
- Role Match: hiển thị `topRole`, matches và `recommendedNextSkills`.
- Roadmap: hiển thị role metadata và priority skills nếu có.
- Không đọc học liệu từ `roadmap.task.resources`.
- Learning: ưu tiên `canonicalSkillName`, generate content khi `404`.
- Resources: đọc từ `data.resources`, search khi cache rỗng.

## 12. Quick examples

```http
POST /api/analysis/repositories/:repoId?includeEvidence=false
GET  /api/analysis/repositories/:repoId/role-matches?limit=5
POST /api/roadmaps/generate
GET  /api/learning/skills/Testing?targetRole=Backend Developer&level=beginner&language=vi
GET  /api/learning/skills/Testing/resources?targetRole=Backend Developer&level=beginner&language=en&type=video
POST /api/learning/skills/Testing/resources/search
```

Kết luận:

- `skillVector` là nguồn kỹ năng chuẩn.
- `roleMatch` cá nhân hóa roadmap.
- Roadmap chỉ mô tả học gì.
- Learning cung cấp nội dung và tài nguyên học.
- FE nên dùng canonical name; BE vẫn canonicalize lại để bảo đảm an toàn.
