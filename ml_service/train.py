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
from sklearn.preprocessing import LabelEncoder

MODEL_VERSION = "dev2vec-demo-v1"
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
        "apiSkillTokens": ["router", "controller", "request", "response", "express"],
    },
    {
        "skillName": "Database", "canonicalSkillName": "Database",
        "roleIds": ["backend"],
        "repoSkillDocument": "database schema query migration transaction repository persistence",
        "issueSkillDocument": "fix query migration database connection transaction performance",
        "apiSkillTokens": ["postgresql", "mysql", "mongodb", "mongoose", "sequelize"],
    },
    {
        "skillName": "Authentication", "canonicalSkillName": "Authentication",
        "roleIds": ["backend"],
        "repoSkillDocument": "authentication authorization user session token password security",
        "issueSkillDocument": "fix login permission token expiry access security",
        "apiSkillTokens": ["jsonwebtoken", "passport", "oauth", "bcrypt", "session"],
    },
    {
        "skillName": "API Testing", "canonicalSkillName": "API Testing",
        "roleIds": ["backend"],
        "repoSkillDocument": "api integration unit test endpoint mock assertion coverage",
        "issueSkillDocument": "test endpoint regression mock failure expected response",
        "apiSkillTokens": ["jest", "pytest", "supertest", "junit", "mockito"],
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
        "apiSkillTokens": ["react", "react-dom", "jsx", "vite"],
    },
    {
        "skillName": "Component Design", "canonicalSkillName": "Component Design",
        "roleIds": ["frontend"],
        "repoSkillDocument": "reusable component design system props composition storybook",
        "issueSkillDocument": "component behavior props styling accessibility reuse",
        "apiSkillTokens": ["storybook", "styled-components", "tailwindcss", "sass"],
    },
    {
        "skillName": "State Management", "canonicalSkillName": "State Management",
        "roleIds": ["frontend"],
        "repoSkillDocument": "frontend state store action reducer reactive data flow",
        "issueSkillDocument": "state update stale data store synchronization render",
        "apiSkillTokens": ["redux", "zustand", "pinia", "mobx", "rxjs"],
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
        "apiSkillTokens": ["css", "tailwindcss", "bootstrap", "sass"],
    },
    {
        "skillName": "Mobile UI", "canonicalSkillName": "Mobile UI",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile app user interface screen widget layout animation",
        "issueSkillDocument": "mobile screen layout gesture rendering device",
        "apiSkillTokens": ["flutter", "react-native", "swiftui", "jetpack-compose"],
    },
    {
        "skillName": "Navigation", "canonicalSkillName": "Navigation",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile navigation route screen stack tab deep link",
        "issueSkillDocument": "navigation back stack route screen deep link",
        "apiSkillTokens": ["react-navigation", "go-router", "navigation-compose"],
    },
    {
        "skillName": "Local Storage", "canonicalSkillName": "Local Storage",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile local storage database cache preferences offline persistence",
        "issueSkillDocument": "offline data cache migration storage synchronization",
        "apiSkillTokens": ["sqlite", "room", "realm", "shared_preferences", "async-storage"],
    },
    {
        "skillName": "API Integration", "canonicalSkillName": "API Integration",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile api client network request response serialization",
        "issueSkillDocument": "network request timeout response parsing api error",
        "apiSkillTokens": ["retrofit", "dio", "axios", "urlsession", "http"],
    },
    {
        "skillName": "App State Management", "canonicalSkillName": "App State Management",
        "roleIds": ["mobile"],
        "repoSkillDocument": "mobile application state store event reactive lifecycle",
        "issueSkillDocument": "state lifecycle update background foreground synchronization",
        "apiSkillTokens": ["bloc", "provider", "riverpod", "redux", "mobx"],
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
        "apiSkillTokens": ["kubernetes", "kubectl", "helm", "kustomize"],
    },
    {
        "skillName": "CI/CD", "canonicalSkillName": "CI/CD",
        "roleIds": ["devops"],
        "repoSkillDocument": "continuous integration delivery pipeline build test release deploy",
        "issueSkillDocument": "pipeline build failure release deployment automation",
        "apiSkillTokens": ["actions/checkout", "github-actions", "jenkins", "gitlab-ci"],
    },
    {
        "skillName": "Infrastructure as Code", "canonicalSkillName": "Infrastructure as Code",
        "roleIds": ["devops"],
        "repoSkillDocument": "infrastructure as code cloud provisioning configuration automation",
        "issueSkillDocument": "infrastructure plan state provision resource configuration",
        "apiSkillTokens": ["terraform", "ansible", "pulumi", "cloudformation"],
    },
    {
        "skillName": "Monitoring", "canonicalSkillName": "Monitoring",
        "roleIds": ["devops"],
        "repoSkillDocument": "monitoring observability metrics logs traces alert dashboard",
        "issueSkillDocument": "alert metric log incident latency availability",
        "apiSkillTokens": ["prometheus", "grafana", "opentelemetry", "datadog"],
    },
    {
        "skillName": "Data Analysis", "canonicalSkillName": "Data Analysis",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "data analysis dataframe statistics exploration cleaning feature",
        "issueSkillDocument": "dataset quality missing value analysis metric",
        "apiSkillTokens": ["pandas", "numpy", "scipy", "jupyter"],
    },
    {
        "skillName": "Machine Learning", "canonicalSkillName": "Machine Learning",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "machine learning model feature prediction classification regression",
        "issueSkillDocument": "model accuracy prediction feature evaluation dataset",
        "apiSkillTokens": ["scikit-learn", "tensorflow", "pytorch", "xgboost"],
    },
    {
        "skillName": "Model Training", "canonicalSkillName": "Model Training",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "model training validation optimization hyperparameter experiment pipeline",
        "issueSkillDocument": "training loss convergence checkpoint validation performance",
        "apiSkillTokens": ["torch", "keras", "mlflow", "optuna"],
    },
    {
        "skillName": "Data Visualization", "canonicalSkillName": "Data Visualization",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "data visualization chart plot dashboard statistical graphics",
        "issueSkillDocument": "chart axis plot legend dashboard visualization",
        "apiSkillTokens": ["matplotlib", "seaborn", "plotly", "altair"],
    },
    {
        "skillName": "NLP Basics", "canonicalSkillName": "NLP Basics",
        "roleIds": ["data_scientist"],
        "repoSkillDocument": "natural language processing text token embedding classification",
        "issueSkillDocument": "text preprocessing token model language evaluation",
        "apiSkillTokens": ["transformers", "nltk", "spacy", "gensim"],
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
            "combinedVector": [float(value) for value in combined],
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
                "validationStrategy": "not_promoted",
                "metrics": {},
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
