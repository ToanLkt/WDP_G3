# Hướng dẫn cập nhật Frontend sau Dev2Vec Remediation Batch 1–2

**Mục tiêu:** giúp Frontend cập nhật đúng các luồng đã thay đổi mà không phải sửa hàng loạt contract cũ.

**Phiên bản hiện tại**

```text
modelVersion = dev2vec-demo-v4
analysisPipelineVersion = dev2vec-analysis-pipeline-v12
consumerCompatibilityVersion = dev2vec-consumer-compatibility-v1
roleSelectionVersion = repository-primary-role-selection-v1
aiContextBoundaryVersion = ai-context-boundary-v1
roadmapSourceVersion = roadmap-source-provenance-v1
```

> Các field public cũ về role, skill gap, roadmap và chat vẫn được giữ nguyên tên, type và nesting. Những field mới chủ yếu là optional/additive.

---

## 1. Các nguyên tắc FE cần áp dụng

### 1.1 Không coi record mới nhất theo thời gian là record hiện hành

Backend đã chuyển sang logic **latest compatible analysis**. FE không nên tự chọn record mới nhất dựa vào `createdAt` hoặc `analyzedAt`.

Hãy ưu tiên các trạng thái và metadata backend trả về:

```text
analysisStatus
reason
compatibility
isCompatible
isCurrentVersion
modelVersion
pipelineVersion
```

### 1.2 Chỉ coi Dev2Vec result là authoritative khi record compatible

Một analysis/snapshot hiện hành phải thuộc đúng generation hiện tại, bao gồm model, pipeline và evidence/document versions.

FE không cần tự so sánh toàn bộ version để quyết định nếu backend đã trả:

```js
{
  isCompatible: true,
  isCurrentVersion: true
}
```

Tuy nhiên FE nên hiển thị version trong màn hình history, snapshot detail hoặc admin detail.

### 1.3 Không dùng package/repository technology để suy ra skill của user

Trong chat và roadmap:

- Dev2Vec result là nguồn authoritative cho role và skill gap.
- Package/README/project metadata chỉ là technical repository context.
- Không hiển thị package của repo như bằng chứng chắc chắn user có skill đó.

### 1.4 Primary role và role lựa chọn

Khi phân tích một repo:

- `primaryRole` là rank-1 role của repo hiện tại.
- `additionalRoleOptions` gồm tối đa hai rank-1 role từ các repo khác của cùng user.
- Không còn merged vector hoặc synthetic multi-repo inference.

---

# 2. Những field cũ FE tiếp tục dùng

Các field sau không đổi tên/type:

```text
roleId
roleName
matchScore
matchLevel
matchLevelLabel
matchedSkillNames
weakSkillNames
missingSkillNames
recommendedNextSkills
roleMatch
skillGapSummary
```

Quy tắc:

```text
matchScore = probability × 100
```

Primary role vẫn nằm ở rank đầu tiên của kết quả Python.

Không cần đổi component đang render các field trên, trừ khi component đang tự tính lại skill status hoặc tự reorder role.

---

# 3. Analysis APIs

## 3.1 Phân tích repository

```http
POST /api/analysis/repositories/{repoId}
```

Behavior chính không đổi:

- phân tích contribution của user;
- trả role phù hợp nhất;
- có thể trả thêm hai role khác trong prediction của repo;
- tạo analysis result và snapshot.

FE nên lưu lại:

```text
analysisId
snapshotId
repositoryId
modelVersion
pipelineVersion
```

nếu response có cung cấp.

## 3.2 Lấy analysis mới nhất của một repo

```http
GET /api/analysis/results/{repoId}
```

### Trường hợp có analysis compatible

Tiếp tục render analysis như hiện tại.

Có thể có thêm:

```js
{
  analysisStatus: "available",
  compatibility: {
    isCompatible: true,
    isCurrentVersion: true
  }
}
```

### Trường hợp chỉ có history cũ

Backend có thể trả typed state:

```js
{
  analysisStatus: "analysis_required",
  reason: "incompatible_analysis_history"
}
```

FE nên:

