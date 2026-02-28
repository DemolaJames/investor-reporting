import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { getAccessToken, listFolders } from '@/lib/google/drive'

export async function GET(req: NextRequest) {
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

  const { data: settings } = await admin
    .from('fund_settings')
    .select('google_refresh_token_encrypted, encryption_key_encrypted')
    .eq('fund_id', membership.fund_id)
    .single()

  if (!settings?.google_refresh_token_encrypted || !settings?.encryption_key_encrypted) {
    return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 })
  }

  const kek = process.env.ENCRYPTION_KEY
  if (!kek) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })

  const dek = decrypt(settings.encryption_key_encrypted, kek)
  const refreshToken = decrypt(settings.google_refresh_token_encrypted, dek)

  try {
    const accessToken = await getAccessToken(refreshToken)
    const parent = req.nextUrl.searchParams.get('parent') || undefined
    const folders = await listFolders(accessToken, parent)

    return NextResponse.json({ folders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list folders'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
