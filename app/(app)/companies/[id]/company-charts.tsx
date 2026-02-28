'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MetricForm } from '@/components/metric-form'
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
  created_at: string
  inbound_emails: { id: string; subject: string; received_at: string } | null
}

export type { MetricValueRow }

interface Props {
  companyId: string
  companyName: string
  metrics: Metric[]
}

export function CompanyCharts({ companyId, companyName, metrics }: Props) {
  const router = useRouter()
  const [valuesByMetric, setValuesByMetric] = useState<Record<string, MetricValueRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [addMetricOpen, setAddMetricOpen] = useState(false)

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

  const exportCsv = () => {
    const rows: string[][] = [
      ['Company', 'Metric', 'Period', 'Value', 'Unit', 'Confidence', 'Source', 'Date Entered'],
    ]
    for (const m of metrics) {
      const values = valuesByMetric[m.id] ?? []
      for (const v of values) {
        const value = v.value_number !== null ? String(v.value_number) : (v.value_text ?? '')
        const unit = m.unit ?? ''
        const source = v.is_manually_entered
          ? 'Manual'
          : (v.inbound_emails?.subject ?? 'Email')
        rows.push([
          companyName,
          m.name,
          v.period_label,
          value,
          unit,
          v.confidence,
          source,
          v.created_at ? new Date(v.created_at).toLocaleDateString() : '',
        ])
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_metrics.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addMetricDialog = (
    <Dialog open={addMetricOpen} onOpenChange={setAddMetricOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Metric</DialogTitle>
        </DialogHeader>
        <MetricForm
          companyId={companyId}
          onSuccess={() => {
            setAddMetricOpen(false)
            router.refresh()
          }}
          onCancel={() => setAddMetricOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )

  if (metrics.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <p className="text-muted-foreground">
            No metrics configured yet. Add metrics to this company to start tracking data.
          </p>
          <Button size="sm" onClick={() => setAddMetricOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add metric
          </Button>
        </div>
        {addMetricDialog}
      </>
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

  const hasData = metrics.some((m) => (valuesByMetric[m.id]?.length ?? 0) > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        {hasData && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
        <Button size="sm" variant="outline" onClick={() => setAddMetricOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add metric
        </Button>
      </div>

      {metrics.map((m) => (
        <MetricChartCard
          key={m.id}
          companyId={companyId}
          metric={m}
          values={valuesByMetric[m.id] ?? []}
          onRefresh={loadValues}
        />
      ))}

      {addMetricDialog}
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
