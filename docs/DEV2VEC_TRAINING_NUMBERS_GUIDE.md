# Dev2Vec v4 — Tài liệu kỹ thuật và hướng dẫn tích hợp cho BE2

Tài liệu này là hướng dẫn bàn giao Dev2Vec từ BE1 cho BE2. Nội dung mô tả đúng implementation và artifacts hiện tại, gồm nguồn dữ liệu GitHub, cách tạo ba vector, cách train top-3 role, cách tính skill gap, ý nghĩa các con số, contract JSON, cách Node.js gọi Python và các giới hạn cần biết khi đưa lên production.

Nguồn sự thật kỹ thuật của tài liệu:

- `ml_service/extractors/github_fetcher.py`
- `ml_service/extractors/repo_document.py`
- `ml_service/extractors/issues_document.py`
- `ml_service/extractors/api_document.py`
- `ml_service/train.py`
- `ml_service/infer.py`
- `ml_service/app.py`
- `ml_service/evaluate_skill_gaps.py`
- `ml_service/validate_contract.py`
- `ml_service/dataset/dataset_summary.json`
- `ml_service/artifacts/model_metadata.json`

Model hiện tại:

```text
modelVersion = dev2vec-demo-v4
datasetVersion = dev2vec-dataset-v3-contribution-gated
Python khuyến nghị = 3.12
```

## 1. Mục tiêu và phạm vi

Dev2Vec nhận evidence kỹ thuật của một developer và trả về:

1. Ba embedding riêng cho repository, issue và API/import.
2. Một combined vector 580 chiều.
3. Tối đa ba role phù hợp nhất trong năm role chuẩn.
4. Skill gap của từng role được trả về.

Dev2Vec không làm các việc sau:

- Không thay thế API contract hiện tại của FE.
- Không tự crawl GitHub trong lúc inference.
- Không train khi nhận request production.
- Không dùng keyword scoring cũ để tính role.
- Không khẳng định `probability` là xác suất tuyệt đối developer chắc chắn thuộc role đó.
- Không khẳng định skill gap hiện đã đạt chất lượng production-grade.

Năm role chuẩn:

| `modelLabel` | `roleId` | `roleName` |
|---|---|---|
| Backend | `backend` | Backend Developer |
| Frontend | `frontend` | Frontend Developer |
| Mobile | `mobile` | Mobile Developer |
| DevOps | `devops` | DevOps Engineer |
| Data Scientist | `data_scientist` | Data Scientist |

## 2. Kiến trúc tổng thể

```text
GitHub API / dữ liệu analysis hiện có trong Node.js
                    |
                    v
       repoDocument + issueDocument + apiTokens
                    |
                    v
              ml_service/infer.py
                    |
       +------------+-------------+
       |            |             |
       v            v             v
 Repo Doc2Vec  Issue Doc2Vec  API Doc2Vec
    230            150           200
       |            |             |
       +------------+-------------+
                    |
                    v
 combinedVector = repo + issue + api = 580
                    |
          +---------+----------+
          |                    |
          v                    v
 Logistic Regression    channel-weighted
 top-3 roles            skill similarity
          |                    |
          +---------+----------+
                    |
                    v
             JSON contract cho Node
                    |
                    v
       Node map vào response API cũ của FE
```

Có hai lifecycle tách biệt:

### Local/offline

```text
crawl dataset → audit dataset → train.py → evaluate → validate contract
→ commit/publish artifacts
```

### Production/Render

```text
Node build input → Python load artifacts → infer → Node map output
```

Production không chạy crawler và không chạy `train.py`. Lý do là training Doc2Vec và cross-validation tốn CPU/RAM, không phù hợp Render Free và làm request không ổn định.

## 3. Dataset v3 hiện tại lấy dữ liệu gì

Dataset dùng để train:

```text
ml_service/dataset/developers.extracted.json
```

Thống kê từ `dataset_summary.json`:

| Chỉ số | Giá trị |
|---|---:|
| Developer samples | 150 |
| Samples mỗi role | 30 |
| Tổng repository | 408 |
| Repository fetch thành công | 408 |
| Repository contribution verified | 408 |
| Repository bị reject | 0 |
| Trung bình `repoDocument` | 24,438 ký tự |
| Trung bình `issueDocument` | 6,786 ký tự |
| Trung bình `apiTokens` | 47 token |
| Sample thiếu issue | 54 |
| Sample thiếu API token | 12 |
| Sample thiếu repo document | 0 |

Mỗi sample có contract:

```json
{
  "developerId": "backend_001",
  "label": "Backend",
  "githubUsername": "github-user",
  "repositories": [
    "https://github.com/github-user/project"
  ],
  "repoDocument": "...",
  "issueDocument": "...",
  "apiTokens": ["express", "mongodb"],
  "sourceStats": {
    "repoCount": 1,
    "repoTextLength": 12000,
    "issueCount": 4,
    "issueTextLength": 2000,
    "apiTokenCount": 20
  }
}
```

`developerId` chỉ dùng làm document tag/định danh dataset. `label` là ground-truth role để train classifier. `sourceStats` dùng audit, không được nối trực tiếp vào vector classifier.

### 3.1 Contribution gate

