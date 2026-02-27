-- Metric definitions per company. Each company has its own independently
-- configured set. The description field is passed to Claude for context.
create table metrics (
  id                  uuid    primary key default gen_random_uuid(),
  company_id          uuid    references companies(id) on delete cascade not null,
  fund_id             uuid    references funds(id) on delete cascade not null,
  name                text    not null,
  slug                text    not null,
  description         text,
  unit                text,
  unit_position       text    default 'prefix'
                              check (unit_position in ('prefix', 'suffix')),
  value_type          text    default 'number'
                              check (value_type in ('number', 'currency', 'percentage', 'text')),
  reporting_cadence   text    default 'quarterly'
                              check (reporting_cadence in ('quarterly', 'monthly', 'annual')),
  display_order       int     default 0,
  is_active           boolean default true,
  created_at          timestamptz default now(),
  unique(company_id, slug)
);

-- Time series: one row per metric per reporting period.
-- Reporting is always anchored to a quarter. period_month is set for
-- metrics that track monthly values within a quarter (e.g. MAU per month).
create table metric_values (
  id                    uuid      primary key default gen_random_uuid(),
  metric_id             uuid      references metrics(id) on delete cascade not null,
  company_id            uuid      references companies(id) on delete cascade not null,
  fund_id               uuid      references funds(id) on delete cascade not null,
  period_label          text      not null,
  period_year           int       not null,
  period_quarter        int       check (period_quarter between 1 and 4),
  period_month          int       check (period_month between 1 and 12),
  value_number          numeric,
  value_text            text,
  confidence            text      default 'high'
                                  check (confidence in ('high', 'medium', 'low')),
  source_email_id       uuid      references inbound_emails(id),
  notes                 text,
  is_manually_entered   boolean   default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  constraint metric_values_has_value
    check (value_number is not null or value_text is not null)
);

-- COALESCE(x, 0) treats NULL as 0 so the constraint is deterministic:
-- two quarterly rows (period_month = null) for the same metric+quarter
-- will correctly conflict rather than silently creating duplicates.
create unique index metric_values_period_idx on metric_values (
  metric_id,
  period_year,
  coalesce(period_quarter, 0),
  coalesce(period_month, 0)
);

alter table metrics       enable row level security;
alter table metric_values enable row level security;
