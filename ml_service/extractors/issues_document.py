"""Developer-specific GitHub issue resolving history for Dev2Vec v3."""

from __future__ import annotations

from dataclasses import dataclass

from text_cleaner import join_and_clean


@dataclass
class IssueExtraction:
    parts: list[str]
    count: int


def _login(value: object) -> str:
    return str(value.get("login", "")).lower() if isinstance(value, dict) else ""


def extract_issues(
    fetcher,
    owner: str,
    repo: str,
    username: str,
    max_issues: int,
    max_comments: int,
) -> IssueExtraction:
    """Keep issues authored, assigned, or discussed by the target developer."""
    result = fetcher.get(
        f"/repos/{owner}/{repo}/issues?state=all&per_page={max_issues}",
        "ISSUES_FETCH_FAILED",
        optional=True,
    )
    if not result.ok or not isinstance(result.data, list):
        return IssueExtraction([], 0)
    username_lower = username.lower()
    issues = [item for item in result.data if "pull_request" not in item][:30]
    parts: list[str] = []
    used_count = 0
    for issue in issues:
        authored = _login(issue.get("user")) == username_lower
        assigned = any(
            _login(assignee) == username_lower
            for assignee in issue.get("assignees", [])
        )
        user_comments: list[str] = []
        if max_comments > 0 and issue.get("comments", 0):
            number = issue.get("number")
            comments = fetcher.get(
                f"/repos/{owner}/{repo}/issues/{number}/comments?per_page=100",
                "COMMENTS_FETCH_FAILED",
                optional=True,
            )
            if comments.ok and isinstance(comments.data, list):
                user_comments = [
                    comment.get("body") or ""
                    for comment in comments.data
                    if _login(comment.get("user")) == username_lower
                ][:max_comments]
        if not authored and not assigned and not user_comments:
            continue
        labels = [
            label.get("name", "") if isinstance(label, dict) else str(label)
            for label in issue.get("labels", [])
        ]
        relation = " ".join(
            value for value, present in (
                ("authored", authored), ("assigned", assigned),
                ("commented", bool(user_comments)),
            ) if present
        )
        parts.extend([
            f"user issue {relation} {issue.get('title', '')}",
            issue.get("body") or "",
            "labels " + " ".join(labels),
        ])
        parts.extend(f"user comment {body}" for body in user_comments if body)
        used_count += 1
        if used_count >= 20:
            break
    return IssueExtraction(parts, used_count)


def build_issue_document(parts: list[str]) -> str:
    return join_and_clean(parts, max_length=30_000)
