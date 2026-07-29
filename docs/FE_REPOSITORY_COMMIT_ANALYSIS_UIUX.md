# Repository Commit Analysis UI/UX Guide

Tài liệu này hướng dẫn Frontend hiển thị kết quả phân tích commit theo contract mới của Backend. Phạm vi là màn hình Repository Detail và các lớp type/normalizer liên quan. Không được suy diễn dữ liệu khi Backend báo phạm vi fetch chưa đầy đủ.

## 1. Luồng dữ liệu

```text
GitHub branches
      ↓
Commits từ tất cả branch
      ↓
Deduplicate theo commit SHA
      ↓
Thống kê toàn bộ commit/user commit/active days
      ↓
Chọn tối đa 400 commit đại diện cho AI/Dev2Vec
      ↓
Repository Detail UI
```

Backend ghi nhận toàn bộ commit unique trong phạm vi fetch. Chỉ tập commit đưa vào AI bị giới hạn tối đa 400.

## 2. Ý nghĩa các field

| Field | Ý nghĩa | Cách hiển thị/gợi ý |
|---|---|---|
| `commitScope` | Phạm vi commit được thu thập. Giá trị mới là `all_branches`. | Badge “Tất cả branch”. |
| `totalRepoCommits` | Tổng commit unique của repository trong phạm vi đã fetch, dedupe theo SHA. | “Tổng commit đã ghi nhận”. |
| `userCommits` | Tổng commit unique được attribution cho user trên tất cả branch. | “Commit của bạn”. |
| `analyzedCommits` | Số commit thực tế đưa vào AI/Dev2Vec. Tối đa 400. | “Commit dùng để phân tích: X / Y”. |
| `activeDays` | Số ngày UTC có ít nhất một commit của user, tính trên toàn bộ `userCommits`. | “Ngày hoạt động”. |
| `analysisLimit` | Giới hạn mẫu AI hiện tại, thường là `400`. | Dùng cho tooltip hoặc accessibility text. |
| `selectionApplied` | `true` khi Backend phải chọn mẫu vì số commit vượt giới hạn. | Hiển thị tooltip giải thích sampling. |
| `selectionStrategy` | Chiến lược chọn commit, ví dụ `temporal_branch_stratified`. | Không cần hiển thị trực tiếp; dùng trong tooltip/debug. |
| `deduplication` | Cách loại trùng, hiện là `commit_sha`. | Có thể dùng trong tooltip chi tiết. |
| `activeDayDateSource` | Trường ngày dùng để tính active days, hiện là `author_date`. | Tooltip: “Tính từ authorDate”. |
| `activeDayTimezone` | Múi giờ chuẩn hóa khi tính ngày, hiện là `UTC`. | Tooltip: “Timezone: UTC”. |
| `branchesDiscovered` | Số branch phát hiện được từ GitHub. | Có thể hiển thị trong trạng thái dữ liệu nâng cao. |
| `branchesAnalyzed` | Số branch đã fetch/phân tích thành công. | Đối chiếu với `branchesDiscovered`. |
| `fetchComplete` | `true` khi fetch hoàn tất theo phạm vi yêu cầu. | Nếu false, hiển thị cảnh báo. |
| `fetchTruncated` | `true` khi dữ liệu bị cắt bởi giới hạn đồng bộ/pagination. | Nếu true, hiển thị cảnh báo. |
| `failedBranches` | Danh sách branch fetch lỗi. | Hiển thị số lượng hoặc danh sách rút gọn. |

## 3. UI đề xuất cho Repository Detail

### Summary cards

Hiển thị các nhãn sau:

- **Commit của bạn:** `userCommits ?? 0`
- **Tổng commit đã ghi nhận:** `totalRepoCommits ?? 0`
- **Ngày hoạt động:** `activeDays ?? 0`
- **Commit dùng để phân tích:** `analyzedCommits ?? 0 / userCommits ?? 0`
- **Phạm vi:** badge **Tất cả branch** khi `commitScope === "all_branches"`

