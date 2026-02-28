import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth', req.url))

  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/settings?drive_error=consent_denied', req.url))
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/settings?drive_error=missing_params', req.url))
  }

  // Decode state to get fund_id
  let fundId: string
  try {
    const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
    fundId = state.fund_id
  } catch {
    return NextResponse.redirect(new URL('/settings?drive_error=invalid_state', req.url))
  }

  // Verify user has access to this fund
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.redirect(new URL('/settings?drive_error=forbidden', req.url))
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?drive_error=not_configured', req.url))
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[google-oauth] Token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(new URL('/settings?drive_error=token_exchange_failed', req.url))
  }

  const tokens = await tokenRes.json()
  const refreshToken = tokens.refresh_token

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/settings?drive_error=no_refresh_token', req.url))
  }

  // Encrypt and store refresh token using the fund's encryption key
  const { data: settings } = await admin
    .from('fund_settings')
    .select('encryption_key_encrypted')
    .eq('fund_id', fundId)
    .single()

  if (!settings?.encryption_key_encrypted) {
    return NextResponse.redirect(new URL('/settings?drive_error=no_encryption_key', req.url))
  }

  const kek = process.env.ENCRYPTION_KEY
  if (!kek) {
    return NextResponse.redirect(new URL('/settings?drive_error=server_error', req.url))
  }

  // Decrypt the DEK, then encrypt the refresh token with it
  const { decrypt } = await import('@/lib/crypto')
  const dek = decrypt(settings.encryption_key_encrypted, kek)
  const encryptedRefreshToken = encrypt(refreshToken, dek)

  await admin
    .from('fund_settings')
    .update({ google_refresh_token_encrypted: encryptedRefreshToken })
    .eq('fund_id', fundId)

  return NextResponse.redirect(new URL('/settings?drive_connected=true', req.url))
}
