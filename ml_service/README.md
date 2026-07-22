# Dev2Vec ML Service — Hướng dẫn cho BE2

## 1. Mục đích

`ml_service` phân tích dữ liệu kỹ thuật của một developer để:

- tạo ba vector Doc2Vec từ repository, issue và dependency/API;
- dự đoán top role bằng Logistic Regression;
- so sánh vector developer với skill prototype để tạo skill gaps;
- trả một JSON contract ổn định để Node.js BE map vào response hiện tại của FE.

Đây là model demo được train từ 75 developer samples, không nên diễn giải
probability như độ chính xác tuyệt đối.

## 2. Kiến trúc

```text
GitHub/repository data
        |
        v
repoDocument + issueDocument + apiTokens
        |
        v
ml_service/infer.py
        |
        +-- Repo Doc2Vec  -> repoVector     (230)
        +-- Issue Doc2Vec -> issueVector    (150)
        +-- API Doc2Vec   -> apiVector      (200)
        |
        v
combinedVector = repoVector + issueVector + apiVector (580)
        |
        +-- Logistic Regression -> top role predictions
        +-- Cosine similarity   -> skill gaps
        |
        v
JSON stdout -> Node.js BE -> existing FE response
```

Ba vector luôn được **concatenate đúng thứ tự**, không average:

```text
combinedVector = repoVector + issueVector + apiVector
```

Nếu một nguồn thiếu, service dùng zero vector đúng kích thước:

| Nguồn thiếu | Vector thay thế | `vectorSources` |
|---|---:|---|
| `repoDocument == ""` | 230 số `0` | `repos: false` |
| `issueDocument == ""` | 150 số `0` | `issues: false` |
| `apiTokens == []` | 200 số `0` | `apis: false` |

## 3. Cấu trúc thư mục

```text
ml_service/
  requirements.txt
  README.md
  dataset/
    developers.seed.json
    developers.extracted.json
    dataset_summary.json
  extractors/
    repo_document.py
    issues_document.py
    api_document.py
    github_fetcher.py
    text_cleaner.py
  train.py
  infer.py
  validate_contract.py
  artifacts/
    doc2vec_repo.model
    doc2vec_issue.model
    doc2vec_api.model
    role_classifier.joblib
    label_encoder.joblib
    skill_prototypes.json
    skill_vectors.json
    model_metadata.json
```

## 4. Cài đặt local

Chạy từ thư mục root của backend:

```bash
python3 -m pip install -r ml_service/requirements.txt
```

Dependencies chính: `gensim`, `scikit-learn`, `joblib`, `numpy` và
`requests`.

## 5. Dataset crawler

Crawler lấy dữ liệu thật từ GitHub: repo metadata, topics, languages, README,
dependency/config, commit messages, changed file paths, issues và comments.

Nên cấu hình token để tránh rate limit:

```bash
export GITHUB_TOKEN="your-token"
```

Không commit token vào Git.

Chạy crawler:

```bash
python3 ml_service/extractors/github_fetcher.py \
  --seed ml_service/dataset/developers.seed.json \
  --output ml_service/dataset/developers.extracted.json \
  --summary ml_service/dataset/dataset_summary.json \
  --max-commits 30 \
  --max-issues 30 \
  --max-comments 3 \
  --sleep 0.2
```

PowerShell:

```powershell
$env:GITHUB_TOKEN = "your-token"
python ml_service/extractors/github_fetcher.py `
  --seed ml_service/dataset/developers.seed.json `
  --output ml_service/dataset/developers.extracted.json `
  --summary ml_service/dataset/dataset_summary.json
```

Warnings/progress đi vào stderr. Hai output file luôn là JSON thuần.

## 6. Training — chỉ chạy local/offline

```bash
python3 ml_service/train.py \
  --dataset ml_service/dataset/developers.extracted.json \
  --cv-folds 5 \
  --missing-channel-augmentation