Dataset v3 không chấp nhận repo chỉ vì repo xuất hiện trong seed. Với mỗi repo, crawler truy vấn commit theo `author=githubUsername`, đọc commit detail và pull request của user, sau đó cộng số dòng thay đổi.

Mặc định repo chỉ được dùng khi:

```text
verified changed lines >= 5
```

Điều này hạn chế trường hợp gắn một developer vào repo nổi tiếng mà không có evidence đóng góp thực tế.

Lưu ý quan trọng: `repoDocument` không phải source code user-only tuyệt đối. Nó là hybrid contribution-gated:

- Repo metadata, topics, languages và README cung cấp ngữ cảnh toàn project.
- Commit messages, pull requests và changed paths là evidence gắn với user.
- Dependency/import tokens chỉ lấy từ file version hoặc patch user thực sự chạm vào.
- Issue document chỉ giữ issue history liên quan đến user.

Nói ngắn gọn:

```text
repoDocument  = repo context sau khi contribution được xác minh
                + user commit/PR/changed-path evidence
issueDocument = user-attributed issue evidence
apiTokens     = user-touched dependency/import evidence
```

### 3.2 `repoDocument`

Với repo đã vượt contribution gate, extractor gom:

- repo name;
- full name;
- description/about;
- topics;
- primary language và danh sách languages;
- README;
- commit messages của user;
- pull request title/body của user;
- changed file paths của user.

Các giới hạn chính:

- Tối đa 30 commit được query cho mỗi repo.
- Tối đa 15 commit detail được dùng.
- Tối đa 20 changed files mỗi commit/PR.
- Tối đa 5 pull request của user trong window hiện tại.
- Tối đa khoảng 50,000 ký tự cho `repoDocument` của một developer.

README và metadata giúp nhận biết project thực hiện chức năng gì. Commit/PR/changed paths giúp nhận biết developer thực sự làm phần nào. Vì có phần context toàn repo, BE2 không nên diễn giải mọi từ trong `repoDocument` là code do user trực tiếp viết.

### 3.3 `issueDocument`

Extractor bỏ pull request ra khỏi GitHub Issues API và chỉ giữ issue khi user:

- là tác giả issue;
- được assign issue; hoặc
- có comment trong issue.

Document gồm:

- relation: authored/assigned/commented;
- issue title;
- issue body;
- labels;
- tối đa số comment của chính user theo CLI flag.

Giới hạn build document:

- Xét tối đa 30 issue từ response.
- Dùng tối đa 20 issue phù hợp.
- Mặc định tối đa 3 comment của user cho mỗi issue.
- Tối đa khoảng 30,000 ký tự cho một developer.

Nếu repo không có issue phù hợp hoặc không fetch được issue:

```text
issueDocument = ""
issueVector = zero vector 150
vectorSources.issues = false
```

Thiếu issue không làm training hoặc inference crash.

### 3.4 `apiTokens`

`apiTokens` được lấy từ file/patch gắn với contribution của user, không lấy toàn bộ dependency của organization repo một cách mù quáng.

Dependency/config parsers hỗ trợ:

- `package.json`, `package-lock.json`, yarn/pnpm lock;
- `requirements.txt`, `pyproject.toml`, `Pipfile`;
- `pom.xml`, `build.gradle`, `build.gradle.kts`;
- `pubspec.yaml`;
- `Gemfile`, `composer.json`;
- `go.mod`, `Cargo.toml`;
- `Dockerfile`;
- GitHub workflow YAML.

Source import parsers hỗ trợ:

- JavaScript/TypeScript: `import`, `require`;
- Python: `import`, `from ... import`;
- Java/Kotlin/Scala;
- Dart;
- C#;
- Rust;
- Ruby;
- Go.

Dependency token là strong evidence và được giữ trực tiếp. Import token chỉ được giữ khi lặp lại đủ số lần, mặc định:

```text
min import frequency = 5
```

Token được lowercase, normalize, deduplicate và sort. Nếu không có evidence:

```text
apiTokens = []
apiVector = zero vector 200
vectorSources.apis = false
```

### 3.5 Text cleaning

Extractor:

- lowercase text;
- bỏ URL và HTML tag;
- rút gọn code block quá dài;
- normalize whitespace;
- giữ technical token ở mức có thể;
- giới hạn kích thước document.

`train.py` tokenize lần cuối bằng:

```python
simple_preprocess(text, deacc=True, min_len=2, max_len=50)
```

Nghĩa là text được lowercase, bỏ dấu và giữ token dài từ 2 đến 50 ký tự. `apiTokens` được nối bằng dấu cách trước khi đưa vào API Doc2Vec.

## 4. Ba Doc2Vec model

Dev2Vec dùng ba model độc lập vì ba nguồn có đặc trưng ngôn ngữ khác nhau.

| Artifact | Input | Dimension | Mode | Seed full training |
|---|---|---:|---:|---:|
| `doc2vec_repo.model` | `repoDocument` | 230 | DM (`dm=1`) | 41 |
| `doc2vec_issue.model` | `issueDocument` | 150 | DM (`dm=1`) | 42 |
| `doc2vec_api.model` | chuỗi `apiTokens` | 200 | DBOW (`dm=0`) | 43 |

Cấu hình chung:

