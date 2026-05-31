"""Persist analysis JSON to PostgreSQL (JSONB)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

# psycopg2 is optional at import time
try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    psycopg2 = None  # type: ignore
    Json = None  # type: ignore


def save_analysis_to_postgres(
    database_url: str,
    track_id: str,
    analysis: Dict[str, Any],
    table: str = "track_audio_analysis",
) -> None:
    """
    Upsert analysis into JSONB column.

    Expected schema (run migration in main gachify repo):
      CREATE TABLE track_audio_analysis (
        track_id UUID PRIMARY KEY,
        analysis JSONB NOT NULL,
        analyzed_at TIMESTAMPTZ DEFAULT NOW()
      );
    """
    if psycopg2 is None:
        raise RuntimeError("Install psycopg2-binary: pip install psycopg2-binary")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {table} (track_id, analysis)
                VALUES (%s, %s)
                ON CONFLICT (track_id) DO UPDATE
                SET analysis = EXCLUDED.analysis, analyzed_at = NOW()
                """,
                (track_id, Json(analysis)),
            )
        conn.commit()
    finally:
        conn.close()


def analysis_to_jsonb_ready(analysis: Dict[str, Any]) -> str:
    """Serialize for JSONB storage (validates round-trip)."""
    return json.dumps(analysis, ensure_ascii=False)
