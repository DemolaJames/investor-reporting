-- Store Google OAuth credentials per-fund (instead of requiring env vars)
ALTER TABLE fund_settings ADD COLUMN IF NOT EXISTS google_client_id text;
ALTER TABLE fund_settings ADD COLUMN IF NOT EXISTS google_client_secret_encrypted text;