```text
min_count = 1
workers = 1
epochs = 30
window = 5
negative = 5
```

`workers=1` và seed cố định giúp kết quả reproducible hơn. Tuy vậy, khác biệt BLAS, CPU hoặc version thư viện vẫn có thể tạo sai số nhỏ; artifacts phải được coi là một bộ bất biến và deploy cùng nhau.

Trong full training, vector của developer lấy từ document tag:

```python
model.dv[developerId]
```

Trong inference, document mới không có tag nên dùng:

```python
model.infer_vector(tokens, epochs=30)
```

Runtime đặt seed riêng:

```text
repo inference seed  = 1101
issue inference seed = 1102
api inference seed   = 1103
```

## 5. Vector dimension và missing-channel fallback

Dimensions là shared contract bắt buộc:

```json
{
  "repo": 230,
  "issue": 150,
  "api": 200,
  "combined": 580
}
```

Thứ tự concat:

```text
combinedVector = repoVector + issueVector + apiVector
```

Dấu `+` ở đây là concatenate, không phải cộng số học và không phải average:

```text
[230 phần tử] + [150 phần tử] + [200 phần tử]
= [580 phần tử]
```

Fallback:

| Input thiếu | Runtime tạo | Source flag |
|---|---:|---|
| `repoDocument == ""` | 230 số `0` | `repos: false` |
| `issueDocument == ""` | 150 số `0` | `issues: false` |
| `apiTokens == []` | 200 số `0` | `apis: false` |

Classifier luôn nhận đúng 580 chiều. `validate_contract.py` kiểm tra cả chiều vector, thứ tự concat, zero fallback và giới hạn topN.

## 6. Missing-channel augmentation

Dataset thật có 54 sample không có issue và 12 sample không có API token. Để classifier chịu được production input thiếu nguồn, training hiện bật:

```text
--missing-channel-augmentation
```

Mỗi vector training sinh bốn biến thể:

1. Có đủ repo + issue + API.
2. Zero issue.
3. Zero API.
4. Chỉ repo, zero issue và API.

Do đó:

```text
150 developer samples × 4 variants = 600 classifier samples
```

Augmentation chỉ phục vụ classifier; nó không tạo dữ liệu GitHub giả và không thay đổi label role.

Lưu ý khi audit metadata hiện tại: `artifactCompatibility.missingChannelSupportNote` vẫn là một note legacy nói training script chưa áp dụng augmentation. Trạng thái thực tế phải đọc từ các field có cấu trúc:

```text
trainingStrategy = missing-channel-augmentation
dataset.missingChannelAugmentation = true
dataset.classifierSampleCount = 600
```

BE2 không nên dùng chuỗi note legacy đó để quyết định bật/tắt inference.

## 7. Cách train và đánh giá role classifier

### 7.1 Cross-validation chống leakage

Role metrics không lấy từ accuracy trên chính training set. `train.py` chạy 5-fold `StratifiedGroupKFold`:

- `stratified`: giữ phân bố năm role tương đối cân bằng;
- `group`: samples dùng chung repo phải nằm cùng fold;
- `random_state = 42`;
- Doc2Vec được train lại chỉ bằng fold train;
- document ở fold test dùng `infer_vector`, không dùng document vector đã học sẵn;
- Logistic Regression cũng chỉ train trên fold train.

Thiết kế này hạn chế hai leakage phổ biến:

1. Cùng repo xuất hiện ở train và test.
2. Doc2Vec đã nhìn thấy document test trước khi đánh giá.

Sau khi đo out-of-fold metrics, hệ thống train lại ba Doc2Vec và classifier trên toàn bộ 150 samples để sinh artifacts deploy.

### 7.2 Logistic Regression

Classifier:

```python
LogisticRegression(
    max_iter=2000,
    random_state=42,
    solver="lbfgs"
)
```

Input:

```text
combinedVector: 580 số thực
```

Target:

```text
Backend | Frontend | Mobile | DevOps | Data Scientist
```

Khái quát với role `k`:

```text
logit(k) = W(k) · combinedVector + b(k)
```

`predict_proba` chuẩn hóa logits thành phân bố xác suất năm role. Runtime sắp xếp giảm dần và lấy tối đa ba role.

Role scoring artifacts hiện tại:

```json
{
  "strategy": "classifier_only",
  "alpha": 1.0,
  "beta": 0.0,
  "calibrationMethod": "none"
}
```

Code có khả năng hybrid classifier/prototype, nhưng v4 hiện dùng:

```text
finalRoleScore = 1.0 × classifierProbability
               + 0.0 × prototypeSimilarity
```

Vì vậy `rolePredictions[].probability` là Logistic Regression probability chưa calibration. BE2 được map nó thành phần trăm, nhưng không nên mô tả là độ chính xác tuyệt đối của cá nhân.

### 7.3 Role metrics hiện tại

Out-of-fold metrics trên 150 samples:

| Metric | Giá trị |
|---|---:|
| Accuracy | 0.920000 |
| Balanced accuracy | 0.920000 |
| Macro F1 | 0.918140 |
| Weighted F1 | 0.918140 |
| Top-3 accuracy | 0.980000 |
| Log loss | 0.280653 |

Per-role:

| Role | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| Backend | 0.923077 | 0.800000 | 0.857143 | 30 |
| Frontend | 0.882353 | 1.000000 | 0.937500 | 30 |
| Mobile | 0.961538 | 0.833333 | 0.892857 | 30 |
| DevOps | 0.909091 | 1.000000 | 0.952381 | 30 |
| Data Scientist | 0.935484 | 0.966667 | 0.950820 | 30 |

Confusion matrix, hàng là label thật và cột là prediction:

```text
                    Predicted
True          BE   FE   Mobile  DevOps  DS
Backend       24    2      0       3    1
Frontend       0   30      0       0    0
Mobile         2    2     25       0    1
DevOps         0    0      0      30    0
Data Scientist 0    0      1       0   29
```

Top-3 accuracy 0.98 nghĩa là 98% samples có role thật nằm trong ba role đầu. Nó không có nghĩa mỗi probability của output chính xác 98%.

## 8. Skill prototypes và skill vectors

Role classifier và skill gap là hai bài toán khác nhau.

- Role classifier học từ 150 developer labels.
- Skill gap so vector developer với 25 prototype định nghĩa trong `train.py`.

Mỗi role có năm skills:

| Role | Skills |
|---|---|
| Backend | REST API, Database, Authentication, API Testing, Docker Basics |
| Frontend | React UI, Component Design, State Management, Frontend Testing, Responsive Design |
| Mobile | Mobile UI, Navigation, Local Storage, API Integration, App State Management |
| DevOps | Docker, Kubernetes, CI/CD, Infrastructure as Code, Monitoring |
| Data Scientist | Data Analysis, Machine Learning, Model Training, Data Visualization, NLP Basics |

Mỗi prototype có:

```json
{
  "skillName": "Database",
  "canonicalSkillName": "Database",
  "roleIds": ["backend"],
  "repoSkillDocument": "...",
  "issueSkillDocument": "...",
  "apiSkillTokens": ["postgresql", "mysql", "mongodb"]
}
```

`skill_prototypes.json` lưu định nghĩa có thể đọc. `skill_vectors.json` lưu ba vector prototype và combined vector được tạo bằng chính ba Doc2Vec artifacts. Vì vậy khi retrain Doc2Vec, `skill_vectors.json` phải được sinh lại cùng lần train; không được trộn skill vectors của model version cũ với model mới.

## 9. Công thức skill-gap v4

V4 không dùng một cosine duy nhất trên combined vector. Nó tính từng channel:

```text
repoScore  = max(0, cosine(repoVector, repoSkillVector))
issueScore = max(0, cosine(issueVector, issueSkillVector))
apiScore   = min(1, matchedApiTokenCount / 2)
```

Trọng số:

```text
repo  = 0.35
issue = 0.15
api   = 0.50
```

Khi đủ ba nguồn:

```text
skillScore = 0.35 × repoScore
           + 0.15 × issueScore
           + 0.50 × apiScore
```

Khi thiếu channel, runtime bỏ trọng số channel đó khỏi mẫu số rồi normalize lại:

```text
skillScore = Σ(weight(channel) × score(channel))
             / Σ(weight(channel khả dụng))
```

Ví dụ chỉ có repo và API:

```text
skillScore = (0.35 × repoScore + 0.50 × apiScore) / 0.85
```

Điều này tránh việc developer bị hạ điểm chỉ vì repo không có issue phù hợp.

API overlap cho 0.5 khi khớp một token và 1.0 khi khớp từ hai token trở lên. Matching normalize lowercase, `_` thành `-`, đồng thời hỗ trợ package path có chứa alias đủ dài.

### 9.1 Threshold đã hiệu chỉnh

Threshold trong `model_metadata.json`:

```json
{
  "weak": 0.125,
  "matched": 0.3
}
```

Mapping:

| Khoảng score | Dev2Vec status | Output list |
|---|---|---|
| `score >= 0.30` | `matched` | `matchedSkillNames` |
| `0.125 <= score < 0.30` | `weak` | `weakSkillNames` |
| `score < 0.125` | `missing` | `missingSkillNames` |

`recommendedNextSkills` hiện được tạo đơn giản:

```text
first 5 of (missingSkillNames + weakSkillNames)
```

Đây không phải hard-coded `NEXT_SKILL_PRIORITY` theo role. Nó dùng thứ tự skill prototype hiện tại, ưu tiên missing trước weak.

### 9.2 Skill-gap evaluation

Skill annotations có bốn label:

```text
verified
partial_evidence
not_observed
unknown
```

Mapping evaluator:

```text
matched → verified
weak    → partial_evidence
missing → not_observed
```

Threshold được chọn trên validation set và test chỉ được mở sau khi threshold đã khóa.

Validation:

| Metric | Giá trị |
|---|---:|
| Reviewed annotations | 145 |
| Accuracy | 0.751724 |
| Macro F1 | 0.668024 |
| Weighted F1 | 0.745580 |

Held-out test:

| Metric | Giá trị |
|---|---:|
| Annotations | 100 |
| Accuracy | 0.610000 |
| Macro F1 | 0.596838 |
| Weighted F1 | 0.619460 |

Held-out confusion matrix theo thứ tự `verified`, `partial_evidence`, `not_observed`:

