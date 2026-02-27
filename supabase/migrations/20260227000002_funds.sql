-- Funds are the primary isolation unit.
-- All data (companies, metrics, emails) is scoped to a fund_id.

create table funds (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  created_by  uuid        references auth.users(id) not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Join table: users that belong to a fund. Flat membership — no roles.
create table fund_members (
  id          uuid        primary key default gen_random_uuid(),
  fund_id     uuid        references funds(id) on delete cascade not null,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  invited_by  uuid        references auth.users(id),
  created_at  timestamptz default now(),
  unique(fund_id, user_id)
);

-- Per-fund configuration and encrypted secrets.
--
-- Envelope encryption for claude_api_key:
--   encryption_key_encrypted  — a random per-fund DEK, AES-256-GCM encrypted
--                               with the master ENCRYPTION_KEY env var (the KEK)
--   claude_api_key_encrypted  — the Claude API key, AES-256-GCM encrypted
--                               with the per-fund DEK
--
-- To decrypt: fetch encryption_key_encrypted → decrypt with KEK → use DEK
--             to decrypt claude_api_key_encrypted.
create table fund_settings (
  id                          uuid    primary key default gen_random_uuid(),
  fund_id                     uuid    references funds(id) on delete cascade not null unique,
  claude_api_key_encrypted    text,
  encryption_key_encrypted    text,
  postmark_inbound_address    text,
  postmark_webhook_token      text,
  retain_resolved_reviews     boolean default true,
  resolved_reviews_ttl_days   int     check (resolved_reviews_ttl_days is null or resolved_reviews_ttl_days > 0),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table funds        enable row level security;
alter table fund_members enable row level security;
alter table fund_settings enable row level security;
