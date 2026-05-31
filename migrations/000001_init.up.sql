-- Gachify core schema (PostgreSQL source of truth for relational data)

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle          CITEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL DEFAULT '',
    tier            TEXT NOT NULL DEFAULT 'free'
        CHECK (tier IN ('free', 'premium', 'creator_pro')),
    trash_tolerance REAL NOT NULL DEFAULT 0.5
        CHECK (trash_tolerance >= 0 AND trash_tolerance <= 1),
    gachi_persona   JSONB NOT NULL DEFAULT '{}',
    region          CHAR(2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_handle ON users (handle);

CREATE TABLE tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title           TEXT NOT NULL,
    duration_ms     INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    status          TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'processing', 'published', 'shadow_banned', 'removed')),
    gachi_metadata  JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracks_creator ON tracks (creator_id);
CREATE INDEX idx_tracks_status_created ON tracks (status, created_at DESC);
CREATE INDEX idx_tracks_gachi_metadata ON tracks USING gin (gachi_metadata);

CREATE TABLE playlists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    is_public   BOOLEAN NOT NULL DEFAULT false,
    items       JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlists_owner ON playlists (owner_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tracks_updated_at
    BEFORE UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER playlists_updated_at
    BEFORE UPDATE ON playlists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
