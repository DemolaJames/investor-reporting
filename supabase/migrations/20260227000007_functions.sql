-- Returns all fund IDs the current authenticated user belongs to.
-- security definer bypasses RLS on fund_members so RLS policies on other
-- tables can call this without causing recursive policy evaluation.
-- Returns uuid[] (not setof uuid) — set-returning functions are not
-- permitted in RLS policy expressions.
-- COALESCE ensures an empty array is returned rather than NULL when the
-- user has no memberships, so `= any(...)` evaluates to false, not NULL.
create or replace function public.get_my_fund_ids()
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(fund_id), '{}') from fund_members where user_id = auth.uid();
$$;

-- Automatically stamps updated_at on any row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Automatically adds the fund creator as a member when a new fund is inserted.
-- Runs as security definer so it can write to fund_members even before the
-- creator has a membership row (which get_my_fund_ids() would need).
create or replace function public.add_fund_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into fund_members (fund_id, user_id, invited_by)
  values (new.id, new.created_by, new.created_by);
  return new;
end;
$$;

-- updated_at triggers
create trigger set_updated_at_app_settings
  before update on app_settings
  for each row execute function public.set_updated_at();

create trigger set_updated_at_funds
  before update on funds
  for each row execute function public.set_updated_at();

create trigger set_updated_at_fund_settings
  before update on fund_settings
  for each row execute function public.set_updated_at();

create trigger set_updated_at_companies
  before update on companies
  for each row execute function public.set_updated_at();

create trigger set_updated_at_metric_values
  before update on metric_values
  for each row execute function public.set_updated_at();

-- Auto-membership: runs after a new fund row is inserted
create trigger fund_creator_member
  after insert on funds
  for each row execute function public.add_fund_creator_as_member();
