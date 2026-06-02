CREATE TABLE IF NOT EXISTS offline_downloads (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id   UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_offline_downloads_user ON offline_downloads(user_id);

CREATE TABLE IF NOT EXISTS filter_presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    filters    JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_filter_presets_user ON filter_presets(user_id);
