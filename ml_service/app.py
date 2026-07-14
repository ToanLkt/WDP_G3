#!/usr/bin/env python3
"""Private persistent Dev2Vec HTTP worker using only the Python stdlib server."""
from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from infer import load_artifacts, run_inference

HOST = os.environ.get("DEV2VEC_SERVICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEV2VEC_SERVICE_PORT", "8001"))
MAX_BODY = int(os.environ.get("DEV2VEC_SERVICE_MAX_BODY_BYTES", "10485760"))
CONCURRENCY = max(1, int(os.environ.get("DEV2VEC_SERVICE_CONCURRENCY", "1")))
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"

STARTED = time.perf_counter()
LOAD_COUNT = 0
LOAD_STARTED = time.perf_counter()
LOADED = load_artifacts(ARTIFACTS)
LOAD_COUNT += 1
LOAD_MS = int((time.perf_counter() - LOAD_STARTED) * 1000)
SEMAPHORE = threading.BoundedSemaphore(CONCURRENCY)
# Doc2Vec.infer_vector mutates model RNG state; serialize inference for deterministic equality.
MODEL_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "Dev2VecService/1.0"

    def log_message(self, fmt, *args):
        print(json.dumps({"event": "dev2vec_http", "message": fmt % args}))

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.respond(404, {"status": "not_found"})
        self.respond(200, {
            "status": "ok",
            "warm": True,
            "artifactVersion": LOADED["metadata"].get("modelVersion"),
            "vectorDimension": 580,
            "artifactLoadCount": LOAD_COUNT,
            "artifactLoadMs": LOAD_MS,
            "uptimeMs": int((time.perf_counter() - STARTED) * 1000),
        })

    def do_POST(self):
        if self.path != "/infer":
            return self.respond(404, {"status": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                return self.respond(413, {"success": False, "errorCode": "DEV2VEC_INVALID_INPUT", "message": "Invalid request size"})
            payload = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return self.respond(400, {"success": False, "errorCode": "DEV2VEC_INVALID_INPUT", "message": "Body must be valid JSON"})
        if not SEMAPHORE.acquire(timeout=1):
            return self.respond(503, {"success": False, "errorCode": "DEV2VEC_BUSY", "message": "Inference worker is busy"})
        started = time.perf_counter()
        try:
            with MODEL_LOCK:
                output = run_inference(payload, LOADED)
            print(json.dumps({
                "event": "dev2vec_inference",
                "requestId": str(payload.get("requestId", ""))[:120],
                "durationMs": int((time.perf_counter() - started) * 1000),
                "workerState": "warm",
            }))
            self.respond(200, output)
        except (TypeError, ValueError) as exc:
            self.respond(400, {"success": False, "errorCode": "DEV2VEC_INVALID_INPUT", "message": str(exc)[:200]})
        except Exception as exc:
            self.respond(500, {"success": False, "errorCode": "DEV2VEC_INFERENCE_FAILED", "message": str(exc)[:200]})
        finally:
            SEMAPHORE.release()


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    def shutdown(_signum, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    print(json.dumps({"event": "dev2vec_service_started", "host": HOST, "port": PORT, "artifactLoadMs": LOAD_MS}))
    server.serve_forever()
    server.server_close()


if __name__ == "__main__":
    main()
