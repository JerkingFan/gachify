-- Moderation status + OAuth account linking

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE tracks ADD CONSTRAINT tracks_status_check
    CHECK (status IN (
        'draft', 'processing', 'pending_review',
        'published', 'shadow_banned', 'removed'
    ));

CREATE TABLE oauth_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    email            CITEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_oauth_accounts_user ON oauth_accounts (user_id);
