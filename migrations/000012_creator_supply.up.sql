-- Creator supply: draft metadata, approved state, scheduled publish, daily play stats

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_status_check
    CHECK (status IN (
        'draft', 'processing', 'pending_review', 'approved',
        'published', 'shadow_banned', 'removed'
    ));

CREATE TABLE IF NOT EXISTS track_play_daily (
    track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    play_date   DATE NOT NULL,
    play_count  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, play_date)
);

CREATE INDEX IF NOT EXISTS idx_track_play_daily_track_date
    ON track_play_daily (track_id, play_date DESC);

CREATE INDEX IF NOT EXISTS idx_tracks_scheduled_publish
    ON tracks (scheduled_publish_at)
    WHERE status = 'approved' AND scheduled_publish_at IS NOT NULL;
