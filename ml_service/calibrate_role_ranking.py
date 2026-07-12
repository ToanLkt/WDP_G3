#!/usr/bin/env python3
"""Evaluate Dev2Vec role ranking calibration without promoting production config."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
from gensim.models.doc2vec import Doc2Vec
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold
from sklearn.linear_model import LogisticRegression

from infer import (
    ROLE_MAPPING,
    VECTOR_DIMS,
    cosine_similarity,
    normalize_cosine,
    role_prototype_similarity,
)

ROLE_ORDER = ["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"]
ROLE_IDS = ["backend", "frontend", "mobile", "devops", "data_scientist"]
GRID = [(1.0, 0.0), (0.9, 0.1), (0.8, 0.2), (0.7, 0.3), (0.6, 0.4), (0.5, 0.5), (0.4, 0.6)]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path("ml_service/dataset/developers.extracted.json"))
    parser.add_argument("--artifacts", type=Path, default=Path("ml_service/artifacts"))
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--output", type=Path, default=Path("ml_service/artifacts/role_scoring_candidate.json"))
    parser.add_argument("--write-candidate", action="store_true")
    return parser.parse_args()


def load_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def has_text(value):
    return bool(str(value or "").strip())


def source_vector(model, tag, enabled, size):
    if not enabled:
        return np.zeros(size, dtype=np.float32)
    vector = np.asarray(model.dv[tag], dtype=np.float32)
    if vector.shape[0] != size or not np.all(np.isfinite(vector)):
        raise ValueError("invalid vector for %s" % tag)
    return vector


def build_vectors(data, repo_model, issue_model, api_model):
    vectors = []
    labels = []
    for item in data:
        developer_id = item["developerId"]
        repo_vector = source_vector(repo_model, developer_id, has_text(item.get("repoDocument")), VECTOR_DIMS["repo"])
        issue_vector = source_vector(issue_model, developer_id, has_text(item.get("issueDocument")), VECTOR_DIMS["issue"])
        api_vector = source_vector(api_model, developer_id, bool(item.get("apiTokens") or []), VECTOR_DIMS["api"])
        combined = np.concatenate([repo_vector, issue_vector, api_vector])
        if combined.shape[0] != VECTOR_DIMS["combined"] or not np.all(np.isfinite(combined)):
            raise ValueError("invalid combined vector for %s" % developer_id)
        vectors.append(combined)
        labels.append(item["label"])
    return np.vstack(vectors), np.asarray(labels)


def prototype_scores(vectors, skill_vectors):
    scores = np.zeros((vectors.shape[0], len(ROLE_ORDER)), dtype=np.float32)
    details = []
    for row_index, vector in enumerate(vectors):
        row_details = {}
        for role_index, role_label in enumerate(ROLE_ORDER):
            role_id = ROLE_MAPPING[role_label]["roleId"]
            summary = role_prototype_similarity(role_id, vector, skill_vectors)
            scores[row_index, role_index] = summary["normalizedPrototypeSimilarity"]
            row_details[role_label] = summary
        details.append(row_details)
    return scores, details


def ordered_probabilities(classifier, label_encoder, vectors):
    raw = classifier.predict_proba(vectors)
    output = np.zeros((vectors.shape[0], len(ROLE_ORDER)), dtype=np.float32)
    for class_position, encoded in enumerate(classifier.classes_):
        label = str(label_encoder.inverse_transform([encoded])[0])
        output[:, ROLE_ORDER.index(label)] = raw[:, class_position]
    return output


def rank_with_scores(classifier_probs, proto_scores, alpha, beta):
    scores = alpha * classifier_probs + beta * proto_scores
    return np.argmax(scores, axis=1), scores


def top2_accuracy(scores, y_true_indexes):
    top2 = np.argsort(scores, axis=1)[:, -2:]
    return float(np.mean([truth in row for truth, row in zip(y_true_indexes, top2)]))


def evaluate_predictions(y_true_indexes, y_pred_indexes, scores):
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true_indexes,
        y_pred_indexes,
        labels=list(range(len(ROLE_ORDER))),
        zero_division=0,
    )
    return {
        "macroF1": float(np.mean(f1)),
        "macroPrecision": float(np.mean(precision)),
        "macroRecall": float(np.mean(recall)),
        "weightedF1": float(precision_recall_fscore_support(
            y_true_indexes,
            y_pred_indexes,
            average="weighted",
            zero_division=0,
        )[2]),
        "top1Accuracy": float(accuracy_score(y_true_indexes, y_pred_indexes)),
        "top2Accuracy": top2_accuracy(scores, y_true_indexes),
        "meanConfidence": float(np.max(scores, axis=1).mean()),
        "perRole": {
            role: {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
            }
            for index, role in enumerate(ROLE_ORDER)
        },
        "confusionMatrix": confusion_matrix(
            y_true_indexes,
            y_pred_indexes,
            labels=list(range(len(ROLE_ORDER))),
        ).tolist(),
    }


def run_cv(data, vectors, labels, label_encoder, skill_vectors, folds):
    split_count = max(2, min(folds, min(np.bincount(np.asarray([ROLE_ORDER.index(label) for label in labels])))))
    splitter = StratifiedKFold(n_splits=split_count, shuffle=True, random_state=42)
    label_indexes = np.asarray([ROLE_ORDER.index(label) for label in labels])
    encoded_labels = label_encoder.transform(labels)
    rows = []
    conflict_examples = []

    for alpha, beta in GRID:
        fold_true = []
        fold_pred = []
        fold_scores = []
        for train_indexes, validation_indexes in splitter.split(vectors, label_indexes):
            fold_classifier = LogisticRegression(max_iter=2000, random_state=42, solver="lbfgs")
            fold_classifier.fit(vectors[train_indexes], encoded_labels[train_indexes])
            validation_vectors = vectors[validation_indexes]
            classifier_probs = ordered_probabilities(fold_classifier, label_encoder, validation_vectors)
            proto, proto_details = prototype_scores(validation_vectors, skill_vectors)
            pred, scores = rank_with_scores(classifier_probs, proto, alpha, beta)
            fold_true.extend(label_indexes[validation_indexes].tolist())
            fold_pred.extend(pred.tolist())
            fold_scores.append(scores)

            if alpha == 0.5 and beta == 0.5 and len(conflict_examples) < 5:
                classifier_top = np.argmax(classifier_probs, axis=1)
                proto_top = np.argmax(proto, axis=1)
                for local_index, sample_index in enumerate(validation_indexes):
                    if classifier_top[local_index] != proto_top[local_index] and len(conflict_examples) < 5:
                        conflict_examples.append({
                            "developerId": data[int(sample_index)]["developerId"],
                            "label": labels[int(sample_index)],
                            "classifierTop": ROLE_ORDER[int(classifier_top[local_index])],
                            "prototypeTop": ROLE_ORDER[int(proto_top[local_index])],
                            "classifierProbabilities": {
                                role: float(classifier_probs[local_index, role_index])
                                for role_index, role in enumerate(ROLE_ORDER)
                            },
                            "prototypeSimilarities": {
                                role: proto_details[local_index][role]
                                for role in ROLE_ORDER
                            },
                        })
        all_scores = np.vstack(fold_scores)
        metrics = evaluate_predictions(np.asarray(fold_true), np.asarray(fold_pred), all_scores)
        rows.append({
            "alpha": alpha,
            "beta": beta,
            **metrics,
        })
    return rows, conflict_examples


def choose_candidate(rows):
    baseline = next(row for row in rows if row["alpha"] == 1.0 and row["beta"] == 0.0)
    best = max(rows, key=lambda row: (row["macroF1"], row["top1Accuracy"], -row["beta"]))
    promote = (
        best["macroF1"] > baseline["macroF1"] + 0.005
        and all(
            best["perRole"][role]["f1"] >= baseline["perRole"][role]["f1"] - 0.05
            for role in ROLE_ORDER
        )
    )
    if not promote:
        best = baseline
    return {
        "strategy": "hybrid" if best["beta"] > 0 else "classifier_only",
        "alpha": best["alpha"],
        "beta": best["beta"],
        "calibrationMethod": "none",
        "validationStrategy": "stratified-k-fold-artifact-audit",
        "promoteRecommended": promote,
        "selectionReason": "Hybrid promoted only when macro F1 improves and no role regresses materially.",
        "metrics": best,
        "baselineMetrics": baseline,
    }


def main():
    args = parse_args()
    data = load_json(args.dataset)
    repo_model = Doc2Vec.load(str(args.artifacts / "doc2vec_repo.model"))
    issue_model = Doc2Vec.load(str(args.artifacts / "doc2vec_issue.model"))
    api_model = Doc2Vec.load(str(args.artifacts / "doc2vec_api.model"))
    label_encoder = joblib.load(args.artifacts / "label_encoder.joblib")
    skill_vectors = load_json(args.artifacts / "skill_vectors.json")
    vectors, labels = build_vectors(data, repo_model, issue_model, api_model)
    rows, conflicts = run_cv(data, vectors, labels, label_encoder, skill_vectors, args.folds)
    candidate = choose_candidate(rows)
    output = {
        "sampleCount": len(data),
        "roles": ROLE_ORDER,
        "grid": rows,
        "candidate": candidate,
        "conflictExamples": conflicts,
        "notes": [
            "Default runtime remains classifier-only unless production metadata is explicitly changed.",
            "This script does not retrain or promote production metadata by default.",
        ],
    }
    if args.write_candidate:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8") as handle:
            json.dump(output, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
