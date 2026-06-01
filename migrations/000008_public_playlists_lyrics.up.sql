CREATE INDEX IF NOT EXISTS idx_playlists_public_created
    ON playlists (created_at DESC)
    WHERE is_public = true;