```text
[
  [22,  4,  0],
  [ 2,  8, 13],
  [ 3, 17, 31]
]
```

Giới hạn bắt buộc phải ghi khi bàn giao:

- 100 test annotations là Codex-reviewed project ground truth theo yêu cầu project owner.
- Đây không phải independent expert-adjudicated ground truth.
- Skill-gap hiện đạt mức demo/beta, chưa đủ bằng chứng để tuyên bố production-grade.
- Lớp `partial_evidence` khó phân biệt nhất.
- Không được tune lại threshold dựa trên held-out test này; làm vậy sẽ gây test leakage.

## 10. Ý nghĩa chính xác của các con số output

### `probability`

```text
rolePredictions[i].probability
```

Là classifier score của role trong input hiện tại. V4 chưa probability calibration. Không dùng nó như accuracy của model và không so trực tiếp với skill similarity.

### `matchScore`

Python không trả `matchScore`. Node map:

```text
matchScore = probability × 100
```

Ví dụ:

```text
probability = 0.723456
matchScore  = 72.35 sau khi Node làm tròn
```

### `similarity`

```text
skillGaps[roleId].details[i].similarity
```

Trong v4 đây là `channel_weighted_v1` score trong khoảng 0..1, không còn là raw cosine combined-vector. Node có thể hiển thị:

```text
skillDisplayScore = similarity × 100
```

Không được dùng role `probability` làm skill score và không được dùng skill `similarity` làm role score.

### Accuracy/F1

Accuracy/F1 trong metadata là metric của tập evaluation, không phải field cho từng user request.

## 11. Python inference input contract

Input bắt buộc là JSON object:

```json
{
  "requestId": "analysis-123",
  "repoDocument": "backend api controller database commit paths",
  "issueDocument": "fix token expiry and endpoint response",
  "apiTokens": ["express", "mongoose", "jsonwebtoken"],
  "topN": 3
}
```

Field rules:

| Field | Type | Rule |
|---|---|---|
| `requestId` | string, optional | Trace request phía Node |
| `repoDocument` | string | Có thể `""` |
| `issueDocument` | string | Có thể `""` |
| `apiTokens` | string array | Có thể `[]` |
| `topN` | integer | Python clamp về 1..3 |

Runtime còn hỗ trợ optional metadata:

```json
{
  "evidenceChannels": {
    "availableChannels": {
      "repo": true,
      "issue": false,
      "api": true
    },
    "channelStatus": {
      "repo": "available",
      "issue": "not_fetched",
      "api": "available"
    }
  }
}
```

Nếu `evidenceChannels` không có, Python suy ra availability từ document/token có rỗng hay không. Nếu Node đánh dấu channel `false`, Python chủ động dùng zero vector cho channel đó ngay cả khi payload còn text.

Shared contract khóa tối đa ba role. Python luôn enforce 1..3. Một số helper Node hiện clamp input đến 5, nhưng Python vẫn chỉ trả tối đa 3; BE2 nên gửi `topN: 3` và giới hạn response FE tối đa ba items để contract nhất quán.

## 12. Python inference output contract

Success output:

```json
{
  "success": true,
  "modelVersion": "dev2vec-demo-v4",
  "vectorDims": {
    "repo": 230,
    "issue": 150,
    "api": 200,
    "combined": 580
  },
  "vectors": {
    "repoVector": [],
    "issueVector": [],
    "apiVector": [],
    "combinedVector": []
  },
  "rolePredictions": [
    {
      "roleId": "backend",
      "roleName": "Backend Developer",
      "modelLabel": "Backend",
      "probability": 0.72,
      "rank": 1
    }
  ],
  "skillGaps": {
    "backend": {
      "matchedSkillNames": ["REST API"],
      "weakSkillNames": ["Database"],
      "missingSkillNames": ["API Testing"],
      "recommendedNextSkills": ["API Testing", "Database"],
      "details": [
        {
          "skillName": "REST API",
          "canonicalSkillName": "REST API",
          "similarity": 0.48,
          "status": "matched"
        }
      ]
    }
  },
  "vectorSources": {
    "repos": true,
    "issues": false,
    "apis": true
  },
  "sourceStats": {
    "repoTextLength": 100,
    "issueTextLength": 0,
    "apiTokenCount": 3
  }
}
```

Các vector array trong ví dụ được rút gọn; output thật có đủ 230/150/200/580 phần tử. `skillGaps` chỉ chứa key của các role được trả trong `rolePredictions`.

Error output từ CLI:

```json
{
  "success": false,
  "errorCode": "DEV2VEC_INFERENCE_FAILED",
  "message": "short error message",
  "modelVersion": null
}
```

Quy tắc stdout/stderr:

- `infer.py` stdout luôn chỉ có một JSON document.
- Warning, timing và exception phải đi stderr.
- Node không được merge stderr vào stdout trước `JSON.parse`.
- CLI trả exit code khác 0 khi lỗi, nhưng Node vẫn nên parse stdout để lấy structured error nếu có.

## 13. Node.js tích hợp với Python

Trong repository hiện tại, các thành phần adapter nằm ở:

```text
src/services/dev2vec/dev2vecInputBuilder.service.js
src/services/dev2vec/dev2vec.service.js
src/services/dev2vec/dev2vecRoleMapper.service.js
src/services/dev2vec/dev2vecStatus.service.js
src/services/dev2vec/sourceUsageParser.service.js
```

BE2 nên giữ ba responsibility tách biệt:

1. Input builder chỉ xây `repoDocument`, `issueDocument`, `apiTokens` và metadata.
2. Python client chỉ gọi worker/process, parse và validate contract.
3. Role mapper chỉ map output Python sang response API cũ.

Không đưa công thức scoring role cũ vào input builder hoặc mapper.

### 13.1 Build input trong Node

Input production phải cùng semantics với dataset train:

#### `repoDocument`

Ưu tiên evidence contribution của user:

- repository name/full name/description/language/topics để làm context;
- commit messages gắn với user;
- changed paths gắn với user;
- source/config snippets từ file user chạm vào;
- README chỉ là project context, không phải bằng chứng user viết toàn bộ project.

#### `issueDocument`

Chỉ gom issue user authored/assigned/commented khi có thể. Không lấy toàn bộ issue organization repo rồi coi là evidence cá nhân.

#### `apiTokens`

Ưu tiên dependency/import từ source/config file user chạm vào. Normalize lowercase, deduplicate và tránh token nội bộ vô nghĩa.

Nếu production builder dùng scope khác dataset train, distribution shift sẽ làm probability và skill gap kém tin cậy.

### 13.2 Cách gọi khuyến nghị: persistent HTTP worker

Production ưu tiên `ml_service/app.py` vì artifacts chỉ load một lần khi worker start:

```text
GET  /health
POST /infer
```

Start local:

```bash
DEV2VEC_SERVICE_HOST=127.0.0.1 \
DEV2VEC_SERVICE_PORT=8001 \
python3.12 ml_service/app.py
```

Health:

```bash
curl http://127.0.0.1:8001/health
```

Inference:

```bash
curl -X POST http://127.0.0.1:8001/infer \
  -H 'Content-Type: application/json' \
  -d '{
    "requestId":"manual-check",
    "repoDocument":"backend api database",
    "issueDocument":"",
    "apiTokens":["express","mongodb"],
    "topN":3
  }'
```

`app.py` dùng lock vì `Doc2Vec.infer_vector` thay đổi RNG state. Mặc định concurrency thấp giúp cùng input/artifacts cho kết quả ổn định hơn.

### 13.3 Fallback: Python process per request

Khi HTTP worker chưa chạy, Node adapter có thể:

1. Chuẩn hóa input.
2. Ghi JSON vào file tạm.
3. Gọi `python ml_service/infer.py --input <temp-file>` bằng `execFile`.
4. Parse stdout.
5. Xóa file tạm trong `finally`.

Không dùng shell interpolation cho JSON hoặc requestId. `execFile` an toàn hơn `exec` và tránh lỗi quoting giữa macOS/Linux/Windows.

CLI hỗ trợ stdin để test:

```bash
printf '%s' '{"repoDocument":"","issueDocument":"","apiTokens":[],"topN":3}' \
  | python3.12 ml_service/infer.py --input -
```

Process-per-request phải load artifacts mỗi lần nên chậm hơn persistent worker. Chỉ dùng làm local mode hoặc fallback.

### 13.4 Environment variables

Khuyến nghị production:

```text
DEV2VEC_ENABLED=true
DEV2VEC_PYTHON_BIN=/opt/venv/bin/python
DEV2VEC_INFER_PATH=ml_service/infer.py
DEV2VEC_TIMEOUT_MS=30000
DEV2VEC_MAX_BUFFER_BYTES=10485760
DEV2VEC_ARTIFACTS_DIR=ml_service/artifacts
DEV2VEC_SERVICE_URL=http://127.0.0.1:8001
DEV2VEC_SERVICE_PORT=8001
DEV2VEC_SERVICE_TIMEOUT_MS=30000
DEV2VEC_SERVICE_FALLBACK_ENABLED=true
DEV2VEC_SERVICE_CONCURRENCY=1
```

Không đặt `GITHUB_TOKEN` trong inference worker nếu production không crawl GitHub. Không commit `.env`.

### 13.5 Validate Python output trong Node

Trước khi map, kiểm tra tối thiểu:

```text
output là object
output.success === true
output.vectorDims đúng 230/150/200/580
output.rolePredictions là array, length 1..3
roleId thuộc danh sách chuẩn
rank tăng từ 1
probability là số hữu hạn
skillGaps là object
skillGaps có key cho mỗi returned roleId
vector arrays có đúng chiều nếu được lưu
```

Nếu HTTP worker trả lỗi:

- 400: input không hợp lệ;
- 413: body vượt giới hạn;
- 503: worker busy;
- 500: inference/artifact error.

Node nên map lỗi service thành 502/503 phù hợp, log `requestId`, error code và stderr preview, nhưng không log toàn bộ source document hoặc token nhạy cảm.

## 14. Mapping sang API cũ của FE

Với mỗi prediction:

```text
matchScore = probability × 100
matchedSkillNames = skillGaps[roleId].matchedSkillNames
weakSkillNames = skillGaps[roleId].weakSkillNames
missingSkillNames = skillGaps[roleId].missingSkillNames
recommendedNextSkills = skillGaps[roleId].recommendedNextSkills
```

