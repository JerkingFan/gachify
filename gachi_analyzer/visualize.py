"""Optional PNG visualizations for Creator Hub review UI."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import librosa
import librosa.display
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from gachi_analyzer.config import AnalyzerConfig, get_config


def render_analysis_plots(
    y: np.ndarray,
    sr: int,
    analysis: Dict[str, Any],
    output_dir: Path,
    stem: str = "track",
    cfg: Optional[AnalyzerConfig] = None,
) -> Dict[str, str]:
    """
    Generate waveform, spectrogram, emotion heatmap with ♂️ stone markers.
    Returns paths dict for JSON embedding.
    """
    cfg = cfg or get_config()
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: Dict[str, str] = {}

    # --- Waveform + stones ---
    fig, ax = plt.subplots(figsize=(12, 3), dpi=cfg.visualize_dpi)
    librosa.display.waveshow(y, sr=sr, ax=ax, color="#2d6a4f", alpha=0.85)
    for t in analysis.get("gachi", {}).get("stone_timestamps", []):
        ax.axvline(t, color="#e63946", linestyle="--", linewidth=0.9, alpha=0.9)
    ax.set_title("Waveform — ♂️ stone hits in red")
    ax.set_xlabel("Time (s)")
    wf_path = output_dir / f"{stem}_waveform.png"
    fig.tight_layout()
    fig.savefig(wf_path)
    plt.close(fig)
    paths["waveform_image_path"] = str(wf_path)

    # --- Mel spectrogram ---
    fig, ax = plt.subplots(figsize=(12, 4), dpi=cfg.visualize_dpi)
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    S_db = librosa.power_to_db(S, ref=np.max)
    librosa.display.specshow(S_db, sr=sr, x_axis="time", y_axis="mel", ax=ax, cmap="magma")
    ax.set_title("Mel spectrogram")
    spec_path = output_dir / f"{stem}_spectrogram.png"
    fig.tight_layout()
    fig.savefig(spec_path)
    plt.close(fig)
    paths["spectrogram_image_path"] = str(spec_path)

    # --- Emotion timeline heatmap ---
    timeline: List[Dict[str, Any]] = analysis.get("emotions", {}).get("emotions_timeline", [])
    if timeline:
        labels = list(timeline[0].get("emotions", {}).keys())
        mat = np.array([[fr["emotions"].get(lb, 0) for lb in labels] for fr in timeline])
        fig, ax = plt.subplots(figsize=(12, 3), dpi=cfg.visualize_dpi)
        im = ax.imshow(mat.T, aspect="auto", origin="lower", cmap="YlOrRd")
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels)
        ax.set_xlabel("Frame")
        ax.set_title("Emotion distribution over time")
        fig.colorbar(im, ax=ax, fraction=0.02)
        emo_path = output_dir / f"{stem}_emotions.png"
        fig.tight_layout()
        fig.savefig(emo_path)
        plt.close(fig)
        paths["emotions_heatmap_path"] = str(emo_path)

    return paths