1. Không render record cũ như kết quả hiện hành.
2. Hiển thị CTA “Phân tích lại repository”.
3. History cũ vẫn có thể hiển thị ở màn snapshot/history nếu cần.

### Trường hợp chưa từng phân tích

Có thể nhận:

```js
{
  analysisStatus: "analysis_required",
  reason: "no_compatible_dev2vec_analysis"
}
```

FE xử lý tương tự: hiển thị nút phân tích.

## 3.3 Lấy analysis của tất cả repo

```http
GET /api/analysis/me
```

Mỗi repository có thể thuộc một trong hai nhóm:

```text
compatible analysis available
analysis required
```

Không nên filter bỏ repository chỉ vì chưa có analysis v12. Nên hiển thị trạng thái riêng cho từng repo.

---

# 4. Role matching và role options

## 4.1 Single-repository role matching

```http
GET /api/analysis/repositories/{repoId}/role-matches
```

Các field cũ như `topRole` và `matches` vẫn được giữ.

Backend có thể bổ sung:

```js
{
  roleSelection: {
    primaryRole: {},
    additionalRoleOptions: []
  },
  primaryRole: {},
  additionalRoleOptions: []
}
```

### Cách render khuyến nghị

```text
Vai trò phù hợp nhất với repository hiện tại
[ primaryRole ]

Các vai trò khác từ những repository đã phân tích
[ additionalRoleOptions[0] ]
[ additionalRoleOptions[1] ]
```

Không nên gộp ba role này thành “top-3 của cùng một inference” vì hai role bổ sung có thể đến từ repo khác.

## 4.2 Ý nghĩa các role option

Mỗi role có thể có provenance:

```js
{
  roleId: "backend_developer",
  roleName: "Backend Developer",
  matchScore: 82.31,
  sourceRepositoryId: "...",
  sourceRepositoryName: "...",
  sourceAnalysisId: "...",
  sourceSnapshotId: "...",
  selectionType: "current_repository_primary",
  modelVersion: "dev2vec-demo-v4",
  pipelineVersion: "dev2vec-analysis-pipeline-v12"
}
```

Các giá trị `selectionType` quan trọng:

```text
current_repository_primary
portfolio_repository_primary
portfolio_suggestion
```

FE nên dùng `selectionType` để gắn nhãn nguồn role.

## 4.3 Multi-repository role matching

```http
POST /api/analysis/role-matches
```

Với `selected_repos` hoặc `all_analyzed_repos`, backend không còn chạy classifier trên merged vector.

Metadata mới có thể gồm:

```js
{
  aggregationMode: "repository_primary_roles",
  classifierInferencePerformed: false,
  authoritativeScope: "per_repository_dev2vec",
  sourceRepositoryCount: 3
}
```

FE không nên gọi đây là “phân tích Dev2Vec tổng hợp nhiều repo”.

Tên hiển thị phù hợp hơn:

```text
Các role nổi bật từ portfolio repository
```

Mỗi role vẫn là rank-1 prediction của một repo cụ thể.

---

# 5. Tạo roadmap theo role user chọn

```http
POST /api/roadmaps/generate
```

## 5.1 Request cũ vẫn hỗ trợ

```json
{
  "repoId": "..."
}
```

Backend sẽ dùng primary role của repo đó.

## 5.2 Request mới khi user chọn một role option

FE nên gửi đầy đủ provenance backend đã trả:

```json
{
  "repoId": "CURRENT_REPOSITORY_ID",
  "currentRepositoryId": "CURRENT_REPOSITORY_ID",
  "selectedRoleId": "backend_developer",
  "sourceRepositoryId": "SOURCE_REPOSITORY_ID",
  "sourceAnalysisId": "SOURCE_ANALYSIS_ID",
  "sourceSnapshotId": "SOURCE_SNAPSHOT_ID"
}
```

`sourceAnalysisId` hoặc `sourceSnapshotId` tùy dữ liệu backend trả; gửi được cả hai càng tốt.

## 5.3 Không cho phép chọn role tùy ý

FE chỉ nên cho user chọn:

- primary role của repo hiện tại;
- role nằm trong `additionalRoleOptions`;
- role nằm trong portfolio role list backend trả.

