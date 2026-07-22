"""API/import extraction from file versions touched by a developer."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import PurePosixPath

VALID_TOKEN = re.compile(r"^[a-z0-9@._+/#:-]{2,100}$")
REQUIREMENT_SPLIT = re.compile(r"\s*(?:==|>=|<=|~=|!=|>|<|\[|;|\s@)\s*")
GRADLE_DEP = re.compile(
    r"(?:implementation|testImplementation|api|compileOnly|runtimeOnly)"
    r"\s*[\(\s]['\"]([^'\"]+)['\"]"
)
WORKFLOW_ACTION = re.compile(
    r"\buses:\s*([a-z0-9_.-]+/[a-z0-9_.-]+)(?:@[\w.-]+)?", re.I
)
JS_IMPORT = re.compile(
    r"(?:\bfrom\s*|\brequire\s*\(|\bimport\s*\()\s*['\"]([^'\"]+)['\"]"
)
PY_IMPORT = re.compile(r"^\s*(?:from|import)\s+([a-zA-Z_][\w.]*)", re.M)
JVM_IMPORT = re.compile(r"^\s*import\s+([a-zA-Z_][\w.]*)", re.M)
DART_IMPORT = re.compile(r"\bimport\s+['\"]package:([^/'\"]+)", re.I)
CSHARP_USING = re.compile(r"^\s*using\s+([a-zA-Z_][\w.]*)\s*;", re.M)
RUST_USE = re.compile(r"^\s*use\s+([a-zA-Z_][\w]*)", re.M)
RUBY_REQUIRE = re.compile(r"^\s*require\s*['\"]([^'\"]+)", re.M)
QUOTED_IMPORT = re.compile(r"['\"]([^'\"]+)['\"]")


def _normalize(value: object) -> str:
    token = str(value).strip().lower().strip("\"'`,")
    if token.startswith(("./", "../", "/")):
        return ""
    if token.startswith("@"):
        parts = token.split("/")
        token = "/".join(parts[:2]) if len(parts) >= 2 else token
    elif "/" in token and not token.startswith(("github.com/", "gitlab.com/")):
        token = token.split("/", 1)[0]
    return token if VALID_TOKEN.fullmatch(token) else ""


def _add(tokens: set[str], value: object) -> None:
    token = _normalize(value)
    if token:
        tokens.add(token)


def _toml_dependency_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    active_section = ""
    for line in text.splitlines():
        section = re.match(r"^\s*\[([^\]]+)\]", line)
        if section:
            active_section = section.group(1).lower()
            continue
        if "dependenc" in active_section:
            key = re.match(r"^\s*([a-zA-Z0-9_.-]+)\s*=", line)
            if key:
                _add(tokens, key.group(1))
        array_item = re.search(
            r"['\"]([a-zA-Z0-9@._+/-]+)(?:\[[^\]]+\])?\s*(?:[<>=!~; ].*)?['\"]",
            line,
        )
        if array_item and ("dependencies" in active_section or "dependencies" in line):
            _add(tokens, array_item.group(1))
    return tokens


def _dependency_tokens(path: str, text: str) -> set[str]:
    tokens: set[str] = set()
    logical_path = path.rsplit(":", 1)[-1]
    name = PurePosixPath(logical_path).name.lower()
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
                match = re.match(
                    r'^\s{0,4}["\']?(@?[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)?)@',
                    line,
                )
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
            tokens.update(_toml_dependency_tokens(text))
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
        elif name.endswith((".yml", ".yaml")) and ".github/workflows/" in logical_path:
            for action in WORKFLOW_ACTION.findall(text):
                _add(tokens, action)
    except (json.JSONDecodeError, ET.ParseError, TypeError):
        return set()
    return tokens


def _source_import_tokens(path: str, text: str) -> set[str]:
    tokens: set[str] = set()
    suffix = PurePosixPath(path.rsplit(":", 1)[-1]).suffix.lower()
    # Commit patches prefix source lines with diff markers; remove only that marker.
    text = "\n".join(
        line[1:] if line.startswith(("+", "-", " ")) else line
        for line in text.splitlines()
        if not line.startswith(("+++", "---", "@@"))
    )
    if suffix in {".js", ".jsx", ".ts", ".tsx"}:
        values = JS_IMPORT.findall(text)
    elif suffix == ".py":
        values = PY_IMPORT.findall(text)
    elif suffix in {".java", ".kt", ".kts", ".scala"}:
        values = [".".join(value.split(".")[:3]) for value in JVM_IMPORT.findall(text)]
    elif suffix == ".dart":
        values = DART_IMPORT.findall(text)
    elif suffix == ".cs":
        values = CSHARP_USING.findall(text)
    elif suffix == ".rs":
        values = [value for value in RUST_USE.findall(text) if value not in {"crate", "self", "super", "std"}]
    elif suffix == ".rb":
        values = RUBY_REQUIRE.findall(text)
    elif suffix == ".go":
        values = QUOTED_IMPORT.findall(text)
    else:
        values = []
    for value in values:
        _add(tokens, value)
    return tokens


def extract_api_tokens(files: dict[str, str], min_frequency: int = 5) -> list[str]:
    """Return direct dependency edits plus repeated imports from touched file versions."""
    strong_tokens: set[str] = set()
    import_frequency: Counter[str] = Counter()
    for path, text in files.items():
        dependency_tokens = _dependency_tokens(path, text)
        if dependency_tokens:
            strong_tokens.update(dependency_tokens)
        for token in _source_import_tokens(path, text):
            import_frequency[token] += 1
    repeated_imports = {
        token for token, count in import_frequency.items()
        if count >= max(1, min_frequency)
    }
    return sorted(strong_tokens | repeated_imports)
