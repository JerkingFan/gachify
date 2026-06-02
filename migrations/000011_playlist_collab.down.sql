DROP TABLE IF EXISTS playlist_collaborators;
DROP INDEX IF EXISTS idx_playlists_invite_token;
ALTER TABLE playlists DROP COLUMN IF EXISTS invite_token;
ALTER TABLE playlists DROP COLUMN IF EXISTS is_collaborative;