Không dùng các nhãn gây hiểu nhầm như “Đóng góp của bạn / toàn dự án” nếu `fetchComplete === false` hoặc `fetchTruncated === true`. Khi dữ liệu chưa đầy đủ, dùng “đã ghi nhận trong phạm vi đồng bộ hiện tại”.

### Sampling tooltip

Khi `selectionApplied === true`, hiển thị tooltip:

> Hệ thống ghi nhận toàn bộ commit của bạn nhưng chọn tối đa 400 commit đại diện để phân tích kỹ năng.

Tooltip nên đặt trên card “Commit dùng để phân tích”, không chiếm thêm diện tích thường trực.

### Active days tooltip

Trên card “Ngày hoạt động”, thêm tooltip nhỏ:

> Tính theo `authorDate`, timezone UTC.

Chỉ hiển thị tooltip khi các field tương ứng có trong response; không cần đưa thông tin kỹ thuật này vào tiêu đề card.

### Trạng thái phạm vi và chất lượng dữ liệu

Khi `commitScope === "all_branches"`, hiển thị badge:

```text
Tất cả branch
```

Khi `fetchTruncated === true` hoặc `fetchComplete === false`, hiển thị cảnh báo:

> Dữ liệu commit có thể chưa đầy đủ do giới hạn đồng bộ từ GitHub.

Nếu `failedBranches` không rỗng, hiển thị:

- “Không thể đồng bộ X branch”, hoặc
- tối đa 3 tên branch đầu tiên và “+N branch khác”.

Danh sách đầy đủ có thể nằm trong popover/expansion panel.

## 4. Type và normalizer cần kiểm tra

Frontend cần rà soát các vị trí sau:

1. `RepositoryDetailPage.tsx`: layout cards, badge phạm vi, warning và tooltip.
2. Analysis API types: bổ sung type cho toàn bộ field trong `analysisScope`.
3. Analysis normalizer: giữ nguyên giá trị `0`, `false` và mảng rỗng; không thay thế bằng field khác.
4. Repository analysis cards: mapping từng card theo đúng field ở bảng trên.

Ví dụ type đề xuất:

```ts
type AnalysisScope = {
  commitScope?: string;
  totalRepoCommits?: number;
  userCommits?: number;
  analyzedCommits?: number;
  activeDays?: number;
  analysisLimit?: number;
  selectionApplied?: boolean;
  selectionStrategy?: string;
  deduplication?: string;
  activeDayDateSource?: string;
  activeDayTimezone?: string;
  branchesDiscovered?: number;
  branchesAnalyzed?: number;
  fetchComplete?: boolean;
  fetchTruncated?: boolean;
  failedBranches?: string[] | { branch?: string; errorCode?: string }[];
};
```

Normalizer phải dùng nullish coalescing:

```ts
const userCommits = scope.userCommits ?? 0;
const totalRepoCommits = scope.totalRepoCommits ?? 0;
const analyzedCommits = scope.analyzedCommits ?? 0;
const activeDays = scope.activeDays ?? 0;
```

Không dùng `||` cho số hoặc boolean vì sẽ làm mất giá trị hợp lệ `0` hoặc `false`.

FE tuyệt đối không fallback:

- `userCommits` thành `totalRepoCommits`;
- `totalRepoCommits` thành `analyzedCommits`;
- `analyzedCommits` thành `userCommits`.

Nếu field không có, dùng trạng thái “Chưa có dữ liệu” hoặc fallback tương thích được nêu ở phần sau, không đổi ý nghĩa field.

## 5. Empty state và fallback

### Response không có `analysisScope`

Hiển thị card “Thông tin commit chưa có” với CTA “Phân tích repository”. Không tự tính lại từ các field cũ nếu không chắc chúng cùng phạm vi dữ liệu.

