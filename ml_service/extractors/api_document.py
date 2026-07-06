"""Dependency/config parsers that produce real API/dependency tokens."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import PurePosixPath

VALID_TOKEN = re.compile(r"^[a-z0-9@._+/#:-]{2,100}$")
REQUIREMENT_SPLIT = re.compile(r"\s*(?:==|>=|<=|~=|!=|>|<|\[|;|\s@)\s*")
GRADLE_DEP = re.compile(
    r"(?:implementation|testImplementation|api|compileOnly|runtimeOnly)"
    r"\s*[\(\s]['\"]([^'\"]+)['\"]"
)
WORKFLOW_ACTION = re.compile(r"\buses:\s*([a-z0-9_.-]+/[a-z0-9_.-]+)(?:@[\w.-]+)?", re.I)


def _add(tokens: set[str], value: object) -> None:
    token = str(value).strip().lower().strip("\"'`,")
    if VALID_TOKEN.fullmatch(token):
        tokens.add(token)


def _toml_dependency_tokens(text: str, cargo: bool = False) -> set[str]:
    tokens: set[str] = set()
    active_section = ""
    dependency_sections = {
        "dependencies", "dev-dependencies", "build-dependencies",
        "tool.poetry.dependencies", "tool.poetry.dev-dependencies",
    }
    for line in text.splitlines():
        section = re.match(r"^\s*\[([^\]]+)\]", line)
        if section:
            active_section = section.group(1).lower()
            continue
        if active_section in dependency_sections:
            key = re.match(r"^\s*([a-zA-Z0-9_.-]+)\s*=", line)
            if key:
                _add(tokens, key.group(1))
        if not cargo:
            array_item = re.search(r"['\"]([a-zA-Z0-9@._+/-]+)(?:\[[^\]]+\])?\s*(?:[<>=!~; ].*)?['\"]", line)
            if array_item and ("dependencies" in active_section or "dependencies" in line):
                _add(tokens, array_item.group(1))
    return tokens


def extract_api_tokens(files: dict[str, str]) -> list[str]:
    tokens: set[str] = set()
    for path, text in files.items():
        name = PurePosixPath(path).name.lower()
        try:
            if name in {"package.json", "composer.json"}:
                data = json.loads(text)
                sections = (
                    ("dependencies", "devDependencies", "peerDependencies")
                    if name == "package.json"
                    else ("require", "require-dev")
                )
                for section in sections:
                    for key in data.get(section, {}):
                        _add(tokens, key)
            elif name == "package-lock.json":
                data = json.loads(text)
                for key in data.get("dependencies", {}):
                    _add(tokens, key)
                for key in data.get("packages", {}):
                    if key.startswith("node_modules/"):
                        _add(tokens, key.removeprefix("node_modules/"))
            elif name in {"yarn.lock", "pnpm-lock.yaml"}:
                for line in text.splitlines():
                    match = re.match(r'^\s{0,4}["\']?(@?[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)?)@', line)
                    if match:
                        _add(tokens, match.group(1))
            elif name == "requirements.txt":
                for line in text.splitlines():
                    line = line.strip()
                    if line and not line.startswith(("#", "-")):
                        _add(tokens, REQUIREMENT_SPLIT.split(line, 1)[0])
            elif name in {"pipfile", "gemfile"}:
                for line in text.splitlines():
                    match = re.match(
                        r'\s*(?:gem\s+)?["\']?([a-zA-Z0-9_.-]+)["\']?\s*(?:=|,)',
                        line,
                    )
                    if match:
                        _add(tokens, match.group(1))
            elif name in {"pyproject.toml", "cargo.toml"}:
                tokens.update(_toml_dependency_tokens(text, cargo=name == "cargo.toml"))
            elif name == "pom.xml":
                root = ET.fromstring(text)
                for node in root.iter():
                    if node.tag.rsplit("}", 1)[-1] in {"groupId", "artifactId"} and node.text:
                        _add(tokens, node.text)
            elif name in {"build.gradle", "build.gradle.kts"}:
                for match in GRADLE_DEP.findall(text):
                    for part in match.split(":")[:2]:
                        _add(tokens, part)
            elif name == "pubspec.yaml":
                section = ""
                for line in text.splitlines():
                    if re.match(r"^(dependencies|dev_dependencies):\s*$", line):
                        section = line.split(":", 1)[0]
                    elif section and re.match(r"^\s{2}[a-zA-Z0-9_.-]+:", line):
                        _add(tokens, line.strip().split(":", 1)[0])
                    elif line and not line.startswith(" "):
                        section = ""
            elif name == "go.mod":
                for line in text.splitlines():
                    match = re.match(r"\s*(?:module\s+)?([a-z0-9_.-]+\.[a-z]{2,}/\S+)", line, re.I)
                    if match:
                        _add(tokens, match.group(1))
            elif name == "dockerfile":
                for image in re.findall(r"^\s*FROM\s+([^\s]+)", text, re.I | re.M):
                    _add(tokens, image.split("@", 1)[0])
            elif name.endswith((".yml", ".yaml")) and ".github/workflows/" in path:
                for action in WORKFLOW_ACTION.findall(text):
                    _add(tokens, action)
        except (json.JSONDecodeError, ET.ParseError, TypeError):
            continue
    return sorted(tokens)
