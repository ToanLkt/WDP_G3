"""GitHub issue and comment extraction."""

from __future__ import annotations

from dataclasses import dataclass

from text_cleaner import join_and_clean


@dataclass
class IssueExtraction:
    parts: list[str]
    count: int


def extract_issues(
    fetcher,
    owner: str,
    repo: str,
    max_issues: int,
    max_comments: int,
) -> IssueExtraction:
    result = fetcher.get(
        f"/repos/{owner}/{repo}/issues?state=all&per_page={max_issues}",
        "ISSUES_FETCH_FAILED",
        optional=True,
    )
    if not result.ok or not isinstance(result.data, list):
        return IssueExtraction([], 0)
    issues = [item for item in result.data if "pull_request" not in item][:20]
    parts: list[str] = []
    for issue in issues:
        labels = [
            label.get("name", "") if isinstance(label, dict) else str(label)
            for label in issue.get("labels", [])
        ]
        parts.extend([
            f"issue {issue.get('title', '')}",
            issue.get("body") or "",
            "labels " + " ".join(labels),
        ])
        number = issue.get("number")
        if number and max_comments > 0 and issue.get("comments", 0):
            comments = fetcher.get(
                f"/repos/{owner}/{repo}/issues/{number}/comments?per_page={max_comments}",
                "COMMENTS_FETCH_FAILED",
                optional=True,
            )
            if comments.ok and isinstance(comments.data, list):
                parts.extend(
                    f"comment {comment.get('body', '')}"
                    for comment in comments.data[:max_comments]
                )
    return IssueExtraction(parts, len(issues))


def build_issue_document(parts: list[str]) -> str:
    return join_and_clean(parts, max_length=30_000)
