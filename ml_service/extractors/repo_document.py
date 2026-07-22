"""Contribution-gated repository evidence for Dev2Vec v3."""

from __future__ import annotations

import base64
import urllib.parse
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from text_cleaner import join_and_clean

CONFIG_NAMES = {
    "package.json",
    "composer.json", "requirements.txt", "pyproject.toml", "pipfile",
    "pom.xml", "build.gradle", "build.gradle.kts", "pubspec.yaml", "gemfile",
    "go.mod", "cargo.toml", "dockerfile", "docker-compose.yml",
    "docker-compose.yaml",
}
SOURCE_SUFFIXES = {
    ".c", ".cc", ".cpp", ".cs", ".dart", ".go", ".h", ".hpp", ".java",
    ".js", ".jsx", ".jl", ".kt", ".kts", ".m", ".mm", ".php", ".pl",
    ".py", ".r", ".rb", ".rs", ".scala", ".swift", ".ts", ".tsx",
}


@dataclass
class RepoExtraction:
    document_parts: list[str] = field(default_factory=list)
    evidence_files: dict[str, str] = field(default_factory=dict)
    success: bool = False
    contribution_verified: bool = False
    changed_lines: int = 0


def _is_evidence_file(path: str) -> bool:
    lower = path.lower()
    name = PurePosixPath(lower).name
    return (
        name in CONFIG_NAMES
        or PurePosixPath(lower).suffix in SOURCE_SUFFIXES
        or lower.startswith(".github/workflows/")
        and lower.endswith((".yml", ".yaml"))
    )


def _login(item: object) -> str:
    return str(item.get("login", "")).lower() if isinstance(item, dict) else ""


