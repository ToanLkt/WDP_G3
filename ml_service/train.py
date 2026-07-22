#!/usr/bin/env python3
"""Train Dev2Vec artifacts locally. Never run this script in production."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from gensim.models.doc2vec import Doc2Vec, TaggedDocument
from gensim.utils import simple_preprocess
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import LabelEncoder

MODEL_VERSION = "dev2vec-demo-v4"
VECTOR_DIMS = {"repo": 230, "issue": 150, "api": 200, "combined": 580}
ROLE_ORDER = ["Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"]
ROLE_IDS = ["backend", "frontend", "mobile", "devops", "data_scientist"]
ROLE_ID_BY_LABEL = dict(zip(ROLE_ORDER, ROLE_IDS))
REQUIRED_FIELDS = {
    "developerId", "label", "githubUsername", "repositories",
    "repoDocument", "issueDocument", "apiTokens", "sourceStats",
}

SKILL_PROTOTYPES = [
    {
        "skillName": "REST API", "canonicalSkillName": "REST API",
        "roleIds": ["backend"],
        "repoSkillDocument": "backend server rest api controller route endpoint request response validation",
        "issueSkillDocument": "fix api endpoint request response validation status error",
        "apiSkillTokens": ["express", "nestjs", "fastapi", "spring-web", "aspnetcore", "router", "controller"],
    },
    {
        "skillName": "Database", "canonicalSkillName": "Database",
        "roleIds": ["backend"],
        "repoSkillDocument": "database schema query migration transaction repository persistence",
        "issueSkillDocument": "fix query migration database connection transaction performance",
        "apiSkillTokens": ["postgresql", "mysql", "mongodb", "mongoose", "sequelize", "prisma", "typeorm", "sqlalchemy", "hibernate", "redis"],
    },
    {
        "skillName": "Authentication", "canonicalSkillName": "Authentication",
        "roleIds": ["backend"],
        "repoSkillDocument": "authentication authorization user session token password security",
        "issueSkillDocument": "fix login permission token expiry access security",
        "apiSkillTokens": ["jsonwebtoken", "passport", "oauth", "bcrypt", "spring-security", "jose", "auth0"],
    },
    {
        "skillName": "API Testing", "canonicalSkillName": "API Testing",
        "roleIds": ["backend"],
        "repoSkillDocument": "api integration unit test endpoint mock assertion coverage",
        "issueSkillDocument": "test endpoint regression mock failure expected response",
        "apiSkillTokens": ["jest", "pytest", "supertest", "chai-http", "junit", "mockito", "testcontainers"],
    },
    {
        "skillName": "Docker Basics", "canonicalSkillName": "Docker Basics",
        "roleIds": ["backend"],
        "repoSkillDocument": "docker container backend service image compose deployment",
        "issueSkillDocument": "container build image environment service startup",
        "apiSkillTokens": ["docker", "docker-compose", "container", "image"],
    },
    {
        "skillName": "React UI", "canonicalSkillName": "React UI",
        "roleIds": ["frontend"],
        "repoSkillDocument": "react frontend user interface jsx component hook rendering",
        "issueSkillDocument": "fix ui render component hook browser interaction",
        "apiSkillTokens": ["react", "react-dom", "next", "jsx", "vite"],
    },
    {
        "skillName": "Component Design", "canonicalSkillName": "Component Design",
        "roleIds": ["frontend"],
        "repoSkillDocument": "reusable component design system props composition storybook",
        "issueSkillDocument": "component behavior props styling accessibility reuse",
        "apiSkillTokens": ["storybook", "styled-components", "tailwindcss", "sass", "vue"],
    },
    {
        "skillName": "State Management", "canonicalSkillName": "State Management",
        "roleIds": ["frontend"],
        "repoSkillDocument": "frontend state store action reducer reactive data flow",
        "issueSkillDocument": "state update stale data store synchronization render",
        "apiSkillTokens": ["redux", "zustand", "pinia", "mobx", "rxjs", "vuex"],
    },
    {
        "skillName": "Frontend Testing", "canonicalSkillName": "Frontend Testing",
        "roleIds": ["frontend"],
        "repoSkillDocument": "frontend component browser unit integration end to end testing",
        "issueSkillDocument": "ui regression test browser assertion interaction failure",
        "apiSkillTokens": ["vitest", "jest", "playwright", "cypress", "testing-library"],
    },
    {
        "skillName": "Responsive Design", "canonicalSkillName": "Responsive Design",
        "roleIds": ["frontend"],
        "repoSkillDocument": "responsive web design mobile layout css grid flexbox accessibility",
        "issueSkillDocument": "layout breakpoint viewport mobile style accessibility",
        "apiSkillTokens": ["css", "tailwindcss", "bootstrap", "sass", "scss"],
    },
    {
        "skillName": "Mobile UI", "canonicalSkillName": "Mobile UI",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile app user interface screen widget layout animation",
        "issueSkillDocument": "mobile screen layout gesture rendering device",
        "apiSkillTokens": ["flutter", "react-native", "swiftui", "jetpack-compose", "androidx.compose"],
    },
    {
        "skillName": "Navigation", "canonicalSkillName": "Navigation",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile navigation route screen stack tab deep link",
        "issueSkillDocument": "navigation back stack route screen deep link",
        "apiSkillTokens": ["react-navigation", "go-router", "navigation-compose", "auto_route"],
    },
    {
        "skillName": "Local Storage", "canonicalSkillName": "Local Storage",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile local storage database cache preferences offline persistence",
        "issueSkillDocument": "offline data cache migration storage synchronization",
        "apiSkillTokens": ["sqlite", "room", "realm", "shared_preferences", "async-storage", "hive", "coredata"],
    },
    {
        "skillName": "API Integration", "canonicalSkillName": "API Integration",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile api client network request response serialization",
        "issueSkillDocument": "network request timeout response parsing api error",
        "apiSkillTokens": ["retrofit", "dio", "axios", "urlsession", "alamofire"],
    },
    {
        "skillName": "App State Management", "canonicalSkillName": "App State Management",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile application state store event reactive lifecycle",
        "issueSkillDocument": "state lifecycle update background foreground synchronization",
        "apiSkillTokens": ["bloc", "provider", "riverpod", "redux", "mobx", "livedata"],
    },
    {
        "skillName": "Docker", "canonicalSkillName": "Docker",
        "roleIds": ["devops"],
        "repoSkillDocument": "docker container image registry compose build deployment",
        "issueSkillDocument": "container image build runtime registry deployment",
        "apiSkillTokens": ["docker", "docker-compose", "build-push-action"],
    },
    {
        "skillName": "Kubernetes", "canonicalSkillName": "Kubernetes",
        "roleIds": ["devops"],
        "repoSkillDocument": "kubernetes cluster pod service deployment ingress helm",
        "issueSkillDocument": "cluster pod scheduling rollout service ingress failure",
        "apiSkillTokens": ["kubernetes", "kubectl", "helm", "kustomize", "client-go"],
    },
    {
        "skillName": "CI/CD", "canonicalSkillName": "CI/CD",
        "roleIds": ["devops"],
        "repoSkillDocument": "continuous integration delivery pipeline build test release deploy",
        "issueSkillDocument": "pipeline build failure release deployment automation",
        "apiSkillTokens": ["actions/checkout", "github-actions", "jenkins", "gitlab-ci", "circleci"],
    },
    {
        "skillName": "Infrastructure as Code", "canonicalSkillName": "Infrastructure as Code",
        "roleIds": ["devops"],
        "repoSkillDocument": "infrastructure as code cloud provisioning configuration automation",
        "issueSkillDocument": "infrastructure plan state provision resource configuration",
        "apiSkillTokens": ["terraform", "ansible", "pulumi", "cloudformation", "bicep"],
    },
    {
        "skillName": "Monitoring", "canonicalSkillName": "Monitoring",
        "roleIds": ["devops"],
        "repoSkillDocument": "monitoring observability metrics logs traces alert dashboard",
        "issueSkillDocument": "alert metric log incident latency availability",
        "apiSkillTokens": ["prometheus", "grafana", "opentelemetry", "datadog", "jaeger"],
    },
    {
        "skillName": "Data Analysis", "canonicalSkillName": "Data Analysis",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "data analysis dataframe statistics exploration cleaning feature",
        "issueSkillDocument": "dataset quality missing value analysis metric",
        "apiSkillTokens": ["pandas", "numpy", "scipy", "jupyter", "polars", "statsmodels"],
    },
    {
        "skillName": "Machine Learning", "canonicalSkillName": "Machine Learning",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "machine learning model feature prediction classification regression",
        "issueSkillDocument": "model accuracy prediction feature evaluation dataset",
        "apiSkillTokens": ["scikit-learn", "sklearn", "tensorflow", "pytorch", "torch", "xgboost"],
    },
    {
        "skillName": "Model Training", "canonicalSkillName": "Model Training",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "model training validation optimization hyperparameter experiment pipeline",
        "issueSkillDocument": "training loss convergence checkpoint validation performance",
        "apiSkillTokens": ["torch", "keras", "mlflow", "optuna", "lightning", "transformers"],
    },
    {
        "skillName": "Data Visualization", "canonicalSkillName": "Data Visualization",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "data visualization chart plot dashboard statistical graphics",
        "issueSkillDocument": "chart axis plot legend dashboard visualization",
        "apiSkillTokens": ["matplotlib", "seaborn", "plotly", "altair", "bokeh"],
    },
    {
        "skillName": "NLP Basics", "canonicalSkillName": "NLP Basics",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "natural language processing text token embedding classification",
        "issueSkillDocument": "text preprocessing token model language evaluation",
        "apiSkillTokens": ["transformers", "nltk", "spacy", "gensim", "sentence-transformers"],
    },
]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument(
        "--missing-channel-augmentation",
        action="store_true",
        help="Augment classifier training with zero issue/API channel variants after dataset loading.",
    )
    parser.add_argument(
        "--cv-folds",
        type=int,
        default=5,
        help="Number of group-aware stratified folds used for out-of-fold evaluation (default: 5).",
    )
    return parser.parse_args()


def tokenize(text):
    return simple_preprocess(str(text), deacc=True, min_len=2, max_len=50)


def validate_dataset(data):
    if not isinstance(data, list) or not data:
        raise ValueError("dataset must be a non-empty JSON array")
    seen = set()
    for index, item in enumerate(data):
        if not isinstance(item, dict) or not REQUIRED_FIELDS.issubset(item):
            raise ValueError("dataset item %d is missing required fields" % index)
        if item["developerId"] in seen:
            raise ValueError("duplicate developerId: %s" % item["developerId"])
        seen.add(item["developerId"])
        if item["label"] not in ROLE_ORDER:
            raise ValueError("unsupported label: %s" % item["label"])
        if not isinstance(item["apiTokens"], list):
            raise ValueError("apiTokens must be an array at item %d" % index)


def train_doc2vec(documents, vector_size, dm, seed):
    tagged = [
        TaggedDocument(words=tokens or ["__empty__"], tags=[tag])
        for tag, tokens in documents
    ]
    model = Doc2Vec(
        vector_size=vector_size,
        dm=dm,
        min_count=1,
        workers=1,
        epochs=30,
        window=5,
        seed=seed,
        negative=5,
    )
    model.build_vocab(tagged)
    model.train(tagged, total_examples=model.corpus_count, epochs=model.epochs)
    return model


def source_vector(model, tag, has_source, vector_size):
    if not has_source:
        return np.zeros(vector_size, dtype=np.float32)
    return np.asarray(model.dv[tag], dtype=np.float32)


def infer_vector(model, text, has_source, vector_size, seed):
    if not has_source:
        return np.zeros(vector_size, dtype=np.float32)
    tokens = tokenize(text)
    if not tokens:
        return np.zeros(vector_size, dtype=np.float32)
    model.random.seed(seed)
    return np.asarray(model.infer_vector(tokens, epochs=30), dtype=np.float32)


def write_json(path, value):
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def augment_missing_channel_vectors(vectors, labels):
    augmented_vectors = []
    augmented_labels = []
    repo_end = VECTOR_DIMS["repo"]
    issue_end = VECTOR_DIMS["repo"] + VECTOR_DIMS["issue"]
    for vector, label in zip(vectors, labels):
        variants = [
            vector,
            np.concatenate([vector[:repo_end], np.zeros(VECTOR_DIMS["issue"], dtype=np.float32), vector[issue_end:]]),
            np.concatenate([vector[:issue_end], np.zeros(VECTOR_DIMS["api"], dtype=np.float32)]),
            np.concatenate([
                vector[:repo_end],
                np.zeros(VECTOR_DIMS["issue"], dtype=np.float32),
                np.zeros(VECTOR_DIMS["api"], dtype=np.float32),
            ]),
        ]
        for variant in variants:
            if variant.shape[0] != VECTOR_DIMS["combined"]:
                raise ValueError("augmented vector has invalid length")
            augmented_vectors.append(variant)
            augmented_labels.append(label)
    return augmented_vectors, augmented_labels


def repository_groups(data):
    """Keep samples sharing a repository in the same evaluation fold."""
    parents = list(range(len(data)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left, right):
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    repo_owner = {}
    duplicate_repositories = set()
    for index, item in enumerate(data):
        for repo_url in item["repositories"]:
            normalized = str(repo_url).strip().lower().rstrip("/")
            if normalized in repo_owner:
                union(index, repo_owner[normalized])
                duplicate_repositories.add(normalized)
            else:
                repo_owner[normalized] = index
    return np.asarray([find(index) for index in range(len(data))]), len(
        duplicate_repositories
    )


def combined_vectors_for_indices(
    data,
    indices,
    repo_model,
    issue_model,
    api_model,
    infer_documents=False,
    seed_offset=0,
):
    vectors = []
    for index in indices:
        item = data[int(index)]
        if infer_documents:
            repo_vector = infer_vector(
                repo_model,
                item["repoDocument"],
                bool(item["repoDocument"].strip()),
                VECTOR_DIMS["repo"],
                seed_offset + 10_000 + int(index),
            )
            issue_vector = infer_vector(
                issue_model,
                item["issueDocument"],
                bool(item["issueDocument"].strip()),
                VECTOR_DIMS["issue"],
                seed_offset + 20_000 + int(index),
            )
            api_vector = infer_vector(
                api_model,
                " ".join(item["apiTokens"]),
                bool(item["apiTokens"]),
                VECTOR_DIMS["api"],
                seed_offset + 30_000 + int(index),
            )
        else:
            developer_id = item["developerId"]
            repo_vector = source_vector(
                repo_model,
                developer_id,
                bool(item["repoDocument"].strip()),
                VECTOR_DIMS["repo"],
            )
            issue_vector = source_vector(
                issue_model,
                developer_id,
                bool(item["issueDocument"].strip()),
                VECTOR_DIMS["issue"],
            )
            api_vector = source_vector(
                api_model,
                developer_id,
                bool(item["apiTokens"]),
                VECTOR_DIMS["api"],
            )
        combined = np.concatenate([repo_vector, issue_vector, api_vector])
        if combined.shape[0] != VECTOR_DIMS["combined"]:
            raise ValueError("combined evaluation vector has invalid length")
        vectors.append(combined)
    return vectors


def top_k_accuracy(encoded_labels, probabilities, k):
    top_indices = np.argsort(-probabilities, axis=1)[:, :k]
    return float(
        np.mean(
            [
                int(label) in predictions
                for label, predictions in zip(encoded_labels, top_indices)
            ]
        )
    )


def rounded(value):
    return round(float(value), 6)


def evaluate_role_classifier(data, cv_folds, missing_channel_augmentation):
    if cv_folds < 2:
        raise ValueError("--cv-folds must be at least 2")
    role_counts = Counter(item["label"] for item in data)
    smallest_role = min(role_counts.values())
    if cv_folds > smallest_role:
        raise ValueError(
            "--cv-folds cannot exceed the smallest role sample count (%d)"
            % smallest_role
        )

    labels = [item["label"] for item in data]
    label_encoder = LabelEncoder()
    label_encoder.fit(ROLE_ORDER)
    encoded_labels = label_encoder.transform(labels)
    groups, duplicate_repo_count = repository_groups(data)
    splitter = StratifiedGroupKFold(
        n_splits=cv_folds, shuffle=True, random_state=42
    )
    oof_predictions = np.full(len(data), -1, dtype=np.int64)
    oof_probabilities = np.zeros((len(data), len(ROLE_ORDER)), dtype=np.float64)
    fold_metrics = []

    all_repo_docs = [
        (item["developerId"], tokenize(item["repoDocument"])) for item in data
    ]
    all_issue_docs = [
        (item["developerId"], tokenize(item["issueDocument"])) for item in data
    ]
    all_api_docs = [
        (item["developerId"], tokenize(" ".join(item["apiTokens"])))
        for item in data
    ]

    for fold_number, (train_indices, test_indices) in enumerate(
        splitter.split(np.zeros(len(data)), encoded_labels, groups), start=1
    ):
        print(
            "Evaluating fold %d/%d..." % (fold_number, cv_folds),
            file=sys.stderr,
        )
        repo_model = train_doc2vec(
            [all_repo_docs[index] for index in train_indices],
            VECTOR_DIMS["repo"],
            dm=1,
            seed=4100 + fold_number,
        )
        issue_model = train_doc2vec(
            [all_issue_docs[index] for index in train_indices],
            VECTOR_DIMS["issue"],
            dm=1,
            seed=4200 + fold_number,
        )
        api_model = train_doc2vec(
            [all_api_docs[index] for index in train_indices],
            VECTOR_DIMS["api"],
            dm=0,
            seed=4300 + fold_number,
        )
        train_vectors = combined_vectors_for_indices(
            data,
            train_indices,
            repo_model,
            issue_model,
            api_model,
        )
        train_labels = encoded_labels[train_indices].tolist()
        if missing_channel_augmentation:
            train_vectors, train_labels = augment_missing_channel_vectors(
                train_vectors, train_labels
            )
        classifier = LogisticRegression(
            max_iter=2000, random_state=42, solver="lbfgs"
        )
        classifier.fit(np.vstack(train_vectors), train_labels)
        test_vectors = combined_vectors_for_indices(
            data,
            test_indices,
            repo_model,
            issue_model,
            api_model,
            infer_documents=True,
            seed_offset=fold_number * 100_000,
        )
        probabilities = classifier.predict_proba(np.vstack(test_vectors))
        aligned_probabilities = np.zeros((len(test_indices), len(ROLE_ORDER)))
        aligned_probabilities[:, classifier.classes_.astype(int)] = probabilities
        predictions = np.argmax(aligned_probabilities, axis=1)
        oof_predictions[test_indices] = predictions
        oof_probabilities[test_indices] = aligned_probabilities
        fold_truth = encoded_labels[test_indices]
        fold_metrics.append(
            {
                "fold": fold_number,
                "trainSize": int(len(train_indices)),
                "testSize": int(len(test_indices)),
                "accuracy": rounded(accuracy_score(fold_truth, predictions)),
                "macroF1": rounded(
                    f1_score(fold_truth, predictions, average="macro", zero_division=0)
                ),
                "top3Accuracy": rounded(
                    top_k_accuracy(fold_truth, aligned_probabilities, 3)
                ),
            }
        )

    if np.any(oof_predictions < 0):
        raise ValueError("cross-validation did not predict every sample")
    ordered_class_ids = label_encoder.transform(ROLE_ORDER)
    precision, recall, per_role_f1, support = precision_recall_fscore_support(
        encoded_labels,
        oof_predictions,
        labels=ordered_class_ids,
        zero_division=0,
    )
    matrix = confusion_matrix(
        encoded_labels, oof_predictions, labels=ordered_class_ids
    )
    per_role = {}
    for index, role in enumerate(ROLE_ORDER):
        per_role[role] = {
            "precision": rounded(precision[index]),
            "recall": rounded(recall[index]),
            "f1": rounded(per_role_f1[index]),
            "support": int(support[index]),
        }
    accuracy_values = [item["accuracy"] for item in fold_metrics]
    macro_f1_values = [item["macroF1"] for item in fold_metrics]
    top3_values = [item["top3Accuracy"] for item in fold_metrics]
    return {
        "foldCount": cv_folds,
        "randomState": 42,
        "groupedBySharedRepository": True,
        "duplicateRepositoryCount": duplicate_repo_count,
        "accuracy": rounded(accuracy_score(encoded_labels, oof_predictions)),
        "accuracyFoldStd": rounded(np.std(accuracy_values)),
        "balancedAccuracy": rounded(
            balanced_accuracy_score(encoded_labels, oof_predictions)
        ),
        "macroF1": rounded(
            f1_score(encoded_labels, oof_predictions, average="macro", zero_division=0)
        ),
        "macroF1FoldStd": rounded(np.std(macro_f1_values)),
        "weightedF1": rounded(
            f1_score(
                encoded_labels, oof_predictions, average="weighted", zero_division=0
            )
        ),
        "top3Accuracy": rounded(
            top_k_accuracy(encoded_labels, oof_probabilities, 3)
        ),
        "top3AccuracyFoldStd": rounded(np.std(top3_values)),
        "logLoss": rounded(
            log_loss(encoded_labels, oof_probabilities, labels=np.arange(len(ROLE_ORDER)))
        ),
        "confusionMatrixLabels": ROLE_ORDER,
        "confusionMatrix": matrix.astype(int).tolist(),
        "perRole": per_role,
        "folds": fold_metrics,
    }


def generate_skill_vectors(repo_model, issue_model, api_model):
    by_role = {role_id: [] for role_id in ROLE_IDS}
    for index, skill in enumerate(SKILL_PROTOTYPES):
        repo_vector = infer_vector(
            repo_model, skill["repoSkillDocument"],
            bool(skill["repoSkillDocument"].strip()), VECTOR_DIMS["repo"], 1000 + index,
        )
        issue_vector = infer_vector(
            issue_model, skill["issueSkillDocument"],
            bool(skill["issueSkillDocument"].strip()), VECTOR_DIMS["issue"], 2000 + index,
        )
        api_text = " ".join(skill["apiSkillTokens"])
        api_vector = infer_vector(
            api_model, api_text, bool(skill["apiSkillTokens"]),
            VECTOR_DIMS["api"], 3000 + index,
        )
        combined = np.concatenate([repo_vector, issue_vector, api_vector])
        entry = {
            "skillName": skill["skillName"],
            "canonicalSkillName": skill["canonicalSkillName"],
            "repoVector": [float(value) for value in repo_vector],
            "issueVector": [float(value) for value in issue_vector],
            "apiVector": [float(value) for value in api_vector],
            "combinedVector": [float(value) for value in combined],
            "apiSkillTokens": list(skill["apiSkillTokens"]),
            "prototypeVersion": MODEL_VERSION,
        }
        for role_id in skill["roleIds"]:
            by_role[role_id].append(entry)
    return by_role


def main():
    args = parse_args()
    root = Path(__file__).resolve().parent
    artifacts = root / "artifacts"
    artifacts.mkdir(exist_ok=True)

    try:
        with args.dataset.open(encoding="utf-8") as handle:
            data = json.load(handle)
        validate_dataset(data)

        evaluation_metrics = evaluate_role_classifier(
            data,
            args.cv_folds,
            args.missing_channel_augmentation,
        )

        repo_docs = [
            (item["developerId"], tokenize(item["repoDocument"])) for item in data
        ]
        issue_docs = [
            (item["developerId"], tokenize(item["issueDocument"])) for item in data
        ]
        api_docs = [
            (item["developerId"], tokenize(" ".join(item["apiTokens"]))) for item in data
        ]
        print("Training repository Doc2Vec...", file=sys.stderr)
        repo_model = train_doc2vec(repo_docs, VECTOR_DIMS["repo"], dm=1, seed=41)
        print("Training issue Doc2Vec...", file=sys.stderr)
        issue_model = train_doc2vec(issue_docs, VECTOR_DIMS["issue"], dm=1, seed=42)
        print("Training API Doc2Vec...", file=sys.stderr)
        api_model = train_doc2vec(api_docs, VECTOR_DIMS["api"], dm=0, seed=43)

        combined_vectors = []
        labels = []
        for item in data:
            developer_id = item["developerId"]
            repo_vector = source_vector(
                repo_model, developer_id, bool(item["repoDocument"].strip()),
                VECTOR_DIMS["repo"],
            )
            issue_vector = source_vector(
                issue_model, developer_id, bool(item["issueDocument"].strip()),
                VECTOR_DIMS["issue"],
            )
            api_vector = source_vector(
                api_model, developer_id, bool(item["apiTokens"]), VECTOR_DIMS["api"],
            )
            combined = np.concatenate([repo_vector, issue_vector, api_vector])
            if combined.shape[0] != VECTOR_DIMS["combined"]:
                raise ValueError("combined training vector has invalid length")
            combined_vectors.append(combined)
            labels.append(item["label"])

        classifier_vectors = combined_vectors
        classifier_labels = labels
        training_strategy = "full-channel-training-current-artifact"
        supports_missing_channels = False
        if args.missing_channel_augmentation:
            classifier_vectors, classifier_labels = augment_missing_channel_vectors(combined_vectors, labels)
            training_strategy = "missing-channel-augmentation"
            supports_missing_channels = True

        label_encoder = LabelEncoder()
        encoded_labels = label_encoder.fit_transform(classifier_labels)
        classifier = LogisticRegression(
            max_iter=2000, random_state=42, solver="lbfgs"
        )
        classifier.fit(np.vstack(classifier_vectors), encoded_labels)

        repo_model.save(str(artifacts / "doc2vec_repo.model"))
        issue_model.save(str(artifacts / "doc2vec_issue.model"))
        api_model.save(str(artifacts / "doc2vec_api.model"))
        joblib.dump(classifier, artifacts / "role_classifier.joblib")
        joblib.dump(label_encoder, artifacts / "label_encoder.joblib")
        write_json(artifacts / "skill_prototypes.json", SKILL_PROTOTYPES)
        write_json(
            artifacts / "skill_vectors.json",
            generate_skill_vectors(repo_model, issue_model, api_model),
        )

        role_counts = Counter(item["label"] for item in data)
        metadata = {
            "status": "ready",
            "modelVersion": MODEL_VERSION,
            "modelType": "classifier_ria",
            "inputDimension": VECTOR_DIMS["combined"],
            "channels": ["repo", "issue", "api"],
            "supportsMissingChannels": supports_missing_channels,
            "trainingStrategy": training_strategy,
            "trainedAt": (
                datetime.now(timezone.utc).isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            ),
            "roles": ROLE_ORDER,
            "roleIds": ROLE_IDS,
            "vectorDims": VECTOR_DIMS,
            "artifactCompatibility": {
                "requiresInputDimension": VECTOR_DIMS["combined"],
                "zeroVectorMissingChannelFallback": True,
                "missingChannelSupportNote": (
                    "Runtime can preserve shape with zero placeholders, but this training script "
                    "does not apply missing-channel augmentation yet."
                ),
            },
            "roleScoring": {
                "strategy": "classifier_only",
                "alpha": 1.0,
                "beta": 0.0,
                "calibrationMethod": "none",
                "scoringVersion": "classifier-only-v1",
                "validationStrategy": (
                    "stratified_group_%d_fold_out_of_fold" % args.cv_folds
                ),
                "metrics": evaluation_metrics,
            },
            "skillGapScoring": {
                "strategy": "channel_weighted_v1",
                "weights": {"repo": 0.35, "issue": 0.15, "api": 0.5},
                "repoIssueSimilarity": "positive_cosine",
                "apiSimilarity": "direct_token_overlap_two_matches_full_score",
                "renormalizeMissingChannels": True,
            },
            "dataset": {
                "sampleCount": len(data),
                "classifierSampleCount": len(classifier_labels),
                "missingChannelAugmentation": args.missing_channel_augmentation,
                "samplesPerRole": {
                    role: role_counts.get(role, 0) for role in ROLE_ORDER
                },
            },
            "artifacts": {
                "doc2vecRepo": True,
                "doc2vecIssue": True,
                "doc2vecApi": True,
                "classifier": True,
                "skillPrototypes": True,
            },
        }
        write_json(artifacts / "model_metadata.json", metadata)
        print("Dev2Vec training complete: %s" % artifacts, file=sys.stderr)
        return 0
    except Exception as exc:
        print("Training failed: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
