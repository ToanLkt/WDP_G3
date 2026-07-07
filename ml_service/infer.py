#!/usr/bin/env python3
"""Run Dev2Vec inference. Standard output is always one JSON document."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from gensim.models.doc2vec import Doc2Vec
from gensim.utils import simple_preprocess

MODEL_VERSION = "dev2vec-demo-v1"
VECTOR_DIMS = {"repo": 230, "issue": 150, "api": 200, "combined": 580}
ROLE_MAPPING = {
    "Backend": {"roleId": "backend", "roleName": "Backend Developer"},
    "Frontend": {"roleId": "frontend", "roleName": "Frontend Developer"},
    "Mobile": {"roleId": "mobile", "roleName": "Mobile Developer"},
    "DevOps": {"roleId": "devops", "roleName": "DevOps Engineer"},
    "Data Scientist": {
        "roleId": "data_scientist", "roleName": "Data Scientist"
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    return parser.parse_args()


def read_input(path):
    if path == "-":
        return json.load(sys.stdin)
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_input(payload):
    if not isinstance(payload, dict):
        raise ValueError("Input must be a JSON object")
    repo_document = payload.get("repoDocument", "")
    issue_document = payload.get("issueDocument", "")
    api_tokens = payload.get("apiTokens", [])
    top_n = payload.get("topN", 3)
    if not isinstance(repo_document, str):
        raise ValueError("repoDocument must be a string")
    if not isinstance(issue_document, str):
        raise ValueError("issueDocument must be a string")
    if not isinstance(api_tokens, list) or not all(
        isinstance(item, str) for item in api_tokens
    ):
        raise ValueError("apiTokens must be an array of strings")
    if not isinstance(top_n, int) or isinstance(top_n, bool):
        raise ValueError("topN must be an integer")
    return repo_document, issue_document, api_tokens, max(1, min(top_n, 3))


def infer_source(model, text, size, seed):
    if not text.strip():
        return np.zeros(size, dtype=np.float32)
    tokens = simple_preprocess(text, deacc=True, min_len=2, max_len=50)
    if not tokens:
        return np.zeros(size, dtype=np.float32)
    model.random.seed(seed)
    return np.asarray(model.infer_vector(tokens, epochs=30), dtype=np.float32)


def cosine_similarity(left, right):
    left_norm = float(np.linalg.norm(left))
    right_norm = float(np.linalg.norm(right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return float(np.dot(left, right) / (left_norm * right_norm))


def build_skill_gap(role_id, combined_vector, skill_vectors):
    matched = []
    weak = []
    missing = []
    details = []
    for skill in skill_vectors.get(role_id, []):
        prototype = np.asarray(skill["combinedVector"], dtype=np.float32)
        if prototype.shape[0] != VECTOR_DIMS["combined"]:
            raise ValueError("Skill vector has invalid length")
        similarity = cosine_similarity(combined_vector, prototype)
        if similarity >= 0.55:
            status = "matched"
            matched.append(skill["skillName"])
        elif similarity >= 0.35:
            status = "weak"
            weak.append(skill["skillName"])
        else:
            status = "missing"
            missing.append(skill["skillName"])
        details.append({
            "skillName": skill["skillName"],
            "canonicalSkillName": skill["canonicalSkillName"],
            "similarity": round(similarity, 6),
            "status": status,
        })
    return {
        "matchedSkillNames": matched,
        "weakSkillNames": weak,
        "missingSkillNames": missing,
        "recommendedNextSkills": (missing + weak)[:5],
        "details": details,
    }


def run_inference(payload, artifacts):
    repo_document, issue_document, api_tokens, top_n = validate_input(payload)
    repo_model = Doc2Vec.load(str(artifacts / "doc2vec_repo.model"))
    issue_model = Doc2Vec.load(str(artifacts / "doc2vec_issue.model"))
    api_model = Doc2Vec.load(str(artifacts / "doc2vec_api.model"))
    classifier = joblib.load(artifacts / "role_classifier.joblib")
    label_encoder = joblib.load(artifacts / "label_encoder.joblib")
    with (artifacts / "skill_vectors.json").open(encoding="utf-8") as handle:
        skill_vectors = json.load(handle)
    with (artifacts / "model_metadata.json").open(encoding="utf-8") as handle:
        metadata = json.load(handle)

    repo_vector = infer_source(
        repo_model, repo_document, VECTOR_DIMS["repo"], 1101
    )
    issue_vector = infer_source(
        issue_model, issue_document, VECTOR_DIMS["issue"], 1102
    )
    api_text = " ".join(api_tokens)
    api_vector = infer_source(api_model, api_text, VECTOR_DIMS["api"], 1103)
    combined_vector = np.concatenate([repo_vector, issue_vector, api_vector])
    if combined_vector.shape[0] != VECTOR_DIMS["combined"]:
        raise ValueError("Combined vector has invalid length")

    probabilities = classifier.predict_proba(combined_vector.reshape(1, -1))[0]
    ranked = np.argsort(probabilities)[::-1][:top_n]
    predictions = []
    skill_gaps = {}
    for rank, class_index in enumerate(ranked, start=1):
        encoded_class = classifier.classes_[class_index]
        model_label = str(label_encoder.inverse_transform([encoded_class])[0])
        mapping = ROLE_MAPPING[model_label]
        predictions.append({
            "roleId": mapping["roleId"],
            "roleName": mapping["roleName"],
            "modelLabel": model_label,
            "probability": round(float(probabilities[class_index]), 6),
            "rank": rank,
        })
        skill_gaps[mapping["roleId"]] = build_skill_gap(
            mapping["roleId"], combined_vector, skill_vectors
        )

    return {
        "success": True,
        "modelVersion": metadata.get("modelVersion", MODEL_VERSION),
        "vectorDims": VECTOR_DIMS,
        "vectors": {
            "repoVector": [float(value) for value in repo_vector],
            "issueVector": [float(value) for value in issue_vector],
            "apiVector": [float(value) for value in api_vector],
            "combinedVector": [float(value) for value in combined_vector],
        },
        "rolePredictions": predictions,
        "skillGaps": skill_gaps,
        "vectorSources": {
            "repos": bool(repo_document.strip()),
            "issues": bool(issue_document.strip()),
            "apis": bool(api_tokens),
        },
        "sourceStats": {
            "repoTextLength": len(repo_document),
            "issueTextLength": len(issue_document),
            "apiTokenCount": len(api_tokens),
        },
    }


def main():
    args = parse_args()
    artifacts = Path(__file__).resolve().parent / "artifacts"
    try:
        output = run_inference(read_input(args.input), artifacts)
        exit_code = 0
    except Exception as exc:
        print("Dev2Vec inference failed: %s" % exc, file=sys.stderr)
        output = {
            "success": False,
            "errorCode": "DEV2VEC_INFERENCE_FAILED",
            "message": str(exc)[:200],
            "modelVersion": None,
        }
        exit_code = 1
    json.dump(output, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
