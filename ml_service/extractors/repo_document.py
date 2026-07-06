"""Repository metadata, README, config and commit extraction."""

from __future__ import annotations

from dataclasses import dataclass, field

from text_cleaner import join_and_clean

CONFIG_PATHS = [
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "composer.json", "requirements.txt", "pyproject.toml", "Pipfile",
    "pom.xml", "build.gradle", "build.gradle.kts", "pubspec.yaml", "Gemfile",
    "go.mod", "Cargo.toml", "Dockerfile", "docker-compose.yml",
    ".github/workflows/ci.yml", ".github/workflows/main.yml",
    ".github/workflows/build.yml", ".github/workflows/test.yml",
    ".github/workflows/release.yml",
]
CONFIG_NAMES = {path.lower() for path in CONFIG_PATHS if "/" not in path}


@dataclass
class RepoExtraction:
    document_parts: list[str] = field(default_factory=list)
    config_files: dict[str, str] = field(default_factory=dict)
    success: bool = False


def extract_repo(
    fetcher,
    owner: str,
    repo: str,
    max_commits: int,
) -> RepoExtraction:
    output = RepoExtraction()
    metadata = fetcher.get(f"/repos/{owner}/{repo}", "REPO_FETCH_FAILED")
    if not metadata.ok or not isinstance(metadata.data, dict):
        return output
    output.success = True
    data = metadata.data
    output.document_parts.extend([
        data.get("name", ""),
        data.get("full_name", ""),
        data.get("description", ""),
        "topics " + " ".join(data.get("topics", [])),
        f"primary language {data.get('language', '')}",
    ])
    topics = fetcher.get(f"/repos/{owner}/{repo}/topics", "TOPICS_FETCH_FAILED", optional=True)
    if topics.ok and isinstance(topics.data, dict):
        output.document_parts.append("topics " + " ".join(topics.data.get("names", [])))

    languages = fetcher.get(f"/repos/{owner}/{repo}/languages", "LANGUAGES_FETCH_FAILED", optional=True)
    if languages.ok and isinstance(languages.data, dict):
        output.document_parts.append("languages " + " ".join(languages.data.keys()))

    readme = fetcher.get(f"/repos/{owner}/{repo}/readme", "README_NOT_FOUND", optional=True)
    if readme.ok and isinstance(readme.data, dict):
        import base64
        try:
            output.document_parts.append(
                base64.b64decode(readme.data.get("content", "")).decode("utf-8", errors="replace")
            )
        except (ValueError, TypeError):
            fetcher.warn("README_DECODE_FAILED", "README content was not valid base64")
    else:
        fetcher.warn("README_NOT_FOUND", "README not found")

    tree_paths: list[str] = []
    default_branch = data.get("default_branch", "HEAD")
    tree = fetcher.get(
        f"/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
        "REPOSITORY_TREE_FETCH_FAILED",
        optional=True,
    )
    if tree.ok and isinstance(tree.data, dict):
        for item in tree.data.get("tree", []):
            path = item.get("path", "")
            lower = path.lower()
            if (
                item.get("type") == "blob"
                and (
                    lower in CONFIG_NAMES
                    or lower.startswith(".github/workflows/")
                    and lower.endswith((".yml", ".yaml"))
                )
            ):
                tree_paths.append(path)
    paths_to_fetch = tree_paths[:30] if tree_paths else CONFIG_PATHS
    for path in paths_to_fetch:
        content = fetcher.content(owner, repo, path)
        if content:
            output.config_files[path] = content
            output.document_parts.append(f"{path} {content[:6000]}")

    commits = fetcher.get(
        f"/repos/{owner}/{repo}/commits?per_page={max_commits}",
        "COMMITS_FETCH_FAILED",
        optional=True,
    )
    if commits.ok and isinstance(commits.data, list):
        for item in commits.data:
            message = item.get("commit", {}).get("message", "")
            if message:
                output.document_parts.append(f"commit {message}")
        for item in commits.data[:15]:
            sha = item.get("sha")
            if not sha:
                continue
            detail = fetcher.get(
                f"/repos/{owner}/{repo}/commits/{sha}",
                "COMMIT_DETAIL_FETCH_FAILED",
                optional=True,
            )
            if detail.ok and isinstance(detail.data, dict):
                paths = [
                    file.get("filename", "")
                    for file in detail.data.get("files", [])[:20]
                    if file.get("filename")
                ]
                if paths:
                    output.document_parts.append("changed files " + " ".join(paths))
    return output


def build_repo_document(parts: list[str]) -> str:
    return join_and_clean(parts, max_length=50_000)
