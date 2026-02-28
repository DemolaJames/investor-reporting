import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const domain = user.email?.split('@')[1]?.toLowerCase()
  if (!domain) return NextResponse.json({ fund: null })

  const admin = createAdminClient()

  const { data: fund } = await admin
    .from('funds')
    .select('id, name')
    .eq('email_domain', domain)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ fund: fund ?? null })
}
