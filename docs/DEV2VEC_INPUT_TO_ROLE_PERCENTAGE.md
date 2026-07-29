# Dev2Vec: từ dữ liệu repository đến phần trăm phù hợp vai trò

## 1. Phạm vi

Tài liệu này mô tả đúng pipeline Dev2Vec đang chạy trong dự án:

```text
Dữ liệu repository
  → chuẩn hóa thành 3 kênh dữ liệu
  → Doc2Vec tạo 3 vector
  → nối thành vector 580 chiều
  → Logistic Regression tính xác suất cho từng vai trò
  → backend đổi xác suất thành phần trăm
```

Năm vai trò mà model hiện phân loại là:

1. Backend
2. Frontend
3. Mobile
4. DevOps
5. Data Scientist

Model hiện tại có version `dev2vec-demo-v4`.

## 2. Dữ liệu đầu vào

Backend thu thập bằng chứng từ repository và chuyển thành ba trường đầu vào chính.

### 2.1. `repoDocument`

Đây là chuỗi văn bản đại diện cho hoạt động và nội dung repository, được xây dựng chủ yếu từ:

- metadata của repository;
- commit của người dùng, commit message và các file thay đổi;
- pull request;
- file source được xác định là đóng góp của người dùng;
- ngôn ngữ, framework và thông tin liên quan được phát hiện trong quá trình phân tích.

Kênh repository chỉ được đánh dấu có dữ liệu khi phần đóng góp của người dùng đã được xác nhận và `repoDocument` không rỗng.

### 2.2. `issueDocument`

Đây là chuỗi văn bản tạo từ các GitHub issue được cung cấp cho pipeline.

Nếu issue không được lấy, bị tắt hoặc không có nội dung, trường này là chuỗi rỗng. Khi đó model dùng zero vector cho toàn bộ kênh issue.

### 2.3. `apiTokens`

Đây là mảng token mô tả dependency/API thực sự được quy cho phần đóng góp của người dùng, ví dụ:

```json
["express", "mongoose", "jsonwebtoken", "react", "docker"]
```

Token được rút ra từ package/dependency và bằng chứng sử dụng trong source. Nếu đóng góp của người dùng chưa được xác nhận hoặc không phát hiện token phù hợp, mảng này rỗng.

### 2.4. Input gửi sang Python

Input cuối cùng có cấu trúc chính như sau:

```json
{
  "repoDocument": "...",
  "issueDocument": "...",
  "apiTokens": ["express", "mongoose"],
  "evidenceChannels": {
    "availableChannels": {
      "repo": true,
      "issue": false,
      "api": true
    }
  },
  "topN": 3
}
```

`topN` được giới hạn tối đa là 3, nên output chỉ trả tối đa ba vai trò đứng đầu.

## 3. Tạo ba vector

Dự án dùng ba model Doc2Vec độc lập:

| Kênh | Dữ liệu đưa vào Doc2Vec | Kích thước |
|---|---|---:|
| Repository | `repoDocument` | 230 |
| Issue | `issueDocument` | 150 |
| API | chuỗi tạo bởi `" ".join(apiTokens)` | 200 |

Trước khi infer, văn bản được tokenize và chuẩn hóa. Mỗi model chạy `infer_vector(..., epochs=30)` để tạo một vector số thực:

```text
v_repo  ∈ R^230
v_issue ∈ R^150
v_api   ∈ R^200
```

Nếu một kênh không có dữ liệu, model không tự suy đoán dữ liệu cho kênh đó mà tạo zero vector đúng kích thước:

```text
v_missing = [0, 0, ..., 0]
```

Ví dụ, khi không có issue:

```text
v_issue = zero vector 150 chiều
```

## 4. Ghép ba vector

Ba vector không được cộng và cũng không được lấy trung bình. Chúng được nối theo đúng thứ tự:

```text
x = concat(v_repo, v_issue, v_api)
```

Kích thước vector tổng:

```text
dim(x) = 230 + 150 + 200 = 580
```

Có thể hình dung:

```text
x = [r1, ..., r230, i1, ..., i150, a1, ..., a200]
```

Vector `x` 580 chiều là input trực tiếp của bộ phân loại vai trò.

## 5. Từ vector 580 chiều đến xác suất từng vai trò

### 5.1. Bộ phân loại

Dự án dùng `LogisticRegression` của scikit-learn, được train trên các vector 580 chiều có nhãn vai trò.

Với mỗi vai trò `k`, classifier học một vector trọng số `w_k` và bias `b_k`. Từ vector repository `x`, model tính logit:

```text
z_k = w_k · x + b_k
```

Trong đó:

- `x` là combined vector 580 chiều;
- `w_k` là trọng số model đã học cho vai trò `k`;
- `b_k` là bias của vai trò;
- `·` là tích vô hướng.

