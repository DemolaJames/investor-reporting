import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email?.trim()) {
    return NextResponse.json({ allowed: false })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const domain = normalizedEmail.split('@')[1]

  if (!domain) {
    return NextResponse.json({ allowed: false })
  }

  const admin = createAdminClient()

  // Check for exact email match or wildcard domain match
  const { data } = await admin
    .from('allowed_signups')
    .select('id')
    .or(`email_pattern.eq.${normalizedEmail},email_pattern.eq.*@${domain}`)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ allowed: !!data })
}