Không dùng toàn bộ `/api/roles/catalog` làm danh sách role để tạo roadmap authoritative.

Role catalog chỉ là metadata/display catalog.

## 5.4 Roadmap provenance

Roadmap response có thể có thêm:

```js
{
  roadmapSource: {
    selectedRoleId: "...",
    roleSelectionType: "...",
    sourceRepositoryId: "...",
    sourceAnalysisId: "...",
    sourceSnapshotId: "...",
    modelVersion: "dev2vec-demo-v4",
    pipelineVersion: "dev2vec-analysis-pipeline-v12",
    evidenceFingerprint: "..."
  }
}
```

FE nên dùng provenance để:

- hiển thị “Roadmap được tạo từ role X của repository Y”;
- debug khi roadmap cũ;
- biết roadmap có cần regenerate sau analysis mới hay không.

Không cần hiển thị `evidenceFingerprint` cho user thường.

---

# 6. Snapshot và progress comparison

## 6.1 Danh sách snapshot

```http
GET /api/repositories/{repoId}/snapshots
```

Mỗi snapshot có thể bổ sung:

```js
{
  modelVersion: "dev2vec-demo-v4",
  pipelineVersion: "dev2vec-analysis-pipeline-v12",
  repoDocumentVersion: "...",
  issueDocumentVersion: "...",
  apiEvidenceVersion: "...",
  isCurrentVersion: true,
  isCompatible: true,
  isComparableWithCurrent: true
}
```

### Cách render

- Hiển thị badge version: `Pipeline v12`.
- Snapshot cũ: badge “Phiên bản cũ”.
- Disable nút compare nếu `isComparableWithCurrent === false`.

## 6.2 Snapshot detail

```http
GET /api/snapshots/{snapshotId}
```

Snapshot cũ vẫn xem được.

FE cần phân biệt:

```text
viewable
comparable
current
```

Một snapshot có thể xem được nhưng không compare được với generation hiện tại.

## 6.3 So sánh hai snapshot

```http
POST /api/snapshots/compare
```

Chỉ compare khi cùng generation/version.

### Thành công

Response có thể có:

```js
{
  comparisonStatus: "comparable",
  comparisonVersion: {
    modelVersion: "dev2vec-demo-v4",
    pipelineVersion: "dev2vec-analysis-pipeline-v12"
  }
}
```

### Khác version

Backend trả HTTP `409` với error/status:

```text
incompatible_snapshot_versions
```

Ví dụ:

```json
{
  "success": false,
  "comparisonStatus": "incompatible_snapshot_versions",
  "message": "Snapshots were generated by different Dev2Vec versions.",
  "errors": {
    "leftVersion": {
      "modelVersion": "dev2vec-demo-v4",
      "pipelineVersion": "dev2vec-analysis-pipeline-v11"
    },
    "rightVersion": {
      "modelVersion": "dev2vec-demo-v4",
      "pipelineVersion": "dev2vec-analysis-pipeline-v12"
    }
  }
}
```

FE nên:

1. Không render delta chart.
2. Hiển thị message “Không thể so sánh snapshot khác phiên bản”.
3. Cho phép user xem riêng từng snapshot.
4. Có thể gợi ý phân tích lại để tạo snapshot cùng version.

## 6.4 Progress comparison tự động

```http
GET /api/repositories/{repoId}/progress-comparison
```

Các trạng thái cần xử lý:

```text
comparable
insufficient_compatible_snapshots
```

Nếu `insufficient_compatible_snapshots`:

- không hiển thị chart tăng/giảm;
- hiển thị cần ít nhất hai lần phân tích bằng cùng version;
- không fallback sang snapshot cũ.

---

# 7. Dashboard

```http
GET /api/dashboard/me
```

Dashboard hiện dùng:

- latest compatible analysis;
- rank-1 role;
- Python skill-gap;
- active roadmap;
- `RoadmapProgress`;
- feedback gắn với current analysis.

Field cũ giữ nguyên.

Metadata mới có thể gồm:

