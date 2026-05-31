"""Valence-arousal and discrete emotion tagging (+ gachi troll detection)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import librosa
import numpy as np

from gachi_analyzer.config import EMOTION_FRAME_SEC, AnalyzerConfig, get_config

# DEAM-inspired linear mapping coefficients (fallback when no .npz weights)
# Trained offline on DEAM-like stats; replace via models/emotion_regressor.npz
_DEFAULT_V_WEIGHTS = np.array(
    [0.12, -0.08, 0.15, -0.05, 0.22, 0.18, -0.11, 0.09, 0.14, -0.07, 0.06, 0.10, 0.04]
)
_DEFAULT_A_WEIGHTS = np.array(
    [0.18, 0.22, 0.11, 0.25, 0.08, -0.06, 0.19, 0.14, 0.20, 0.16, 0.12, 0.09, 0.05]
)

DISCRETE_LABELS = [
    "aggressive",
    "euphoric",
    "melancholic",
    "dark",
    "epic",
    "funny/troll",
]


@dataclass
class EmotionAnalysis:
    valence: float
    arousal: float
    discrete: Dict[str, float]
    dominant_emotion: str
    emotions_timeline: List[Dict[str, Any]]
    troll_moments: List[Dict[str, float]]


def _load_regressor_weights(path: Path) -> Tuple[np.ndarray, np.ndarray]:
    if path.is_file():
        data = np.load(path)
        return data["v_weights"], data["a_weights"]
    return _DEFAULT_V_WEIGHTS, _DEFAULT_A_WEIGHTS


def _feature_vector(y: np.ndarray, sr: int) -> np.ndarray:
    """Compact embedding proxy (OpenL3/VGGish slot — MFCC+chroma+contrast)."""
    mfcc = librosa.feature.mfcc(y=y, n_mfcc=13, sr=sr).mean(axis=1)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    rms = np.array([librosa.feature.rms(y=y).mean()])
    return np.concatenate([mfcc, chroma[:12] if chroma.size >= 12 else chroma, rms])


def _va_from_features(feat: np.ndarray, v_w: np.ndarray, a_w: np.ndarray) -> Tuple[float, float]:
    dim = min(len(feat), len(v_w), len(a_w))
    v = float(np.tanh(np.dot(feat[:dim], v_w[:dim])))
    a = float(np.tanh(np.dot(feat[:dim], a_w[:dim])))
    return (v + 1) / 2, (a + 1) / 2  # map to [0,1]


def _discrete_distribution(valence: float, arousal: float, energy: float) -> Dict[str, float]:
    """Soft labels from VA quadrant + spectral energy (heuristic classifier)."""
    scores = {
        "aggressive": arousal * (1 - valence) * (0.5 + energy),
        "euphoric": arousal * valence,
        "melancholic": (1 - arousal) * (1 - valence),
        "dark": (1 - valence) * (0.4 + energy * 0.6),
        "epic": arousal * (0.5 + valence * 0.5) * energy,
        "funny/troll": arousal * (1 - abs(valence - 0.5) * 2) * 0.35,
    }
    total = sum(scores.values()) + 1e-8
    return {k: round(v / total, 4) for k, v in scores.items()}


def _detect_troll_moments(
    y: np.ndarray,
    sr: int,
    frame_sec: float,
) -> List[Dict[str, float]]:
    """
    Sudden shift: high energy / minor tension → absurd spectral flatness spike.
    Classic gachi bait-and-switch.
    """
    hop = int(frame_sec * sr)
    moments: List[Dict[str, float]] = []
    prev_flatness: Optional[float] = None
    prev_rms: Optional[float] = None

    for start in range(0, len(y) - hop, hop):
        chunk = y[start : start + hop]
        flat = float(np.mean(librosa.feature.spectral_flatness(y=chunk)))
        rms = float(np.mean(librosa.feature.rms(y=chunk)))
        t = start / sr
        if prev_flatness is not None and prev_rms is not None:
            flat_jump = flat - prev_flatness
            rms_drop = prev_rms - rms
            if flat_jump > 0.08 and rms_drop > 0.02:
                moments.append(
                    {
                        "time_sec": round(t, 2),
                        "troll_score": round(float(np.clip(flat_jump * 3 + rms_drop * 5, 0, 1)), 3),
                    }
                )
        prev_flatness, prev_rms = flat, rms
    return moments


def _try_torch_embedding(y: np.ndarray, sr: int, cfg: AnalyzerConfig) -> Optional[np.ndarray]:
    """Optional OpenL3 / torch hub — returns None if unavailable."""
    openl3_path = cfg.models_dir / "openl3"
    if not openl3_path.exists():
        return None
    try:
        import torch  # noqa: F401

        # Placeholder: production loads custom checkpoint from models/openl3/
        return None
    except ImportError:
        return None


def analyze_emotions(
    y: np.ndarray,
    sr: int,
    energy_score: float = 0.5,
    cfg: Optional[AnalyzerConfig] = None,
) -> EmotionAnalysis:
    cfg = cfg or get_config()
    v_w, a_w = _load_regressor_weights(cfg.emotion_weights)

    frame_sec = EMOTION_FRAME_SEC
    hop = int(frame_sec * sr)
    timeline: List[Dict[str, Any]] = []
    v_vals, a_vals = [], []

    for start in range(0, len(y) - hop + 1, hop):
        chunk = y[start : start + hop]
        feat = _feature_vector(chunk, sr)
        v, a = _va_from_features(feat, v_w, a_w)
        v_vals.append(v)
        a_vals.append(a)
        disc = _discrete_distribution(v, a, energy_score)
        timeline.append(
            {
                "start_sec": round(start / sr, 2),
                "end_sec": round((start + hop) / sr, 2),
                "valence": round(v, 4),
                "arousal": round(a, 4),
                "emotions": disc,
            }
        )

    valence = float(np.mean(v_vals)) if v_vals else 0.5
    arousal = float(np.mean(a_vals)) if a_vals else 0.5
    discrete = _discrete_distribution(valence, arousal, energy_score)
    dominant = max(discrete, key=discrete.get)
    troll = _detect_troll_moments(y, sr, frame_sec / 2)

    return EmotionAnalysis(
        valence=round(valence, 4),
        arousal=round(arousal, 4),
        discrete=discrete,
        dominant_emotion=dominant,
        emotions_timeline=timeline,
        troll_moments=troll,
    )


def emotions_to_dict(e: EmotionAnalysis) -> Dict[str, Any]:
    return {
        "valence": e.valence,
        "arousal": e.arousal,
        "discrete_emotions": e.discrete,
        "dominant_emotion": e.dominant_emotion,
        "emotions_timeline": e.emotions_timeline,
        "troll_moments": e.troll_moments,
    }
