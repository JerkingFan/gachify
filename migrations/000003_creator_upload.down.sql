DROP INDEX IF EXISTS idx_transcode_jobs_pending;
DROP INDEX IF EXISTS idx_transcode_jobs_track;
DROP TABLE IF EXISTS transcode_jobs;
DROP INDEX IF EXISTS idx_tracks_creator_status;
ALTER TABLE tracks DROP COLUMN IF EXISTS processing_error;
ALTER TABLE tracks DROP COLUMN IF EXISTS source_filename;
ALTER TABLE tracks DROP COLUMN IF EXISTS source_content_type;
ALTER TABLE tracks DROP COLUMN IF EXISTS master_object_key;
