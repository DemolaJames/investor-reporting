-- Add Google Drive fields to fund_settings
ALTER TABLE fund_settings ADD COLUMN IF NOT EXISTS google_refresh_token_encrypted text;
ALTER TABLE fund_settings ADD COLUMN IF NOT EXISTS google_drive_folder_id text;
ALTER TABLE fund_settings ADD COLUMN IF NOT EXISTS google_drive_folder_name text;
