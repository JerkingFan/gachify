"""Standard MIR features: tempo, key, danceability, energy, structure."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import librosa
import numpy as np
from scipy import signal

from gachi_analyzer.backends import essentia_bpm_key
from gachi_analyzer.config import STRUCTURE_MAX_SECTIONS, AnalyzerConfig, get_config

# Krumhansl-Schmuckler major/minor profiles (normalized)
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)
_PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class MusicalAnalysis:
    duration_sec: float
    bpm: float
    bpm_secondary: Optional[float]
    tempo_changes: List[Dict[str, float]]
    key: str
    mode: str  # major | minor
    danceability: float
    energy: Dict[str, float]
    spectral: Dict[str, Any]
    structure: List[Dict[str, Any]]
    mfcc_mean: List[float]


def _estimate_key(y: np.ndarray, sr: int) -> Tuple[str, str]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    if chroma_mean.sum() < 1e-8:
        return "C", "major"
    major = np.roll(_KS_MAJOR, 0)
    minor = np.roll(_KS_MINOR, 0)
    best_corr, best_key, best_mode = -2.0, "C", "major"
    for shift in range(12):
        cm = np.roll(chroma_mean, -shift)
        corr_maj = np.corrcoef(cm, major)[0, 1]
        corr_min = np.corrcoef(cm, minor)[0, 1]
        if corr_maj > best_corr:
            best_corr, best_key, best_mode = corr_maj, _PITCH_CLASSES[shift], "major"
        if corr_min > best_corr:
            best_corr, best_key, best_mode = corr_min, _PITCH_CLASSES[shift], "minor"
    return best_key, best_mode


def _scalar_tempo(tempo: np.ndarray | float) -> float:
    """librosa may return scalar or 1-element array depending on version."""
    t = np.asarray(tempo).reshape(-1)
    if t.size == 0 or not np.isfinite(t[0]):
        return 120.0
    return float(t[0])


def _tempo_and_changes(y: np.ndarray, sr: int) -> Tuple[float, Optional[float], List[Dict[str, float]]]:
    """Global BPM + sliding-window tempo change log (gachi loves surprise BPM)."""
    tempo_global, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = _scalar_tempo(tempo_global)

    # Secondary pulse: double/half tempo ambiguity resolution via onset autocorr
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    ac = librosa.autocorrelate(onset_env, max_size=onset_env.shape[0] // 2)
    peaks, _ = signal.find_peaks(ac, height=0.1 * ac.max() if ac.max() > 0 else 0.01)
    bpm_secondary: Optional[float] = None
    if len(peaks) >= 2:
        lag = peaks[1] - peaks[0]
        if lag > 0:
            bpm_sec = 60.0 * sr / (512.0 * lag)  # hop default alignment
            if 40 < bpm_sec < 240 and abs(bpm_sec - bpm) > 8:
                bpm_secondary = float(bpm_sec)

    # Windowed tempo deltas
    changes: List[Dict[str, float]] = []
    win_sec, hop_sec = 8.0, 4.0
    win = int(win_sec * sr)
    hop = int(hop_sec * sr)
    prev_bpm: Optional[float] = None
    for start in range(0, len(y) - win, hop):
        chunk = y[start : start + win]
        t, _ = librosa.beat.beat_track(y=chunk, sr=sr)
        local = _scalar_tempo(t)
        t_sec = start / sr
        if prev_bpm is not None and abs(local - prev_bpm) > 12:
            changes.append(
                {
                    "time_sec": round(t_sec, 2),
                    "from_bpm": round(prev_bpm, 1),
                    "to_bpm": round(local, 1),
                }
            )
        prev_bpm = local
    return bpm, bpm_secondary, changes


def _danceability(y: np.ndarray, sr: int) -> float:
    """Beat regularity × onset accent strength, squashed to [0,1]."""
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    if beats.size < 4:
        return 0.35
    beat_times = librosa.frames_to_time(beats, sr=sr)
    intervals = np.diff(beat_times)
    if intervals.size == 0:
        return 0.35
    regularity = 1.0 - np.clip(np.std(intervals) / (np.mean(intervals) + 1e-6), 0, 1)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
    accent = float(np.mean(pulse[beats.astype(int).clip(0, len(pulse) - 1)]))
    score = 0.55 * regularity + 0.45 * accent
    return float(np.clip(score, 0.0, 1.0))


def _energy_features(y: np.ndarray, sr: int) -> Dict[str, float]:
    rms = librosa.feature.rms(y=y)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    return {
        "rms_mean": float(np.mean(rms)),
        "rms_max": float(np.max(rms)),
        "spectral_centroid_mean": float(np.mean(centroid)),
        "spectral_rolloff_mean": float(np.mean(rolloff)),
        "energy_score": float(np.clip(np.mean(rms) * 8.0, 0.0, 1.0)),
    }


def _spectral_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    return {
        "mfcc_mean": mfcc.mean(axis=1).tolist(),
        "mfcc_std": mfcc.std(axis=1).tolist(),
        "spectral_contrast_mean": contrast.mean(axis=1).tolist(),
        "zcr_mean": float(np.mean(zcr)),
        "zcr_std": float(np.std(zcr)),
    }


def _structure_sections(y: np.ndarray, sr: int, cfg: AnalyzerConfig) -> List[Dict[str, Any]]:
    """Novelty-based segmentation → intro/drop/bridge/outro labels (heuristic)."""
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
    logmel = librosa.power_to_db(mel)
    # Recurrence matrix → structural boundaries
    try:
        R = librosa.segment.recurrence_matrix(
            logmel, mode="affinity", sym=True
        )
        bounds = librosa.segment.agglomerative(R, k=min(STRUCTURE_MAX_SECTIONS, 8))
    except Exception:
        bounds = librosa.segment.agglomerative(logmel, k=4)

    bound_times = librosa.frames_to_time(bounds, sr=sr)
    labels_cycle = ["intro", "verse", "drop", "bridge", "drop", "verse", "outro", "drop"]
    sections: List[Dict[str, Any]] = []
    for i in range(len(bound_times) - 1):
        label = labels_cycle[i % len(labels_cycle)]
        if i == len(bound_times) - 2:
            label = "outro"
        sections.append(
            {
                "label": label,
                "start_sec": round(float(bound_times[i]), 2),
                "end_sec": round(float(bound_times[i + 1]), 2),
            }
        )
    return sections


def analyze_musical(
    y: np.ndarray,
    sr: int,
    cfg: Optional[AnalyzerConfig] = None,
) -> MusicalAnalysis:
    cfg = cfg or get_config()
    duration = len(y) / sr

    bpm, bpm_secondary, tempo_changes = _tempo_and_changes(y, sr)
    key, mode = _estimate_key(y, sr)
    if cfg.use_essentia:
        ess = essentia_bpm_key(y, sr)
        if ess:
            bpm, key, mode = ess[0], ess[1], ess[2]
    danceability = _danceability(y, sr)
    energy = _energy_features(y, sr)
    spectral = _spectral_features(y, sr)
    structure = _structure_sections(y, sr, cfg)

    return MusicalAnalysis(
        duration_sec=round(duration, 3),
        bpm=round(bpm, 2),
        bpm_secondary=round(bpm_secondary, 2) if bpm_secondary else None,
        tempo_changes=tempo_changes,
        key=key,
        mode=mode,
        danceability=round(danceability, 4),
        energy=energy,
        spectral=spectral,
        structure=structure,
        mfcc_mean=spectral["mfcc_mean"],
    )


def musical_to_dict(m: MusicalAnalysis) -> Dict[str, Any]:
    return {
        "duration_sec": m.duration_sec,
        "bpm": m.bpm,
        "bpm_secondary": m.bpm_secondary,
        "tempo_changes": m.tempo_changes,
        "key": m.key,
        "mode": m.mode,
        "danceability": m.danceability,
        "energy": m.energy,
        "spectral": m.spectral,
        "structure": m.structure,
    }
