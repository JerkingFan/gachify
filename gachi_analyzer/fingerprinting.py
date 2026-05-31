"""Gachimuchi source sample fingerprint matching against sample_db."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import librosa
import numpy as np

from gachi_analyzer.audio_io import iter_windows
from gachi_analyzer.config import AnalyzerConfig, get_config

HOP_MATCH = 512
N_CHROMA = 12


@dataclass
class SampleMatch:
    source_id: str
    source_title: str
    remix_time_sec: float
    source_time_sec: float
    confidence: float


def _chroma_fingerprint(y: np.ndarray, sr: int) -> np.ndarray:
    """12-bin chroma mean vector — compact fingerprint."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=N_CHROMA)
    vec = chroma.mean(axis=1)
    norm = np.linalg.norm(vec) + 1e-8
    return (vec / norm).astype(np.float32)


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def load_sample_database(cfg: AnalyzerConfig) -> List[Dict[str, Any]]:
    """
    Load fingerprints from sample_db/*.json

    Schema per file:
    {
      "source_id": "billy_herrington_wrestling",
      "title": "Billy Herrington — Wrestling",
      "duration_sec": 180.5,
      "fingerprint": [12 floats],
      "segments": [{"start_sec": 0, "fingerprint": [...]}, ...]
    }
    """
    db_dir = cfg.sample_db_dir
    entries: List[Dict[str, Any]] = []
    if not db_dir.is_dir():
        return entries
    for path in sorted(db_dir.glob("*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                entries.append(json.load(f))
        except (json.JSONDecodeError, OSError):
            continue
    return entries


def match_samples(
    y: np.ndarray,
    sr: int,
    cfg: Optional[AnalyzerConfig] = None,
    window_sec: float = 3.0,
    hop_sec: float = 1.5,
    match_threshold: float = 0.78,
) -> List[Dict[str, Any]]:
    """
    Sliding-window chroma match against reference DB.
    Returns deduplicated source list with time-aligned hits.
    """
    cfg = cfg or get_config()
    database = load_sample_database(cfg)
    if not database:
        return []

    raw_matches: List[SampleMatch] = []

    for start, end, chunk in iter_windows(y, sr, window_sec, hop_sec):
        fp = _chroma_fingerprint(chunk, sr)
        remix_t = (start + end) / 2 / sr

        for entry in database:
            global_fp = np.array(entry.get("fingerprint", []), dtype=np.float32)
            if global_fp.size == N_CHROMA:
                sim = _cosine_sim(fp, global_fp)
                if sim >= match_threshold:
                    raw_matches.append(
                        SampleMatch(
                            source_id=entry["source_id"],
                            source_title=entry.get("title", entry["source_id"]),
                            remix_time_sec=round(remix_t, 2),
                            source_time_sec=0.0,
                            confidence=round(sim, 3),
                        )
                    )

            for seg in entry.get("segments", []):
                seg_fp = np.array(seg.get("fingerprint", []), dtype=np.float32)
                if seg_fp.size != N_CHROMA:
                    continue
                sim = _cosine_sim(fp, seg_fp)
                if sim >= match_threshold:
                    raw_matches.append(
                        SampleMatch(
                            source_id=entry["source_id"],
                            source_title=entry.get("title", entry["source_id"]),
                            remix_time_sec=round(remix_t, 2),
                            source_time_sec=float(seg.get("start_sec", 0)),
                            confidence=round(sim, 3),
                        )
                    )

    # Aggregate by source_id
    by_source: Dict[str, Dict[str, Any]] = {}
    for m in raw_matches:
        if m.source_id not in by_source:
            by_source[m.source_id] = {
                "source_id": m.source_id,
                "title": m.source_title,
                "hits": [],
                "max_confidence": 0.0,
            }
        by_source[m.source_id]["hits"].append(
            {
                "remix_time_sec": m.remix_time_sec,
                "source_time_sec": m.source_time_sec,
                "confidence": m.confidence,
            }
        )
        by_source[m.source_id]["max_confidence"] = max(
            by_source[m.source_id]["max_confidence"], m.confidence
        )

    return list(by_source.values())


def build_fingerprint_from_file(
    audio_path: Path,
    source_id: str,
    title: str,
    cfg: Optional[AnalyzerConfig] = None,
) -> Dict[str, Any]:
    """Utility to index a reference gachi video/audio into sample_db JSON."""
    from gachi_analyzer.audio_io import load_audio

    cfg = cfg or get_config()
    y, sr = load_audio(audio_path, cfg)
    fp = _chroma_fingerprint(y, sr)
    segments = []
    for start, end, chunk in iter_windows(y, sr, 5.0, 5.0):
        segments.append(
            {
                "start_sec": round(start / sr, 2),
                "fingerprint": _chroma_fingerprint(chunk, sr).tolist(),
            }
        )
    return {
        "source_id": source_id,
        "title": title,
        "duration_sec": round(len(y) / sr, 2),
        "fingerprint": fp.tolist(),
        "segments": segments[:50],  # cap index size
    }
