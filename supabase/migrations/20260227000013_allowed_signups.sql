-- 1. Signup whitelist table
create table allowed_signups (
  id            uuid        primary key default gen_random_uuid(),
  email_pattern text        not null unique, -- exact email or '*@domain.com'
  created_at    timestamptz default now()
);
alter table allowed_signups enable row level security;
-- No RLS policies — only accessible via service role (admin client)

-- 2. Add role column to fund_members
ALTER TABLE fund_members ADD COLUMN role text NOT NULL DEFAULT 'member';

-- 3. Add email_domain to funds
ALTER TABLE funds ADD COLUMN email_domain text;

-- 4. Fund join requests table
create table fund_join_requests (
  id          uuid        primary key default gen_random_uuid(),
  fund_id     uuid        references funds(id) on delete cascade not null,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  email       text        not null,
  status      text        not null default 'pending',
  reviewed_by uuid        references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(fund_id, user_id)
);
alter table fund_join_requests enable row level security;

-- RLS for fund_join_requests
create policy "Users can view their own join requests"
  on fund_join_requests for select
  using (user_id = auth.uid());

create policy "Fund admins can view join requests for their fund"
  on fund_join_requests for select
  using (
    fund_id = any(public.get_my_fund_ids())
  );

create policy "Authenticated users can create join requests"
  on fund_join_requests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Fund admins can update join requests"
  on fund_join_requests for update
  using (
    fund_id = any(public.get_my_fund_ids())
  );

-- updated_at trigger for fund_join_requests
create trigger set_updated_at_fund_join_requests
  before update on fund_join_requests
  for each row execute function public.set_updated_at();

-- 5. Update the fund creator trigger to set role = 'admin'
create or replace function public.add_fund_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into fund_members (fund_id, user_id, invited_by, role)
  values (new.id, new.created_by, new.created_by, 'admin');
  return new;
end;
$$;
