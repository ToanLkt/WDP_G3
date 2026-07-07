#!/usr/bin/env python3
"""Validate the Dev2Vec inference JSON contract."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

EXPECTED_DIMS = {"repo": 230, "issue": 150, "api": 200, "combined": 580}
ALLOWED_ROLE_IDS = {
    "backend", "frontend", "mobile", "devops", "data_scientist"
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def invoke(payload):
    infer_path = Path(__file__).resolve().parent / "infer.py"
    process = subprocess.run(
        [sys.executable, str(infer_path), "--input", "-"],
        input=json.dumps(payload),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    try:
        output = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError("infer.py stdout is not valid JSON: %s" % exc)
    require(process.returncode == 0, "infer.py failed: %s" % process.stderr.strip())
    return output


def validate_output(output, top_n, expect_missing):
    require(output.get("success") is True, "success must be true")
    require(output.get("modelVersion"), "modelVersion is missing")
    require(output.get("vectorDims") == EXPECTED_DIMS, "vectorDims mismatch")
    vectors = output.get("vectors", {})
    require(len(vectors.get("repoVector", [])) == 230, "repoVector length")
    require(len(vectors.get("issueVector", [])) == 150, "issueVector length")
    require(len(vectors.get("apiVector", [])) == 200, "apiVector length")
    require(len(vectors.get("combinedVector", [])) == 580, "combinedVector length")
    combined = (
        vectors["repoVector"] + vectors["issueVector"] + vectors["apiVector"]
    )
    require(vectors["combinedVector"] == combined, "combined concat order mismatch")
    predictions = output.get("rolePredictions", [])
    require(0 < len(predictions) <= top_n, "rolePredictions count")
    role_ids = [item.get("roleId") for item in predictions]
    require(all(role_id in ALLOWED_ROLE_IDS for role_id in role_ids), "roleId")
    require(set(output.get("skillGaps", {})) == set(role_ids), "skillGaps keys")
    require(isinstance(output.get("vectorSources"), dict), "vectorSources missing")
    require(isinstance(output.get("sourceStats"), dict), "sourceStats missing")
    if expect_missing:
        require(
            not any(output["vectorSources"].values()),
            "missing sources must be reported as false",
        )
        require(
            all(value == 0.0 for value in vectors["combinedVector"]),
            "missing sources must create zero vectors",
        )


def main():
    checks = 0
    try:
        sample = invoke({
            "requestId": "contract-validation",
            "repoDocument": (
                "backend rest api controller authentication database docker"
            ),
            "issueDocument": "",
            "apiTokens": ["express", "postgresql", "jsonwebtoken"],
            "topN": 3,
        })
        validate_output(sample, 3, expect_missing=False)
        checks += 1
        missing = invoke({
            "requestId": "missing-source-validation",
            "repoDocument": "",
            "issueDocument": "",
            "apiTokens": [],
            "topN": 3,
        })
        validate_output(missing, 3, expect_missing=True)
        checks += 1
        capped_top_n = invoke({
            "requestId": "top-n-cap-validation",
            "repoDocument": "frontend component state responsive interface",
            "issueDocument": "fix component rendering and browser layout",
            "apiTokens": ["react", "vite", "playwright"],
            "topN": 99,
        })
        validate_output(capped_top_n, 3, expect_missing=False)
        require(
            len(capped_top_n["rolePredictions"]) == 3,
            "topN values above 3 must be capped at 3",
        )
        checks += 1
        print("PASS: Dev2Vec contract valid (%d scenarios)" % checks)
        return 0
    except Exception as exc:
        print("FAIL: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
