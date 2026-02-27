import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Service-role client — bypasses RLS. Use only in API routes and server actions,
// never in client components. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
