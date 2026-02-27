-- Fix get_my_fund_ids: migration 7 applied it as `returns setof uuid`, which
-- is not permitted in RLS policy expressions. Drop and recreate with uuid[]
-- (CREATE OR REPLACE cannot change a function's return type).
drop function if exists public.get_my_fund_ids();
create function public.get_my_fund_ids()
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(fund_id), '{}') from fund_members where user_id = auth.uid();
$$;

-- RLS policies for all tables.
-- All data-isolation policies use get_my_fund_ids() which queries fund_members
-- via security definer — no recursive evaluation.

-- app_settings: read-only for authenticated users; writes are service-role only
create policy "Authenticated users can read app settings"
  on app_settings for select
  to authenticated
  using (true);

-- funds
create policy "Fund members can view their fund"
  on funds for select
  using (id = any(public.get_my_fund_ids()));

create policy "Authenticated users can create a fund"
  on funds for insert
  with check (created_by = auth.uid());

create policy "Fund members can update their fund"
  on funds for update
  using (id = any(public.get_my_fund_ids()));

create policy "Fund creator can delete their fund"
  on funds for delete
  using (created_by = auth.uid());

-- fund_members
create policy "Fund members can view membership"
  on fund_members for select
  using (fund_id = any(public.get_my_fund_ids()));

create policy "Fund members can invite others"
  on fund_members for insert
  with check (fund_id = any(public.get_my_fund_ids()));

create policy "Fund members can remove members"
  on fund_members for delete
  using (fund_id = any(public.get_my_fund_ids()));

-- fund_settings
create policy "Fund members can manage settings"
  on fund_settings for all
  using (fund_id = any(public.get_my_fund_ids()));

-- authorized_senders
create policy "Fund members can manage authorized senders"
  on authorized_senders for all
  using (fund_id = any(public.get_my_fund_ids()));

-- companies
create policy "Fund members can manage companies"
  on companies for all
  using (fund_id = any(public.get_my_fund_ids()));

-- inbound_emails
create policy "Fund members can manage emails"
  on inbound_emails for all
  using (fund_id = any(public.get_my_fund_ids()));

-- metrics
create policy "Fund members can manage metrics"
  on metrics for all
  using (fund_id = any(public.get_my_fund_ids()));

-- metric_values
create policy "Fund members can manage metric values"
  on metric_values for all
  using (fund_id = any(public.get_my_fund_ids()));

-- parsing_reviews
create policy "Fund members can manage reviews"
  on parsing_reviews for all
  using (fund_id = any(public.get_my_fund_ids()));
