# Claude Code Build Guide — Portfolio Reporting Tool

A sequenced set of prompts for building this project in Claude Code, phase by phase.
Each prompt is designed to be self-contained — paste it at the start of a focused session.

---

## Before You Start

1. Create an empty directory for the project: `mkdir portfolio-reporter && cd portfolio-reporter`
2. Have your Supabase project URL and keys ready (create a new project at supabase.com)
3. Run `claude` in that directory to start a session
4. Commit to git after each phase completes successfully

---

## Session 0: Project Kickoff

Paste this at the very start of your first session. It establishes context for everything that follows.

```
I'm building a self-hostable portfolio reporting tool for venture capital funds. 
Here is the full technical specification:

[PASTE THE ENTIRE SPEC DOCUMENT HERE]

We will build this in phases. Today we are starting with Phase 1: the Supabase schema and migrations.

Before writing any code, please:
1. Confirm you've read the full spec
2. Ask me any clarifying questions that would affect the schema design
3. Tell me which npm libraries you plan to use and why, before installing anything

Do not start writing code yet.
```

---

## Phase 1: Database Schema

**Goal:** All tables created in Supabase with correct RLS policies. Testable by inspecting the Supabase dashboard.

```
Let's build Phase 1: the Supabase schema.

Set up a Next.js 14 project with TypeScript and Tailwind CSS.
Then create the Supabase migration files for all tables in the spec.

Specific requirements:
- Use the app router (not pages router)
- Create a supabase/migrations/ folder with numbered migration files
- Include all tables: fund_settings, authorized_senders, companies, metrics, 
  metric_values, inbound_emails, parsing_reviews
- Include all RLS policies exactly as specified
- Create a lib/supabase/ folder with typed client helpers (server and client)
- Generate TypeScript types from the schema into lib/types/database.ts

After creating the files, show me the exact commands to apply the migrations 
to my Supabase project. Do not run them yet — show me first.
```

---

## Phase 2A: Attachment Parsing

**Goal:** A utility that takes a Postmark payload and returns extracted text from all attachments.

```
Phase 2A: attachment text extraction utility.

Create lib/parsing/extractAttachmentText.ts

This function takes a Postmark inbound email payload and returns a structured object:
{
  emailBody: string,
  attachments: Array<{
    filename: string,
    contentType: string,
    extractedText: string,
    skipped: boolean,
    skipReason?: string
  }>
}

Handle these formats:
- PDF: pass base64 directly (will be sent to Claude natively — just store the base64 and flag it)
- DOCX: use mammoth to extract plain text
- PPTX: extract slide text (research the best lightweight npm package for this)
- XLSX / CSV: use the xlsx package, convert each sheet to a markdown table
- Images (JPG, PNG, GIF): flag as image — will be passed to Claude as base64
- Everything else: skip with a reason

Truncate any single attachment's text to 50,000 characters. Log a warning if truncation occurs.

Before installing any packages, tell me what you plan to use and why.
```

---

## Phase 2B: Claude Integration

**Goal:** Two Claude utility functions — company identification and metric extraction.

```
Phase 2B: Claude API integration.

Create two functions in lib/claude/:

1. identifyCompany.ts
   - Takes: email subject, body excerpt, array of companies (id, name, aliases)
   - Makes a Claude API call using the prompts in the spec
   - Returns: { company_id, new_company_name, confidence, reasoning }
   - Uses the claude-sonnet-4-5 model (or latest Sonnet available in the SDK)
   - Handles JSON parsing errors with one retry using a stricter prompt

2. extractMetrics.ts
   - Takes: company name, combined email/attachment text, array of metric definitions, 
     array of PDF base64 strings (passed natively), array of image base64 strings
   - Constructs the prompt from the spec
   - Returns the structured JSON from the spec (reporting_period + metrics + unextracted_metrics)
   - Handles JSON parsing errors with one retry

Both functions take a claudeApiKey parameter — they do not read from environment variables.
The key comes from the user's fund_settings record.

Use the official @anthropic-ai/sdk package. Tell me before installing it.
```

---

## Phase 2C: Inbound Email Webhook

**Goal:** A working `/api/inbound-email` endpoint that receives a Postmark payload and runs the full pipeline.