Ví dụ mapper:

```js
const prediction = output.rolePredictions[0];
const gap = output.skillGaps[prediction.roleId] || {};

const match = {
  roleId: prediction.roleId,
  roleName: prediction.roleName,
  matchScore: Math.round(prediction.probability * 10000) / 100,
  matchedSkillNames: gap.matchedSkillNames || [],
  weakSkillNames: gap.weakSkillNames || [],
  missingSkillNames: gap.missingSkillNames || [],
  recommendedNextSkills: gap.recommendedNextSkills || []
};
```

Không đổi tên các field FE chính:

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

`matchLevel` và `matchLevelLabel` là presentation mapping của Node, không phải output model. BE2 có thể giữ ngưỡng API hiện tại nhưng phải ghi rõ đó là UI/business categorization, không phải threshold học bởi Logistic Regression.

Không dùng lại:

- hard-coded skill weight/confidence để tính role;
- required/optional formula cũ để thay probability;
- keyword score để override top-3 classifier;
- hard-coded `NEXT_SKILL_PRIORITY` để thay output Python.

Nếu business layer dùng deterministic evidence để giải thích kết quả, evidence đó nên được hiển thị riêng và không âm thầm thay đổi probability.

## 15. Artifact contract

Production cần đồng bộ các file:

```text
ml_service/artifacts/doc2vec_repo.model
ml_service/artifacts/doc2vec_issue.model
ml_service/artifacts/doc2vec_api.model
ml_service/artifacts/role_classifier.joblib
ml_service/artifacts/label_encoder.joblib
ml_service/artifacts/skill_prototypes.json
ml_service/artifacts/skill_vectors.json
ml_service/artifacts/model_metadata.json
```

Ý nghĩa:

| Artifact | Tác dụng |
|---|---|
| Repo/Issue/API `.model` | Token/text → embedding từng channel |
| `role_classifier.joblib` | Combined vector → probability năm role |
| `label_encoder.joblib` | Encoded class ↔ model label |
| `skill_prototypes.json` | Định nghĩa human-readable của 25 skills |
| `skill_vectors.json` | Prototype embeddings dùng khi inference |
| `model_metadata.json` | Version, dims, metrics, scoring weights, thresholds |

Không copy riêng classifier mà bỏ ba Doc2Vec model. Không dùng metadata v4 với model v3. Khi nâng model version, deploy toàn bộ folder artifacts như một atomic release.

Worker nên fail fast nếu:

- thiếu artifact;
- classifier input dimension không phải 580;
- metadata `vectorDims` không đúng contract;
- vector chứa NaN/Infinity.

## 16. Các lệnh local/offline

### Cài môi trường Python 3.12

```bash
python3.12 -m venv ~/.venvs/wdp-g3-py312
source ~/.venvs/wdp-g3-py312/bin/activate
python -m pip install --upgrade pip
python -m pip install -r ml_service/requirements.txt
```

### Crawl dataset

```bash
export GITHUB_TOKEN="your-token"

python ml_service/extractors/github_fetcher.py \
  --seed ml_service/dataset/developers.seed.json \
  --output ml_service/dataset/developers.extracted.json \
  --summary ml_service/dataset/dataset_summary.json \
  --max-commits 30 \
  --max-issues 30 \
  --max-comments 3 \
  --sleep 0.2
```

Crawler dùng nhiều GitHub requests. HTTP 429 có thể là secondary rate limit dù core remaining vẫn còn. Khi đó tăng `--sleep`, chờ rồi dùng `--resume` hoặc chạy lại một developer với `--developer-id`.

### Train artifacts

```bash
python ml_service/train.py \
  --dataset ml_service/dataset/developers.extracted.json \
  --cv-folds 5 \
  --missing-channel-augmentation
```

### Kiểm tra annotations

```bash
python ml_service/evaluate_skill_gaps.py --check-only
```

Held-out test v4 đã được đánh giá và ghi metadata. Không chạy lại `--evaluate-test --write-metadata` để thử nhiều threshold trên cùng test set.

### Validate contract

```bash
python ml_service/validate_contract.py
```

Kỳ vọng:

```text
PASS: Dev2Vec contract valid (3 scenarios)
```

### Test inference

```bash
python ml_service/infer.py --input temp/dev2vec_input.json
```

### Xem metadata

```bash
python -m json.tool ml_service/artifacts/model_metadata.json
```

## 17. Quy trình nâng version model

Khi dataset, prototype, vector dimension, scoring hoặc classifier thay đổi:

1. Chốt extraction semantics trước khi crawl.
2. Validate seed: unique developer ID, đúng năm labels, contribution thật.
3. Crawl full dataset và audit `dataset_summary.json`.
4. Không train nếu có fetch failure/rejected contribution chưa giải thích.
5. Train với group-aware CV.
6. Kiểm tra role accuracy, macro F1, top-3 accuracy, log loss và confusion matrix.
7. Tạo validation/test annotations mới nếu thay đổi skill scoring đáng kể.
8. Tune threshold chỉ trên validation.
9. Mở test đúng một lần.
10. Tăng `MODEL_VERSION` trong train/infer và sinh lại toàn bộ artifacts.
11. Chạy `validate_contract.py` trong môi trường Python giống production.
12. Deploy artifacts atomically và verify `/health` trả đúng version.

