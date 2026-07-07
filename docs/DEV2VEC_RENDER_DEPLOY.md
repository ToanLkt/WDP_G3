# Dev2Vec Render Deploy

## 1. Docker-based Render deploy

Render nên deploy BE bằng Dockerfile ở root repo. Image hiện chứa Node.js app và Python runtime để Node gọi `ml_service/infer.py` qua `child_process/execFile`.

Render chỉ chạy inference. Không chạy `ml_service/train.py`, `github_fetcher.py`, hoặc validate/train job trong Docker build.

## 2. Dockerfile làm gì

- Base image: `node:20-bookworm-slim`.
- Cài system packages: `python3`, `python3-venv`, `python3-pip`, `build-essential`.
- Tạo Python venv tại `/opt/venv`.
- Cài Python deps từ `ml_service/requirements.txt`.
- Cài Node deps bằng `npm ci --omit=dev`.
- Copy source code và chạy `npm start`.

Python path trong container:

```text
/opt/venv/bin/python
```

## 3. Render env variables

Set rõ các biến sau trên Render:

```text
DEV2VEC_ENABLED=true
DEV2VEC_PYTHON_BIN=/opt/venv/bin/python
DEV2VEC_INFER_PATH=ml_service/infer.py
DEV2VEC_TIMEOUT_MS=30000
DEV2VEC_MAX_BUFFER_BYTES=10485760
DEV2VEC_ARTIFACTS_DIR=ml_service/artifacts
```

Dockerfile đã có default `ENV`, nhưng Render vẫn nên set `DEV2VEC_ENABLED=true` để tránh bị override nhầm.

## 4. Artifacts bắt buộc

Các file này phải có trong repo/image:

```text
ml_service/artifacts/doc2vec_repo.model
ml_service/artifacts/doc2vec_issue.model
ml_service/artifacts/doc2vec_api.model
ml_service/artifacts/role_classifier.joblib
ml_service/artifacts/label_encoder.joblib
ml_service/artifacts/skill_vectors.json
ml_service/artifacts/model_metadata.json
```

Hiện `.dockerignore` không loại `ml_service/requirements.txt`, `ml_service/infer.py`, hoặc `ml_service/artifacts/`.

Nếu artifacts quá lớn hoặc không muốn commit trực tiếp, dùng Git LFS hoặc bước download artifact trước deploy. Nếu không có artifacts trong image, `/api/admin/dev2vec/status` sẽ không `ready`.

## 5. Local Docker test

Build:

```bash
docker build -t wdp-api-dev2vec .
```

Run:

```bash
docker run --env-file .env -p 5000:5000 wdp-api-dev2vec
```

Nếu local `.env` có `DEV2VEC_PYTHON_BIN` kiểu Windows path, override khi run:

```bash
docker run --env-file .env -e DEV2VEC_PYTHON_BIN=/opt/venv/bin/python -p 5000:5000 wdp-api-dev2vec
```

## 6. Verify sau deploy

1. Gọi `GET /api/admin/dev2vec/status`.
   - Kỳ vọng `data.status = "ready"`.
   - `data.artifacts.*` đều là `true`.
2. Gọi `POST /api/analysis/role-matches`.
   - Kỳ vọng có `data.matches[]`.
   - `scoringMethod = "dev2vec_doc2vec_classifier"`.

## 7. Troubleshooting

- Python not found: kiểm tra `DEV2VEC_PYTHON_BIN=/opt/venv/bin/python`.
- Missing artifacts: kiểm tra `.dockerignore`, Git tracking, hoặc Git LFS/download artifact.
- Pip install failed: Render build log thường thiếu wheel/system deps; Dockerfile đang dùng Debian slim và `build-essential`.
- Timeout: tăng `DEV2VEC_TIMEOUT_MS` nếu inference vượt 30 giây.
- maxBuffer: tăng `DEV2VEC_MAX_BUFFER_BYTES` nếu stdout/stderr quá lớn.
- Status `partial`: thiếu ít nhất một artifact hoặc metadata không `ready`.
- Status `unavailable`: `DEV2VEC_ENABLED=false`, thiếu metadata, hoặc artifacts dir sai.
