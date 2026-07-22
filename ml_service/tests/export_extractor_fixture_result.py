#!/usr/bin/env python3
"""Export deterministic Python extractor semantics for a shared Phase 5 fixture."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml_service" / "extractors"))

from api_document import extract_api_tokens  # noqa: E402
from issues_document import build_issue_document  # noqa: E402
from repo_document import build_repo_document  # noqa: E402


def main() -> int:
    fixture = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    username = fixture["developerIdentity"]["username"].lower()
    commits = [item for item in fixture["commits"] if str(item.get("authorLogin", "")).lower() == username][:15]
    pulls = [item for item in fixture["pullRequests"] if item.get("relation") == "authored" and str(item.get("authorLogin", "")).lower() == username][:5]
    changed_lines = sum(int(item.get("additions", 0) or 0) + int(item.get("deletions", 0) or 0) for item in commits + pulls)
    accepted = changed_lines >= 5
    changed_paths = sorted(set(
        [file["filename"] for item in commits for file in item.get("files", [])[:20]]
        + [path for item in pulls for path in item.get("changedPaths", [])[:20]]
    ))

    repo_parts: list[str] = []
    if accepted:
        repo = fixture["repository"]
        repo_parts = [repo.get("name", ""), repo.get("fullName", ""), repo.get("description", ""),
                      "topics " + " ".join(repo.get("topics", [])), f"primary language {repo.get('language', '')}",
                      "languages " + " ".join(repo.get("languages", [])), repo.get("readme", "")]
        repo_parts += [f"user commit {item.get('message', '')}" for item in commits]
        for item in pulls:
            repo_parts += [f"user pull request {item.get('title', '')}", item.get("body", "")]
        repo_parts += ["user changed files " + " ".join(changed_paths)]

    issue_parts: list[str] = []
    selected_issues: list[int] = []
    for issue in sorted(fixture["issues"], key=lambda item: (item.get("updatedAt", ""), -int(item.get("number", 0))), reverse=True):
        relations = issue.get("relations", [])
        if not relations or len(selected_issues) >= 20:
            continue
        selected_issues.append(issue["number"])
        issue_parts += [f"user issue {' '.join(relations)} {issue.get('title', '')}", issue.get("body", ""),
                        "labels " + " ".join(issue.get("labels", []))]
        issue_parts += [f"user comment {item.get('body', '')}" for item in issue.get("userComments", [])[:3]]

    files = {item["path"]: item.get("content", "") for item in fixture["touchedFiles"]}
    result = {
        "contribution": {"accepted": accepted, "verifiedChangedLines": changed_lines,
                         "selectedCommitShas": [item["sha"] for item in commits],
                         "selectedPullRequestNumbers": [item["number"] for item in pulls], "changedPaths": changed_paths},
        "repoDocument": build_repo_document(repo_parts),
        "issueDocument": build_issue_document(issue_parts),
        "selectedIssueNumbers": selected_issues,
        "apiTokens": extract_api_tokens(files, min_frequency=5),
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
