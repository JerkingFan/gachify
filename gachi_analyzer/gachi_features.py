"""Gachi-specific metrics: ♂️ stones, wackiness, brother power, deepness."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import librosa
import numpy as np

from gachi_analyzer.audio_io import iter_windows
from gachi_analyzer.config import AnalyzerConfig, get_config

STONE_TYPE_FILES = {
    "♂️AH": "ah.wav",
    "Fucking slave": "fucking_slave.wav",
    "Spank": "spank.wav",
    "Boy next door": "boy_next_door.wav",
}


@dataclass
class StoneEvent:
    time_sec: float
    stone_type: str
    confidence: float


@dataclass
class GachiFeatures:
    has_deep_stone: bool
    stone_count: int
    dominant_stone_type: str
    stone_timestamps: List[float]
    stone_events: List[Dict[str, Any]]
    wackiness_score: float
    brother_power_index: float
    deepness_score: float


def _load_stone_templates(cfg: AnalyzerConfig) -> Dict[str, np.ndarray]:
    """Reference grunts from models/stone_refs/ (optional WAV snippets)."""
    templates: Dict[str, np.ndarray] = {}
    ref_dir = cfg.stone_refs_dir
    if not ref_dir.is_dir():
        return templates
    for stype, fname in STONE_TYPE_FILES.items():
        path = ref_dir / fname
        if path.is_file():
            t, _ = librosa.load(path.as_posix(), sr=cfg.target_sr, mono=True)
            templates[stype] = t
    return templates


def _stone_flux_peaks(y: np.ndarray, sr: int, cfg: AnalyzerConfig) -> List[float]:
    """Transient peaks in 200–3500 Hz band (where legends cry)."""
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    mask = (freqs >= 200) & (freqs <= 3500)
    band = S[mask, :].mean(axis=0)
    flux = np.maximum(0, np.diff(band, prepend=band[0]))
    from gachi_analyzer.config import STONE_FLUX_PERCENTILE, STONE_MIN_GAP_SEC

    thresh = np.percentile(flux, STONE_FLUX_PERCENTILE)
    peak_idx = librosa.util.peak_pick(
        flux,
        pre_max=3,
        post_max=3,
        pre_avg=5,
        post_avg=5,
        delta=thresh * 0.25,
        wait=int(STONE_MIN_GAP_SEC * sr / 512),
    )
    times = librosa.frames_to_time(peak_idx, sr=sr, hop_length=512)
    return [float(t) for t in times]


def _classify_stone_window(
    window: np.ndarray,
    sr: int,
    templates: Dict[str, np.ndarray],
    cfg: AnalyzerConfig,
) -> Tuple[str, float]:
    """Template correlation or torch classifier if present."""
    from gachi_analyzer.config import STONE_MATCH_THRESHOLD

    if cfg.stone_classifier.is_file():
        try:
            import torch

            # Production: load TorchScript / state_dict
            # model = torch.jit.load(cfg.stone_classifier)
            pass
        except Exception:
            pass

    if not templates:
        # Heuristic: spectral centroid burst → generic ♂️AH
        cent = librosa.feature.spectral_centroid(y=window, sr=sr).mean()
        conf = float(np.clip(cent / 4000, 0.3, 0.85))
        return "♂️AH", conf

    best_type, best_corr = "unknown", -1.0
    for stype, tmpl in templates.items():
        # Normalized cross-correlation peak
        n = min(len(window), len(tmpl))
        if n < 512:
            continue
        w = window[:n] / (np.linalg.norm(window[:n]) + 1e-8)
        t = tmpl[:n] / (np.linalg.norm(tmpl[:n]) + 1e-8)
        corr = float(np.max(np.correlate(w, t, mode="valid")))
        if corr > best_corr:
            best_corr, best_type = corr, stype

    if best_corr < STONE_MATCH_THRESHOLD:
        return "unknown", best_corr
    return best_type, best_corr


def detect_stones(
    y: np.ndarray,
    sr: int,
    cfg: Optional[AnalyzerConfig] = None,
) -> Tuple[List[StoneEvent], Dict[str, Any]]:
    cfg = cfg or get_config()
    templates = _load_stone_templates(cfg)
    peak_times = _stone_flux_peaks(y, sr, cfg)

    events: List[StoneEvent] = []
    win_half = int(0.4 * sr)

    for t in peak_times:
        center = int(t * sr)
        w_start = max(0, center - win_half)
        w_end = min(len(y), center + win_half)
        window = y[w_start:w_end]
        stype, conf = _classify_stone_window(window, sr, templates, cfg)
        if stype != "unknown" or conf > 0.5:
            events.append(StoneEvent(time_sec=round(t, 3), stone_type=stype, confidence=round(conf, 3)))

    # Dedupe nearby
    filtered: List[StoneEvent] = []
    from gachi_analyzer.config import STONE_MIN_GAP_SEC

    for ev in sorted(events, key=lambda e: e.time_sec):
        if filtered and ev.time_sec - filtered[-1].time_sec < STONE_MIN_GAP_SEC:
            if ev.confidence > filtered[-1].confidence:
                filtered[-1] = ev
        else:
            filtered.append(ev)

    type_counts: Dict[str, int] = {}
    for ev in filtered:
        type_counts[ev.stone_type] = type_counts.get(ev.stone_type, 0) + 1

    dominant = max(type_counts, key=type_counts.get) if type_counts else "none"
    deep_types = {"♂️AH", "Fucking slave"}
    has_deep = any(e.stone_type in deep_types for e in filtered) and len(filtered) > 0

    meta = {
        "has_deep_stone": has_deep,
        "stone_count": len(filtered),
        "dominant_stone_type": dominant,
        "stone_timestamps": [e.time_sec for e in filtered],
        "stone_events": [
            {"time_sec": e.time_sec, "type": e.stone_type, "confidence": e.confidence}
            for e in filtered
        ],
    }
    return filtered, meta


def compute_wackiness(
    y: np.ndarray,
    sr: int,
    tempo_changes: List[Dict[str, float]],
    troll_moments: List[Dict[str, float]],
) -> float:
    """Chaos index: tempo whiplash + spectral flux chaos + troll bait."""
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    flux_chaos = float(np.std(onset) / (np.mean(onset) + 1e-6))
    tempo_factor = min(1.0, len(tempo_changes) * 0.15)
    troll_factor = min(1.0, len(troll_moments) * 0.12)
    # Dissonance proxy: high chroma entropy
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    ent = float(-np.sum(chroma * np.log(chroma + 1e-8)) / chroma.size)
    dissonance = np.clip(ent / 3.5, 0, 1)
    score = 0.3 * np.clip(flux_chaos / 2, 0, 1) + 0.25 * tempo_factor + 0.25 * troll_factor + 0.2 * dissonance
    return round(float(np.clip(score, 0, 1)), 4)


def compute_brother_power(
    energy_score: float,
    aggressive_emotion: float,
    stone_count: int,
    duration_sec: float,
) -> float:
    """Aniki Workout playlist fuel — feel the thunder."""
    density = stone_count / max(duration_sec / 30.0, 1.0)  # stones per 30s block
    density_norm = np.clip(density / 3.0, 0, 1)
    bpi = 0.4 * energy_score + 0.35 * aggressive_emotion + 0.25 * density_norm
    return round(float(np.clip(bpi, 0, 1)), 4)


def compute_deepness(
    y: np.ndarray,
    sr: int,
    mode: str,
    key: str,
) -> float:
    """Deep dark fantasy coefficient — sub-bass, minor, long reverb tail."""
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    sub = S[freqs < 120, :].mean() if np.any(freqs < 120) else 0
    full = S.mean() + 1e-8
    sub_ratio = float(np.clip(sub / full, 0, 1))

    minor_boost = 0.15 if mode == "minor" else 0.0
    # Reverb proxy: autocorrelation tail energy
    ac = librosa.autocorrelate(y**2, max_size=min(len(y), sr * 2))
    tail = float(np.mean(ac[len(ac) // 4 :]) / (np.mean(ac[: len(ac) // 8]) + 1e-8))
    reverb = np.clip(tail / 2.0, 0, 1)

    # Van Darkholme bonus if key is D minor folklore :)
    key_bonus = 0.05 if key in ("D", "Dm", "F", "G") else 0.0
    deep_dark_coefficient = 0.45 * sub_ratio + 0.35 * reverb + minor_boost + key_bonus
    return round(float(np.clip(deep_dark_coefficient, 0, 1)), 4)


def analyze_gachi(
    y: np.ndarray,
    sr: int,
    musical: Dict[str, Any],
    emotions: Dict[str, Any],
    cfg: Optional[AnalyzerConfig] = None,
) -> GachiFeatures:
    cfg = cfg or get_config()
    _, stone_meta = detect_stones(y, sr, cfg)
    wackiness = compute_wackiness(
        y, sr, musical.get("tempo_changes", []), emotions.get("troll_moments", [])
    )
    agg = emotions.get("discrete_emotions", {}).get("aggressive", 0.3)
    bpi = compute_brother_power(
        musical["energy"]["energy_score"],
        agg,
        stone_meta["stone_count"],
        musical["duration_sec"],
    )
    deepness = compute_deepness(y, sr, musical["mode"], musical["key"])

    return GachiFeatures(
        has_deep_stone=stone_meta["has_deep_stone"],
        stone_count=stone_meta["stone_count"],
        dominant_stone_type=stone_meta["dominant_stone_type"],
        stone_timestamps=stone_meta["stone_timestamps"],
        stone_events=stone_meta["stone_events"],
        wackiness_score=wackiness,
        brother_power_index=bpi,
        deepness_score=deepness,
    )


def gachi_to_dict(g: GachiFeatures) -> Dict[str, Any]:
    return {
        "has_deep_stone": g.has_deep_stone,
        "stone_count": g.stone_count,
        "dominant_stone_type": g.dominant_stone_type,
        "stone_timestamps": g.stone_timestamps,
        "stone_events": g.stone_events,
        "wackiness_score": g.wackiness_score,
        "brother_power_index": g.brother_power_index,
        "deepness_score": g.deepness_score,
    }
