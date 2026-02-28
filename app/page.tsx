import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Root route: check auth, membership, and onboarding state, redirect accordingly.
export default async function Home() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  // Check if user is a member of any fund (via RLS — only returns their funds)
  const { data: fundSettings } = await supabase
    .from('fund_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (fundSettings) redirect('/dashboard')

  // Check for pending join requests
  const admin = createAdminClient()
  const { data: pendingRequest } = await admin
    .from('fund_join_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (pendingRequest) redirect('/pending')

  redirect('/onboarding')
}
