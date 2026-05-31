# Models directory

| Path | Purpose |
|------|---------|
| `emotion_regressor.npz` | Valence/arousal linear head (`v_weights`, `a_weights`). Run `python scripts/init_emotion_weights.py`. |
| `stone_classifier.pt` | Optional TorchScript stone type classifier. |
| `stone_refs/*.wav` | Template WAVs for ♂️AH, Fucking slave, Spank, Boy next door. |
| `openl3/` | Optional OpenL3 checkpoint for embedding-based emotions. |

Replace fallback weights with models fine-tuned on **DEAM** / **PMEmo** and gachi stone datasets for production accuracy.
