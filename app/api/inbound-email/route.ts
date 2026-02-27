import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json, IssueType, ProcessingStatus } from '@/lib/types/database'
import {
  extractAttachmentText,
  type ExtractionResult,
} from '@/lib/parsing/extractAttachmentText'
import { identifyCompany, type CompanyRef } from '@/lib/claude/identifyCompany'
import { extractMetrics, type MetricDef, type ExtractMetricsResult } from '@/lib/claude/extractMetrics'
import { decryptApiKey } from '@/lib/crypto'

// ---------------------------------------------------------------------------
// Postmark inbound payload shape (fields we use)
// ---------------------------------------------------------------------------

interface PostmarkPayload {
  From: string
  FromFull?: { Email: string; Name: string }
  To: string
  OriginalRecipient?: string
  Subject?: string
  TextBody?: string
  HtmlBody?: string
  Attachments?: Array<{
    Name: string
    ContentType: string
    Content: string
    ContentLength: number
  }>
}

// ---------------------------------------------------------------------------
// Entry point — always returns HTTP 200 to Postmark
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    await handleInbound(req)
  } catch (err) {
    console.error('[inbound-email] Unhandled error:', err)
  }
  return NextResponse.json({ ok: true })
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function handleInbound(req: NextRequest) {
  const supabase = createAdminClient()
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const payload = (await req.json()) as PostmarkPayload

  const toAddress = payload.OriginalRecipient || payload.To
  const fromAddress = payload.FromFull?.Email || payload.From

  // Step 1: Resolve which fund this email belongs to and validate the token
  const fundInfo = await resolveFund(supabase, toAddress, fromAddress, token)
  if (!fundInfo) {
    console.warn(`[inbound-email] Could not resolve fund for to=${toAddress} from=${fromAddress}`)
    return
  }
  const { fundId, isGlobal } = fundInfo

  // Step 2: Check authorized senders.
  // For global routing the from_address was used to find the fund, so it is
  // implicitly authorized. For per-fund routing we must check explicitly.
  if (!isGlobal) {
    const authorized = await isAuthorizedSender(supabase, fundId, fromAddress)
    if (!authorized) {
      console.warn(`[inbound-email] Unauthorized sender ${fromAddress} for fund ${fundId}`)
      return
    }
  }

  // Step 3: Persist raw payload with status 'pending'
  const { data: emailRow, error: insertError } = await supabase
    .from('inbound_emails')
    .insert({
      fund_id: fundId,
      from_address: fromAddress,
      subject: payload.Subject ?? null,
      raw_payload: payload as unknown as Json,
      processing_status: 'pending',
      attachments_count: payload.Attachments?.length ?? 0,
    })
    .select('id')
    .single()

  if (insertError || !emailRow) {
    console.error('[inbound-email] Failed to insert email record:', insertError)
    return
  }

  const emailId = emailRow.id

  // Steps 4–8: extraction pipeline. Any error → mark failed.
  try {
    await supabase
      .from('inbound_emails')
      .update({ processing_status: 'processing' })
      .eq('id', emailId)

    await runPipeline(supabase, emailId, fundId, payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[inbound-email] Pipeline error for email ${emailId}:`, err)
    await supabase
      .from('inbound_emails')
      .update({ processing_status: 'failed', processing_error: message })
      .eq('id', emailId)
  }
}

// ---------------------------------------------------------------------------
// Pipeline (Steps 4–8)
// ---------------------------------------------------------------------------

async function runPipeline(
  supabase: ReturnType<typeof createAdminClient>,
  emailId: string,
  fundId: string,
  payload: PostmarkPayload
) {
  // Step 4: Extract text from email body and attachments
  const extracted = await extractAttachmentText(payload)

  // Fetch the fund's (decrypted) Claude API key
  const claudeApiKey = await getClaudeApiKey(supabase, fundId)

  // Step 5: Identify the company
  const companies = await getCompanies(supabase, fundId)

  const identification = await identifyCompany(
    payload.Subject ?? '',
    extracted.emailBody,
    companies,
    claudeApiKey
  )

  if (identification.new_company_name) {
    await createReview(supabase, {
      fund_id: fundId,
      email_id: emailId,
      issue_type: 'new_company_detected',
      extracted_value: identification.new_company_name,
      context_snippet: identification.reasoning,
    })
    await finalizeEmail(supabase, emailId, { status: 'needs_review' })
    return
  }

  if (!identification.company_id) {
    await createReview(supabase, {
      fund_id: fundId,
      email_id: emailId,
      issue_type: 'company_not_identified',
      context_snippet: identification.reasoning,
    })
    await finalizeEmail(supabase, emailId, { status: 'needs_review' })
    return
  }

  const companyId = identification.company_id
  const companyName = companies.find(c => c.id === companyId)?.name ?? ''

  // Attach company to email record now that we know it
  await supabase
    .from('inbound_emails')
    .update({ company_id: companyId })
    .eq('id', emailId)

  // Step 6: Extract metrics
  const metrics = await getMetrics(supabase, companyId)

  if (metrics.length === 0) {
    await finalizeEmail(supabase, emailId, { status: 'success', metricsExtracted: 0 })
    return
  }

  const combinedText = buildCombinedText(extracted)

  const pdfBase64s = extracted.attachments
    .filter(a => !a.skipped && a.base64Content && isPdf(a.contentType))
    .map(a => a.base64Content!)

  const images = extracted.attachments
    .filter(a => !a.skipped && a.base64Content && isImage(a.contentType))
    .map(a => ({ data: a.base64Content!, mediaType: a.contentType }))

  const metricsResult = await extractMetrics(
    companyName,
    combinedText,
    metrics,
    pdfBase64s,
    images,
    claudeApiKey
  )

  // Store the raw Claude response
  await supabase
    .from('inbound_emails')
    .update({ claude_response: metricsResult as unknown as Json })
    .eq('id', emailId)

  // Step 7: Write results
  const { reviewCount, writtenCount } = await writeResults(
    supabase,
    emailId,
    fundId,
    companyId,
    metricsResult,
    metrics
  )

  // Step 8: Finalize email status
  const status = reviewCount > 0 ? 'needs_review' : 'success'
  await finalizeEmail(supabase, emailId, { status, metricsExtracted: writtenCount })
}

// ---------------------------------------------------------------------------
// Result writer (Step 7)
// ---------------------------------------------------------------------------

async function writeResults(
  supabase: ReturnType<typeof createAdminClient>,
  emailId: string,
  fundId: string,
  companyId: string,
  result: ExtractMetricsResult,
  metricDefs: MetricDef[]
): Promise<{ reviewCount: number; writtenCount: number }> {
  let reviewCount = 0
  let writtenCount = 0

  const { reporting_period, metrics, unextracted_metrics } = result

  // If the period itself is low-confidence, flag everything and write nothing
  if (reporting_period.confidence === 'low') {
    for (const m of metrics) {
      await createReview(supabase, {
        fund_id: fundId,
        email_id: emailId,
        metric_id: m.metric_id,
        company_id: companyId,
        issue_type: 'ambiguous_period',
        extracted_value: String(m.value),
        context_snippet: `Period label: "${reporting_period.label}" (low confidence)`,
      })
      reviewCount++
    }
    for (const m of unextracted_metrics) {
      await createReview(supabase, {
        fund_id: fundId,
        email_id: emailId,
        metric_id: m.metric_id,
        company_id: companyId,
        issue_type: 'metric_not_found',
        context_snippet: m.reason,
      })
      reviewCount++
    }
    return { reviewCount, writtenCount }
  }

  // Write extracted metrics
  for (const m of metrics) {
    const def = metricDefs.find(d => d.id === m.metric_id)
    if (!def) continue

    // Duplicate period check
    const isDuplicate = await checkDuplicatePeriod(supabase, m.metric_id, reporting_period)
    if (isDuplicate) {
      await createReview(supabase, {
        fund_id: fundId,
        email_id: emailId,
        metric_id: m.metric_id,
        company_id: companyId,
        issue_type: 'duplicate_period',
        extracted_value: String(m.value),
        context_snippet: `Period: ${reporting_period.label}`,
      })
      reviewCount++
      continue
    }

    const valueFields = parseValue(m.value, def.value_type)

    const { error } = await supabase.from('metric_values').insert({
      metric_id: m.metric_id,
      company_id: companyId,
      fund_id: fundId,
      period_label: reporting_period.label,
      period_year: reporting_period.year,
      period_quarter: reporting_period.quarter ?? null,
      period_month: reporting_period.month ?? null,
      confidence: m.confidence,
      source_email_id: emailId,
      notes: m.notes,
      is_manually_entered: false,
      ...valueFields,
    })

    if (error) {
      console.error(`[inbound-email] Failed to insert metric_value for ${m.metric_id}:`, error)
      continue
    }

    writtenCount++

    // Low confidence → also create a review for human verification
    if (m.confidence === 'low') {
      await createReview(supabase, {
        fund_id: fundId,
        email_id: emailId,
        metric_id: m.metric_id,
        company_id: companyId,
        issue_type: 'low_confidence',
        extracted_value: String(m.value),
        context_snippet: m.notes,
      })
      reviewCount++
    }
  }

  // Flag unextracted metrics
  for (const m of unextracted_metrics) {
    await createReview(supabase, {
      fund_id: fundId,
      email_id: emailId,
      metric_id: m.metric_id,
      company_id: companyId,
      issue_type: 'metric_not_found',
      context_snippet: m.reason,
    })
    reviewCount++
  }

  return { reviewCount, writtenCount }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function resolveFund(
  supabase: ReturnType<typeof createAdminClient>,
  toAddress: string,
  fromAddress: string,
  token: string
): Promise<{ fundId: string; isGlobal: boolean } | null> {
  // Try per-fund inbound address first
  const { data: fundSettings } = await supabase
    .from('fund_settings')
    .select('fund_id, postmark_webhook_token')
    .eq('postmark_inbound_address', toAddress)
    .maybeSingle()

  if (fundSettings) {
    if (!token || token !== fundSettings.postmark_webhook_token) {
      console.warn('[inbound-email] Invalid token for per-fund address')
      return null
    }
    return { fundId: fundSettings.fund_id, isGlobal: false }
  }

  // Try global inbound address
  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('global_inbound_address, global_inbound_token')
    .maybeSingle()

  if (!appSettings?.global_inbound_address || toAddress !== appSettings.global_inbound_address) {
    return null
  }

  if (!token || token !== appSettings.global_inbound_token) {
    console.warn('[inbound-email] Invalid token for global address')
    return null
  }

  // Route by from_address — error if ambiguous
  const { data: senders } = await supabase
    .from('authorized_senders')
    .select('fund_id')
    .eq('email', fromAddress)

  if (!senders || senders.length === 0) return null

  if (senders.length > 1) {
    console.error(
      `[inbound-email] Ambiguous routing: ${fromAddress} is an authorized sender for multiple funds`
    )
    return null
  }

  return { fundId: senders[0].fund_id, isGlobal: true }
}

async function isAuthorizedSender(
  supabase: ReturnType<typeof createAdminClient>,
  fundId: string,
  email: string
): Promise<boolean> {
  const { data } = await supabase
    .from('authorized_senders')
    .select('id')
    .eq('fund_id', fundId)
    .eq('email', email)
    .maybeSingle()
  return !!data
}

async function getClaudeApiKey(
  supabase: ReturnType<typeof createAdminClient>,
  fundId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('fund_settings')
    .select('claude_api_key_encrypted, encryption_key_encrypted')
    .eq('fund_id', fundId)
    .single()

  if (error || !data?.claude_api_key_encrypted || !data?.encryption_key_encrypted) {
    throw new Error(`Claude API key not configured for fund ${fundId}`)
  }

  return decryptApiKey(data.claude_api_key_encrypted, data.encryption_key_encrypted)
}

async function getCompanies(
  supabase: ReturnType<typeof createAdminClient>,
  fundId: string
): Promise<CompanyRef[]> {
  const { data } = await supabase
    .from('companies')
    .select('id, name, aliases')
    .eq('fund_id', fundId)
    .eq('status', 'active')

  return data ?? []
}

async function getMetrics(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string
): Promise<MetricDef[]> {
  const { data } = await supabase
    .from('metrics')
    .select('id, name, slug, description, unit, value_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('display_order')

  return (data ?? []) as MetricDef[]
}

async function checkDuplicatePeriod(
  supabase: ReturnType<typeof createAdminClient>,
  metricId: string,
  period: ExtractMetricsResult['reporting_period']
): Promise<boolean> {
  let query = supabase
    .from('metric_values')
    .select('id')
    .eq('metric_id', metricId)
    .eq('period_year', period.year)

  if (period.quarter !== null && period.quarter !== undefined) {
    query = query.eq('period_quarter', period.quarter)
  } else {
    query = query.is('period_quarter', null)
  }

  if (period.month !== null && period.month !== undefined) {
    query = query.eq('period_month', period.month)
  } else {
    query = query.is('period_month', null)
  }

  const { data } = await query.maybeSingle()
  return !!data
}

async function createReview(
  supabase: ReturnType<typeof createAdminClient>,
  review: {
    fund_id: string
    email_id: string
    metric_id?: string
    company_id?: string
    issue_type: IssueType
    extracted_value?: string
    context_snippet?: string
  }
) {
  const { error } = await supabase.from('parsing_reviews').insert(review)
  if (error) console.error('[inbound-email] Failed to create review:', error)
}

async function finalizeEmail(
  supabase: ReturnType<typeof createAdminClient>,
  emailId: string,
  opts: { status: ProcessingStatus; metricsExtracted?: number }
) {
  await supabase
    .from('inbound_emails')
    .update({
      processing_status: opts.status,
      metrics_extracted: opts.metricsExtracted ?? 0,
    })
    .eq('id', emailId)
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function buildCombinedText(extracted: ExtractionResult): string {
  const parts: string[] = [`[EMAIL BODY]\n${extracted.emailBody}`]
  for (const att of extracted.attachments) {
    if (!att.skipped && att.extractedText) {
      parts.push(`[ATTACHMENT: ${att.filename}]\n${att.extractedText}`)
    }
  }
  return parts.join('\n\n')
}

function parseValue(
  value: number | string,
  valueType: string
): { value_number?: number; value_text?: string } {
  if (valueType === 'text') return { value_text: String(value) }
  const num =
    typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  if (isNaN(num)) return { value_text: String(value) }
  return { value_number: num }
}

function isPdf(contentType: string): boolean {
  return contentType === 'application/pdf'
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/')
}