```
Phase 2C: the inbound email webhook.

Create app/api/inbound-email/route.ts

This is the core pipeline. When a POST arrives:

1. Validate the X-Postmark-Token header against the stored webhook token
   - Look up the user by matching postmark_inbound_address to the From address's domain
   - If token invalid or user not found, return 200 (always return 200 to Postmark, never 4xx)

2. Check authorized_senders — if from_address not in the list, log and return 200

3. Create an inbound_emails record with status 'pending' and the raw payload

4. Run attachment extraction (from Phase 2A)

5. Call identifyCompany (from Phase 2B)
   - If new company detected: create parsing_reviews record, set email status 'needs_review', return
   - If company not identified: set email status 'needs_review', return

6. Call extractMetrics (from Phase 2B)

7. Write metric values to the database per the logic in the spec:
   - high/medium confidence → write to metric_values
   - low confidence → write to metric_values + create parsing_reviews entry
   - unextracted metrics → create parsing_reviews entry
   - duplicate period → create parsing_reviews entry, do not overwrite
   - period confidence low → create parsing_reviews entries, do not write values

8. Update inbound_emails.processing_status to 'success' or 'needs_review'

Use the Supabase service role client for all database writes in this route.
Wrap the entire pipeline in try/catch — on any unhandled error, set status 'failed' 
and store the error message. Always return HTTP 200 to Postmark.

After building this, create a test script scripts/test-webhook.ts that sends a 
realistic fake Postmark payload to the endpoint so I can test without real email.
```

---

## Phase 2D: Pipeline Testing

**Goal:** Verify the pipeline works end-to-end before building any UI.

```
Phase 2D: test the pipeline.

I want to test the inbound email webhook before building any UI.

1. Start the dev server
2. Help me set up ngrok or use a local tunnel so Postmark can reach my local server
3. Walk me through creating a test Postmark inbound stream and pointing it at my tunnel URL
4. Run the test script from Phase 2C against my local server
5. Show me how to inspect the results in the Supabase dashboard

If anything is broken, let's fix it now before moving to the UI phases.

Also create a simple scripts/seed.ts that inserts:
- One fund_settings record
- Two companies with aliases and metrics
- One authorized_sender
So I have data to work with in the UI.
```

---

## Phase 3: Auth and Onboarding

**Goal:** Users can sign up, sign in, and complete the three-step onboarding flow.

```
Phase 3: authentication and onboarding.

Set up Supabase Auth and build the onboarding flow.

Auth:
- Sign in / sign up page at /auth with email+password
- Magic link option as secondary
- Redirect to /onboarding after first login, /dashboard on subsequent logins
- Detect first login by checking if fund_settings row exists

Onboarding (3-step flow at /onboarding):
Step 1 — Fund name + Claude API key
  - Fund name text input
  - Claude API key input (masked, like a password field)
  - "Test connection" button — calls /api/test-claude-key and shows success/error inline
  - Store key encrypted using the ENCRYPTION_KEY environment variable (use AES-256-GCM)

Step 2 — Postmark setup
  - Display the webhook URL they need to paste into Postmark: {appUrl}/api/inbound-email?token={generated_token}
  - Generate a random webhook token and store in fund_settings
  - Input field for their Postmark inbound email address
  - Brief instructions with a link to Postmark docs

Step 3 — Authorized senders
  - Pre-populate with the user's email address
  - Add/remove email addresses with labels
  - "Finish setup" button

Also create:
- A simple nav layout component used across all authenticated pages
- Route protection: redirect unauthenticated users to /auth
- /api/test-claude-key route that makes a minimal Claude API call to verify the key

Use shadcn/ui for form components. Ask before installing anything new.
```

---

## Phase 4A: Company and Metric Management

**Goal:** Users can create and configure companies and their metrics.

```
Phase 4A: company and metric management.

Build the company management screens.

Companies list at /companies:
- Table with columns: name, stage, status, metrics configured, last report received
- "Add company" button opens a slide-over or modal
- Add company form: name, aliases (tag input — multiple values), stage, sector, notes
- Click any row navigates to /companies/[id]

Company detail at /companies/[id]:
- Tab layout: Overview, Metrics, Charts (placeholder), Reports (placeholder)

Overview tab:
- Display all company fields
- Edit button opens the same form used for creation
- Aliases displayed as tags

Metrics tab:
- Table of configured metrics: name, unit, cadence, last value, active toggle
- "Add metric" button opens a form:
  - Name (text)
  - Slug (auto-generated from name, editable)
  - Description (textarea — this is what Claude uses to find the metric)
  - Unit (text, e.g. "$", "%", "users")
  - Unit position (prefix/suffix toggle)
  - Value type (select: number, currency, percentage, text)
  - Reporting cadence (select: quarterly, monthly, annual)
  - Display order (number)
- Edit and delete actions on each metric row
- Warn before deleting a metric that has values

Build the API routes: /api/companies, /api/companies/[id], /api/companies/[id]/metrics, /api/metrics/[id]
```

---

## Phase 4B: Review Queue and Email Log

**Goal:** Users can process flagged items and inspect the email history.

