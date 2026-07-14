#!/usr/bin/env python3
"""Run Dev2Vec inference. Standard output is always one JSON document."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
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
DEFAULT_ROLE_SCORING = {
    "strategy": "classifier_only",
    "alpha": 1.0,
    "beta": 0.0,
    "calibrationMethod": "none",
    "scoringVersion": "classifier-only-v1",
}


def timing_enabled():
    return os.environ.get("DEV2VEC_TIMING_DEBUG") in {"true", "1"}


def now_ms():
    return int(time.perf_counter() * 1000)


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
    evidence_channels = payload.get("evidenceChannels", {})
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
    if evidence_channels is None:
        evidence_channels = {}
    if not isinstance(evidence_channels, dict):
        raise ValueError("evidenceChannels must be an object when provided")
    return repo_document, issue_document, api_tokens, evidence_channels, max(1, min(top_n, 3))


def resolve_channel_availability(repo_document, issue_document, api_tokens, evidence_channels):
    available = evidence_channels.get("availableChannels", {})
    status = evidence_channels.get("channelStatus", {})
    if not isinstance(available, dict):
        available = {}
    if not isinstance(status, dict):
        status = {}
    fallback = {
        "repo": bool(repo_document.strip()),
        "issue": bool(issue_document.strip()),
        "api": bool(api_tokens),
    }
    return {
        "availableChannels": {
            "repo": bool(available.get("repo", fallback["repo"])),
            "issue": bool(available.get("issue", fallback["issue"])),
            "api": bool(available.get("api", fallback["api"])),
        },
        "channelStatus": {
            "repo": str(status.get("repo") or ("available" if fallback["repo"] else "insufficient_metadata")),
            "issue": str(status.get("issue") or ("available" if fallback["issue"] else "not_fetched")),
            "api": str(status.get("api") or ("available" if fallback["api"] else "no_usage_tokens")),
        },
    }


def infer_source(model, text, size, seed):
    if not text.strip():
        return np.zeros(size, dtype=np.float32)
    tokens = simple_preprocess(text, deacc=True, min_len=2, max_len=50)
    if not tokens:
        return np.zeros(size, dtype=np.float32)
    model.random.seed(seed)
    return np.asarray(model.infer_vector(tokens, epochs=30), dtype=np.float32)


def assert_vector(name, vector, size):
    if vector.shape[0] != size:
        raise ValueError("%s vector has invalid length" % name)
    if not np.all(np.isfinite(vector)):
        raise ValueError("%s vector contains NaN or Infinity" % name)


def validate_artifact_metadata(metadata, classifier):
    vector_dims = metadata.get("vectorDims") or {}
    if vector_dims and vector_dims != VECTOR_DIMS:
        raise ValueError("Model metadata vectorDims do not match runtime VECTOR_DIMS")
    expected_dim = int(metadata.get("inputDimension") or metadata.get("model", {}).get("inputDimension") or VECTOR_DIMS["combined"])
    if expected_dim != VECTOR_DIMS["combined"]:
        raise ValueError("Model metadata inputDimension is incompatible")
    classifier_dim = getattr(classifier, "n_features_in_", VECTOR_DIMS["combined"])
    if int(classifier_dim) != VECTOR_DIMS["combined"]:
        raise ValueError("Classifier input dimension is incompatible")


def load_artifacts(artifacts):
    """Load and validate immutable inference artifacts once."""
    loaded = {
        "repo_model": Doc2Vec.load(str(artifacts / "doc2vec_repo.model")),
        "issue_model": Doc2Vec.load(str(artifacts / "doc2vec_issue.model")),
        "api_model": Doc2Vec.load(str(artifacts / "doc2vec_api.model")),
        "classifier": joblib.load(artifacts / "role_classifier.joblib"),
        "label_encoder": joblib.load(artifacts / "label_encoder.joblib"),
    }
    with (artifacts / "skill_vectors.json").open(encoding="utf-8") as handle:
        loaded["skill_vectors"] = json.load(handle)
    with (artifacts / "model_metadata.json").open(encoding="utf-8") as handle:
        loaded["metadata"] = json.load(handle)
    validate_artifact_metadata(loaded["metadata"], loaded["classifier"])
    validate_role_scoring_config(loaded["metadata"])
    return loaded


def cosine_similarity(left, right):
    left_norm = float(np.linalg.norm(left))
    right_norm = float(np.linalg.norm(right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return float(np.dot(left, right) / (left_norm * right_norm))


def normalize_cosine(value):
    if not np.isfinite(value):
        return 0.0
    return max(0.0, min(1.0, (float(value) + 1.0) / 2.0))


def validate_role_scoring_config(metadata):
    config = metadata.get("roleScoring") or DEFAULT_ROLE_SCORING
    if not isinstance(config, dict):
        return DEFAULT_ROLE_SCORING
    strategy = str(config.get("strategy") or "classifier_only")
    alpha = float(config.get("alpha", 1.0))
    beta = float(config.get("beta", 0.0))
    if (
        not np.isfinite(alpha)
        or not np.isfinite(beta)
        or alpha < 0.0
        or beta < 0.0
        or alpha > 1.0
        or beta > 1.0
        or abs((alpha + beta) - 1.0) > 1e-6
    ):
        return DEFAULT_ROLE_SCORING
    if strategy not in {"classifier_only", "hybrid"}:
        return DEFAULT_ROLE_SCORING
    if strategy == "classifier_only":
        alpha, beta = 1.0, 0.0
    return {
        "strategy": strategy,
        "alpha": alpha,
        "beta": beta,
        "calibrationMethod": str(config.get("calibrationMethod") or "none"),
        "scoringVersion": str(config.get("scoringVersion") or DEFAULT_ROLE_SCORING["scoringVersion"]),
    }


def role_prototype_similarity(role_id, combined_vector, skill_vectors, top_k=3):
    similarities = []
    missing = 0
    for skill in skill_vectors.get(role_id, []):
        prototype = np.asarray(skill["combinedVector"], dtype=np.float32)
        if prototype.shape[0] != VECTOR_DIMS["combined"] or not np.all(np.isfinite(prototype)):
            missing += 1
            continue
        similarities.append(cosine_similarity(combined_vector, prototype))
    if not similarities:
        return {
            "rawPrototypeSimilarity": 0.0,
            "normalizedPrototypeSimilarity": 0.0,
            "validSkillPrototypeCount": 0,
            "missingPrototypeCount": missing,
        }
    ranked = sorted(similarities, reverse=True)
    selected = ranked[: max(1, min(top_k, len(ranked)))]
    raw = float(np.mean(selected))
    return {
        "rawPrototypeSimilarity": raw,
        "normalizedPrototypeSimilarity": normalize_cosine(raw),
        "validSkillPrototypeCount": len(similarities),
        "missingPrototypeCount": missing,
    }


def rank_roles(probabilities, label_encoder, classifier, combined_vector, skill_vectors, scoring_config):
    rows = []
    for class_index, probability in enumerate(probabilities):
        encoded_class = classifier.classes_[class_index]
        model_label = str(label_encoder.inverse_transform([encoded_class])[0])
        mapping = ROLE_MAPPING[model_label]
        prototype = role_prototype_similarity(mapping["roleId"], combined_vector, skill_vectors)
        classifier_score = float(probability)
        final_score = (
            scoring_config["alpha"] * classifier_score
            + scoring_config["beta"] * prototype["normalizedPrototypeSimilarity"]
        )
        if not np.isfinite(final_score):
            final_score = classifier_score
        rows.append({
            "classIndex": class_index,
            "modelLabel": model_label,
            "mapping": mapping,
            "classifierProbability": classifier_score,
            "prototype": prototype,
            "finalRoleScore": float(final_score),
        })
    rows.sort(key=lambda item: (-item["finalRoleScore"], item["modelLabel"]))
    return rows


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
    timings = {}
    started = now_ms()
    repo_document, issue_document, api_tokens, evidence_channels, top_n = validate_input(payload)
    timings["validateInputMs"] = now_ms() - started
    load_started = now_ms()
    loaded = artifacts if isinstance(artifacts, dict) else load_artifacts(artifacts)
    repo_model = loaded["repo_model"]
    issue_model = loaded["issue_model"]
    api_model = loaded["api_model"]
    classifier = loaded["classifier"]
    label_encoder = loaded["label_encoder"]
    skill_vectors = loaded["skill_vectors"]
    metadata = loaded["metadata"]
    timings["modelLoadMs"] = now_ms() - load_started
    validate_started = now_ms()
    scoring_config = validate_role_scoring_config(metadata)
    channel_info = resolve_channel_availability(
        repo_document, issue_document, api_tokens, evidence_channels
    )
    available_channels = channel_info["availableChannels"]
    timings["metadataValidateMs"] = now_ms() - validate_started

    vector_started = now_ms()
    repo_vector = infer_source(
        repo_model, repo_document if available_channels["repo"] else "", VECTOR_DIMS["repo"], 1101
    )
    issue_vector = infer_source(
        issue_model, issue_document if available_channels["issue"] else "", VECTOR_DIMS["issue"], 1102
    )
    api_text = " ".join(api_tokens) if available_channels["api"] else ""
    api_vector = infer_source(api_model, api_text, VECTOR_DIMS["api"], 1103)
    assert_vector("repo", repo_vector, VECTOR_DIMS["repo"])
    assert_vector("issue", issue_vector, VECTOR_DIMS["issue"])
    assert_vector("api", api_vector, VECTOR_DIMS["api"])
    combined_vector = np.concatenate([repo_vector, issue_vector, api_vector])
    assert_vector("combined", combined_vector, VECTOR_DIMS["combined"])
    timings["vectorInferenceMs"] = now_ms() - vector_started

    classifier_started = now_ms()
    probabilities = classifier.predict_proba(combined_vector.reshape(1, -1))[0]
    ranked_roles = rank_roles(
        probabilities, label_encoder, classifier, combined_vector, skill_vectors, scoring_config
    )[:top_n]
    predictions = []
    skill_gaps = {}
    for rank, row in enumerate(ranked_roles, start=1):
        mapping = row["mapping"]
        model_label = row["modelLabel"]
        predictions.append({
            "roleId": mapping["roleId"],
            "roleName": mapping["roleName"],
            "modelLabel": model_label,
            "probability": round(float(row["finalRoleScore"]), 6),
            "rank": rank,
        })
        skill_gaps[mapping["roleId"]] = build_skill_gap(
            mapping["roleId"], combined_vector, skill_vectors
        )
    timings["classifierPredictMs"] = now_ms() - classifier_started
    timings["totalPythonMs"] = now_ms() - started
    if timing_enabled():
        print("[Dev2VecTimingPython] %s" % json.dumps(timings, separators=(",", ":")), file=sys.stderr)

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
            "repos": available_channels["repo"],
            "issues": available_channels["issue"],
            "apis": available_channels["api"],
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
        read_started = now_ms()
        payload = read_input(args.input)
        if timing_enabled():
            print("[Dev2VecTimingPython] %s" % json.dumps({"readInputMs": now_ms() - read_started}, separators=(",", ":")), file=sys.stderr)
        output = run_inference(payload, artifacts)
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
