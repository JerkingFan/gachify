"""Map GachiMIR analyzer JSON → Gachify tracks.gachi_metadata for recommendations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _scale_deepness(value: float) -> float:
    """Gachify UI/DB often uses 1–10; analyzer returns ~0–1."""
    if value <= 1.0:
        return round(value * 10, 2)
    return round(value, 2)


def _energy_scalar(analysis: Dict[str, Any]) -> Optional[float]:
    energy = analysis.get("energy")
    if isinstance(energy, (int, float)):
        return float(energy)
    if isinstance(energy, dict):
        for key in ("energy_score", "rms", "loudness"):
            v = energy.get(key)
            if isinstance(v, (int, float)):
                return float(v)
    return None


def _dominant_sample(analysis: Dict[str, Any]) -> Optional[str]:
    sources: List[Any] = analysis.get("sample_sources") or []
    if not sources:
        gachi = analysis.get("gachi") or {}
        stone = gachi.get("dominant_stone_type")
        if isinstance(stone, str) and stone.strip():
            return stone.strip()
        return None
    first = sources[0]
    if isinstance(first, dict):
        for key in ("source_id", "id", "title", "name"):
            v = first.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip().lower().replace(" ", "_")
    return None


def analysis_to_gachi_metadata(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Produce fields used by Gachify catalog, admin moderation, and /tracks/{id}/next.
    Preserves any caller-provided keys when merging into existing metadata.
    """
    gachi = analysis.get("gachi") or {}
    if not gachi and analysis.get("wackiness_score") is not None:
        gachi = analysis

    bpi = float(gachi.get("brother_power_index", 0.5))
    deepness = float(gachi.get("deepness_score", 0.5))
    stone_count = int(gachi.get("stone_count", 0))

    mood_tags = list(analysis.get("auto_tags") or [])
    mood_tags = [str(t).strip() for t in mood_tags if str(t).strip()]

    meta: Dict[str, Any] = {
        "gachi_power_level": max(1, min(100, int(round(bpi * 100)))),
        "deepness_score": _scale_deepness(deepness),
        "grunt_count": stone_count,
        "mood_tags": mood_tags,
    }

    bpm = analysis.get("bpm")
    if isinstance(bpm, (int, float)) and bpm > 0:
        meta["bpm"] = round(float(bpm), 2)

    sample = _dominant_sample(analysis)
    if sample:
        meta["dominant_male_sample"] = sample

    wack = gachi.get("wackiness_score")
    if isinstance(wack, (int, float)):
        meta["wackiness_score"] = round(float(wack), 4)

    energy = _energy_scalar(analysis)
    if energy is not None:
        meta["energy"] = round(min(1.0, max(0.0, energy)), 4)

    valence = analysis.get("valence")
    if isinstance(valence, (int, float)):
        meta["valence"] = round(min(1.0, max(0.0, float(valence))), 4)

    dance = analysis.get("danceability")
    if isinstance(dance, (int, float)):
        meta["danceability"] = round(min(1.0, max(0.0, float(dance))), 4)

    if stone_count >= 8:
        meta["wessratost_level"] = min(10, 5 + stone_count // 3)

    duration = analysis.get("duration_sec")
    if isinstance(duration, (int, float)) and duration > 600:
        meta["is_continuous_mix"] = True

    meta["analyzer"] = {
        "schema_version": analysis.get("schema_version", "1.0"),
        "analyzed_at": analysis.get("analyzed_at"),
        "processing_time_sec": analysis.get("processing_time_sec"),
        "dominant_emotion": analysis.get("dominant_emotion"),
        "key": analysis.get("key"),
        "mode": analysis.get("mode"),
    }
    return meta