def extract_repo(
    fetcher,
    owner: str,
    repo: str,
    username: str,
    max_commits: int,
    max_source_files: int = 10,
    min_changed_lines: int = 5,
) -> RepoExtraction:
    """Collect repo context only after a meaningful user contribution is found."""
    output = RepoExtraction()
    metadata = fetcher.get(f"/repos/{owner}/{repo}", "REPO_FETCH_FAILED")
    if not metadata.ok or not isinstance(metadata.data, dict):
        return output
    output.success = True
    data = metadata.data
    user_lower = username.lower()

    commit_query = urllib.parse.urlencode({
        "author": username,
        "per_page": max(1, min(max_commits, 30)),
    })
    commits = fetcher.get(
        f"/repos/{owner}/{repo}/commits?{commit_query}",
        "USER_COMMITS_FETCH_FAILED",
        optional=True,
    )
    commit_items = commits.data if commits.ok and isinstance(commits.data, list) else []
    commit_parts: list[str] = []
    changed_paths: list[str] = []
    evidence_candidates: list[tuple[str, str, str, str]] = []

    for item in commit_items[:15]:
        sha = item.get("sha")
        if not sha:
            continue
        detail = fetcher.get(
            f"/repos/{owner}/{repo}/commits/{sha}",
            "USER_COMMIT_DETAIL_FETCH_FAILED",
            optional=True,
        )
        if not detail.ok or not isinstance(detail.data, dict):
            continue
        detail_data = detail.data
        author_login = _login(detail_data.get("author"))
        committer_login = _login(detail_data.get("committer"))
        if author_login and author_login != user_lower and committer_login != user_lower:
            continue
        stats = detail_data.get("stats") or {}
        output.changed_lines += int(stats.get("additions", 0) or 0)
        output.changed_lines += int(stats.get("deletions", 0) or 0)
        message = detail_data.get("commit", {}).get("message", "")
        if message:
            commit_parts.append(f"user commit {message}")
        for file_data in detail_data.get("files", [])[:20]:
            path = file_data.get("filename", "")
            if not path:
                continue
            changed_paths.append(path)
            if _is_evidence_file(path):
                evidence_candidates.append((owner, repo, sha, path))
                patch = file_data.get("patch") or ""
                if patch:
                    output.evidence_files[f"patch:{sha}:{path}"] = patch

    # Pull requests cover squash merges where the final commit may be attributed to a maintainer.
    pulls = fetcher.get(
        f"/repos/{owner}/{repo}/pulls?state=all&per_page=30&sort=updated&direction=desc",
        "PULL_REQUESTS_FETCH_FAILED",
        optional=True,
    )
    pull_items = pulls.data if pulls.ok and isinstance(pulls.data, list) else []
    user_pulls = [item for item in pull_items if _login(item.get("user")) == user_lower][:5]
    pull_parts: list[str] = []
    for pull in user_pulls:
        number = pull.get("number")
        if not number:
            continue
        detail = fetcher.get(
            f"/repos/{owner}/{repo}/pulls/{number}",
            "PULL_REQUEST_DETAIL_FETCH_FAILED",
            optional=True,
        )
        detail_data = detail.data if detail.ok and isinstance(detail.data, dict) else pull
        output.changed_lines += int(detail_data.get("additions", 0) or 0)
        output.changed_lines += int(detail_data.get("deletions", 0) or 0)
        pull_parts.extend([
            f"user pull request {detail_data.get('title', '')}",
            detail_data.get("body") or "",
        ])
        files = fetcher.get(
            f"/repos/{owner}/{repo}/pulls/{number}/files?per_page=20",
            "PULL_REQUEST_FILES_FETCH_FAILED",
            optional=True,
        )
        file_items = files.data if files.ok and isinstance(files.data, list) else []
        head = detail_data.get("head") or {}
        head_repo = head.get("repo") or {}
        head_full_name = head_repo.get("full_name", "")
        head_parts = head_full_name.split("/", 1)
        head_sha = head.get("sha", "")
        for file_data in file_items[:20]:
            path = file_data.get("filename", "")
            if not path:
                continue
            changed_paths.append(path)
            if not _is_evidence_file(path):
                continue
            if len(head_parts) == 2 and head_sha:
                evidence_candidates.append((head_parts[0], head_parts[1], head_sha, path))
            patch = file_data.get("patch") or ""
            if patch:
                patch_ref = head_sha or str(number)
                output.evidence_files[f"pr-patch:{patch_ref}:{path}"] = patch

    output.contribution_verified = output.changed_lines >= max(1, min_changed_lines)
    if not output.contribution_verified:
        warning_type = (
            "CONTRIBUTION_BELOW_THRESHOLD"
            if output.changed_lines
            else "CONTRIBUTION_NOT_VERIFIED"
        )
        fetcher.warn(
            warning_type,
            f"{username} has {output.changed_lines} verified changed lines; "
            f"minimum is {max(1, min_changed_lines)}",
        )
        return output

    output.document_parts.extend([
        data.get("name", ""),
        data.get("full_name", ""),
        data.get("description", ""),
        "topics " + " ".join(data.get("topics", [])),
        f"primary language {data.get('language', '')}",
    ])
    topics = fetcher.get(
        f"/repos/{owner}/{repo}/topics", "TOPICS_FETCH_FAILED", optional=True
    )
    if topics.ok and isinstance(topics.data, dict):
        output.document_parts.append("topics " + " ".join(topics.data.get("names", [])))
    languages = fetcher.get(
        f"/repos/{owner}/{repo}/languages", "LANGUAGES_FETCH_FAILED", optional=True
    )
    if languages.ok and isinstance(languages.data, dict):
        output.document_parts.append("languages " + " ".join(languages.data.keys()))
    readme = fetcher.get(
        f"/repos/{owner}/{repo}/readme", "README_NOT_FOUND", optional=True
    )
    if readme.ok and isinstance(readme.data, dict):
        try:
            output.document_parts.append(
                base64.b64decode(readme.data.get("content", "")).decode(
                    "utf-8", errors="replace"
                )
            )
        except (ValueError, TypeError):
            fetcher.warn("README_DECODE_FAILED", "README content was not valid base64")
    # A README is optional GitHub repository content. Its absence is not an
    # extraction failure, so keep the remaining verified evidence without
    # adding a dataset warning.

    output.document_parts.extend(commit_parts)
    output.document_parts.extend(pull_parts)
    if changed_paths:
        output.document_parts.append("user changed files " + " ".join(changed_paths))

    seen_candidates: set[tuple[str, str, str, str]] = set()
    fetched = 0
    for candidate in evidence_candidates:
        if candidate in seen_candidates or fetched >= max(0, max_source_files):
            continue
        seen_candidates.add(candidate)
        file_owner, file_repo, sha, path = candidate
        content = fetcher.content(file_owner, file_repo, path, ref=sha)
        if content:
            output.evidence_files.pop(f"patch:{sha}:{path}", None)
            output.evidence_files.pop(f"pr-patch:{sha}:{path}", None)
            output.evidence_files[f"content:{file_owner}/{file_repo}:{sha}:{path}"] = content
            fetched += 1
    return output


def build_repo_document(parts: list[str]) -> str:
    return join_and_clean(parts, max_length=50_000)
