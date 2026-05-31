-- Auth credentials and user library (liked tracks, sessions)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email CITEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;

CREATE TABLE liked_tracks (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX idx_liked_tracks_user ON liked_tracks (user_id, created_at DESC);

ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
