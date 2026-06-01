#!/usr/bin/env python3
"""
GachiMIR Analyzer — production entrypoint for Creator Hub upload pipeline.

♂️ Respect the Aniki. Analyze responsibly.

Usage:
  python analyzer.py --input remix.flac --output analysis.json --visualize
  python analyzer.py --batch ./uploads/ --workers 4 --output-dir ./results/
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from tqdm import tqdm

# Support both `python analyzer.py` (cwd=gachi_analyzer) and `python -m gachi_analyzer.analyzer`
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from gachi_analyzer.audio_io import AudioLoadError, load_audio
    from gachi_analyzer.config import AnalyzerConfig, get_config
    from gachi_analyzer.db import save_analysis_to_postgres
    from gachi_analyzer.emotion import analyze_emotions, emotions_to_dict
    from gachi_analyzer.fingerprinting import match_samples
    from gachi_analyzer.gachi_features import analyze_gachi, gachi_to_dict
    from gachi_analyzer.musical import analyze_musical, musical_to_dict
    from gachi_analyzer.originality import analyze_originality, originality_to_dict
    from gachi_analyzer.visualize import render_analysis_plots
else:
    from gachi_analyzer.audio_io import AudioLoadError, load_audio
    from gachi_analyzer.config import AnalyzerConfig, get_config
    from gachi_analyzer.db import save_analysis_to_postgres
    from gachi_analyzer.emotion import analyze_emotions, emotions_to_dict
    from gachi_analyzer.fingerprinting import match_samples
    from gachi_analyzer.gachi_features import analyze_gachi, gachi_to_dict
    from gachi_analyzer.musical import analyze_musical, musical_to_dict
    from gachi_analyzer.originality import analyze_originality, originality_to_dict
    from gachi_analyzer.visualize import render_analysis_plots


def _json_sanitize(obj: Any) -> Any:
    """Convert numpy scalars to native Python types for JSON/JSONB."""
    if isinstance(obj, dict):
        return {k: _json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_sanitize(v) for v in obj]
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def analyze_track(
    input_path: Path,
    cfg: Optional[AnalyzerConfig] = None,
    visualize: bool = False,
    viz_dir: Optional[Path] = None,
    progress: Optional[tqdm] = None,
) -> Dict[str, Any]:
    """
    Full MIR pipeline for a single track. Target: <60s for typical 3–5 min remix.
    """
    cfg = cfg or get_config()
    t0 = time.perf_counter()

    def step(msg: str, inc: int = 1) -> None:
        if progress is not None:
            progress.set_postfix_str(msg, refresh=True)
            progress.update(inc)

    step("load", 0)
    y, sr = load_audio(input_path, cfg)
    step("musical", 1)

    musical = analyze_musical(y, sr, cfg)
    musical_dict = musical_to_dict(musical)

    step("emotions", 1)
    emotions = analyze_emotions(
        y, sr, energy_score=musical_dict["energy"]["energy_score"], cfg=cfg
    )
    emotions_dict = emotions_to_dict(emotions)

    step("gachi", 1)
    gachi = analyze_gachi(y, sr, musical_dict, emotions_dict, cfg)
    gachi_dict = gachi_to_dict(gachi)

    step("fingerprint", 1)
    sample_sources = match_samples(y, sr, cfg)

    step("originality", 1)
    originality = analyze_originality(y, sr, musical_dict, sample_sources, cfg)
    originality_dict = originality_to_dict(originality)

    # Auto-tags for search / recommendations
    auto_tags = _derive_tags(musical_dict, emotions_dict, gachi_dict, originality_dict)

    result: Dict[str, Any] = {
        "schema_version": "1.0",
        "analyzer_version": "1.0.0",
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "input_file": input_path.name,
        "input_path": str(input_path.resolve()),
        "duration_sec": musical_dict["duration_sec"],
        "bpm": musical_dict["bpm"],
        "bpm_secondary": musical_dict["bpm_secondary"],
        "tempo_changes": musical_dict["tempo_changes"],
        "key": musical_dict["key"],
        "mode": musical_dict["mode"],
        "danceability": musical_dict["danceability"],
        "energy": musical_dict["energy"],
        "spectral": musical_dict["spectral"],
        "structure": musical_dict["structure"],
        "valence": emotions_dict["valence"],
        "arousal": emotions_dict["arousal"],
        "discrete_emotions": emotions_dict["discrete_emotions"],
        "dominant_emotion": emotions_dict["dominant_emotion"],
        "emotions_timeline": emotions_dict["emotions_timeline"],
        "troll_moments": emotions_dict["troll_moments"],
        "gachi": gachi_dict,
        "has_deep_stone": gachi_dict["has_deep_stone"],
        "stone_count": gachi_dict["stone_count"],
        "dominant_stone_type": gachi_dict["dominant_stone_type"],
        "stone_timestamps": gachi_dict["stone_timestamps"],
        "stone_events": gachi_dict["stone_events"],
        "wackiness_score": gachi_dict["wackiness_score"],
        "brother_power_index": gachi_dict["brother_power_index"],
        "deepness_score": gachi_dict["deepness_score"],
        "sample_sources": sample_sources,
        "originality": originality_dict,
        "originality_ratio": originality_dict["originality_ratio"],
        "auto_tags": auto_tags,
        "processing_time_sec": round(time.perf_counter() - t0, 2),
    }

    if visualize:
        step("viz", 1)
        out = viz_dir or input_path.parent / "analysis_viz"
        paths = render_analysis_plots(
            y, sr, {"emotions": emotions_dict, "gachi": gachi_dict},
            out,
            stem=input_path.stem,
            cfg=cfg,
        )
        result.update(paths)
        result["waveform_image_path"] = paths.get("waveform_image_path")

    if progress is not None:
        remaining = progress.total - progress.n
        if remaining > 0:
            progress.update(remaining)
    return _json_sanitize(result)


def _derive_tags(
    musical: Dict[str, Any],
    emotions: Dict[str, Any],
    gachi: Dict[str, Any],
    originality: Dict[str, Any],
) -> List[str]:
    tags: List[str] = []
    if gachi["brother_power_index"] > 0.7:
        tags.append("aniki-workout")
    if gachi["deepness_score"] > 0.65:
        tags.append("deep-dark-fantasy")
    if gachi["wackiness_score"] > 0.6:
        tags.append("wacky")
    if gachi["stone_count"] >= 5:
        tags.append("stone-heavy")
    if musical["bpm"] >= 140:
        tags.append("fast-bpm")
    if emotions["dominant_emotion"] == "aggressive":
        tags.append("aggressive")
    if originality["copyright_risk"] == "high":
        tags.append("review-originality")
    if musical["mode"] == "minor":
        tags.append("minor")
    return tags


def _worker_analyze(args: Tuple[str, str, bool]) -> Tuple[str, Optional[Dict[str, Any]], Optional[str]]:
    input_path, output_dir, visualize = args
    try:
        cfg = get_config()
        out_dir = Path(output_dir)
        with tqdm(total=6, desc=Path(input_path).name, leave=False, disable=True) as pbar:
            result = analyze_track(
                Path(input_path),
                cfg=cfg,
                visualize=visualize,
                viz_dir=out_dir / "viz",
                progress=pbar,
            )
        out_file = out_dir / f"{Path(input_path).stem}_analysis.json"
        out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return input_path, result, None
    except Exception as e:
        return input_path, None, str(e)


def run_batch(
    input_dir: Path,
    output_dir: Path,
    workers: int = 4,
    visualize: bool = False,
) -> List[Tuple[str, Optional[str]]]:
    from gachi_analyzer.config import SUPPORTED_EXTENSIONS

    output_dir.mkdir(parents=True, exist_ok=True)
    files = [
        f
        for f in sorted(input_dir.iterdir())
        if f.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    args_list = [(str(f), str(output_dir), visualize) for f in files]
    results: List[Tuple[str, Optional[str]]] = []

    if workers <= 1:
        for args in tqdm(args_list, desc="Batch analyze"):
            path, _, err = _worker_analyze(args)
            results.append((path, err))
    else:
        with mp.Pool(processes=workers) as pool:
            for path, _, err in tqdm(
                pool.imap_unordered(_worker_analyze, args_list),
                total=len(args_list),
                desc="Batch analyze",
            ):
                results.append((path, err))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="GachiMIR — deep audio analysis for gachimuchi remixes"
    )
    parser.add_argument("--input", "-i", type=Path, help="Input audio file")
    parser.add_argument("--output", "-o", type=Path, help="Output JSON path")
    parser.add_argument("--visualize", action="store_true", help="Generate PNG plots")
    parser.add_argument("--viz-dir", type=Path, default=None, help="Visualization output dir")
    parser.add_argument("--batch", type=Path, help="Directory of audio files")
    parser.add_argument("--output-dir", type=Path, help="Batch output directory")
    parser.add_argument("--workers", type=int, default=4, help="Parallel workers for batch")
    parser.add_argument("--postgres-url", type=str, default=None, help="Save to Postgres JSONB")
    parser.add_argument("--track-id", type=str, default=None, help="UUID for DB upsert")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="No progress bar (for CI/worker logs)",
    )
    args = parser.parse_args()

    if args.batch:
        out = args.output_dir or args.batch / "analysis_results"
        errors = run_batch(args.batch, out, workers=args.workers, visualize=args.visualize)
        failed = [e for e in errors if e[1]]
        if failed:
            print(f"Failed {len(failed)} / {len(errors)}", file=sys.stderr)
            for path, err in failed:
                print(f"  {path}: {err}", file=sys.stderr)
            return 1
        print(f"Batch complete → {out}")
        return 0

    if not args.input:
        parser.error("--input or --batch is required")

    try:
        progress = None if args.quiet else tqdm(total=6, desc="Analyzing", unit="step")
        result = analyze_track(
            args.input,
            visualize=args.visualize,
            viz_dir=args.viz_dir,
            progress=progress,
        )
        if progress is not None:
            progress.close()
    except AudioLoadError as e:
        print(f"Load error: {e}", file=sys.stderr)
        return 2

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote {args.output}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.postgres_url and args.track_id:
        save_analysis_to_postgres(args.postgres_url, args.track_id, result)
        print(f"Saved to Postgres track_id={args.track_id}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
