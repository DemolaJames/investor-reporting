-- App-level configuration. One row per deployment.
-- Managed by the instance administrator via service role only.
-- Authenticated users can read (to display the global inbound address in UI).

create table app_settings (
  id          uuid        primary key default gen_random_uuid(),
  global_inbound_address  text,
  global_inbound_token    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Seed a single configuration row
insert into app_settings (id) values (gen_random_uuid());

alter table app_settings enable row level security;