```js
{
  dev2vecStatus: "current",
  modelVersion: "dev2vec-demo-v4",
  pipelineVersion: "dev2vec-analysis-pipeline-v12",
  topRoles: [],
  currentSnapshot: {},
  currentFeedback: {}
}
```

Các trạng thái:

```text
current
analysis_required
```

Nếu `analysis_required`:

- không hiển thị career direction cũ;
- hiển thị CTA phân tích repository;
- roadmap cũ vẫn có thể nằm ở lịch sử nhưng không nên gọi là current recommendation.

---

# 8. AI feedback

## 8.1 Generate feedback

```http
POST /api/ai-feedback/repositories/{repoId}
```

Chỉ chạy khi có analysis compatible.

Nếu không có, backend trả typed conflict như:

```text
analysis_required
incompatible_analysis_history
```

FE không nên retry Gemini liên tục; nên dẫn user sang phân tích repo trước.

## 8.2 Read feedback

```http
GET /api/ai-feedback/results/{repoId}
GET /api/ai-feedback/me
```

Feedback có thể bổ sung:

```js
{
  isStale: true,
  staleReason: "analysis_version_changed",
  sourceModelVersion: "dev2vec-demo-v4",
  sourcePipelineVersion: "dev2vec-analysis-pipeline-v11",
  currentModelVersion: "dev2vec-demo-v4",
  currentPipelineVersion: "dev2vec-analysis-pipeline-v12"
}
```

### Cách render

Nếu `isStale === true`:

- vẫn có thể hiển thị nội dung cũ;
- thêm badge “Feedback cũ”;
- hiển thị CTA “Tạo lại feedback”;
- không dùng feedback cũ làm career recommendation hiện tại.

---

# 9. AI mentor chat

```http
POST /api/chat/sessions/{sessionId}/messages
```

Backend đã tách context thành nhiều nguồn.

Message/session response có thể bổ sung:

```js
{
  contextSources: [
    "authoritative_dev2vec",
    "user_contribution",
    "technical_repository_context"
  ],
  dev2vecAuthoritative: true
}
```

## 9.1 Ý nghĩa context

```text
authoritative_dev2vec
```

Được dùng cho role, skill-gap, roadmap và career advice.

```text
user_contribution
```

Dùng để giải thích contribution của user.

```text
technical_repository_context
```

Dùng để trả lời kỹ thuật về repo, package, README hoặc architecture metadata. Không phải bằng chứng skill cá nhân.

## 9.2 UI khuyến nghị

Có thể hiển thị nhãn nhỏ:

```text
Dựa trên kết quả Dev2Vec
Dựa trên contribution đã xác minh
Dựa trên thông tin kỹ thuật repository
```

Không bắt buộc hiển thị tất cả metadata cho user, nhưng hữu ích trong debug hoặc AI transparency.

## 9.3 Comparison chat

Khi chat so sánh repository, client cần gửi `repositoryIds` rõ ràng, từ 2 đến 5 repo.

Không dựa vào việc AI tự đoán tên repo từ câu hỏi để tạo authoritative comparison.

---

# 10. Learning và progress

Các API learning/progress không đổi contract chính:

```http
GET  /api/roadmaps/{roadmapId}/learning
GET  /api/roadmaps/{roadmapId}/learning/items/{itemId}
POST /api/roadmaps/{roadmapId}/learning/items/{itemId}/generate

GET   /api/roadmaps/{roadmapId}/progress
PATCH /api/roadmaps/{roadmapId}/progress/items
POST  /api/roadmaps/{roadmapId}/progress/reset
```

FE tiếp tục dùng như cũ.

Lưu ý terminology:

```text
Roadmap progress = tiến độ học
Snapshot progress comparison = thay đổi kết quả phân tích repository theo thời gian
```

Không gộp hai loại progress thành một metric.

---

# 10.1 Roadmap-level Coursera Course Recommendations

## Vai trò trong sản phẩm

Learning hiện tại vẫn là luồng học chính và tiếp tục hoạt động độc lập:

```text
roadmap item
→ learning content
→ YouTube resources
→ progress
```