```

Training thực hiện:

1. đánh giá out-of-fold bằng stratified group 5-fold cross-validation;
2. giữ các developer dùng chung repository trong cùng fold để tránh data leakage;
3. train lại ba Doc2Vec chỉ trên phần train của từng fold và infer vector cho phần test;
4. đo accuracy, balanced accuracy, macro/weighted F1, top-3 accuracy, log loss,
   per-role precision/recall/F1 và confusion matrix;
5. train Repo Doc2Vec với 230 dimensions, Issue Doc2Vec với 150 dimensions và
   API Doc2Vec với 200 dimensions trên toàn dataset;
6. concat theo thứ tự repo + issue + api thành vector 580 dimensions;
7. train Logistic Regression cho 5 roles; tùy chọn missing-channel augmentation
   giúp classifier học cả trường hợp issue/API bị thiếu;
8. sinh 25 skill prototypes/skill vectors và ghi artifacts vào
   `ml_service/artifacts/`.

Các metric thật được ghi tại:

```txt
model_metadata.json -> roleScoring.metrics
```

Không dùng accuracy trên chính training samples để đánh giá chất lượng. Metric
được ghi là dự đoán out-of-fold của toàn bộ dataset.

Sau khi train, kiểm tra metadata:

```bash
python3 -m json.tool ml_service/artifacts/model_metadata.json
```

> Production/Render tuyệt đối không chạy `train.py` và không chạy crawler.
> Production chỉ load artifacts đã có và chạy `infer.py`.

## 7. Inference contract cho BE2

### Input

BE2 chuẩn bị một JSON file:

```json
{
  "requestId": "analysis-123",
  "repoDocument": "node express rest api authentication database",
  "issueDocument": "",
  "apiTokens": ["express", "mongoose", "jsonwebtoken", "docker"],
  "topN": 3
}
```

Quy tắc input:

- `requestId`: optional, dùng để trace phía Node;
- `repoDocument`: string, mặc định có thể là `""`;
- `issueDocument`: string, mặc định có thể là `""`;
- `apiTokens`: mảng string, mặc định có thể là `[]`;
- `topN`: integer, mặc định `3`, service giới hạn trong khoảng 1–3 để đúng
  shared contract giữa BE1 và BE2.

Chạy:

```bash
python3 ml_service/infer.py --input temp/dev2vec_input.json
```

`infer.py` cũng nhận JSON từ stdin bằng `--input -`, hữu ích khi không muốn
tạo file trung gian:

```bash
printf '%s' '{"repoDocument":"","issueDocument":"","apiTokens":[],"topN":3}' \
  | python3 ml_service/infer.py --input -
```

### Success output

stdout trả đúng một JSON document:

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
      "matchedSkillNames": [],
      "weakSkillNames": [],
      "missingSkillNames": [],
      "recommendedNextSkills": [],
      "details": []
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
    "apiTokenCount": 4
  }
}
```

Các array vector thực tế có độ dài `230/150/200/580`; ví dụ trên rút gọn để
dễ đọc.

### Error output

Khi input hoặc artifact lỗi, stdout vẫn là JSON hợp lệ:

```json
{
  "success": false,
  "errorCode": "DEV2VEC_INFERENCE_FAILED",
  "message": "short error message",
  "modelVersion": null
}
```

Process trả exit code khác `0` khi inference lỗi. BE2 nên đọc và parse stdout
ngay cả khi child process báo non-zero exit code.

### Logging

- stdout: chỉ JSON để Node.js parse;
- stderr: warning/error của Python hoặc dependency.

BE2 không được nối stderr vào stdout trước khi `JSON.parse`.

## 8. Role mapping cố định

| `modelLabel` | `roleId` | `roleName` |
|---|---|---|
| Backend | `backend` | Backend Developer |
| Frontend | `frontend` | Frontend Developer |
| Mobile | `mobile` | Mobile Developer |
| DevOps | `devops` | DevOps Engineer |
| Data Scientist | `data_scientist` | Data Scientist |

Không tự đổi `roleId`, `roleName` hoặc tên skill.

## 9. Mapping sang response hiện tại của FE

Với mỗi item trong `rolePredictions`:

```text
matchScore = probability * 100
matchedSkillNames = skillGaps[roleId].matchedSkillNames
weakSkillNames = skillGaps[roleId].weakSkillNames
missingSkillNames = skillGaps[roleId].missingSkillNames
recommendedNextSkills = skillGaps[roleId].recommendedNextSkills
```

`matchLevel`, `matchLevelLabel`, `roleMatch` và `skillGapSummary` vẫn do lớp
adapter Node.js map theo contract FE hiện tại. Không thay đổi hoặc xóa scoring
cũ trước khi BE2 hoàn tất integration.

## 10. Gợi ý gọi từ Node.js

Nên dùng `execFile`/`spawn` với argument array, không dựng shell command từ
input người dùng. Ví dụ minh họa:

```js
import { execFile } from "node:child_process";

execFile(
  "python3",
  ["ml_service/infer.py", "--input", inputFilePath],
  { maxBuffer: 10 * 1024 * 1024 },
  (error, stdout, stderr) => {
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      // stdout không đúng contract hoặc process chưa khởi động được.
      return handleDev2VecUnavailable(stderr);
    }

    if (error || !result.success) {
      return handleDev2VecUnavailable(result.message || stderr);
    }

    return mapDev2VecToExistingFeResponse(result);
  }
);
```

