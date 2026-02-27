-- Log of every email received by the webhook, regardless of processing outcome.
-- company_id is null when Claude cannot identify the company.
create table inbound_emails (
  id                  uuid        primary key default gen_random_uuid(),
  fund_id             uuid        references funds(id) on delete cascade not null,
  company_id          uuid        references companies(id),
  from_address        text        not null,
  subject             text,
  received_at         timestamptz default now(),
  raw_payload         jsonb,
  processing_status   text        default 'pending'
                                  check (processing_status in (
                                    'pending', 'processing', 'success',
                                    'failed', 'needs_review'
                                  )),
  processing_error    text,
  claude_response     jsonb,
  metrics_extracted   int         default 0,
  attachments_count   int         default 0,
  created_at          timestamptz default now()
);

alter table inbound_emails enable row level security;
