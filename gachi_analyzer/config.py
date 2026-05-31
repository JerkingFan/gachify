"""Configuration for GachiMIR analyzer — paths, DSP params, model hooks."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

# Package root (gachi_analyzer/)
PACKAGE_ROOT = Path(__file__).resolve().parent

# Default analysis sample rate (librosa sweet spot for MIR)
TARGET_SR = 22050

# Overlapping windows for short gachi events (stones, one-shots)
WINDOW_SEC = 2.0
HOP_SEC = 0.5

# Structure segmentation
STRUCTURE_MIN_SECTIONS = 3
STRUCTURE_MAX_SECTIONS = 12

# Stone detector thresholds (tuned for voice-band transients)
STONE_FLUX_PERCENTILE = 92.0
STONE_MIN_GAP_SEC = 0.35
STONE_MATCH_THRESHOLD = 0.62

# Originality / legality
ORIGINALITY_SAMPLE_MATCH_THRESHOLD = 0.55
ORIGINALITY_LOW_ORIGINALITY_RATIO = 0.2  # flag if <20% transformative

# Emotion timeline resolution (seconds per frame aggregate)
EMOTION_FRAME_SEC = 1.0

# Supported extensions (pydub/ffmpeg for exotic codecs)
SUPPORTED_EXTENSIONS = {".wav", ".flac", ".mp3", ".aac", ".m4a", ".ogg", ".opus"}


@dataclass
class AnalyzerConfig:
    """Runtime configuration; override via env or CLI."""

    target_sr: int = TARGET_SR
    window_sec: float = WINDOW_SEC
    hop_sec: float = HOP_SEC
    models_dir: Path = field(default_factory=lambda: PACKAGE_ROOT / "models")
    sample_db_dir: Path = field(default_factory=lambda: PACKAGE_ROOT / "sample_db")
    stone_refs_dir: Path = field(default_factory=lambda: PACKAGE_ROOT / "models" / "stone_refs")
    emotion_weights: Path = field(
        default_factory=lambda: PACKAGE_ROOT / "models" / "emotion_regressor.npz"
    )
    stone_classifier: Path = field(
        default_factory=lambda: PACKAGE_ROOT / "models" / "stone_classifier.pt"
    )
    use_essentia: bool = field(
        default_factory=lambda: os.getenv("GACHI_USE_ESSENTIA", "0") == "1"
    )
    use_madmom: bool = field(
        default_factory=lambda: os.getenv("GACHI_USE_MADMOM", "0") == "1"
    )
    use_demucs: bool = field(
        default_factory=lambda: os.getenv("GACHI_USE_DEMUCS", "0") == "1"
    )
    use_spleeter: bool = field(
        default_factory=lambda: os.getenv("GACHI_USE_SPLEETER", "0") == "1"
    )
    max_analysis_sec: float = field(
        default_factory=lambda: float(os.getenv("GACHI_MAX_ANALYSIS_SEC", "600"))
    )
    visualize_dpi: int = 120

    @property
    def stone_types(self) -> List[str]:
        return ["♂️AH", "Fucking slave", "Spank", "Boy next door", "unknown"]


def get_config() -> AnalyzerConfig:
    return AnalyzerConfig()
