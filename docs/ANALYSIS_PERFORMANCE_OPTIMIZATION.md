# 1. Flow cũ

`POST /api/analysis/repositories/:repoId` luôn đi qua repository/context lookup, commit list, commit detail và code evidence, package/source, issues, Dev2Vec input, một Python process mới, hai lần ghi MongoDB rồi mới trả response. Cache evidence đã tồn tại nhưng endpoint chính chưa có exact-result short circuit. `infer.py` nạp ba Doc2Vec model, classifier, label encoder và skill vectors trong mỗi request.

# 2. Flow mới

Flow mới giữ nguyên public response và Dev2Vec input/output semantics:

1. Lookup repository và context song song.
2. Gọi một GitHub commit-head request để có head SHA đáng tin cậy.
3. Exact cache hit nếu fingerprint và toàn bộ version tương thích; bỏ qua commit/source/issues/Python/Mongo create.
4. Nếu head đổi, đánh giá incremental safety rồi tải commit list mới.
5. Tái dùng commit detail/code evidence theo SHA; fetch phần thiếu hoặc commit mới.
6. Rebuild toàn bộ Dev2Vec input từ evidence cũ + mới và infer lại trên full input.
7. Ghi AnalysisResult, snapshot và provenance mới.
8. Ưu tiên persistent Python service; tự fallback `infer.py` nếu được bật.

# 3. P0 optimizations

- Structured log `[AnalysisPerformance]`, `[Dev2VecTiming]`, `[Dev2VecClient]`; không chứa token, source, patch, issue body hoặc vector.
- GitHub call/duration counter theo `commit_list`, `commit_detail`, `file_at_commit`, `contents_file`, `contents_listing`, `issues`.
- Candidate path được deduplicate case-insensitive và fetch bằng bounded concurrency hiện tại.
- Negative path cache gắn với repository/source fingerprint; fingerprint đổi thì không tái dùng.
- Exact cache short circuit hỗ trợ `forceRegenerate=true`.
- Index lookup latest analysis: `{ userId, repositoryId, analyzedAt: -1 }`.

# 4. Incremental analysis

Lần đầu luôn full. Các lần sau chỉ bật incremental khi có current/previous head SHA, branch không đổi, metadata tương thích và previous head còn xuất hiện trong history đã tải. `newCommitShas` là đoạn từ current head đến trước previous head.

Commit detail service hydrate evidence cache theo SHA và chỉ gọi GitHub cho detail/evidence thiếu. Input builder luôn nhận toàn bộ user commits đã merge; inference luôn chạy lại trên full input 580 chiều. Không cộng vector mới vào vector cũ.

Provenance được lưu trong AnalysisResult và snapshot: `analyzedHeadSha`, `previousAnalysisId`, `previousSnapshotId`, `newCommitShas`, `reusedCommitShasCount`, `newEvidenceCount`, `reusedEvidenceCount`, `incremental`, `incrementalReason`.

# 5. Cache/fingerprint rules

Exact result chỉ reuse khi có đủ `defaultBranch`, `latestCommitSha`, `pushedAt`, `updatedAtGithub` và khớp tuyệt đối. Metadata phải khớp pipeline, evidence builder, issue evidence, source parser, role resolver, skill mapping, model artifact và scoring version. Cache thiếu fingerprint bị từ chối.

Source cache dùng branch, head SHA, pushed/updated timestamps, evidence builder và parser version. Negative path cache dùng đúng fingerprint này nên không sống qua repository version mới.

# 6. Full-analysis fallback conditions

Full analysis được dùng khi first run, feature flag tắt, force regenerate, thiếu head SHA, branch đổi, version đổi, previous head không reachable (force-push/history rewrite), hoặc incremental evidence validation báo lỗi. Fallback reason được log/lưu provenance; flow không fail nếu full path vẫn chạy được.

# 7. Persistent Python service

`ml_service/app.py` dùng private HTTP `GET /health` và `POST /infer`. Artifacts được load/validate đúng một lần lúc start. Health báo artifact version, dimension 580, load count/time và warm state. Bounded semaphore giới hạn concurrent requests; model lock bảo vệ `Doc2Vec.infer_vector` vì thao tác này thay đổi RNG state. `PYTHONHASHSEED=0` giữ equality giữa process và service.

Node ưu tiên `DEV2VEC_SERVICE_URL`, timeout hữu hạn, không retry vô hạn và fallback process khi được phép. `infer.py` được giữ nguyên làm local/test/rollback path. Input service ở memory, không tạo temp file; fallback cũ vẫn dùng temp file và cleanup trong `finally`.

# 8. Render deployment

