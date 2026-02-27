-- Email addresses permitted to trigger parsing for a fund.
-- The global inbound webhook checks this table when routing by from-address.
-- If the same email appears as an authorized sender for multiple funds,
-- the webhook rejects with an error (ambiguous routing).
create table authorized_senders (
  id          uuid        primary key default gen_random_uuid(),
  fund_id     uuid        references funds(id) on delete cascade not null,
  email       text        not null,
  label       text,
  created_at  timestamptz default now(),
  unique(fund_id, email)
);

-- Portfolio companies tracked by the fund.
-- aliases: names and domains Claude uses to match incoming emails to this company.
create table companies (
  id            uuid        primary key default gen_random_uuid(),
  fund_id       uuid        references funds(id) on delete cascade not null,
  name          text        not null,
  aliases       text[],
  sector        text,
  stage         text,
  founded_year  int,
  notes         text,
  status        text        default 'active'
                            check (status in ('active', 'exited', 'written-off')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table authorized_senders enable row level security;
alter table companies          enable row level security;