### Field mới chưa có trong response

- `analyzedCommits`: hiển thị “—” và ẩn tooltip sampling.
- `commitScope`: hiển thị “Phạm vi chưa xác định”, không mặc định “Tất cả branch”.
- `fetchComplete`/`fetchTruncated`: không hiển thị warning nếu cả hai đều không có; hiển thị trạng thái “Trạng thái đồng bộ chưa xác định” ở khu vực chi tiết nếu cần.
- `failedBranches`: không render danh sách khi field không có hoặc là mảng rỗng.
- `activeDayDateSource`/`activeDayTimezone`: chỉ render tooltip khi có giá trị.

### Không có commit

Khi `userCommits ?? 0 === 0`, hiển thị:

> Chưa ghi nhận commit của bạn trong phạm vi repository đã đồng bộ.

Khi `totalRepoCommits ?? 0 === 0`, hiển thị trạng thái đồng bộ/permission phù hợp thay vì kết luận repository không có lịch sử.

## 6. Responsive UI

### Desktop

- Hiển thị 4 card thống kê trên một hàng nếu chiều rộng cho phép.
- Badge “Tất cả branch” đặt cạnh tiêu đề Repository Detail.
- Warning fetch và failed branches đặt dưới hàng summary, toàn chiều rộng.
- Tooltip mở khi hover và vẫn hỗ trợ keyboard focus.

### Mobile

- Xếp card theo một cột hoặc lưới 2 cột tùy breakpoint.
- Giữ nguyên số liệu và mẫu `analyzed / user`, không rút gọn thành phần trăm nếu gây mất ngữ cảnh.
- Badge và warning cho phép xuống dòng; không cắt tên branch bằng CSS nếu người dùng cần xem chi tiết.
- Tooltip chuyển thành tap/popover, có thể đóng bằng nút rõ ràng.
- Danh sách failed branches dùng accordion hoặc bottom sheet.

## 7. Acceptance criteria

- [ ] `userCommits`, `totalRepoCommits`, `analyzedCommits`, `activeDays` được map độc lập.
- [ ] Giá trị số `0` vẫn hiển thị là `0`, không biến thành fallback hoặc “—”.
- [ ] `analyzedCommits` không bao giờ lớn hơn `analysisLimit` khi field giới hạn có giá trị.
- [ ] Khi `selectionApplied === true`, tooltip sampling xuất hiện đúng nội dung hướng dẫn.
- [ ] Khi `fetchTruncated === true` hoặc `fetchComplete === false`, warning GitHub xuất hiện.
- [ ] Khi `failedBranches` có phần tử, UI hiển thị số branch lỗi hoặc danh sách rút gọn.
- [ ] Khi `commitScope === "all_branches"`, badge “Tất cả branch” xuất hiện.
- [ ] Tooltip active days nêu rõ `authorDate` và UTC.
- [ ] Không có UI multi-branch selector cho thao tác phân tích này; “Tất cả branch” là phạm vi Backend đã xử lý.
- [ ] Response cũ không có field mới vẫn có empty/fallback state an toàn.
- [ ] Desktop và mobile không làm mất warning, tooltip hoặc tỷ lệ `analyzed / user`.
- [ ] Không có fallback sai giữa `userCommits`, `totalRepoCommits` và `analyzedCommits`.

## 8. Nhãn UI cần đổi

Nên dùng:

- “Commit của bạn”
- “Tổng commit đã ghi nhận”
- “Ngày hoạt động”
- “Commit dùng để phân tích”
- “Tất cả branch”
- “Dữ liệu commit có thể chưa đầy đủ”

Tránh dùng:

- “Đóng góp của bạn / toàn dự án” khi fetch chưa hoàn tất.
- “Tất cả commit của bạn đã được AI phân tích” khi `selectionApplied === true`.
- “Repository có X commit” nếu `fetchComplete === false` hoặc `fetchTruncated === true`.

