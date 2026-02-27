-- Items flagged by Claude for human review before values are written.
-- Retention behaviour is controlled per-fund via fund_settings:
--   retain_resolved_reviews=false  → resolved rows should be deleted by the app
--   resolved_reviews_ttl_days      → if set, a scheduled job/cron purges rows
--                                     older than this many days after resolution
create table parsing_reviews (
  id                uuid        primary key default gen_random_uuid(),
  fund_id           uuid        references funds(id) on delete cascade not null,
  email_id          uuid        references inbound_emails(id) on delete cascade not null,
  metric_id         uuid        references metrics(id),
  company_id        uuid        references companies(id),
  issue_type        text        not null
                                check (issue_type in (
                                  'new_company_detected',
                                  'low_confidence',
                                  'ambiguous_period',
                                  'metric_not_found',
                                  'company_not_identified',
                                  'duplicate_period'
                                )),
  extracted_value   text,
  context_snippet   text,
  resolution        text        check (resolution in (
                                  'accepted', 'rejected', 'manually_corrected'
                                )),
  resolved_value    text,
  resolved_at       timestamptz,
  created_at        timestamptz default now()
);

alter table parsing_reviews enable row level security;
