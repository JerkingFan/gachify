#!/usr/bin/env python3
"""Worker entrypoint: analyze audio → Gachify gachi_metadata JSON file."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from gachi_analyzer.analyzer import analyze_track
from gachi_analyzer.gachify_metadata import analysis_to_gachi_metadata


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--analysis-out", required=True, type=Path)
    parser.add_argument("--metadata-out", required=True, type=Path)
    args = parser.parse_args()

    result = analyze_track(args.input, visualize=False, progress=None)
    args.analysis_out.parent.mkdir(parents=True, exist_ok=True)
    args.analysis_out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    meta = analysis_to_gachi_metadata(result)
    args.metadata_out.write_text(
        json.dumps(meta, ensure_ascii=False),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
