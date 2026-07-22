# Dev2Vec Deployment

## Environment

| Variable | Required | Default | Windows | Linux/container | Sensitive | Consumer |
| --- | --- | --- | --- | --- | --- | --- |
| `DEV2VEC_ENABLED` | no | `true` | same | same | no | Node |
| `DEV2VEC_SERVICE_URL` | HTTP mode | blank | `http://127.0.0.1:8001` | same/internal URL | no | Node |
| `DEV2VEC_SERVICE_HOST` | no | `127.0.0.1` | same | same | no | worker |
| `DEV2VEC_SERVICE_PORT` | no | `8001` | same | same | no | worker/supervisor |
| `DEV2VEC_SERVICE_TIMEOUT_MS` | no | `30000` | same | same | no | Node |
| `DEV2VEC_SERVICE_FALLBACK_ENABLED` | no | `true` | same | same | no | Node |
| `DEV2VEC_SERVICE_CONCURRENCY` | no | `1` | same | same | no | worker |
| `DEV2VEC_SERVICE_MAX_BODY_BYTES` | no | `10485760` | same | same | no | worker |
| `DEV2VEC_PYTHON_BIN` | no | `python` | `.venv\Scripts\python.exe` | `/opt/venv/bin/python` | no | Node/supervisor |
| `DEV2VEC_INFER_PATH` | no | `ml_service/infer.py` | relative | relative | no | Node |
| `DEV2VEC_TIMEOUT_MS` | no | `30000` | same | same | no | process transport |
| `DEV2VEC_MAX_BUFFER_BYTES` | no | `10485760` | same | same | no | process transport |
| `DEV2VEC_ARTIFACTS_DIR` | no | `ml_service/artifacts` | relative | relative | no | worker/status |
| `DEV2VEC_PERSIST_VECTORS` | no | `true` | same | same | no | persistence |
| `DEV2VEC_OBSERVABILITY_LOG` | no | `false` | same | same | no | Node |

Mongo/JWT/GitHub OAuth variables remain Node-only secrets. The Python worker does not crawl and does not need a GitHub token.

## Windows

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r ml_service/requirements.txt
npm ci
npm run smoke:dev2vec:windows
```

## Linux

Create a compatible venv, install `ml_service/requirements.txt`, install Node packages, then run `sh scripts/smokeDev2VecLinux.sh`. Container production uses `/opt/venv/bin/python`.

## Docker

`docker build -t career-roadmap-dev2vec .` then run with required Mongo/JWT/OAuth secrets. The image uses a non-root Node user, writable `/app/tmp`, atomic packaged artifacts, supervisor readiness wait and `/health` healthcheck. `/live` is process liveness; `/health` is readiness and requires Mongo plus the configured worker.

## Render/platform

No `render.yaml` is present. A single Docker service is supported by the bundled supervisor and `$PORT`; configure Mongo and application secrets, keep worker bound to loopback, and use `/health`. Two separate Render services are possible but require an internal worker URL and are not repository-defined. Artifacts are packaged; deploy never trains, crawls or downloads them.
