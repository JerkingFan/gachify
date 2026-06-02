ALTER TABLE track_comments
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES track_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_track_comments_parent ON track_comments(parent_id);

CREATE TABLE IF NOT EXISTS track_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id    UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL CHECK (reason IN ('spam', 'copyright', 'offensive', 'other')),
    detail      TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_track_reports_track ON track_reports(track_id, created_at DESC);
