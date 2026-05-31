# GachiMIR Analyzer

Production audio analysis pipeline for **gachimuchi remixes** in Gachify Creator Hub.

Extracts standard MIR features (BPM, key, danceability, structure), valence–arousal emotions, and gachi-specific metrics (♂️ stone detector, wackiness, brother power index, deepness, sample fingerprinting, originality).

## Quick start

```bash
cd gachi_analyzer
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt

# Optional: default emotion regressor weights
python scripts/init_emotion_weights.py

# Analyze one track
python analyzer.py --input "remix.flac" --output "analysis_result.json" --visualize
```

From repo root:

```bash
pip install -r gachi_analyzer/requirements.txt
python -m gachi_analyzer.analyzer --input track.mp3 --output out.json
```

## Batch processing

```bash
python analyzer.py --batch ./uploads/ --output-dir ./results/ --workers 4
```

## PostgreSQL (JSONB)

```bash
python analyzer.py -i remix.flac -o out.json \
  --postgres-url "$GACHIFY_DATABASE_URL" \
  --track-id "550e8400-e29b-41d4-a716-446655440000"
```

Expected table (add via gachify migration):

```sql
CREATE TABLE track_audio_analysis (
  track_id UUID PRIMARY KEY,
  analysis JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Sample fingerprint database

Index reference sources:

```bash
python scripts/index_sample.py reference.wav \
  --source-id deep_dark_fantasy \
  --title "Van Darkholme — Deep Dark Fantasy"
```

JSON files land in `sample_db/`. See `sample_db/deep_dark_fantasy.json` for schema.

## ♂️ Stone detector training

1. Place short reference WAVs in `models/stone_refs/`:
   - `ah.wav`, `fucking_slave.wav`, `spank.wav`, `boy_next_door.wav`
2. Or drop a trained `models/stone_classifier.pt` (TorchScript).

Without references, the detector uses spectral-flux peaks + generic ♂️AH heuristic.

## Optional backends

| Feature | Env var | Package |
|---------|---------|---------|
| Essentia tempo/key | `GACHI_USE_ESSENTIA=1` | `essentia` |
| Madmom beats | `GACHI_USE_MADMOM=1` | `madmom` |
| Demucs stems | `GACHI_USE_DEMUCS=1` | `demucs` |
| Spleeter stems | `GACHI_USE_SPLEETER=1` | `spleeter` |

Core path uses **librosa** only (no GPU required).

## Docker / worker integration

Mount `gachi_analyzer/` into the worker image alongside `ffmpeg`. Example:

```dockerfile
RUN apk add --no-cache python3 py3-pip ffmpeg libsndfile
COPY gachi_analyzer /opt/gachi_analyzer
RUN pip install --no-cache-dir -r /opt/gachi_analyzer/requirements.txt
```

Invoke from Go worker:

```text
python -m gachi_analyzer.analyzer -i /data/track.flac -o /tmp/analysis.json
```

## Output schema

Full example: [`example_analysis.json`](example_analysis.json) — hypothetical **♂️Deep♂️Dark♂️Fantasy (Aniki Remix)**.

Top-level fields include: `duration_sec`, `bpm`, `key`, `danceability`, `energy`, `valence`, `arousal`, `emotions_timeline`, `wackiness_score`, `brother_power_index`, `deepness_score`, `stone_events`, `sample_sources`, `originality_ratio`, `waveform_image_path`.

## Performance

- Target: **&lt;60 s** per track on CPU (3–5 min remix).
- Set `GACHI_MAX_ANALYSIS_SEC=600` to cap decode length.
- Batch mode uses `multiprocessing` (`--workers`).

## Project layout

```
gachi_analyzer/
├── analyzer.py          # CLI entrypoint
├── config.py
├── audio_io.py
├── musical.py
├── emotion.py
├── gachi_features.py
├── originality.py
├── fingerprinting.py
├── visualize.py
├── db.py
├── models/              # weights & stone refs
├── sample_db/           # source fingerprints
├── scripts/
├── requirements.txt
└── example_analysis.json
```

## License note

Fingerprint database should only contain **licensed or user-submitted** reference material. The analyzer estimates transformativity; it is not legal advice.
