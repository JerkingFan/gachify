"""Optional MIR backends (essentia, madmom) with safe fallbacks."""

from __future__ import annotations

from typing import Optional, Tuple

import numpy as np


def essentia_bpm_key(y: np.ndarray, sr: int) -> Optional[Tuple[float, str, str]]:
    """Return (bpm, key, mode) if essentia is installed."""
    try:
        import essentia.standard as es  # type: ignore

        audio = y.astype(np.float32)
        rhythm = es.RhythmExtractor2013(method="multifeature")
        bpm, _, _, _, _ = rhythm(audio)
        key_algo = es.KeyExtractor()
        key, scale, strength = key_algo(audio)
        mode = "major" if scale == "major" else "minor"
        if strength < 0.2:
            return None
        return float(bpm), str(key), mode
    except Exception:
        return None


def madmom_beats(y: np.ndarray, sr: int) -> Optional[np.ndarray]:
    """Return beat times in seconds if madmom available."""
    try:
        from madmom.features.beats import RNNBeatProcessor, BeatTrackingProcessor  # type: ignore

        proc = RNNBeatProcessor()
        act = proc(y)
        tracker = BeatTrackingProcessor(fps=100)
        beats = tracker(act)
        return beats
    except Exception:
        return None
