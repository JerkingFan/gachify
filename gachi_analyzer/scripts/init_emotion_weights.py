"""Generate default emotion_regressor.npz (DEAM-style fallback weights)."""

from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "models" / "emotion_regressor.npz"

v_weights = np.array(
    [0.12, -0.08, 0.15, -0.05, 0.22, 0.18, -0.11, 0.09, 0.14, -0.07, 0.06, 0.10, 0.04],
    dtype=np.float32,
)
a_weights = np.array(
    [0.18, 0.22, 0.11, 0.25, 0.08, -0.06, 0.19, 0.14, 0.20, 0.16, 0.12, 0.09, 0.05],
    dtype=np.float32,
)

if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez(OUT, v_weights=v_weights, a_weights=a_weights)
    print(f"Wrote {OUT}")
