#!/usr/bin/env python3
"""Tune and evaluate global skill-gap thresholds from human-reviewed labels."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)

from infer import (
    VECTOR_DIMS,
    infer_source,
    load_artifacts,
    resolve_skill_gap_scoring,
    score_skill_channels,
)

GROUND_TRUTH_LABELS = ["verified", "partial_evidence", "not_observed"]
ALLOWED_LABELS = set(GROUND_TRUTH_LABELS + ["unknown"])
PREDICTION_LABELS = {
    "matched": "verified",
    "weak": "partial_evidence",
    "missing": "not_observed",
}


def parse_args():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset",
        type=Path,
        default=root / "dataset" / "developers.extracted.json",
    )
    parser.add_argument(
        "--annotations",
        type=Path,
        default=root / "dataset" / "skill_annotations.json",
    )
    parser.add_argument("--artifacts", type=Path, default=root / "artifacts")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument(
        "--evaluate-test",
        action="store_true",
        help="Unlock the held-out test set after thresholds are selected on validation.",
    )
    parser.add_argument(
        "--write-metadata",
        action="store_true",
        help="Write calibrated thresholds and the final report to model_metadata.json.",
    )
    parser.add_argument("--grid-step", type=float, default=0.025)
    return parser.parse_args()


def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def validate_annotations(document, dataset):
    if not isinstance(document, dict) or not isinstance(document.get("samples"), list):
        raise ValueError("annotation document must contain a samples array")
    dataset_by_id = {item["developerId"]: item for item in dataset}
    seen_developers = set()
    seen_pairs = set()
    split_counts = Counter()
    label_counts = Counter()
    role_counts = Counter()
    for sample in document["samples"]:
        developer_id = sample.get("developerId")
        if developer_id not in dataset_by_id:
            raise ValueError("annotation developerId is absent from dataset: %s" % developer_id)
        if developer_id in seen_developers:
            raise ValueError("duplicate annotation developerId: %s" % developer_id)
        seen_developers.add(developer_id)
        dataset_item = dataset_by_id[developer_id]
        if sample.get("roleLabel") != dataset_item["label"]:
            raise ValueError("roleLabel mismatch for %s" % developer_id)
        split = sample.get("split")
        if split not in {"validation", "test", "legacy_test_v3"}:
            raise ValueError(
                "split must be validation, test, or legacy_test_v3 for %s"
                % developer_id
            )
        split_counts[split] += 1
        role_counts[(split, sample["roleLabel"])] += 1
        annotations = sample.get("annotations")
        if not isinstance(annotations, list) or not annotations:
            raise ValueError("annotations must be a non-empty array for %s" % developer_id)
        for annotation in annotations:
            skill_name = annotation.get("skillName")
            pair = (developer_id, skill_name)
            if not skill_name or pair in seen_pairs:
                raise ValueError("duplicate or missing skill annotation for %s" % developer_id)
            seen_pairs.add(pair)
            label = annotation.get("label")
            if label not in ALLOWED_LABELS:
                raise ValueError("invalid label for %s/%s: %s" % (developer_id, skill_name, label))
            evidence = annotation.get("evidence")
            if not isinstance(evidence, list):
                raise ValueError("evidence must be an array for %s/%s" % pair)
            if label != "unknown" and not annotation.get("reviewer"):
                raise ValueError("reviewed labels require reviewer for %s/%s" % pair)
            label_counts[(split, label)] += 1
    return {
        "developerCount": len(seen_developers),
        "annotationCount": len(seen_pairs),
        "splitCounts": dict(sorted(split_counts.items())),
        "roleCounts": {
            "%s:%s" % key: value for key, value in sorted(role_counts.items())
        },
        "labelCounts": {
            "%s:%s" % key: value for key, value in sorted(label_counts.items())
        },
    }


def source_vectors(item, loaded, seed_base):
    repo_vector = infer_source(
        loaded["repo_model"], item["repoDocument"], VECTOR_DIMS["repo"], seed_base + 1
    )
    issue_vector = infer_source(
        loaded["issue_model"], item["issueDocument"], VECTOR_DIMS["issue"], seed_base + 2
    )
    api_vector = infer_source(
        loaded["api_model"], " ".join(item["apiTokens"]), VECTOR_DIMS["api"], seed_base + 3
    )
    return repo_vector, issue_vector, api_vector


def collect_rows(document, dataset, loaded):
    dataset_by_id = {item["developerId"]: item for item in dataset}
    skill_vectors = {}
    for role_id, skills in loaded["skill_vectors"].items():
        for skill in skills:
            skill_vectors[(role_id, skill["skillName"])] = np.asarray(
                skill["combinedVector"], dtype=np.float32
            )
    rows = []
    for sample_index, sample in enumerate(document["samples"]):
        item = dataset_by_id[sample["developerId"]]
        repo_vector, issue_vector, api_vector = source_vectors(
            item, loaded, 100_000 + sample_index * 10
        )
        scoring_config = resolve_skill_gap_scoring(loaded["metadata"])
        for annotation in sample["annotations"]:
            label = annotation["label"]
            if label == "unknown":
                continue
            key = (sample["roleId"], annotation["skillName"])
            prototype = skill_vectors.get(key)
            if prototype is None:
                raise ValueError("skill prototype not found: %s/%s" % key)
            rows.append(
                {
                    "developerId": sample["developerId"],
                    "split": sample["split"],
                    "roleId": sample["roleId"],
                    "skillName": annotation["skillName"],
                    "truth": label,
                    "similarity": score_skill_channels(
                        repo_vector,
                        issue_vector,
                        api_vector,
                        item["apiTokens"],
                        {
                            **next(
                                skill
                                for skill in loaded["skill_vectors"][sample["roleId"]]
                                if skill["skillName"] == annotation["skillName"]
                            )
                        },
                        scoring_config,
                    )["score"],
                }
            )
    return rows


def predict_label(similarity, weak_threshold, matched_threshold):
    if similarity >= matched_threshold:
        return "verified"
    if similarity >= weak_threshold:
        return "partial_evidence"
    return "not_observed"


def score_rows(rows, weak_threshold, matched_threshold, include_details=True):
    truth = [row["truth"] for row in rows]
    predicted = [
        predict_label(row["similarity"], weak_threshold, matched_threshold)
        for row in rows
    ]
    precision, recall, f1_values, support = precision_recall_fscore_support(
        truth,
        predicted,
        labels=GROUND_TRUTH_LABELS,
        zero_division=0,
    )
    report = {
        "sampleCount": len(rows),
        "accuracy": round(float(accuracy_score(truth, predicted)), 6),
        "macroF1": round(
            float(
                f1_score(
                    truth,
                    predicted,
                    labels=GROUND_TRUTH_LABELS,
                    average="macro",
                    zero_division=0,
                )
            ),
            6,
        ),
        "weightedF1": round(
            float(
                f1_score(
                    truth,
                    predicted,
                    labels=GROUND_TRUTH_LABELS,
                    average="weighted",
                    zero_division=0,
                )
            ),
            6,
        ),
        "confusionMatrixLabels": GROUND_TRUTH_LABELS,
        "confusionMatrix": confusion_matrix(
            truth, predicted, labels=GROUND_TRUTH_LABELS
        ).astype(int).tolist(),
        "perLabel": {
            label: {
                "precision": round(float(precision[index]), 6),
                "recall": round(float(recall[index]), 6),
                "f1": round(float(f1_values[index]), 6),
                "support": int(support[index]),
            }
            for index, label in enumerate(GROUND_TRUTH_LABELS)
        },
    }
    if include_details:
        by_skill = defaultdict(list)
        for row in rows:
            by_skill[row["skillName"]].append(row)
        report["perSkill"] = {
            skill_name: score_rows(
                skill_rows, weak_threshold, matched_threshold, include_details=False
            )
            for skill_name, skill_rows in sorted(by_skill.items())
        }
    return report


def tune_thresholds(validation_rows, grid_step):
    if grid_step <= 0.0 or grid_step > 0.2:
        raise ValueError("--grid-step must be greater than 0 and at most 0.2")
    if not validation_rows:
        raise ValueError("no reviewed validation annotations are available")
    observed_labels = {row["truth"] for row in validation_rows}
    missing_labels = set(GROUND_TRUTH_LABELS) - observed_labels
    if missing_labels:
        raise ValueError(
            "validation requires reviewed examples for every label; missing: %s"
            % ", ".join(sorted(missing_labels))
        )
    values = np.arange(0.0, 1.000001, grid_step)
    best = None
    for weak_threshold in values:
        for matched_threshold in values:
            if matched_threshold <= weak_threshold:
                continue
            report = score_rows(
                validation_rows,
                float(weak_threshold),
                float(matched_threshold),
                include_details=False,
            )
            candidate = (
                report["macroF1"],
                report["accuracy"],
                -float(matched_threshold - weak_threshold),
                -float(weak_threshold),
            )
            if best is None or candidate > best[0]:
                best = (
                    candidate,
                    round(float(weak_threshold), 6),
                    round(float(matched_threshold), 6),
                )
    return best[1], best[2]


def annotation_fingerprint(document):
    test_samples = [
        sample for sample in document["samples"] if sample.get("split") == "test"
    ]
    payload = json.dumps(
        test_samples, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def reviewed_labels(document, split):
    return {
        annotation["label"]
        for sample in document["samples"]
        if sample.get("split") == split
        for annotation in sample.get("annotations", [])
        if annotation.get("label") != "unknown"
    }


def main():
    args = parse_args()
    try:
        dataset = read_json(args.dataset)
        annotations = read_json(args.annotations)
        summary = validate_annotations(annotations, dataset)
        if args.check_only:
            print(json.dumps({"success": True, "schema": summary}, indent=2))
            return 0
        missing_validation_labels = set(GROUND_TRUTH_LABELS) - reviewed_labels(
            annotations, "validation"
        )
        if missing_validation_labels:
            raise ValueError(
                "validation requires reviewed examples for every label; missing: %s"
                % ", ".join(sorted(missing_validation_labels))
            )
        if args.evaluate_test:
            missing_test_labels = set(GROUND_TRUTH_LABELS) - reviewed_labels(
                annotations, "test"
            )
            if missing_test_labels:
                raise ValueError(
                    "test requires reviewed examples for every label; missing: %s"
                    % ", ".join(sorted(missing_test_labels))
                )
        loaded = load_artifacts(args.artifacts)
        rows = collect_rows(annotations, dataset, loaded)
        validation_rows = [row for row in rows if row["split"] == "validation"]
        test_rows = [row for row in rows if row["split"] == "test"]
        weak_threshold, matched_threshold = tune_thresholds(
            validation_rows, args.grid_step
        )
        report = {
            "status": "validation_thresholds_selected",
            "annotationSchemaVersion": annotations.get("schemaVersion"),
            "modelVersion": loaded["metadata"].get("modelVersion"),
            "skillGapScoring": resolve_skill_gap_scoring(loaded["metadata"]),
            "thresholds": {
                "weak": weak_threshold,
                "matched": matched_threshold,
            },
            "annotationSummary": summary,
            "validation": score_rows(
                validation_rows, weak_threshold, matched_threshold
            ),
        }
        if args.evaluate_test:
            if not test_rows:
                raise ValueError("no reviewed test annotations are available")
            report["status"] = "held_out_test_evaluated"
            report["evaluatedAt"] = (
                datetime.now(timezone.utc).isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )
            report["testSetFingerprint"] = annotation_fingerprint(annotations)
            report["test"] = score_rows(
                test_rows, weak_threshold, matched_threshold
            )
        if args.write_metadata:
            if not args.evaluate_test:
                raise ValueError("--write-metadata requires --evaluate-test")
            metadata_path = args.artifacts / "model_metadata.json"
            metadata = read_json(metadata_path)
            existing = metadata.get("skillGapEvaluation")
            if existing and existing.get("status") == "held_out_test_evaluated":
                raise ValueError(
                    "metadata already contains held-out test metrics; do not repeatedly tune against test"
                )
            metadata["skillGapThresholds"] = report["thresholds"]
            metadata["skillGapEvaluation"] = report
            write_json(metadata_path, metadata)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print("Skill-gap evaluation failed: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
