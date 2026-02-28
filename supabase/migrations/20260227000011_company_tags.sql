-- Add tags column to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
