import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import { randomBytes } from 'crypto'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fundName, claudeApiKey } = await req.json()
  if (!fundName?.trim() || !claudeApiKey?.trim()) {
    return NextResponse.json({ error: 'Fund name and API key are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Extract email domain for fund-level domain matching
  const emailDomain = user.email?.split('@')[1]?.toLowerCase() || null

  // Create the fund — the trigger auto-adds the creator to fund_members
  const { data: fund, error: fundError } = await admin
    .from('funds')
    .insert({ name: fundName.trim(), created_by: user.id, email_domain: emailDomain })
    .select('id')
    .single()

  if (fundError || !fund) {
    console.error('[onboarding/fund] Failed to create fund:', fundError)
    return NextResponse.json({ error: 'Failed to create fund' }, { status: 500 })
  }

  // Envelope encryption:
  //   1. Generate a random per-fund DEK (data encryption key)
  //   2. Encrypt the DEK with the master KEK from ENCRYPTION_KEY env var
  //   3. Encrypt the Claude API key with the DEK
  const kek = process.env.ENCRYPTION_KEY
  if (!kek) {
    await admin.from('funds').delete().eq('id', fund.id)
    return NextResponse.json({ error: 'Server misconfiguration: ENCRYPTION_KEY not set' }, { status: 500 })
  }

  const dek = randomBytes(32).toString('hex')
  const encryptionKeyEncrypted = encrypt(dek, kek)
  const claudeApiKeyEncrypted = encrypt(claudeApiKey.trim(), dek)

  // Generate a random webhook token for Postmark URL validation
  const webhookToken = randomBytes(32).toString('hex')

  const { error: settingsError } = await admin
    .from('fund_settings')
    .insert({
      fund_id: fund.id,
      claude_api_key_encrypted: claudeApiKeyEncrypted,
      encryption_key_encrypted: encryptionKeyEncrypted,
      postmark_webhook_token: webhookToken,
    })

  if (settingsError) {
    console.error('[onboarding/fund] Failed to create fund_settings:', settingsError)
    await admin.from('funds').delete().eq('id', fund.id)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  return NextResponse.json({ fundId: fund.id, webhookToken })
}