Các logit được chuyển thành xác suất bằng softmax:

```text
                 exp(z_k)
p_k = --------------------------------
      Σ_j exp(z_j)
```

Vì vậy:

```text
0 ≤ p_k ≤ 1
```

và tổng xác suất của năm vai trò xấp xỉ:

```text
p_backend
+ p_frontend
+ p_mobile
+ p_devops
+ p_data_scientist
= 1
```

Các trọng số `w_k` và bias `b_k` không phải các con số được hard-code thủ công. Chúng được Logistic Regression học trong quá trình train và lưu trong artifact `role_classifier.joblib`.

### 5.2. Công thức role score đang áp dụng

Code có hỗ trợ công thức tổng quát:

```text
finalRoleScore
= α × classifierProbability
+ β × normalizedPrototypeSimilarity
```

Tuy nhiên metadata của model hiện tại cấu hình:

```text
strategy = classifier_only
α = 1.0
β = 0.0
```

Do đó công thức thực tế đang chạy là:

```text
finalRoleScore = classifierProbability
```

Hay với từng vai trò `k`:

```text
finalRoleScore_k = p_k
```

Skill prototype similarity vẫn có thể được tính phục vụ phần skill gap, nhưng hiện không đóng góp vào phần trăm phù hợp vai trò.

## 6. Chuyển xác suất thành phần trăm

Python trả về:

```json
{
  "roleId": "backend",
  "roleName": "Backend Developer",
  "probability": 0.623456,
  "rank": 1
}
```

Backend Node.js chuyển `probability` sang `matchScore`:

```text
matchScore = round(probability × 100, 2)
```

Ví dụ:

```text
probability = 0.623456
matchScore  = round(0.623456 × 100, 2)
            = 62.35%
```

Các vai trò được sắp xếp giảm dần theo `finalRoleScore`, sau đó chỉ lấy tối đa ba vai trò đầu.

Ví dụ output:

```json
{
  "matches": [
    {
      "roleId": "backend",
      "roleName": "Backend Developer",
      "matchScore": 62.35,
      "rank": 1
    },
    {
      "roleId": "devops",
      "roleName": "DevOps Engineer",
      "matchScore": 21.4,
      "rank": 2
    },
    {
      "roleId": "frontend",
      "roleName": "Frontend Developer",
      "matchScore": 10.25,
      "rank": 3
    }
  ]
}
```

## 7. Vì sao repository khác nhau cho ra phần trăm khác nhau?

Hai repository tạo ra văn bản, dependency và bằng chứng đóng góp khác nhau. Vì vậy:

```text
repoDocument khác
  → v_repo khác

issueDocument khác
  → v_issue khác

apiTokens khác
  → v_api khác

ba vector khác
  → combined vector x khác
  → các logit z_k khác
  → xác suất p_k khác
  → matchScore khác
```

Ví dụ, repository có nhiều bằng chứng về Express, REST API, controller, MongoDB và authentication thường tạo combined vector gần vùng dữ liệu Backend mà classifier đã học. Khi đó logit Backend có xu hướng cao hơn và softmax trả xác suất Backend lớn hơn.

Đây là kết quả model học từ dữ liệu train, không phải công thức kiểu “có Express thì cộng cố định 20%”.

## 8. Ý nghĩa đúng của con số phần trăm

`matchScore` là xác suất phân loại của Logistic Regression đối với năm role mà model đã được train:

```text
matchScore_k = P(role = k | combinedVector)
```

Nó nên được hiểu là:

> Mức độ model cho rằng bằng chứng trong repository giống với mẫu của vai trò đó trong dữ liệu huấn luyện.

Nó không đồng nghĩa với:

- phần trăm kiến thức mà người dùng đã học;
- phần trăm số skill của role đã hoàn thành;
- độ chính xác tuyệt đối ngoài dữ liệu huấn luyện;
- tỷ lệ code của repository thuộc vai trò đó.

## 9. Tóm tắt công thức

```text
v_repo  = Doc2Vec_repo(repoDocument)       ∈ R^230
v_issue = Doc2Vec_issue(issueDocument)     ∈ R^150
v_api   = Doc2Vec_api(join(apiTokens))     ∈ R^200

x = concat(v_repo, v_issue, v_api)         ∈ R^580

z_k = w_k · x + b_k

p_k = exp(z_k) / Σ_j exp(z_j)

finalRoleScore_k = 1.0 × p_k + 0.0 × prototypeSimilarity_k
                 = p_k

matchScore_k = round(finalRoleScore_k × 100, 2)
```

Đó là toàn bộ đường đi chính từ dữ liệu repository đến con số phần trăm cho từng vai trò trong phiên bản model hiện tại.