Coursera chỉ là tài nguyên tham khảo bổ sung được đề xuất theo **toàn bộ roadmap**. Nó không thay thế learning content, YouTube resources hoặc progress hiện tại. Backend chỉ đọc catalog Coursera offline trong MongoDB; request runtime không gọi Coursera và không gọi Gemini.

Endpoint có authentication và kiểm tra roadmap thuộc user hiện tại.

## Vị trí hiển thị

Section Coursera nên nằm ở cuối trang roadmap detail:

```text
Roadmap detail
├── Roadmap overview
├── Main roadmap items
├── Learning/progress hiện tại
└── Khóa học tham khảo trên Coursera
```

FE hiển thị đúng một danh sách course cho toàn roadmap. Không render course dưới từng roadmap item và không group theo `itemId`, `taskId` hoặc `skillName`.

## API contract

```http
GET /api/roadmaps/{roadmapId}/course-recommendations
Authorization: Bearer <token>
```

Response thực tế:

```json
{
  "success": true,
  "message": "Roadmap course recommendations fetched successfully",
  "data": {
    "roadmapId": "6a612c0cac172f94bf4fd268",
    "topic": {
      "topicId": "frontend-intermediate",
      "roleId": "frontend",
      "level": "intermediate",
      "displayName": "Frontend Development trung cấp"
    },
    "courses": [
      {
        "provider": "coursera",
        "title": "IBM Front-End Developer Professional Certificate",
        "description": "HTML, CSS, JavaScript, React, UI/UX, responsive and accessible web applications.",
        "url": "https://www.coursera.org/professional-certificates/ibm-frontend-developer",
        "thumbnailUrl": "",
        "contentType": "professional_certificate",
        "partnerName": "IBM",
        "level": "beginner",
        "language": "en",
        "estimatedDuration": "4 months",
        "pricingType": "provider_determined",
        "linkType": "direct_course",
        "isExternal": true
      }
    ]
  }
}
```

Các field FE sử dụng:

- `data.roadmapId`.
- `data.topic.topicId`, `roleId`, `level`, `displayName`.
- `data.courses[]`.
- Mỗi course gồm `provider`, `title`, `description`, `url`, `thumbnailUrl`, `contentType`, `partnerName`, `level`, `language`, `estimatedDuration`, `pricingType`, `linkType`, `isExternal`.

## TypeScript interfaces gợi ý

```ts
export interface CourseraCourseRecommendation {
  provider: "coursera";
  title: string;
  description: string;
  url: string;
  thumbnailUrl: string;
  contentType:
    | "course"
    | "specialization"
    | "professional_certificate"
    | "guided_project"
    | string;
  partnerName: string;
  level: string;
  language: string;
  estimatedDuration: string;
  pricingType: "provider_determined";
  linkType: "direct_course";
  isExternal: true;
}

export interface RoadmapCourseRecommendationTopic {
  topicId: string;
  roleId: string;
  level: "beginner" | "intermediate" | "advanced" | string;
  displayName: string;
}

export interface RoadmapCourseRecommendationsResponse {
  success: boolean;
  message: string;
  data: {
    roadmapId: string;
    topic: RoadmapCourseRecommendationTopic;
    courses: CourseraCourseRecommendation[];
  };
}
```

## Fetch example

Ví dụ dưới đây giả định `apiClient.get` đã unwrap response body theo convention của FE. Nếu client trả kiểu Axios response, hãy trả `response.data` tương ứng.

```ts
export async function getRoadmapCourseRecommendations(
  roadmapId: string,
): Promise<RoadmapCourseRecommendationsResponse> {
  return apiClient.get(
    `/api/roadmaps/${roadmapId}/course-recommendations`,
  );
}
```

Chỉ gọi hàm này một lần theo `roadmapId`, không gọi trong loop qua roadmap items.

## Loading, render và empty state

- Render section khi `data.courses.length > 0`.
- Không block roadmap detail hoặc learning chính trong lúc request đang loading.
- Có thể dùng skeleton riêng cho section Coursera.
- Không retry vô hạn. Nếu cần retry, dùng hành động thủ công hoặc retry hữu hạn.
- Nếu API lỗi, ẩn section hoặc hiển thị empty state nhẹ; không chuyển toàn bộ roadmap page sang error state.
- Không gọi endpoint cho từng roadmap item.

