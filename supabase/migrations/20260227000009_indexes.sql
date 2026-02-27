-- fund_members: called in every RLS policy via get_my_fund_ids()
create index fund_members_user_id_idx  on fund_members (user_id);
create index fund_members_fund_id_idx  on fund_members (fund_id);

-- authorized_senders: email lookup for global inbound routing
create index authorized_senders_email_idx    on authorized_senders (email);
create index authorized_senders_fund_id_idx  on authorized_senders (fund_id);

-- companies
create index companies_fund_id_idx      on companies (fund_id);
create index companies_fund_status_idx  on companies (fund_id, status);

-- inbound_emails: dashboard and email log queries
create index inbound_emails_fund_received_idx  on inbound_emails (fund_id, received_at desc);
create index inbound_emails_company_id_idx     on inbound_emails (company_id);
create index inbound_emails_status_idx         on inbound_emails (processing_status);

-- metrics
create index metrics_company_id_idx  on metrics (company_id);
create index metrics_fund_id_idx     on metrics (fund_id);

-- metric_values: time series queries
create index metric_values_company_period_idx  on metric_values (company_id, period_year, period_quarter);
create index metric_values_metric_id_idx       on metric_values (metric_id);

-- parsing_reviews: open review queue
create index parsing_reviews_fund_resolution_idx  on parsing_reviews (fund_id, resolution);
create index parsing_reviews_email_id_idx         on parsing_reviews (email_id);
