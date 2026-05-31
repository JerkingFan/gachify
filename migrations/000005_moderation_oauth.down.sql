DROP TABLE IF EXISTS oauth_accounts;

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_status_check
    CHECK (status IN ('draft', 'processing', 'published', 'shadow_banned', 'removed'));
