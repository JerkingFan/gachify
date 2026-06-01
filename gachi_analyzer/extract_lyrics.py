#!/usr/bin/env python3
"""Extract lyrics from audio tags (ID3/USLT) or merge uploaded LRC."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from gachi_analyzer.lyrics_lrc import parse_lrc_text


def _embedded_doc(path: Path) -> Dict[str, Any] | None:
    try:
        from mutagen import File as MutagenFile
    except ImportError:
        return None

    audio = MutagenFile(path)
    if audio is None or not getattr(audio, "tags", None):
        return None

    for key in list(audio.tags.keys()):
        k = str(key).upper()
        if "USLT" not in k and "SYLT" not in k and "LYRICS" not in k:
            continue
        val = audio.tags[key]
        if isinstance(val, list) and val:
            text = str(getattr(val[0], "text", val[0]))
        else:
            text = str(getattr(val, "text", val))
        text = text.strip()
        if not text:
            continue
        doc = parse_lrc_text(text)
        if doc.get("lines"):
            doc["source"] = "embedded"
            return doc
        return {
            "lines": [{"start_ms": 0, "text": text}],
            "format": "plain",
            "source": "embedded",
        }
    return None


def extract(path: Path, lrc_upload: str | None) -> Dict[str, Any]:
    if lrc_upload and lrc_upload.strip():
        doc = parse_lrc_text(lrc_upload)
        doc["source"] = "upload"
        return doc

    embedded = _embedded_doc(path)
    if embedded:
        return embedded

    return {"lines": [], "format": "none", "source": "none"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--lrc-text", default="")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    doc = extract(args.input, args.lrc_text or None)
    args.out.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
