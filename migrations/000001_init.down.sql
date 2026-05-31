DROP TRIGGER IF EXISTS playlists_updated_at ON playlists;
DROP TRIGGER IF EXISTS tracks_updated_at ON tracks;
DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS playlists;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS users;
