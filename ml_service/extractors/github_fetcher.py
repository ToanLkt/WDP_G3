#!/usr/bin/env python3
"""Rate-limit-aware GitHub client and Dev2Vec dataset crawler CLI."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Callable

WarningSink = Callable[[dict[str, str]], None]
ALLOWED_LABELS = {"Backend", "Frontend", "Mobile", "DevOps", "Data Scientist"}


@dataclass
class FetchResult:
    data: Any
    ok: bool
    status: int


class GitHubFetcher:
    api_root = "https://api.github.com"

    def __init__(self, warning_sink: WarningSink, sleep_seconds: float = 0.2):
        self.token = os.environ.get("GITHUB_TOKEN", "").strip()
        self.warning_sink = warning_sink
        self.sleep_seconds = max(0.0, sleep_seconds)
        self.current_developer = ""
        self.current_repo = ""
        self.request_count = 0
        if not self.token:
            print(
                "warning: GITHUB_TOKEN is not set; GitHub allows only 60 requests/hour",
                file=sys.stderr,
            )

    def context(self, developer_id: str, repo_url: str) -> None:
        self.current_developer = developer_id
        self.current_repo = repo_url

    def warn(self, warning_type: str, message: str) -> None:
        item = {
            "developerId": self.current_developer,
            "repo": self.current_repo,
            "type": warning_type,
            "message": message,
        }
        self.warning_sink(item)
        print(
            f"warning [{warning_type}] {self.current_developer} "
            f"{self.current_repo}: {message}",
            file=sys.stderr,
        )

    def get(self, path: str, warning_type: str, optional: bool = False) -> FetchResult:
        url = path if path.startswith("http") else f"{self.api_root}{path}"
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "dev2vec-dataset-crawler",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        for attempt in range(2):
            if self.sleep_seconds:
                time.sleep(self.sleep_seconds)
            request = urllib.request.Request(url, headers=headers)
            self.request_count += 1
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = response.read()
                    return FetchResult(json.loads(payload) if payload else None, True, response.status)
            except urllib.error.HTTPError as exc:
                reset = int(exc.headers.get("X-RateLimit-Reset", "0") or 0)
                wait = max(0, reset - int(time.time()) + 1)
                if exc.code == 403 and attempt == 0 and 0 < wait <= 300:
                    print(f"rate limited; retrying in {wait}s", file=sys.stderr)
                    time.sleep(wait)
                    continue
                if not optional or exc.code not in (404, 409, 422):
                    self.warn(warning_type, f"GitHub API returned HTTP {exc.code}")
                return FetchResult(None, False, exc.code)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                if attempt == 0:
                    time.sleep(1)
                    continue
                self.warn(warning_type, f"request failed: {exc}")
                return FetchResult(None, False, 0)
        return FetchResult(None, False, 0)

    def content(self, owner: str, repo: str, path: str, optional: bool = True) -> str:
        encoded_path = urllib.parse.quote(path, safe="/")
        result = self.get(
            f"/repos/{owner}/{repo}/contents/{encoded_path}",
            "CONTENT_FETCH_FAILED",
            optional=optional,
        )
        if not result.ok or not isinstance(result.data, dict):
            return ""
        content = result.data.get("content", "")
        if result.data.get("encoding") != "base64" or not content:
            return ""
        try:
            return base64.b64decode(content).decode("utf-8", errors="replace")
        except (ValueError, TypeError):
            return ""


def parse_repo_url(repo_url: str) -> tuple[str, str]:
    parsed = urllib.parse.urlparse(repo_url)
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if parsed.netloc.lower() not in {"github.com", "www.github.com"} or len(parts) < 2:
        raise ValueError(f"invalid GitHub repository URL: {repo_url}")
    return parts[0], parts[1].removesuffix(".git")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--max-commits", type=int, default=30)
    parser.add_argument("--max-issues", type=int, default=30)
    parser.add_argument("--max-comments", type=int, default=3)
    parser.add_argument("--verify-contribution", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.2)
    parser.add_argument("--limit", type=int, help=argparse.SUPPRESS)
    return parser.parse_args()


def load_and_validate(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        samples = json.load(handle)
    if not isinstance(samples, list):
        raise ValueError("seed must be a JSON array")
    seen: set[str] = set()
    for index, sample in enumerate(samples):
        required = {"developerId", "label", "githubUsername", "repositories"}
        if not isinstance(sample, dict) or not required.issubset(sample):
            raise ValueError(f"seed item {index} is missing required fields")
        if sample["developerId"] in seen:
            raise ValueError(f"duplicate developerId: {sample['developerId']}")
        seen.add(sample["developerId"])
        if sample["label"] not in ALLOWED_LABELS:
            raise ValueError(f"invalid label: {sample['label']}")
        if not isinstance(sample["repositories"], list) or not sample["repositories"]:
            raise ValueError(f"{sample['developerId']} must contain at least one repository")
    return samples


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def verify_contribution(
    fetcher: GitHubFetcher, owner: str, repo: str, username: str
) -> None:
    result = fetcher.get(
        f"/repos/{owner}/{repo}/contributors?per_page=100",
        "CONTRIBUTORS_FETCH_FAILED",
        optional=True,
    )
    contributors = result.data if result.ok and isinstance(result.data, list) else []
    if not any(
        str(item.get("login", "")).lower() == username.lower()
        for item in contributors
    ):
        fetcher.warn(
            "CONTRIBUTION_NOT_VERIFIED",
            f"{username} was not found among the first 100 contributors",
        )


def make_summary(
    seed_count: int,
    extracted: list[dict],
    warnings: list[dict[str, str]],
    fetcher: GitHubFetcher,
    successful_repos: int,
    failed_repos: int,
) -> dict:
    def average(field: str) -> int:
        values = [item["sourceStats"][field] for item in extracted]
        return round(mean(values)) if values else 0

    return {
        "sampleCount": len(extracted),
        "seedSampleCount": seed_count,
        "samplesPerRole": dict(
            sorted(Counter(item["label"] for item in extracted).items())
        ),
        "developerIdsUnique": (
            len({item["developerId"] for item in extracted}) == len(extracted)
        ),
        "repoCountTotal": sum(
            item["sourceStats"]["repoCount"] for item in extracted
        ),
        "fetchSuccessRepoCount": successful_repos,
        "fetchFailureRepoCount": failed_repos,
        "githubRequestCount": fetcher.request_count,
        "avgRepoTextLength": average("repoTextLength"),
        "avgIssueTextLength": average("issueTextLength"),
        "avgApiTokenCount": average("apiTokenCount"),
        "emptyRepoDocumentCount": sum(
            not item["repoDocument"] for item in extracted
        ),
        "emptyIssueDocumentCount": sum(
            not item["issueDocument"] for item in extracted
        ),
        "emptyApiTokensCount": sum(not item["apiTokens"] for item in extracted),
        "warnings": warnings,
    }


def main() -> int:
    from api_document import extract_api_tokens
    from issues_document import build_issue_document, extract_issues
    from repo_document import build_repo_document, extract_repo

    args = parse_args()
    try:
        samples = load_and_validate(args.seed)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    selected = samples[: args.limit] if args.limit is not None else samples
    warnings: list[dict[str, str]] = []
    fetcher = GitHubFetcher(warnings.append, sleep_seconds=args.sleep)
    extracted: list[dict] = []
    successful_repos = 0
    failed_repos = 0

    for position, sample in enumerate(selected, start=1):
        developer_id = sample["developerId"]
        print(
            f"[{position}/{len(selected)}] extracting {developer_id}",
            file=sys.stderr,
        )
        repo_parts: list[str] = []
        issue_parts: list[str] = []
        config_files: dict[str, str] = {}
        issue_count = 0

        for repo_url in sample["repositories"]:
            fetcher.context(developer_id, repo_url)
            try:
                owner, repo = parse_repo_url(repo_url)
            except ValueError as exc:
                fetcher.warn("INVALID_REPO_URL", str(exc))
                failed_repos += 1
                continue

            repo_data = extract_repo(
                fetcher, owner, repo, max(1, min(args.max_commits, 30))
            )
            if repo_data.success:
                successful_repos += 1
            else:
                failed_repos += 1
            repo_parts.extend(repo_data.document_parts)
            config_files.update({
                f"{owner}/{repo}/{path}": text
                for path, text in repo_data.config_files.items()
            })

            issues = extract_issues(
                fetcher,
                owner,
                repo,
                max(1, min(args.max_issues, 30)),
                max(0, min(args.max_comments, 3)),
            )
            issue_parts.extend(issues.parts)
            issue_count += issues.count
            if args.verify_contribution:
                verify_contribution(
                    fetcher, owner, repo, sample["githubUsername"]
                )

        repo_document = build_repo_document(repo_parts)
        issue_document = build_issue_document(issue_parts)
        api_tokens = extract_api_tokens(config_files)
        extracted.append({
            "developerId": developer_id,
            "label": sample["label"],
            "githubUsername": sample["githubUsername"],
            "repositories": sample["repositories"],
            "repoDocument": repo_document,
            "issueDocument": issue_document,
            "apiTokens": api_tokens,
            "sourceStats": {
                "repoCount": len(sample["repositories"]),
                "repoTextLength": len(repo_document),
                "issueCount": issue_count,
                "issueTextLength": len(issue_document),
                "apiTokenCount": len(api_tokens),
            },
        })
        write_json(args.output, extracted)
        write_json(
            args.summary,
            make_summary(
                len(samples),
                extracted,
                warnings,
                fetcher,
                successful_repos,
                failed_repos,
            ),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
