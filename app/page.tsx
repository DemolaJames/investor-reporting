import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Root route: check auth and onboarding state, redirect accordingly.
export default async function Home() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  // If no fund_settings row is accessible (new user or incomplete onboarding),
  // send to onboarding. RLS ensures only the user's own fund settings are visible.
  const { data } = await supabase
    .from('fund_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (!data) redirect('/onboarding')

  redirect('/dashboard')
}
