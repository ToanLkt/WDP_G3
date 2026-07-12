#!/usr/bin/env python3
"""Audit Dev2Vec channel availability and missing-channel probability shift."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from gensim.models.doc2vec import Doc2Vec
from sklearn.metrics import classification_report, confusion_matrix, f1_score

VECTOR_DIMS = {"repo": 230, "issue": 150, "api": 200, "combined": 580}
ROLE_ORDER = ["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("ml_service/dataset/developers.extracted.json"))
    parser.add_argument("--artifacts", type=Path, default=Path("ml_service/artifacts"))
    return parser.parse_args()


def load_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def has_repo(item):
    return bool(str(item.get("repoDocument", "")).strip())


def has_issue(item):
    return bool(str(item.get("issueDocument", "")).strip())


def has_api(item):
    return bool(item.get("apiTokens") or [])


def channel_key(item):
    parts = []
    if has_repo(item):
        parts.append("repo")
    if has_issue(item):
        parts.append("issue")
    if has_api(item):
        parts.append("api")
    return "+".join(parts) or "none"


def source_vector(model, tag, enabled, size):
    if not enabled:
        return np.zeros(size, dtype=np.float32)
    vector = np.asarray(model.dv[tag], dtype=np.float32)
    if vector.shape[0] != size or not np.all(np.isfinite(vector)):
        raise ValueError("invalid vector for %s" % tag)
    return vector


def build_vectors(data, repo_model, issue_model, api_model, mask_issue=False, mask_api=False):
    vectors = []
    labels = []
    for item in data:
        developer_id = item["developerId"]
        repo_vector = source_vector(repo_model, developer_id, has_repo(item), VECTOR_DIMS["repo"])
        issue_vector = source_vector(
            issue_model,
            developer_id,
            has_issue(item) and not mask_issue,
            VECTOR_DIMS["issue"],
        )
        api_vector = source_vector(
            api_model,
            developer_id,
            has_api(item) and not mask_api,
            VECTOR_DIMS["api"],
        )
        combined = np.concatenate([repo_vector, issue_vector, api_vector])
        if combined.shape[0] != VECTOR_DIMS["combined"] or not np.all(np.isfinite(combined)):
            raise ValueError("invalid combined vector for %s" % developer_id)
        vectors.append(combined)
        labels.append(item["label"])
    return np.vstack(vectors), labels


def evaluate(name, vectors, labels, classifier, label_encoder):
    encoded_true = label_encoder.transform(labels)
    encoded_pred = classifier.predict(vectors)
    labels_order = label_encoder.transform(ROLE_ORDER)
    report = classification_report(
        encoded_true,
        encoded_pred,
        labels=labels_order,
        target_names=ROLE_ORDER,
        output_dict=True,
        zero_division=0,
    )
    return {
        "name": name,
        "macroF1": float(f1_score(encoded_true, encoded_pred, average="macro")),
        "perRoleF1": {role: float(report[role]["f1-score"]) for role in ROLE_ORDER},
        "perRolePrecision": {role: float(report[role]["precision"]) for role in ROLE_ORDER},
        "perRoleRecall": {role: float(report[role]["recall"]) for role in ROLE_ORDER},
        "confusionMatrix": confusion_matrix(encoded_true, encoded_pred, labels=labels_order).tolist(),
        "probabilities": classifier.predict_proba(vectors),
    }


def probability_shift(reference, variant):
    diff = np.abs(reference["probabilities"] - variant["probabilities"])
    return {
        "meanAbsProbabilityShift": float(diff.mean()),
        "maxAbsProbabilityShift": float(diff.max()),
    }


def main():
    args = parse_args()
    data = load_json(args.dataset)
    repo_model = Doc2Vec.load(str(args.artifacts / "doc2vec_repo.model"))
    issue_model = Doc2Vec.load(str(args.artifacts / "doc2vec_issue.model"))
    api_model = Doc2Vec.load(str(args.artifacts / "doc2vec_api.model"))
    classifier = joblib.load(args.artifacts / "role_classifier.joblib")
    label_encoder = joblib.load(args.artifacts / "label_encoder.joblib")

    availability = Counter(channel_key(item) for item in data)
    empty_issue = [item["developerId"] for item in data if not has_issue(item)]
    empty_api = [item["developerId"] for item in data if not has_api(item)]
    labels = [item["label"] for item in data]

    vectors_full, _ = build_vectors(data, repo_model, issue_model, api_model)
    vectors_zero_issue, _ = build_vectors(data, repo_model, issue_model, api_model, mask_issue=True)
    vectors_zero_api, _ = build_vectors(data, repo_model, issue_model, api_model, mask_api=True)
    vectors_zero_issue_api, _ = build_vectors(data, repo_model, issue_model, api_model, mask_issue=True, mask_api=True)

    full = evaluate("classifier_ria_full", vectors_full, labels, classifier, label_encoder)
    zero_issue = evaluate("classifier_ria_zero_issue", vectors_zero_issue, labels, classifier, label_encoder)
    zero_api = evaluate("classifier_ria_zero_api", vectors_zero_api, labels, classifier, label_encoder)
    zero_both = evaluate("classifier_ria_zero_issue_api", vectors_zero_issue_api, labels, classifier, label_encoder)

    output = {
        "sampleCount": len(data),
        "labelDistribution": dict(Counter(labels)),
        "channelAvailabilityCounts": dict(availability),
        "emptyIssueDocumentCount": len(empty_issue),
        "emptyIssueDocumentDeveloperIds": empty_issue,
        "emptyApiTokensCount": len(empty_api),
        "emptyApiTokensDeveloperIds": empty_api,
        "zeroVectorInTraining": {
            "repo": sum(1 for item in data if not has_repo(item)),
            "issue": len(empty_issue),
            "api": len(empty_api),
        },
        "models": [
            {key: value for key, value in full.items() if key != "probabilities"},
            {key: value for key, value in zero_issue.items() if key != "probabilities"},
            {key: value for key, value in zero_api.items() if key != "probabilities"},
            {key: value for key, value in zero_both.items() if key != "probabilities"},
        ],
        "probabilityShiftVsFull": {
            "zeroIssue": probability_shift(full, zero_issue),
            "zeroApi": probability_shift(full, zero_api),
            "zeroIssueAndApi": probability_shift(full, zero_both),
        },
        "classifier": {
            "type": type(classifier).__name__,
            "inputDimension": int(getattr(classifier, "n_features_in_", -1)),
            "hasIntercept": bool(getattr(classifier, "fit_intercept", False)),
            "interceptShape": list(getattr(classifier, "intercept_", np.asarray([])).shape),
        },
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
