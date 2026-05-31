"""Audio loading, format normalization, and overlapping window extraction."""

from __future__ import annotations

from pathlib import Path
from typing import Generator, List, Tuple

import librosa
import numpy as np
import soundfile as sf

from gachi_analyzer.config import AnalyzerConfig, SUPPORTED_EXTENSIONS, get_config


class AudioLoadError(Exception):
    """Raised when input cannot be decoded."""


def load_audio(path: str | Path, cfg: AnalyzerConfig | None = None) -> Tuple[np.ndarray, int]:
    """
    Load audio as mono float32 at cfg.target_sr.

    Uses librosa first; falls back to pydub+ffmpeg for AAC/M4A edge cases.
    """
    cfg = cfg or get_config()
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise AudioLoadError(f"Unsupported format: {path.suffix}")

    try:
        y, sr = librosa.load(
            path.as_posix(),
            sr=cfg.target_sr,
            mono=True,
            duration=cfg.max_analysis_sec if cfg.max_analysis_sec > 0 else None,
        )
    except Exception as lib_err:
        y, sr = _load_via_pydub(path, cfg.target_sr, lib_err)

    if y.size == 0:
        raise AudioLoadError(f"Empty audio: {path}")
    return y.astype(np.float32), sr


def _load_via_pydub(
    path: Path, target_sr: int, original_error: Exception
) -> Tuple[np.ndarray, int]:
    """Last resort: pydub → numpy (needs ffmpeg for mp3/aac)."""
    try:
        from pydub import AudioSegment
    except ImportError as e:
        raise AudioLoadError(
            f"librosa failed ({original_error}); install pydub+ffmpeg for {path.suffix}"
        ) from e

    seg = AudioSegment.from_file(path.as_posix())
    seg = seg.set_channels(1).set_frame_rate(target_sr)
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    if seg.sample_width == 2:
        samples /= 32768.0
    elif seg.sample_width == 4:
        samples /= 2147483648.0
    return samples, target_sr


def get_duration_sec(path: str | Path) -> float:
    """Fast duration probe without full decode."""
    path = Path(path)
    try:
        return float(sf.info(path.as_posix()).duration)
    except Exception:
        y, sr = load_audio(path)
        return len(y) / sr


def iter_windows(
    y: np.ndarray,
    sr: int,
    window_sec: float,
    hop_sec: float,
) -> Generator[Tuple[int, int, np.ndarray], None, None]:
    """Yield (start_sample, end_sample, window_audio) with overlap."""
    win = int(window_sec * sr)
    hop = int(hop_sec * sr)
    if win <= 0 or hop <= 0:
        raise ValueError("window_sec and hop_sec must be positive")
    n = len(y)
    for start in range(0, max(1, n - win + 1), hop):
        end = min(start + win, n)
        chunk = y[start:end]
        if len(chunk) < win:
            chunk = np.pad(chunk, (0, win - len(chunk)), mode="constant")
        yield start, end, chunk


def windows_to_times(
    starts: List[int], ends: List[int], sr: int
) -> List[Tuple[float, float]]:
    return [(s / sr, e / sr) for s, e in zip(starts, ends)]
