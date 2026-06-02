DROP INDEX IF EXISTS idx_tracks_scheduled_publish;
DROP TABLE IF EXISTS track_play_daily;
ALTER TABLE tracks DROP COLUMN IF EXISTS approved_at;
ALTER TABLE tracks DROP COLUMN IF EXISTS scheduled_publish_at;
ALTER TABLE tracks DROP COLUMN IF EXISTS description;

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_status_check
    CHECK (status IN (
        'draft', 'processing', 'pending_review',
        'published', 'shadow_banned', 'removed'
    ));
