# Portfolio Reporting

A self-hosted portfolio reporting tool for venture capital funds. Founders and CFOs email their periodic reports in any format — email body, PDF, PPTX, XLSX — and the system uses Claude to automatically identify the company, extract the metrics you've configured, and store the results as time-series data. Everything is presented through a clean dashboard with charts, a review queue for human oversight, and CSV export.

The tool is designed to run as a single-tenant deployment per fund. You control your own data, your own Claude API key, and your own Postmark inbound address. There's no third-party data storage beyond what you provision yourself via Supabase and your hosting platform.

## Deploy

### Netlify (recommended)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_USERNAME/reporting)

The repo includes a `netlify.toml` with the correct build settings and the `@netlify/plugin-nextjs` plugin. After deploying:

1. Go to **Site settings > Environment variables** and add all variables from the table below
2. Trigger a redeploy for the env vars to take effect

> **Note:** Netlify's Edge middleware has a body-size limit. The `middleware.ts` matcher already excludes `/api/inbound-email` so large Postmark payloads with attachments bypass the edge layer. No additional configuration is needed.

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2Freporting&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ENCRYPTION_KEY,NEXT_PUBLIC_APP_URL&envDescription=Required%20environment%20variables%20for%20Portfolio%20Reporting&project-name=portfolio-reporting)

The repo includes a `vercel.json` with extended function timeouts for long-running routes (email processing, AI summaries).

## Setup

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL migrations in `supabase/migrations/` against your database (or use the Supabase CLI: `supabase db push`)
3. Enable **Email Auth** in Authentication > Providers
4. Copy your project URL, anon key, and service role key

### 2. Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (never exposed to client) |
| `ENCRYPTION_KEY` | 32-byte hex string for AES-256 encryption. Generate with: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL (e.g. `https://reporting.yourfund.com`) |
| `DEMO_MODE` | Set to `true` to seed fake data and disable email parsing (optional) |

### 3. Postmark

1. Create a [Postmark](https://postmarkapp.com) account and server
2. Set up an inbound address (e.g. `abc123@inbound.postmarkapp.com`)
3. After deploying, go to **Settings** in the app to find your webhook URL
4. In Postmark, set the inbound webhook URL to point to your deployment

### 4. First run

1. Sign up with your email at `/auth`
2. Complete the onboarding wizard — enter your fund name and Claude API key
3. Configure your Postmark inbound address in Settings
4. Add authorized sender emails in Settings
5. Add your portfolio companies and configure the metrics you want to track
6. Forward a test report email to your inbound address

## Local development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase and encryption keys

# Start the dev server
npm run dev
```

### Tunnel for webhook testing

To receive Postmark webhooks locally, use a tunnel:

```bash
# Using ngrok
ngrok http 3000

# Or using cloudflared
cloudflared tunnel --url http://localhost:3000
```

Then set the tunnel URL as your Postmark webhook: `https://your-tunnel.ngrok.io/api/inbound-email?token=YOUR_TOKEN`

### Demo mode

To explore the app with sample data:

```bash
# Add to .env.local
DEMO_MODE=true
```

This seeds 4 sample companies with realistic metric data on first login and disables email parsing.

## How it works

1. **Email ingestion** — Postmark receives forwarded reports and sends the payload to your webhook endpoint
2. **Company identification** — Claude identifies which portfolio company the report belongs to, matching against configured names and aliases
3. **Metric extraction** — Claude extracts the specific metrics you've configured for each company, handling PDFs, spreadsheets, and slide decks natively
4. **Review queue** — Low-confidence extractions, new companies, and ambiguous periods are flagged for human review
5. **Dashboard** — Company cards with sparklines, stat counters, and alerts for items needing attention
6. **Charts** — Per-metric time-series charts with clickable data points showing confidence, source, and extraction notes
7. **AI summaries** — Each company page includes a Claude-generated performance summary comparing the latest period to historical data

## Architecture

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Recharts
- **Backend**: Next.js API routes, Supabase (PostgreSQL + Auth + RLS)
- **AI**: Anthropic Claude API (claude-sonnet-4-5)
- **Email**: Postmark inbound webhooks
- **File parsing**: mammoth (DOCX), xlsx (spreadsheets), jszip (PPTX), native PDF/image via Claude

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test locally
4. Submit a pull request with a clear description of the change

Please open an issue first for large changes to discuss the approach.

## License

MIT
