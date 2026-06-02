ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS invite_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_invite_token
    ON playlists (invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS playlist_collaborators (
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_user
    ON playlist_collaborators (user_id);