Repo dùng phương án cùng container để ít thay đổi nhất. Docker chạy `scripts/startProduction.js`, khởi động Python trên `127.0.0.1:8001` và Node trên public `PORT`. Một child process chết sẽ khiến supervisor terminate child còn lại để Render restart container. Backend health trả `503/degraded` khi service đã configured nhưng không healthy.

Python không bind public interface. Với phương án hai Render services trong tương lai, chỉ cần đặt `DEV2VEC_SERVICE_URL` thành private internal URL và không dùng supervisor cùng container.

# 9. Environment variables

| Biến | Mặc định | Ý nghĩa |
|---|---:|---|
| `DEV2VEC_SERVICE_URL` | rỗng ngoài Docker | URL persistent worker; rỗng dùng process path |
| `DEV2VEC_SERVICE_TIMEOUT_MS` | `30000` | HTTP inference timeout |
| `DEV2VEC_SERVICE_FALLBACK_ENABLED` | `true` | Cho phép fallback `infer.py` |
| `DEV2VEC_SERVICE_CONCURRENCY` | `1` | Số request chờ/được xử lý có giới hạn; model vẫn lock để deterministic |
| `ANALYSIS_CACHE_ENABLED` | `true` | Exact analysis cache |
| `ANALYSIS_INCREMENTAL_ENABLED` | `true` | Incremental evidence collection |
| `ANALYSIS_TIMING_DEBUG` | `false` | Structured timing log |

Các biến cũ `DEV2VEC_PYTHON_BIN`, `DEV2VEC_INFER_PATH`, `DEV2VEC_TIMEOUT_MS`, `DEV2VEC_MAX_BUFFER_BYTES` tiếp tục áp dụng cho fallback.

# 10. Benchmark results

Ngày 2026-07-14, `npm run benchmark:analysis-performance` trên fixture LOCAL, không GitHub/MongoDB/Render:

| Mode | Samples (ms) | Average |
|---|---|---:|
| process-per-request | 2311, 2342, 2318 | 2324 ms |
| persistent service warm | 14, 11, 10 | 12 ms |

Chênh lệch fixture là khoảng 99% ở riêng inference transport/load path. Không được dùng số này làm production/Render total latency. Unchanged cache policy bỏ toàn bộ pipeline sau một head check; benchmark thực với authenticated repository vẫn cần chạy riêng trên Render.

# 11. Output equality

Regression fixture chạy cùng input qua `infer.py` và persistent service, so sánh toàn bộ field structure, vectors, role order/probabilities, skill similarity/gaps với float tolerance `1e-6`. Test pass. Hai request lặp và hai request concurrent cũng cho output giống nhau; artifact load count giữ ở 1.

# 12. Tests

- `npm run test:analysis-performance`: PASS.
- `npm run test:dev2vec-input`: PASS.
- `npm run test:dev2vec-evidence-taxonomy`: PASS.
- `npm run test:end-to-end-flow`: PASS.
- `npm run test:current-context`: PASS.
- `npm run test:learning-canonicalization`: PASS.
- `npm run test:backend-analysis-pipeline`: đang fail ở fixture cũ mong `React Router` có score dù fixture không cung cấp `details.similarity`; failure này tồn tại ngoài các thay đổi performance và không sửa scoring policy trong task này.

Test performance bao phủ exact hit, force bypass, incomplete fingerprint, first/incremental/branch/version/history fallback policy, path dedupe, bounded concurrency, health, preload-once, repeated/concurrent equality, malformed JSON và graceful SIGTERM trigger.

# 13. Rollback strategy

- `ANALYSIS_CACHE_ENABLED=false`: bỏ exact cache.
- `ANALYSIS_INCREMENTAL_ENABLED=false`: luôn full evidence collection.
- Bỏ `DEV2VEC_SERVICE_URL` hoặc đặt `DEV2VEC_SERVICE_FALLBACK_ENABLED=true`: dùng `infer.py` process path.
- Có thể đổi Docker CMD về `npm start` để bỏ supervisor/Python service mà không đổi DB/FE.

Các field mới là optional Object; dữ liệu cũ vẫn đọc bình thường. Không có automatic data migration/delete khi startup. Chạy index thủ công bằng `npm run migrate:analysis-performance-indexes`.

# 14. Remaining limitations

- Chưa có authenticated Render/production benchmark vì không dùng token/API thật trong local audit.
- Head check vẫn cần một GitHub call để tránh cache hit trên repository stale.
- Source fingerprint hiện refresh source khi head đổi; chưa có Git tree/blob fingerprint để chứng minh source không đổi sau một commit docs-only.
- Mongo profiler/explain trên production dataset và Render CPU/RAM/cold-start metrics vẫn cần vận hành thực tế.
- Persistent worker cùng container dùng in-process supervisor đơn giản; nếu scale nhiều Node instances, mỗi instance giữ một bộ artifact trong RAM.
