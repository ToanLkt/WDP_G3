#!/usr/bin/env python3
"""Rate-limit-aware GitHub client and Dev2Vec dataset crawler CLI."""

from __future__ import annotations

import argparse
import base64
import json
import os
import socket
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
EXTRACTION_VERSION = "dev2vec-dataset-v3-contribution-gated"


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

        for attempt in range(3):
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
                retry_after = int(exc.headers.get("Retry-After", "0") or 0)
                remaining = int(exc.headers.get("X-RateLimit-Remaining", "-1") or -1)
                wait = retry_after or max(0, reset - int(time.time()) + 1)
                if exc.code == 429 and wait <= 0:
                    wait = min(300, 60 * (attempt + 1))
                if exc.code == 403 and remaining != 0:
                    wait = retry_after or min(300, 60 * (attempt + 1))
                if exc.code in (403, 429) and attempt < 2 and 0 < wait <= 3700:
                    print(
                        f"rate limited (HTTP {exc.code}); retrying in {wait}s",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
                    continue
                if not optional or exc.code not in (404, 409, 422):
                    self.warn(warning_type, f"GitHub API returned HTTP {exc.code}")
                return FetchResult(None, False, exc.code)
            except (
                urllib.error.URLError,
                TimeoutError,
                socket.timeout,
                ConnectionResetError,
                json.JSONDecodeError,
            ) as exc:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                self.warn(warning_type, f"request failed: {exc}")
                return FetchResult(None, False, 0)
        return FetchResult(None, False, 0)

    def content(
        self,
        owner: str,
        repo: str,
        path: str,
        optional: bool = True,
        ref: str | None = None,
    ) -> str:
        encoded_path = urllib.parse.quote(path, safe="/")
        query = "?" + urllib.parse.urlencode({"ref": ref}) if ref else ""
        result = self.get(
            f"/repos/{owner}/{repo}/contents/{encoded_path}{query}",
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
    parser.add_argument("--max-source-files", type=int, default=10)
    parser.add_argument("--min-changed-lines", type=int, default=5)
    parser.add_argument("--min-api-frequency", type=int, default=5)
    parser.add_argument("--verify-contribution", action="store_true")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume a v3 prefix already written to --output",
    )
    parser.add_argument("--sleep", type=float, default=0.2)
    parser.add_argument(
        "--developer-id",
        help="Re-extract one developer and merge it into an existing full output",
    )
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
    contribution_verified_repos: int,
    contribution_rejected_repos: int,
) -> dict:
    def average(field: str) -> int:
        values = [item["sourceStats"][field] for item in extracted]
        return round(mean(values)) if values else 0

    return {
        "extractionVersion": EXTRACTION_VERSION,
        "extractionScope": {
            "repoDocument": "contribution-gated repository context plus user commits and pull requests",
            "issueDocument": "issues authored, assigned, or commented by the user",
            "apiTokens": "dependencies and imports from user-touched file versions",
        },
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
        "contributionVerifiedRepoCount": contribution_verified_repos,
        "contributionRejectedRepoCount": contribution_rejected_repos,
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

    if args.developer_id:
        selected = [
            sample
            for sample in samples
            if sample["developerId"] == args.developer_id
        ]
        if not selected:
            print(
                f"error: developerId not found: {args.developer_id}",
                file=sys.stderr,
            )
            return 2
    else:
        selected = samples[: args.limit] if args.limit is not None else samples

    if args.resume and args.developer_id:
        print("error: --resume cannot be combined with --developer-id", file=sys.stderr)
        return 2

    existing_by_id: dict[str, dict] = {}
    previous_summary: dict[str, Any] = {}
    extracted: list[dict] = []
    start_position = 0
    if args.developer_id:
        try:
            with args.output.open(encoding="utf-8") as handle:
                existing = json.load(handle)
            if not isinstance(existing, list):
                raise ValueError("existing output must be a JSON array")
            existing_by_id = {
                item["developerId"]: item
                for item in existing
                if isinstance(item, dict) and "developerId" in item
            }
            if len(existing_by_id) != len(samples):
                raise ValueError(
                    "--developer-id requires an existing full output matching the seed"
                )
            if args.summary.exists():
                with args.summary.open(encoding="utf-8") as handle:
                    loaded_summary = json.load(handle)
                if isinstance(loaded_summary, dict):
                    previous_summary = loaded_summary
        except (OSError, json.JSONDecodeError, ValueError, KeyError) as exc:
            print(f"error: cannot resume single developer: {exc}", file=sys.stderr)
            return 2
    elif args.resume:
        try:
            with args.output.open(encoding="utf-8") as handle:
                existing = json.load(handle)
            with args.summary.open(encoding="utf-8") as handle:
                loaded_summary = json.load(handle)
            if not isinstance(existing, list) or not isinstance(loaded_summary, dict):
                raise ValueError("resume output and summary must contain JSON data")
            if loaded_summary.get("extractionVersion") != EXTRACTION_VERSION:
                raise ValueError("existing output is not a compatible v3 extraction")
            expected_ids = [item["developerId"] for item in selected[:len(existing)]]
            actual_ids = [item.get("developerId") for item in existing]
            if actual_ids != expected_ids:
                raise ValueError("existing output is not a prefix of the selected seed")
            extracted = existing
            start_position = len(existing)
            previous_summary = loaded_summary
        except (OSError, json.JSONDecodeError, ValueError, KeyError) as exc:
            print(f"error: cannot resume extraction: {exc}", file=sys.stderr)
            return 2

    previous_warnings = previous_summary.get("warnings", [])
    target_warning_types = Counter(
        warning.get("type")
        for warning in previous_warnings
        if isinstance(warning, dict)
        and warning.get("developerId") == args.developer_id
    ) if args.developer_id else Counter()
    warnings: list[dict[str, str]] = [
        warning
        for warning in previous_warnings
        if isinstance(warning, dict)
        and warning.get("developerId") != args.developer_id
    ] if args.developer_id else list(previous_warnings) if args.resume else []
    fetcher = GitHubFetcher(warnings.append, sleep_seconds=args.sleep)
    if args.developer_id or args.resume:
        fetcher.request_count = int(previous_summary.get("githubRequestCount", 0))
    successful_repos = int(previous_summary.get("fetchSuccessRepoCount", 0))
    failed_repos = int(previous_summary.get("fetchFailureRepoCount", 0))
    contribution_verified_repos = int(
        previous_summary.get("contributionVerifiedRepoCount", 0)
    )
    contribution_rejected_repos = int(
        previous_summary.get("contributionRejectedRepoCount", 0)
    )
    if args.developer_id:
        old_target = existing_by_id.get(args.developer_id, {})
        old_source_stats = old_target.get("sourceStats", {})
        target_repo_count = int(
            old_source_stats.get("repoCount", len(selected[0]["repositories"]))
        )
        old_failures = target_warning_types["REPO_FETCH_FAILED"]
        old_rejections = (
            target_warning_types["CONTRIBUTION_NOT_VERIFIED"]
            + target_warning_types["CONTRIBUTION_BELOW_THRESHOLD"]
        )
        failed_repos = max(0, failed_repos - old_failures)
        successful_repos = max(0, successful_repos - (target_repo_count - old_failures))
        contribution_rejected_repos = max(
            0, contribution_rejected_repos - old_rejections
        )
        contribution_verified_repos = max(
            0,
            contribution_verified_repos
            - (target_repo_count - old_failures - old_rejections),
        )

    remaining = selected[start_position:] if args.resume else selected
    if not remaining:
        print("extraction already complete", file=sys.stderr)
        return 0

    for offset, sample in enumerate(remaining, start=1):
        position = start_position + offset if args.resume else offset
        developer_id = sample["developerId"]
        print(
            f"[{position}/{len(selected)}] extracting {developer_id}",
            file=sys.stderr,
        )
        repo_parts: list[str] = []
        issue_parts: list[str] = []
        evidence_files: dict[str, str] = {}
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
                fetcher,
                owner,
                repo,
                sample["githubUsername"],
                max(1, min(args.max_commits, 30)),
                max_source_files=max(0, args.max_source_files),
                min_changed_lines=max(1, args.min_changed_lines),
            )
            if repo_data.success:
                successful_repos += 1
                if repo_data.contribution_verified:
                    contribution_verified_repos += 1
                else:
                    contribution_rejected_repos += 1
            else:
                failed_repos += 1
            repo_parts.extend(repo_data.document_parts)
            evidence_files.update(repo_data.evidence_files)

            issues = extract_issues(
                fetcher,
                owner,
                repo,
                sample["githubUsername"],
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
        api_tokens = extract_api_tokens(
            evidence_files,
            min_frequency=max(1, args.min_api_frequency),
        )
        extracted_item = {
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
        }
        if args.developer_id:
            existing_by_id[developer_id] = extracted_item
            extracted = [
                existing_by_id[item["developerId"]]
                for item in samples
            ]
        else:
            extracted.append(extracted_item)

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
                contribution_verified_repos,
                contribution_rejected_repos,
            ),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
