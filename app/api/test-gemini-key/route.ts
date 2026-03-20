import { NextRequest, NextResponse } from 'next/server'
import { createProviderFromKey } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const limited = await rateLimit({ key: `test-gemini:${req.headers.get('x-forwarded-for') ?? 'unknown'}`, limit: 5, windowSeconds: 300 })
  if (limited) return limited

  const { apiKey } = await req.json()
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 })
  }

  try {
    const provider = createProviderFromKey(apiKey, 'gemini')
    await provider.testConnection()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const lower = raw.toLowerCase()

    let error: string
    if (lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
      error = 'API key is invalid. Check that the key is correct and active in Google AI Studio.'
    } else if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('429')) {
      error = 'API key is valid, but quota exceeded. Check your billing and plan at ai.google.dev.'
    } else if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('403')) {
      error = 'API key is valid, but lacks permission. Ensure the Generative Language API is enabled in your Google Cloud project.'
    } else if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('unauthenticated')) {
      error = 'API key is not authorized for the Generative Language API. Go to Google Cloud Console → APIs & Services → enable "Generative Language API" for your project, then try again.'
    } else {
      error = raw
    }

    const status = lower.includes('quota') || lower.includes('resource_exhausted') ? 429 : 400
    return NextResponse.json({ error }, { status })
  }
}
