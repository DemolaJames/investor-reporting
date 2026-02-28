'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Loader2, X, Plus, Building2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sender {
  email: string
  label: string
}

interface OnboardingState {
  fundId: string | null
  webhookToken: string | null
}

interface MatchingFund {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { n: 1, label: 'Fund setup' },
  { n: 2, label: 'Email integration' },
  { n: 3, label: 'Authorized senders' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {current > step.n ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : current === step.n ? (
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">{step.n}</span>
              </div>
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <span
              className={`text-sm ${
                current === step.n ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-8 h-px bg-border mx-1" />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [matchingFund, setMatchingFund] = useState<MatchingFund | null>(null)
  const [mode, setMode] = useState<'detect' | 'join' | 'create'>('detect')
  const [step, setStep] = useState(1)
  const [state, setState] = useState<OnboardingState>({ fundId: null, webhookToken: null })

  const detectFund = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setMode('create')
      setLoading(false)
      return
    }

    const domain = user.email.split('@')[1]?.toLowerCase()
    if (!domain) {
      setMode('create')
      setLoading(false)
      return
    }

    // Check for existing funds with matching domain (via API)
    const res = await fetch('/api/onboarding/check-domain')
    if (res.ok) {
      const data = await res.json()
      if (data.fund) {
        setMatchingFund(data.fund)
        setMode('join')
        setLoading(false)
        return
      }
    }

    setMode('create')
    setLoading(false)
  }, [supabase])

  useEffect(() => { detectFund() }, [detectFund])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (mode === 'join' && matchingFund) {
    return <JoinFundScreen fund={matchingFund} onCreateInstead={() => setMode('create')} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your fund</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This takes about 3 minutes. You can update everything later in Settings.
          </p>
        </div>

        <StepIndicator current={step} />

        {step === 1 && (
          <Step1
            onComplete={(fundId, webhookToken) => {
              setState({ fundId, webhookToken })
              setStep(2)
            }}
          />
        )}
        {step === 2 && state.fundId && state.webhookToken && (
          <Step2
            fundId={state.fundId}
            webhookToken={state.webhookToken}
            onComplete={() => setStep(3)}
          />
        )}
        {step === 3 && state.fundId && (
          <Step3
            fundId={state.fundId}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Join existing fund screen
// ---------------------------------------------------------------------------

function JoinFundScreen({
  fund,
  onCreateInstead,
}: {
  fund: MatchingFund
  onCreateInstead: () => void
}) {
  const router = useRouter()
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestJoin() {
    setRequesting(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: fund.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRequested(true)
      setTimeout(() => router.push('/pending'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setRequesting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We found a fund matching your email domain.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {requested ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-medium">Request sent</p>
                <p className="text-sm text-muted-foreground">Redirecting...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
                  <Building2 className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{fund.name}</p>
                    <p className="text-xs text-muted-foreground">Existing fund at your organization</p>
                  </div>
                </div>

                <Button className="w-full" onClick={requestJoin} disabled={requesting}>
                  {requesting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Requesting...</>
                  ) : (
                    'Request to join'
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Your request will be reviewed by a fund administrator.
                </p>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button variant="outline" className="w-full" onClick={onCreateInstead}>
                  Create a new fund instead
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Fund name + Claude API key
// ---------------------------------------------------------------------------

function Step1({ onComplete }: { onComplete: (fundId: string, webhookToken: string) => void }) {
  const [fundName, setFundName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function testKey() {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch('/api/test-claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestError(data.error ?? 'Connection failed')
      }
    } catch {
      setTestResult('error')
      setTestError('Network error')
    }
    setTesting(false)
  }

  async function submit() {
    if (!fundName.trim() || !apiKey.trim()) {
      setError('Both fields are required.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundName, claudeApiKey: apiKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onComplete(data.fundId, data.webhookToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund name &amp; Claude API key</CardTitle>
        <CardDescription>
          Your API key is encrypted before storage and never exposed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="fund-name">Fund name</Label>
          <Input
            id="fund-name"
            placeholder="Acme Ventures"
            value={fundName}
            onChange={e => setFundName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">Claude API key</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={e => {
                setApiKey(e.target.value)
                setTestResult(null)
              }}
              className="flex-1"
            />
            <Button variant="outline" onClick={testKey} disabled={testing || !apiKey.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </Button>
          </div>
          {testResult === 'success' && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected successfully
            </p>
          )}
          {testResult === 'error' && (
            <p className="text-sm text-destructive">{testError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Get your key at{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : 'Next →'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Postmark setup
// ---------------------------------------------------------------------------

function Step2({
  fundId,
  webhookToken,
  onComplete,
}: {
  fundId: string
  webhookToken: string
  onComplete: () => void
}) {
  const [inboundAddress, setInboundAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/inbound-email?token=${webhookToken}`

  async function submit() {
    if (!inboundAddress.trim()) {
      setError('Postmark inbound address is required.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/postmark', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, postmarkInboundAddress: inboundAddress }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Postmark email integration</CardTitle>
        <CardDescription>
          Founders email reports to a Postmark inbound address. Postmark forwards
          them to your webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Your webhook URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted rounded-md px-3 py-2 text-xs break-all font-mono">
              {webhookUrl || 'Set NEXT_PUBLIC_APP_URL in your environment'}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            In your{' '}
            <a
              href="https://account.postmarkapp.com/servers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Postmark server settings
            </a>
            , go to <strong>Inbound</strong> and paste this URL as the webhook endpoint.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inbound-address">Postmark inbound email address</Label>
          <Input
            id="inbound-address"
            type="email"
            placeholder="abc123@inbound.postmarkapp.com"
            value={inboundAddress}
            onChange={e => setInboundAddress(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Found on the same Inbound settings page. Share this with your portfolio founders.
          </p>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : 'Next →'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Authorized senders
// ---------------------------------------------------------------------------

function Step3({ fundId, onComplete }: { fundId: string; onComplete: () => void }) {
  const [senders, setSenders] = useState<Sender[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSender() {
    if (!newEmail.trim()) return
    setSenders(prev => [...prev, { email: newEmail.trim(), label: newLabel.trim() }])
    setNewEmail('')
    setNewLabel('')
  }

  function removeSender(index: number) {
    setSenders(prev => prev.filter((_, i) => i !== index))
  }

  async function submit() {
    const valid = senders.filter(s => s.email.trim())
    if (valid.length === 0) {
      setError('Add at least one authorized sender.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, senders: valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized senders</CardTitle>
        <CardDescription>
          Only emails from these addresses will trigger report parsing. Add founders,
          CFOs, and anyone who will send portfolio reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Sender list */}
        {senders.length > 0 && (
          <div className="space-y-2">
            {senders.map((sender, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm flex items-center justify-between">
                  <span>{sender.email}</span>
                  {sender.label && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {sender.label}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSender(i)}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add sender */}
        <div className="space-y-2">
          <Label>Add sender</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="cfo@portfolio.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSender()}
              className="flex-1"
            />
            <Input
              placeholder="Label (optional)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSender()}
              className="w-36"
            />
            <Button variant="outline" size="icon" onClick={addSender} disabled={!newEmail.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Finishing setup…</>
          ) : (
            'Finish setup'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
