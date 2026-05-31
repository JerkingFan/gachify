-- Creator Hub: master audio storage keys and processing state

ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS master_object_key TEXT,
    ADD COLUMN IF NOT EXISTS source_content_type TEXT,
    ADD COLUMN IF NOT EXISTS source_filename TEXT,
    ADD COLUMN IF NOT EXISTS processing_error TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_creator_status ON tracks (creator_id, status);

CREATE TABLE transcode_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id        UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_transcode_jobs_track ON transcode_jobs (track_id);
CREATE INDEX idx_transcode_jobs_pending ON transcode_jobs (status, created_at)
    WHERE status = 'pending';
