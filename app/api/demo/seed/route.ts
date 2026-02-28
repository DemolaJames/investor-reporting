import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { seedDemoData } from '@/lib/demo/seed'

export async function POST() {
  if (process.env.DEMO_MODE !== 'true') {
    return NextResponse.json({ error: 'Demo mode is not enabled' }, { status: 403 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const seeded = await seedDemoData(user.id)

  return NextResponse.json({ seeded })
}
