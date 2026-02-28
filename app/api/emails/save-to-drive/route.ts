import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { getAccessToken, findOrCreateFolder, uploadFile } from '@/lib/google/drive'
import { getGoogleCredentials } from '@/lib/google/credentials'

// POST — save one or more emails to Google Drive
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 403 })

  const body = await req.json()
  // Accept either { emailId: "..." } or { emailIds: ["...", "..."] }
  const emailIds: string[] = body.emailIds ?? (body.emailId ? [body.emailId] : [])

  if (emailIds.length === 0) {
    return NextResponse.json({ error: 'No email IDs provided' }, { status: 400 })
  }

  // Check Google Drive connection
  const { data: settings } = await admin
    .from('fund_settings')
    .select('google_refresh_token_encrypted, encryption_key_encrypted, google_drive_folder_id')
    .eq('fund_id', membership.fund_id)
    .single()

  if (
    !settings?.google_refresh_token_encrypted ||
    !settings?.encryption_key_encrypted ||
    !settings?.google_drive_folder_id
  ) {
    return NextResponse.json({ error: 'Google Drive not connected or no folder selected' }, { status: 400 })
  }

  const kek = process.env.ENCRYPTION_KEY
  if (!kek) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })

  const dek = decrypt(settings.encryption_key_encrypted, kek)
  const refreshToken = decrypt(settings.google_refresh_token_encrypted, dek)
  const creds = await getGoogleCredentials(admin, membership.fund_id)
  const accessToken = await getAccessToken(refreshToken, creds?.clientId, creds?.clientSecret)
  const rootFolderId = settings.google_drive_folder_id

  // Fetch the emails with their company info
  const { data: emails, error: emailsError } = await admin
    .from('inbound_emails')
    .select('id, subject, company_id, raw_payload, received_at')
    .eq('fund_id', membership.fund_id)
    .in('id', emailIds)

  if (emailsError) {
    return NextResponse.json({ error: emailsError.message }, { status: 500 })
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ error: 'No matching emails found' }, { status: 404 })
  }

  // Get company names for subfolder creation
  const companyIds = Array.from(new Set(emails.map(e => e.company_id).filter(Boolean))) as string[]
  const companiesMap: Record<string, string> = {}

  if (companyIds.length > 0) {
    const { data: companies } = await admin
      .from('companies')
      .select('id, name')
      .in('id', companyIds)

    for (const c of companies ?? []) {
      companiesMap[c.id] = c.name
    }
  }

  // Save each email
  let saved = 0
  let failed = 0
  const errors: string[] = []

  for (const email of emails) {
    try {
      const payload = email.raw_payload as Record<string, unknown> | null
      if (!payload) {
        errors.push(`${email.id}: no payload stored`)
        failed++
        continue
      }

      const companyName = email.company_id
        ? companiesMap[email.company_id] ?? 'Unknown Company'
        : 'Unidentified'

      // Find or create company subfolder
      const companyFolderId = await findOrCreateFolder(accessToken, rootFolderId, companyName)

      // Upload email body
      const dateStr = new Date(email.received_at).toISOString().slice(0, 10)
      const subject = ((payload.Subject as string) ?? '')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .slice(0, 60) || 'Report'
      const emailFilename = `${dateStr}_${subject}.txt`
      const emailBody = (payload.TextBody as string) || (payload.HtmlBody as string) || '(no body)'
      await uploadFile(accessToken, companyFolderId, emailFilename, emailBody, 'text/plain')

      // Upload attachments
      const attachments = (payload.Attachments as Array<{
        Name: string
        ContentType: string
        Content: string
      }>) ?? []

      for (const att of attachments) {
        const content = Buffer.from(att.Content, 'base64')
        await uploadFile(accessToken, companyFolderId, att.Name, content, att.ContentType)
      }

      saved++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${email.id}: ${msg}`)
      failed++
    }
  }

  return NextResponse.json({ saved, failed, errors: errors.length > 0 ? errors : undefined })
}
