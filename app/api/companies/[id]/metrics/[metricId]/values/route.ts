import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; metricId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('metric_values')
    .select('*, inbound_emails(id, subject, received_at)')
    .eq('metric_id', params.metricId)
    .eq('company_id', params.id)
    .order('period_year')
    .order('period_quarter', { nullsFirst: true })
    .order('period_month', { nullsFirst: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; metricId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: metric } = await admin
    .from('metrics')
    .select('id, fund_id, value_type')
    .eq('id', params.metricId)
    .eq('company_id', params.id)
    .maybeSingle()

  if (!metric) return NextResponse.json({ error: 'Metric not found' }, { status: 404 })

  const { data: membership } = await admin
    .from('fund_members')
    .select('id')
    .eq('fund_id', metric.fund_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { period_label, period_year, period_quarter, period_month, value, notes } = body

  if (!period_label || !period_year) {
    return NextResponse.json({ error: 'period_label and period_year are required' }, { status: 400 })
  }

  const valueFields: { value_number?: number; value_text?: string } =
    metric.value_type === 'text'
      ? { value_text: String(value) }
      : { value_number: typeof value === 'number' ? value : parseFloat(value) }

  const { data, error } = await admin
    .from('metric_values')
    .insert({
      metric_id: params.metricId,
      company_id: params.id,
      fund_id: metric.fund_id,
      period_label,
      period_year,
      period_quarter: period_quarter ?? null,
      period_month: period_month ?? null,
      confidence: 'high',
      is_manually_entered: true,
      notes: notes ?? null,
      ...valueFields,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
