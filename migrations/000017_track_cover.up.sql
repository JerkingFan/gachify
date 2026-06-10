ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS cover_object_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_cover_object_key ON tracks (cover_object_key)
    WHERE cover_object_key IS NOT NULL;