Lưu ý:

- đường dẫn Python có thể cần cấu hình theo môi trường deploy;
- đặt timeout và `maxBuffer` đủ lớn vì response chứa vector 580 chiều;
- không log toàn bộ vectors ở production;
- nếu Python/model không khả dụng, Node adapter nên fallback an toàn về logic
  hiện tại cho đến khi BE2 hoàn tất migration.

## 11. Skill gaps

Mỗi predicted role được so sánh với 5 skill prototype.

Từ `dev2vec-demo-v4`, skill score không còn dùng một cosine trên combined vector
580 chiều. Service tính riêng:

```text
repo positive-cosine × 0.35
issue positive-cosine × 0.15
API/import direct overlap × 0.50
```

Các weight được renormalize khi channel bị thiếu. Cấu hình nằm trong
`model_metadata.json -> skillGapScoring`.

| Similarity mặc định | Status |
|---:|---|
| `>= 0.55` | `matched` |
| `>= 0.35` và `< 0.55` | `weak` |
| `< 0.35` | `missing` |

`recommendedNextSkills` lấy missing trước, sau đó weak, tối đa 5 skills.

Các giá trị `0.35/0.55` chỉ là fallback trước khi có ground truth. Khi
`model_metadata.json` chứa `skillGapThresholds`, `infer.py` dùng hai threshold
đã được hiệu chỉnh và khóa trong metadata.

### Human-reviewed skill annotation

Pilot annotation nằm tại:

```text
ml_service/dataset/skill_annotations.json
```

Annotation hiện có 70 developer và ba split:

- `validation`: 30 developer đã review, chỉ dùng tune scoring/threshold;
- `legacy_test_v3`: 20 developer test cũ, chỉ giữ để audit;
- `test`: 20 developer mới chưa từng dùng, dành cho held-out test v4.

Mọi nhãn test v4 ban đầu là `unknown`, vì không được dùng prediction/similarity
của model để tự tạo ground truth. Reviewer kiểm tra contribution evidence rồi
đổi thành:

- `verified`: bằng chứng trực tiếp và đủ mạnh;
- `partial_evidence`: bằng chứng hạn chế hoặc gián tiếp;
- `not_observed`: đã review đủ evidence nhưng không quan sát thấy skill;
- `unknown`: chưa review/không đủ evidence, luôn bị loại khỏi metric.

Mỗi nhãn khác `unknown` bắt buộc có `reviewer`; nên ghi changed file, import,
dependency, commit hoặc issue cụ thể trong `evidence`.

Kiểm tra schema/progress mà không load test labels:

```bash
python3 ml_service/evaluate_skill_gaps.py --check-only
```

Sau khi review xong validation annotations, tune một cặp threshold cố định cho
toàn bộ roles/skills bằng validation set. Evaluator bỏ qua `legacy_test_v3`:

```bash
python3 ml_service/evaluate_skill_gaps.py
```

Chỉ khi threshold đã chốt mới mở held-out test và ghi kết quả vào metadata:

```bash
python3 ml_service/evaluate_skill_gaps.py \
  --evaluate-test \
  --write-metadata
```

Evaluator ghi accuracy, macro/weighted F1, per-label/per-skill metrics và
confusion matrix. Sau khi test metrics đã được ghi, script từ chối ghi đè để
tránh tune lặp lại theo test set.

## 12. Validate trước khi tích hợp

```bash
python3 ml_service/validate_contract.py
```

Kết quả mong đợi:

```text
PASS: Dev2Vec contract valid (3 scenarios)
```

Validator kiểm tra:

- inference bình thường, thiếu toàn bộ source và `topN` vượt giới hạn;
- stdout là JSON hợp lệ;
- vector dimensions đúng `230/150/200/580`;
- zero-vector fallback;
- concat order;
- top role và role IDs;
- `topN` luôn bị giới hạn tối đa 3;
- skill-gap keys, `vectorSources` và `sourceStats`.

## 13. Quy tắc ownership/integration

- BE1 chỉ làm trong `ml_service/**`.
- BE1 không sửa Node.js API hoặc response fields của FE.
- Không sửa/xóa logic hard-coded hiện tại trước khi BE2 tích hợp xong.
- BE2 phụ trách adapter Node.js, fallback và map sang response FE hiện tại.
- Mỗi lần artifacts thay đổi, chạy lại `validate_contract.py` trước khi merge.
