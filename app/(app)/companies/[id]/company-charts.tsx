'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Metric } from '@/lib/types/database'
import { MetricChart } from './metric-chart'
import { AddDataPointDialog } from './add-data-point-dialog'

interface MetricValueRow {
  id: string
  metric_id: string
  period_label: string
  period_year: number
  period_quarter: number | null
  period_month: number | null
  value_number: number | null
  value_text: string | null
  confidence: 'high' | 'medium' | 'low'
  source_email_id: string | null
  notes: string | null
  is_manually_entered: boolean
  inbound_emails: { id: string; subject: string; received_at: string } | null
}

export type { MetricValueRow }

interface Props {
  companyId: string
  metrics: Metric[]
}

export function CompanyCharts({ companyId, metrics }: Props) {
  const [valuesByMetric, setValuesByMetric] = useState<Record<string, MetricValueRow[]>>({})
  const [loading, setLoading] = useState(true)

  const loadValues = useCallback(async () => {
    setLoading(true)
    const results: Record<string, MetricValueRow[]> = {}
    await Promise.all(
      metrics.map(async (m) => {
        const res = await fetch(`/api/companies/${companyId}/metrics/${m.id}/values`)
        if (res.ok) {
          results[m.id] = await res.json()
        }
      })
    )
    setValuesByMetric(results)
    setLoading(false)
  }, [companyId, metrics])

  useEffect(() => {
    loadValues()
  }, [loadValues])

  if (metrics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          No metrics configured yet. Add metrics to this company to start tracking data.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {metrics.map((m) => (
          <div key={m.id} className="rounded-lg border p-6 animate-pulse">
            <div className="h-5 w-48 bg-muted rounded mb-4" />
            <div className="h-[250px] bg-muted/50 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {metrics.map((m) => (
        <MetricChartCard
          key={m.id}
          companyId={companyId}
          metric={m}
          values={valuesByMetric[m.id] ?? []}
          onRefresh={loadValues}
        />
      ))}
    </div>
  )
}

function MetricChartCard({
  companyId,
  metric,
  values,
  onRefresh,
}: {
  companyId: string
  metric: Metric
  values: MetricValueRow[]
  onRefresh: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">{metric.name}</h3>
          {metric.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{metric.description}</p>
          )}
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          + Add data point
        </button>
      </div>

      {values.length === 0 ? (
        <div className="h-[250px] flex items-center justify-center rounded border border-dashed">
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            No data yet. Values will appear here after the first parsed report, or you can add historical data manually.
          </p>
        </div>
      ) : (
        <MetricChart
          metric={metric}
          values={values}
          onRefresh={onRefresh}
        />
      )}

      <AddDataPointDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        metric={metric}
        onSuccess={onRefresh}
      />
    </div>
  )
}
