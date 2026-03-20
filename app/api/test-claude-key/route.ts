import { NextRequest, NextResponse } from 'next/server'
import { createProviderFromKey } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const limited = await rateLimit({ key: `test-claude:${req.headers.get('x-forwarded-for') ?? 'unknown'}`, limit: 5, windowSeconds: 300 })
  if (limited) return limited

  const { apiKey } = await req.json()
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 })
  }

  try {
    const provider = createProviderFromKey(apiKey)
    await provider.testConnection()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid API key'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
