create table public.company_summaries (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  fund_id     uuid not null references public.funds(id) on delete cascade,
  period_label text,
  summary_text text not null,
  created_at  timestamptz not null default now()
);

alter table public.company_summaries enable row level security;

create policy "Fund members can manage company summaries"
  on company_summaries for all
  using (fund_id = any(public.get_my_fund_ids()));

create index idx_company_summaries_company on company_summaries(company_id, created_at desc);