Không gọi một model là version mới chỉ vì sửa chuỗi `modelVersion`; version mới phải tương ứng một bộ artifacts và metadata nhất quán.

## 18. Monitoring và vận hành

Nên theo dõi:

- artifact version;
- worker warm/cold;
- artifact load time;
- total inference latency;
- timeout/error rate;
- input source availability;
- phân bố top-1 role theo thời gian;
- tỷ lệ repo/issue/API channel rỗng;
- tỷ lệ matched/weak/missing mỗi skill;
- drift so với dataset train.

Không log full vectors và full source documents trong production trừ chế độ debug có kiểm soát. Chúng làm log lớn và có thể chứa nội dung repository nhạy cảm.

Cache key nên bao gồm ít nhất:

```text
modelVersion
input/evidence fingerprint
input-builder version
topN
```

Khi model version thay đổi, cache kết quả cũ phải được invalidate hoặc phân biệt theo version.

## 19. Troubleshooting

### `ModuleNotFoundError`

Đang chạy sai Python/venv. Kiểm tra:

```bash
which python
python --version
python -m pip install -r ml_service/requirements.txt
```

### stdout không phải JSON

Không in debug vào stdout trong `infer.py`. Node phải parse riêng stdout và stderr.

### Vector dimension mismatch

Artifacts và code runtime khác version hoặc copy thiếu file. Deploy lại toàn bộ artifacts.

### Role probability thấp

Không tự cộng keyword score. Kiểm tra input builder có đúng extraction semantics, channel availability, document length và API token normalization hay không.

### Skill không đạt threshold dù repo có công nghệ đó

Kiểm tra evidence có thực sự thuộc contribution của user không. Skill v4 dùng API overlap mạnh nhất; dependency toàn repo nhưng user không chạm vào không nên tự động được coi là skill cá nhân.

### HTTP 429 khi crawl

Đây thường là GitHub secondary/abuse rate limit, không nhất thiết core limit đã hết. Tăng delay, giảm request burst và resume sau.

### Worker busy

`app.py` serialize model inference để giữ deterministic RNG. Scale theo process/instance thay vì tăng thread vô hạn trên cùng model object.

## 20. Trạng thái sẵn sàng bàn giao

### Có thể bàn giao để BE2 tích hợp

- Input/output contract đã có.
- Python khóa topN tối đa 3.
- Vector dims và concat order đã validate.
- Missing source dùng zero vector.
- Artifacts v4 đã train.
- Role top-3 metrics đủ cho integration/demo.
- Skill thresholds đã ghi metadata.
- `validate_contract.py` pass ba scenarios.

### Chưa nên tuyên bố toàn bộ production-grade

- Role prediction là integration-ready với OOF metrics tốt.
- Skill gap là demo/beta quality: held-out accuracy 61%, macro F1 khoảng 59.68%.
- Skill held-out labels chưa được chuyên gia độc lập adjudicate.
- Probability role chưa calibration.

Thông điệp bàn giao khuyến nghị:

```text
Dev2Vec v4 role prediction is integration-ready.
Skill-gap output is available for beta/demo use and must be presented as
recommendation evidence, not as an absolute assessment of a developer.
```

## 21. Checklist BE2 trước khi merge/deploy

- [ ] Dùng Python 3.12 và cài đúng `ml_service/requirements.txt`.
- [ ] Có đủ toàn bộ artifacts v4.
- [ ] `model_metadata.json.modelVersion == dev2vec-demo-v4`.
- [ ] Input builder dùng contribution-oriented evidence đúng semantics dataset.
- [ ] Gửi `topN: 3`.
- [ ] Không merge stderr vào stdout.
- [ ] Validate output trước khi map.
- [ ] Map `matchScore = probability * 100`.
- [ ] Lấy skill gap bằng đúng `skillGaps[prediction.roleId]`.
- [ ] Giữ nguyên các FE response fields hiện tại.
- [ ] Không reintroduce scoring role cũ.
- [ ] Production chỉ inference, không crawl/train.
- [ ] Ưu tiên persistent HTTP worker, process mode chỉ fallback.
- [ ] Timeout, max buffer và temp-file cleanup đã cấu hình.
- [ ] Cache có model version và evidence fingerprint.
- [ ] Health check trả đúng artifact version.
- [ ] Chạy `python ml_service/validate_contract.py` thành công.
- [ ] UI/tài liệu ghi skill gap là beta/recommendation, không phải kết luận tuyệt đối.

## 22. Kết luận ngắn cho BE2

BE2 không cần biết chi tiết thuật toán để gọi model, nhưng phải giữ đúng ba điều:

1. Xây input cùng semantics với dataset: repo context đã contribution-gated, issue của user và API/import từ file user chạm vào.
2. Tôn trọng contract 230 + 150 + 200 = 580, topN tối đa 3 và zero-vector khi thiếu nguồn.
3. Chỉ map output Python vào API cũ; không tính lại role bằng scoring hard-code.

Nếu ba điều này được giữ, BE2 có thể thay đổi transport, caching hoặc presentation mà không làm lệch Dev2Vec model contract.