`courses: []` là response thành công hợp lệ, không phải lỗi:

```json
{
  "success": true,
  "data": {
    "roadmapId": "...",
    "topic": {
      "topicId": "frontend-intermediate",
      "roleId": "frontend",
      "level": "intermediate",
      "displayName": "Frontend Development trung cấp"
    },
    "courses": []
  }
}
```

FE có thể ẩn section hoặc hiển thị: **“Chưa có khóa học Coursera phù hợp.”**

## Card fields và UI copy

Card nên hiển thị:

- `title`;
- `partnerName`;
- `contentType`;
- `level`;
- `estimatedDuration`;
- `description`;
- CTA.

`thumbnailUrl` có thể là chuỗi rỗng, vì vậy FE cần placeholder. Không giả định `course.level` luôn giống `topic.level`: roadmap intermediate vẫn có thể nhận course beginner nếu course phù hợp với tổng thể roadmap.

Copy khuyến nghị:

- Heading: **“Khóa học tham khảo trên Coursera”**.
- Mô tả: **“Các khóa học bên ngoài được đề xuất theo toàn bộ lộ trình của bạn.”**
- Disclaimer: **“Đây là tài nguyên học bổ sung. Tiến độ học trên Coursera không được đồng bộ với tiến độ roadmap trong ứng dụng.”**
- Pricing: **“Khóa học có thể miễn phí hoặc trả phí tùy theo Coursera.”**
- CTA: **“Xem khóa học trên Coursera”**.

## External link handling

Trước khi mở link, luôn kiểm tra HTTPS và hostname:

```ts
export function isAllowedCourseraUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const allowedHosts = new Set([
      "coursera.org",
      "www.coursera.org",
    ]);

    return (
      parsed.protocol === "https:" &&
      allowedHosts.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}
```

Web:

```ts
if (isAllowedCourseraUrl(course.url)) {
  window.open(course.url, "_blank", "noopener,noreferrer");
}
```

React Native/Expo:

```ts
import { Linking } from "react-native";

if (isAllowedCourseraUrl(course.url)) {
  await Linking.openURL(course.url);
}
```

Không mở URL nếu validation thất bại. FE không gọi Coursera search và không tự ghép URL từ title.

## Error states

| Trạng thái | Ý nghĩa | Xử lý FE |
|---|---|---|
| `401` | Token thiếu hoặc hết hạn | Chạy auth refresh/login flow hiện tại |
| `404` | Roadmap không tồn tại hoặc không thuộc user | Hiển thị roadmap unavailable/not found |
| `200` + `courses: []` | Catalog chưa có dữ liệu hoặc không có course phù hợp | Empty state nhẹ hoặc ẩn section |
| Network/server error | Recommendation tạm thời không tải được | Không làm hỏng roadmap/learning; cho retry hữu hạn nếu cần |

## Integration flow

```text
FE tải roadmap detail
→ render roadmap và learning hiện tại
→ gọi course-recommendations một lần theo roadmapId
→ render section Coursera ở cuối
→ user nhấn course
→ validate URL
→ mở direct Coursera URL
```

Không gọi endpoint trong loop qua roadmap items.

## Compatibility

- Endpoint là additive.
- Không thay đổi response của roadmap API hiện tại.
- Không thay đổi learning API hoặc YouTube fields.
- Không thay đổi progress contract.
- FE cũ không bắt buộc tích hợp endpoint này ngay.
- Việc user mở hoặc hoàn thành course trên Coursera không tự đánh dấu roadmap item hoàn thành.

## FE checklist

- [ ] Gọi endpoint một lần theo `roadmapId`.
- [ ] Không gọi theo từng item/task/skill.
- [ ] Không block roadmap hoặc learning chính.
- [ ] Handle `courses: []` như empty state hợp lệ.
- [ ] Handle `thumbnailUrl` rỗng bằng placeholder.
- [ ] Validate HTTPS và Coursera hostname trước khi mở.
- [ ] Mở bằng external browser/tab với `noopener,noreferrer` trên web.
- [ ] Hiển thị pricing disclaimer.
- [ ] Không đồng bộ Coursera với progress trong ứng dụng.
- [ ] Không đánh dấu roadmap item hoàn thành khi user mở course.

