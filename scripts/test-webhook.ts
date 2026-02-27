/**
 * Sends a realistic fake Postmark inbound payload to the webhook endpoint.
 *
 * Usage:
 *   npx tsx scripts/test-webhook.ts
 *
 * Required environment variables (or edit the CONFIG block below):
 *   WEBHOOK_URL               — defaults to http://localhost:3000/api/inbound-email
 *   POSTMARK_INBOUND_ADDRESS  — the fund's Postmark inbound address (fund_settings.postmark_inbound_address)
 *   POSTMARK_WEBHOOK_TOKEN    — the fund's webhook token (fund_settings.postmark_webhook_token)
 *   TEST_FROM_ADDRESS         — an authorized sender email for that fund
 */

const CONFIG = {
  webhookUrl: process.env.WEBHOOK_URL ?? 'http://localhost:3000/api/inbound-email',
  inboundAddress: process.env.POSTMARK_INBOUND_ADDRESS ?? 'your-fund@inbound.postmarkapp.com',
  webhookToken: process.env.POSTMARK_WEBHOOK_TOKEN ?? 'your-webhook-token',
  fromAddress: process.env.TEST_FROM_ADDRESS ?? 'cfo@acmecorp.com',
}

// ---------------------------------------------------------------------------
// Fake report content — realistic enough to exercise the Claude pipeline
// ---------------------------------------------------------------------------

const REPORT_BODY = `
Hi team,

Please find our Q4 2024 investor update below.

FINANCIAL METRICS
-----------------
Annual Recurring Revenue (ARR): $3.2M
Monthly Recurring Revenue (MRR): $267K
Net Revenue Retention (NRR): 112%
Gross Margin: 74%

OPERATIONAL METRICS
-------------------
Monthly Active Users (MAU): 18,400
Customer Count: 310
Average Contract Value (ACV): $10,320
Churn Rate: 1.8% monthly

CASH & RUNWAY
-------------
Burn Rate: $195K/month
Cash Balance: $4.1M
Runway: 21 months

HIGHLIGHTS
----------
- Closed 3 enterprise deals in Q4 (total $420K ACV)
- Launched new analytics dashboard — 68% of users activated within 30 days
- Hired VP of Sales; sales team now 6 reps

Q1 2025 targets: ARR $3.8M, MAU 22,000

Best,
Sarah Chen
CFO, Acme Corp
`.trim()

// ---------------------------------------------------------------------------
// Postmark inbound payload shape
// ---------------------------------------------------------------------------

const payload = {
  FromName: 'Sarah Chen',
  From: CONFIG.fromAddress,
  FromFull: {
    Email: CONFIG.fromAddress,
    Name: 'Sarah Chen',
  },
  To: CONFIG.inboundAddress,
  ToFull: [{ Email: CONFIG.inboundAddress, Name: '' }],
  OriginalRecipient: CONFIG.inboundAddress,
  ReplyTo: '',
  Subject: 'Acme Corp Q4 2024 Investor Update',
  MessageID: `test-${Date.now()}@test.local`,
  Date: new Date().toUTCString(),
  TextBody: REPORT_BODY,
  HtmlBody: `<html><body><pre>${REPORT_BODY}</pre></body></html>`,
  StrippedTextReply: '',
  Tag: '',
  Headers: [
    { Name: 'X-Spam-Status', Value: 'No' },
  ],
  Attachments: [],
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

async function main() {
  console.log('Sending test webhook payload to:', CONFIG.webhookUrl)
  console.log('  From:', CONFIG.fromAddress)
  console.log('  To:', CONFIG.inboundAddress)
  console.log('  Subject:', payload.Subject)
  console.log()

  const res = await fetch(CONFIG.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postmark-Token': CONFIG.webhookToken,
    },
    body: JSON.stringify(payload),
  })

  const body = await res.text()
  console.log(`Response: ${res.status} ${res.statusText}`)
  console.log(body)

  if (res.status !== 200) {
    console.error('Expected 200 — the webhook should always return 200 to Postmark.')
    process.exit(1)
  }

  console.log('\nCheck your Supabase inbound_emails table for the result.')
  console.log('The processing_status column will show: pending → processing → success/needs_review/failed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