```
Phase 4B: review queue and email log.

Review queue at /review:
- Summary counts at top: new companies detected, low confidence values, 
  metrics not found, ambiguous periods, duplicates
- Tabbed or grouped list by issue_type
- Each item shows:
  - Company name (or "Unknown" if not identified)
  - Metric name (if applicable)
  - Issue description
  - Extracted value (if any)
  - Context snippet from the email (shown in a quoted block)
  - Source email subject and date
- Action buttons per item:
  - Accept — writes the value as-is to metric_values, marks review resolved
  - Reject — discards the value, marks review resolved
  - Edit & Accept — inline number/text input to correct the value before writing
- For "new company detected" items: a "Create Company" button that pre-fills 
  the company creation form with the detected name
- Badge in the nav showing count of open review items

Email log at /emails:
- Table: received date, from address, subject, company, status badge, metrics extracted count
- Filter bar: status dropdown, date range, company
- Click row opens a detail panel or page showing:
  - Full email body
  - Attachments list with extraction status
  - Claude's raw JSON response (in a collapsible code block)
  - Metrics written (links to the metric values)
  - "Re-process" button — re-runs the full Claude pipeline on the stored payload
  - Error message if status is 'failed'

Build the API routes: /api/review, /api/review/[id]/resolve, /api/emails, /api/emails/[id], 
/api/emails/[id]/reprocess
```

---

## Phase 5: Charts and Dashboard

**Goal:** Time series visualization per metric, dashboard overview.

```
Phase 5: data visualization.

Install Recharts. Build the charts.

Company detail — Charts tab at /companies/[id] (Charts tab):
- One chart per metric, in display_order order
- X axis: period labels (Q1 2023, Q2 2023, etc.)
- Y axis: metric values with unit prefix/suffix
- Line chart by default, toggle to bar chart
- Clickable data points: clicking a point opens a small popover showing:
  - Value
  - Confidence level (with color indicator: green/yellow/red)
  - Source email subject (linked to /emails/[id])
  - Claude's extraction notes
  - "Edit" and "Delete" actions for the data point
- Empty state when no data yet: "No data yet. Values will appear here after the first 
  parsed report, or you can add historical data manually."
- "Add data point" button above each chart for manual historical entry

Dashboard at /dashboard:
- Top stats row: total active companies, reports processed (last 90 days), open review items
- Company cards grid (2-3 columns):
  - Company name and stage
  - Last report received date (or "No reports yet")
  - Sparkline for up to 2 metrics (the first 2 by display_order)
  - Review badge if the company has open review items
- Alerts panel (sidebar or bottom section):
  - Open review items count with link to /review
  - Failed emails with link to /emails filtered by failed
  - Companies with no reports in 90+ days

Keep charts clean and minimal. Use a muted color palette.
```

---

## Phase 6: Polish and Open Source Prep

**Goal:** The tool is ready for others to install and use.

```
Phase 6: polish and open source packaging.

Settings page at /settings:
- Fund name (editable)
- Claude API key (masked, with update and test buttons)
- Postmark inbound address (editable) and webhook URL display
- Authorized senders: table with add/remove/label
- Danger zone section: "Delete all data" with a confirmation dialog

Manual data entry:
- On the Charts tab, the "Add data point" button opens a form:
  period (year + quarter/month selectors), value, notes
- On the metric_values detail popover, "Edit" opens an inline form
- Mark manually entered values visually distinct in charts (e.g. dashed border on point)

CSV export:
- On each company's Charts tab: "Export CSV" button downloads all metric values 
  for that company as a CSV
- Columns: company, metric, period, value, unit, confidence, source, date entered

README.md:
Write a complete README with:
- What the tool does (2 paragraphs)
- One-click Vercel deploy button (use https://vercel.com/new/clone)
- Step by step setup: Supabase, Postmark, environment variables
- Local development with tunnel instructions
- How to use the tool once set up
- Contributing section

Vercel deploy config:
- vercel.json if needed
- List all required environment variables so the deploy wizard prompts for them

Demo mode:
- If DEMO_MODE=true in env, seed realistic fake data on first load and skip real email parsing
- Show a banner: "Running in demo mode — email parsing is disabled"
```

---

## Ongoing: Useful Commands for Claude Code Sessions

**At the start of any session after the first:**
```
Here's where we left off: [brief description]. 
The full spec is in portfolio-reporting-spec.md in the root of this project.
Today we're working on [phase/task]. Let's continue.
```

**When something goes wrong:**
```
This isn't working: [describe the error or problem].
Don't make any changes yet. First explain what you think is causing it 
and what you plan to do to fix it.
```

**When you want to review before applying:**
```
Show me all the files you're going to create or modify before making any changes.
```

**When a session gets messy:**
```
Let's reset. Here is the current state of the codebase: [paste relevant file contents].
The problem we're trying to solve is [X]. Start fresh with a clean approach.
```

**Before adding a new library:**
```
Before installing [library], tell me: what does it do, why do we need it, 
is there a simpler alternative, and what size is it?
```
