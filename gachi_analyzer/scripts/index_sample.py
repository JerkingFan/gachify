"""Index a reference gachi source into sample_db/*.json"""

import argparse
import json
from pathlib import Path

from gachi_analyzer.fingerprinting import build_fingerprint_from_file


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("audio", type=Path)
    p.add_argument("--source-id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--out", type=Path, default=None)
    args = p.parse_args()
    out = args.out or Path(__file__).resolve().parents[1] / "sample_db" / f"{args.source_id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    fp = build_fingerprint_from_file(args.audio, args.source_id, args.title)
    out.write_text(json.dumps(fp, indent=2), encoding="utf-8")
    print(f"Indexed → {out}")


if __name__ == "__main__":
    main()
