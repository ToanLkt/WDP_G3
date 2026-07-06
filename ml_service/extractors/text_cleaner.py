"""Text normalization utilities used by dataset extraction."""

from __future__ import annotations

import html
import re

CODE_BLOCK_RE = re.compile(r"```.*?```", re.DOTALL)
URL_RE = re.compile(r"https?://\S+|www\.\S+")
HTML_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: object, max_length: int | None = None) -> str:
    """Normalize prose while retaining useful technical punctuation."""
    if value is None:
        return ""
    text = str(value)
    text = CODE_BLOCK_RE.sub(" ", text)
    text = URL_RE.sub(" ", text)
    text = HTML_RE.sub(" ", html.unescape(text))
    text = WHITESPACE_RE.sub(" ", text).strip().lower()
    if max_length is not None and len(text) > max_length:
        text = text[:max_length].rsplit(" ", 1)[0]
    return text


def join_and_clean(parts: list[str], max_length: int) -> str:
    return clean_text(" ".join(part for part in parts if part), max_length=max_length)
