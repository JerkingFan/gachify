-- Play source attribution + optional cross-device player state

CREATE TABLE IF NOT EXISTS track_play_sources (
    track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    play_count  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, source)
);

CREATE INDEX IF NOT EXISTS idx_track_play_sources_track
    ON track_play_sources (track_id);

CREATE TABLE IF NOT EXISTS user_player_state (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    track_ids    JSONB NOT NULL DEFAULT '[]',
    queue_index  INT NOT NULL DEFAULT 0,
    progress_ms  INT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
