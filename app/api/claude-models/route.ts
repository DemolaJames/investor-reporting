import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClaudeApiKey } from '@/lib/pipeline/processEmail'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
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

  let claudeApiKey: string
  try {
    claudeApiKey = await getClaudeApiKey(admin, membership.fund_id)
  } catch {
    return NextResponse.json({ models: [], error: 'Claude API key not configured.' })
  }

  try {
    const client = new Anthropic({ apiKey: claudeApiKey })
    const list = await client.models.list({ limit: 100 })

    const models = list.data
      .filter((m) => m.type === 'model')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((m) => ({
        id: m.id,
        name: m.display_name,
      }))

    return NextResponse.json({ models })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ models: [], error: message })
  }
}
