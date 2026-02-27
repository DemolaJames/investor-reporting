import { createClient } from '@/lib/supabase/server'
import type { Fund } from '@/lib/types/database'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: fund } = await supabase
    .from('funds')
    .select('name')
    .limit(1)
    .maybeSingle() as { data: Pick<Fund, 'name'> | null }

  const { count: companyCount } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const { count: reviewCount } = await supabase
    .from('parsing_reviews')
    .select('id', { count: 'exact', head: true })
    .is('resolution', null)

  const { count: emailCount } = await supabase
    .from('inbound_emails')
    .select('id', { count: 'exact', head: true })

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {fund?.name ?? 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portfolio overview — charts and metrics coming in Phase 5.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active companies" value={companyCount ?? 0} />
        <StatCard label="Emails received" value={emailCount ?? 0} />
        <StatCard label="Pending reviews" value={reviewCount ?? 0} highlight={!!reviewCount} />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        highlight ? 'border-amber-200 bg-amber-50' : 'bg-card'
      }`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  )
}
