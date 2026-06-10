DROP INDEX IF EXISTS idx_tracks_cover_object_key;
ALTER TABLE tracks DROP COLUMN IF EXISTS cover_object_key;
