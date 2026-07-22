"""Fail-fast validation for the atomic Dev2Vec artifact release set."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

EXPECTED_MODEL_VERSION = "dev2vec-demo-v4"
EXPECTED_DIMS = {"repo": 230, "issue": 150, "api": 200, "combined": 580}


def validate_artifact_set(artifacts_dir: Path) -> dict:
    root = artifacts_dir.resolve()
    manifest_path = root / "artifact_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    metadata = json.loads((root / "model_metadata.json").read_text(encoding="utf-8"))
    if manifest.get("modelVersion") != EXPECTED_MODEL_VERSION or metadata.get("modelVersion") != EXPECTED_MODEL_VERSION:
        raise ValueError("Dev2Vec artifact modelVersion mismatch")
    if metadata.get("vectorDims") != EXPECTED_DIMS or int(metadata.get("inputDimension", 0)) != 580:
        raise ValueError("Dev2Vec artifact dimensions mismatch")
    def assert_finite(value: object, label: str) -> None:
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"Dev2Vec artifact contains non-finite value: {label}")
        if isinstance(value, dict):
            for key, item in value.items():
                assert_finite(item, f"{label}.{key}")
        elif isinstance(value, list):
            for item in value:
                assert_finite(item, label)
    assert_finite(metadata, "model_metadata.json")
    assert_finite(json.loads((root / "skill_vectors.json").read_text(encoding="utf-8")), "skill_vectors.json")
    assert_finite(json.loads((root / "skill_prototypes.json").read_text(encoding="utf-8")), "skill_prototypes.json")
    for filename, expected in manifest.get("files", {}).items():
        target = root / filename
        if not target.is_file() or target.stat().st_size != int(expected.get("sizeBytes", -1)):
            raise ValueError(f"Dev2Vec artifact missing or size mismatch: {filename}")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if digest != expected.get("sha256"):
            raise ValueError(f"Dev2Vec artifact checksum mismatch: {filename}")
    return {"modelVersion": metadata["modelVersion"], "vectorDims": metadata["vectorDims"], "fileCount": len(manifest["files"])}
