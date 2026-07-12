#!/usr/bin/env python3
"""Unit checks for internal Dev2Vec role ranking calibration helpers."""

import numpy as np

from infer import (
    ROLE_MAPPING,
    VECTOR_DIMS,
    normalize_cosine,
    rank_roles,
    role_prototype_similarity,
    validate_role_scoring_config,
)


class DummyClassifier:
    classes_ = np.asarray([0, 1, 2, 3, 4])


class DummyLabelEncoder:
    labels = np.asarray(["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"])

    def inverse_transform(self, values):
        return self.labels[np.asarray(values, dtype=int)]


def unit_vector(index):
    vector = np.zeros(VECTOR_DIMS["combined"], dtype=np.float32)
    vector[index] = 1.0
    return vector


def assert_close(left, right, eps=1e-9):
    assert abs(left - right) <= eps, (left, right)


def main():
    fallback = validate_role_scoring_config({"roleScoring": {"strategy": "hybrid", "alpha": 0.8, "beta": 0.4}})
    assert fallback["strategy"] == "classifier_only"
    assert_close(fallback["alpha"], 1.0)
    assert_close(fallback["beta"], 0.0)

    valid = validate_role_scoring_config({"roleScoring": {"strategy": "hybrid", "alpha": 0.6, "beta": 0.4}})
    assert valid["strategy"] == "hybrid"
    assert_close(valid["alpha"], 0.6)
    assert_close(valid["beta"], 0.4)

    combined = unit_vector(0)
    skill_vectors = {
        "backend": [{"combinedVector": unit_vector(1).tolist()}],
        "frontend": [{"combinedVector": unit_vector(0).tolist()}],
        "mobile": [],
        "devops": [],
        "data_scientist": [],
    }
    probabilities = np.asarray([0.6, 0.3, 0.04, 0.03, 0.03], dtype=np.float32)

    baseline = rank_roles(
        probabilities,
        DummyLabelEncoder(),
        DummyClassifier(),
        combined,
        skill_vectors,
        {"strategy": "classifier_only", "alpha": 1.0, "beta": 0.0},
    )
    assert baseline[0]["modelLabel"] == "Backend"
    assert_close(baseline[0]["finalRoleScore"], float(probabilities[0]))

    prototype_only = rank_roles(
        probabilities,
        DummyLabelEncoder(),
        DummyClassifier(),
        combined,
        skill_vectors,
        {"strategy": "hybrid", "alpha": 0.0, "beta": 1.0},
    )
    assert prototype_only[0]["modelLabel"] == "Frontend"

    missing = role_prototype_similarity("mobile", combined, skill_vectors)
    assert missing["validSkillPrototypeCount"] == 0
    assert missing["normalizedPrototypeSimilarity"] == 0.0

    assert_close(normalize_cosine(-1.0), 0.0)
    assert_close(normalize_cosine(1.0), 1.0)

    ties = rank_roles(
        np.asarray([0.2, 0.2, 0.2, 0.2, 0.2], dtype=np.float32),
        DummyLabelEncoder(),
        DummyClassifier(),
        np.zeros(VECTOR_DIMS["combined"], dtype=np.float32),
        {},
        {"strategy": "classifier_only", "alpha": 1.0, "beta": 0.0},
    )
    assert [row["modelLabel"] for row in ties] == sorted(ROLE_MAPPING.keys())

    print("PASS: Dev2Vec role ranking calibration unit checks")


if __name__ == "__main__":
    main()