# 11. Role catalog

```http
GET /api/roles/catalog
```

Field `modelVersion` giờ phải là:

```text
dev2vec-demo-v4
```

FE không nên hard-code model version cũ.

---

# 12. Error states FE cần hỗ trợ

| HTTP/Status | Code/Reason | Hành vi FE |
|---|---|---|
| 200 | `available` / `current` | Render dữ liệu |
| 200 hoặc typed state | `analysis_required` | Hiển thị CTA phân tích |
| 200 hoặc typed state | `incompatible_analysis_history` | Báo có lịch sử cũ, cần phân tích lại |
| 409 | `incompatible_snapshot_versions` | Không render comparison |
| 200 | `insufficient_compatible_snapshots` | Cần thêm một analysis cùng version |
| 409/typed conflict | incompatible roadmap source | Yêu cầu reload role options |
| 409/typed conflict | stale/incompatible selected analysis | Refresh analysis/role list |

FE nên đọc error từ envelope hiện tại và kiểm tra thêm:

```text
comparisonStatus
analysisStatus
reason
errors
```

---

# 13. TypeScript types gợi ý

```ts
export interface Dev2VecVersionInfo {
  modelVersion?: string;
  pipelineVersion?: string;
  repoDocumentVersion?: string;
  issueDocumentVersion?: string;
  apiEvidenceVersion?: string;
}

export interface Dev2VecCompatibility extends Dev2VecVersionInfo {
  isCompatible?: boolean;
  isCurrentVersion?: boolean;
  isComparableWithCurrent?: boolean;
}

export type RoleSelectionType =
  | "current_repository_primary"
  | "portfolio_repository_primary"
  | "portfolio_suggestion";

export interface RoleOption extends Dev2VecVersionInfo {
  roleId: string;
  roleName: string;
  matchScore: number;
  matchLevel?: string;
  matchLevelLabel?: string;
  sourceRepositoryId?: string;
  sourceRepositoryName?: string;
  sourceAnalysisId?: string;
  sourceSnapshotId?: string;
  selectionType?: RoleSelectionType;
  matchedSkillNames?: string[];
  weakSkillNames?: string[];
  missingSkillNames?: string[];
  recommendedNextSkills?: string[];
}

export interface RoleSelection {
  primaryRole?: RoleOption;
  additionalRoleOptions?: RoleOption[];
  aggregationMode?: "repository_primary_roles";
  classifierInferencePerformed?: boolean;
  authoritativeScope?: "per_repository_dev2vec";
  sourceRepositoryCount?: number;
}

export interface SnapshotCompatibility extends Dev2VecCompatibility {
  analysisScope?: {
    type?: string;
  };
}

export interface FeedbackFreshness extends Dev2VecVersionInfo {
  isStale?: boolean;
  staleReason?: string | null;
  sourceModelVersion?: string;
  sourcePipelineVersion?: string;
  currentModelVersion?: string;
  currentPipelineVersion?: string;
}

export interface ChatContextMetadata {
  contextSources?: Array<
    | "authoritative_dev2vec"
    | "user_contribution"
    | "technical_repository_context"
  >;
  dev2vecAuthoritative?: boolean;
}
```

Các type trên là additive. Hãy merge với response type hiện có, không thay thế toàn bộ DTO nếu backend dùng nesting khác.

---

# 14. Các component FE nên chỉnh

## Repository analysis page

- Render primary role.
- Render top predictions hiện tại nếu đang có.
- Thêm section `additionalRoleOptions`.
- Cho user chọn role để tạo roadmap.
- Lưu provenance của role được chọn.

## Roadmap generation modal/page

- Nhận `RoleOption` thay vì chỉ nhận `roleId`.
- Gửi source repository/analysis/snapshot.
- Default về primary role nếu user không chọn.

## Snapshot history

- Hiển thị version badge.
- Disable compare với snapshot không comparable.
- Xử lý HTTP 409.

## Dashboard

