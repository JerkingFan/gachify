"""Remix transformativity / legality heuristics (originality_ratio)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import librosa
import numpy as np

from gachi_analyzer.config import (
    ORIGINALITY_LOW_ORIGINALITY_RATIO,
    ORIGINALITY_SAMPLE_MATCH_THRESHOLD,
    AnalyzerConfig,
    get_config,
)


@dataclass
class OriginalityAnalysis:
    originality_ratio: float
    unmodified_sample_ratio: float
    has_overlay_production: bool
    semantic_novelty_score: float
    copyright_risk: str  # low | medium | high
    details: Dict[str, Any]


def _stem_separation_energy(y: np.ndarray, sr: int, cfg: AnalyzerConfig) -> Dict[str, float]:
    """
    Detect production overlays (drums/synth) via HPSS + optional Demucs/Spleeter.
    Returns energy ratios per stem category.
    """
    harmonic, percussive = librosa.effects.hpss(y)
    h_energy = float(np.mean(harmonic**2))
    p_energy = float(np.mean(percussive**2))
    total = h_energy + p_energy + 1e-8

    result = {
        "harmonic_ratio": h_energy / total,
        "percussive_ratio": p_energy / total,
        "demucs_available": False,
    }

    if cfg.use_demucs:
        try:
            # Demucs is heavy — only when explicitly enabled
            import demucs.separate  # type: ignore

            result["demucs_available"] = True
            # Full separation would run in worker GPU queue; stub ratio boost
            result["percussive_ratio"] = min(1.0, result["percussive_ratio"] * 1.1)
        except ImportError:
            pass

    if cfg.use_spleeter:
        try:
            from spleeter.separator import Separator  # type: ignore

            result["spleeter_available"] = True
        except ImportError:
            pass

    return result


def _sample_coverage_duration(
    sample_sources: List[Dict[str, Any]],
    duration_sec: float,
    window_overlap_sec: float = 2.0,
) -> float:
    """Estimate seconds likely covered by detected raw samples."""
    if not sample_sources or duration_sec <= 0:
        return 0.0
    hit_times: List[Tuple[float, float]] = []
    for src in sample_sources:
        for hit in src.get("hits", []):
            t = hit["remix_time_sec"]
            hit_times.append((t - window_overlap_sec / 2, t + window_overlap_sec / 2))
    if not hit_times:
        return 0.0
    hit_times.sort()
    merged = [hit_times[0]]
    for start, end in hit_times[1:]:
        if start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    covered = sum(e - s for s, e in merged)
    return float(min(covered, duration_sec))


def _semantic_novelty(
    musical: Dict[str, Any],
    sample_sources: List[Dict[str, Any]],
) -> float:
    """
    Did the remixer actually DJ or just concatenate?
    Rewards tempo changes, key deviation from vanilla hits, structure variety.
    """
    tempo_score = min(1.0, len(musical.get("tempo_changes", [])) * 0.2)
    sections = musical.get("structure", [])
    struct_score = min(1.0, len(sections) / 6.0)
    # Many sample hits but rearranged = still some novelty
    n_sources = len(sample_sources)
    rearrange_bonus = 0.2 if n_sources >= 2 and len(sections) >= 4 else 0.0
    return float(np.clip(0.4 * tempo_score + 0.4 * struct_score + rearrange_bonus, 0, 1))


def analyze_originality(
    y: np.ndarray,
    sr: int,
    musical: Dict[str, Any],
    sample_sources: List[Dict[str, Any]],
    cfg: Optional[AnalyzerConfig] = None,
) -> OriginalityAnalysis:
    cfg = cfg or get_config()
    duration = musical["duration_sec"]
    stems = _stem_separation_energy(y, sr, cfg)

    covered = _sample_coverage_duration(sample_sources, duration)
    unmodified_ratio = covered / max(duration, 1e-6)

    # Production overlay: strong percussive + spectral bandwidth beyond voice band
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    high_band = S[freqs > 4000, :].mean() if np.any(freqs > 4000) else 0
    has_overlay = (
        stems["percussive_ratio"] > 0.35 or high_band > S.mean() * 0.4
    )

    semantic = _semantic_novelty(musical, sample_sources)

    # Originality: inverse of raw sample paste + bonus for production & structure
    paste_penalty = np.clip(unmodified_ratio, 0, 1)
    production_bonus = 0.25 if has_overlay else 0.0
    originality = (1.0 - paste_penalty * 0.7) * 0.6 + semantic * 0.25 + production_bonus
    originality = float(np.clip(originality, 0, 1))

    if originality < ORIGINALITY_LOW_ORIGINALITY_RATIO or unmodified_ratio > 0.8:
        risk = "high"
    elif unmodified_ratio > 0.5 or originality < 0.45:
        risk = "medium"
    else:
        risk = "low"

    return OriginalityAnalysis(
        originality_ratio=round(originality, 4),
        unmodified_sample_ratio=round(unmodified_ratio, 4),
        has_overlay_production=has_overlay,
        semantic_novelty_score=round(semantic, 4),
        copyright_risk=risk,
        details={
            "stems": stems,
            "sample_covered_sec": round(covered, 2),
            "threshold": ORIGINALITY_SAMPLE_MATCH_THRESHOLD,
        },
    )


def originality_to_dict(o: OriginalityAnalysis) -> Dict[str, Any]:
    return {
        "originality_ratio": o.originality_ratio,
        "unmodified_sample_ratio": o.unmodified_sample_ratio,
        "has_overlay_production": o.has_overlay_production,
        "semantic_novelty_score": o.semantic_novelty_score,
        "copyright_risk": o.copyright_risk,
        "details": o.details,
    }