- Xử lý `dev2vecStatus`.
- Không render legacy career result khi `analysis_required`.
- Dùng active roadmap progress.

## AI feedback

- Hiển thị stale badge.
- CTA regenerate.
- Không dùng stale feedback làm current recommendation.

## AI chat

- Gửi explicit repository IDs cho compare.
- Có thể hiển thị context-source badge.
- Phân biệt career advice và technical repo answer.

## Admin analysis/dashboard

- Hiển thị compatible/incompatible.
- Hiển thị model/pipeline version.
- Không kỳ vọng vectors/full documents trong response.

---

# 15. Luồng UI đề xuất

## 15.1 Analysis → role selection → roadmap

```text
User chọn repo
→ POST analysis
→ render primary role
→ render tối đa 2 portfolio role options
→ user chọn role
→ POST roadmap/generate kèm provenance
→ mở roadmap
```

## 15.2 Snapshot comparison

```text
Load snapshot history
→ user chọn snapshot A
→ filter/disable snapshot không cùng version
→ user chọn snapshot B
→ POST compare
→ nếu comparable: render delta
→ nếu 409: render version warning
```

## 15.3 Feedback

```text
Load latest feedback
→ nếu current: render bình thường
→ nếu stale: badge + regenerate CTA
→ nếu chưa có compatible analysis: redirect/CTA phân tích
```

---

# 16. Checklist cho FE

## Analysis và role

- [ ] Không tự chọn latest analysis bằng timestamp.
- [ ] Xử lý `analysis_required`.
- [ ] Primary role là role của repo hiện tại.
- [ ] Hai role bổ sung được render như portfolio options.
- [ ] Không gọi portfolio options là top-3 của cùng model run.
- [ ] Giữ provenance khi user chọn role.

## Roadmap

- [ ] Request cũ với `repoId` vẫn hoạt động.
- [ ] Request mới gửi selected role provenance.
- [ ] Không cho chọn arbitrary role catalog để tạo authoritative roadmap.
- [ ] Hiển thị source repo/role nếu phù hợp.

## Snapshots

- [ ] Hiển thị version.
- [ ] Chỉ enable compare khi compatible.
- [ ] Xử lý `incompatible_snapshot_versions`.
- [ ] Xử lý `insufficient_compatible_snapshots`.

## Dashboard/feedback

- [ ] Xử lý `dev2vecStatus`.
- [ ] Feedback stale có badge.
- [ ] Không coi feedback cũ là current.

## Chat

- [ ] Comparison gửi explicit `repositoryIds`.
- [ ] Không diễn giải package như skill cá nhân trong UI copy.
- [ ] Hỗ trợ optional context-source metadata.

## Compatibility

- [ ] Không xóa field cũ khỏi FE types.
- [ ] Field mới đều optional.
- [ ] Không hard-code pipeline v10/v11; đọc từ response.
- [ ] Không hard-code `dev2vec-demo-v1`.
- [ ] Test với user chỉ có history cũ.
- [ ] Test với user có ít hơn hai portfolio role options.
- [ ] Test snapshot khác version.
- [ ] Test roadmap request cũ và request mới.

---

# 17. Những điều FE không cần làm

FE không cần:

- tự validate SHA-256 evidence fingerprint;
- tự tính role score;
- tự phân loại matched/weak/missing skill;
- tự merge roles giữa nhiều repo;
- tự merge vectors;
- tự quyết định snapshot compatibility bằng timestamp;
- tự suy ra skill từ package list;
- thay đổi tên các field role/skill cũ.

Backend là source of truth cho các quyết định trên.

---

# 18. Ghi chú migration

Sau Batch 2, pipeline hiện tại là:

```text
dev2vec-analysis-pipeline-v12
```

Record v11 trở xuống vẫn là history nhưng không được dùng làm current authoritative record.

Vì vậy user cũ có thể cần phân tích lại repo một lần để:

- tạo analysis v12;
- tạo snapshot v12;
- dùng role option v12;
- tạo roadmap provenance v1;
- tạo feedback current.

FE nên chuẩn bị trạng thái chuyển tiếp này thay vì coi là lỗi hệ thống.
