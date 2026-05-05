import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'

/**
 * POST /api/aria/chat
 *
 * Proxies a chat turn to Aria, which lives as a workflow in n8n with
 * the Obsidian brain tools (consultar_cerebro, escribir_en_cerebro,
 * leer_nota_cerebro). The CRM widget never talks to n8n directly so
 * the webhook URL stays server-side and we can attach the user's id
 * for audit/personalization.
 *
 * Required env vars:
 *   ARIA_WEBHOOK_URL    — n8n webhook URL for Aria (must be set in Vercel)
 *   ARIA_WEBHOOK_TOKEN  — optional shared secret if the webhook requires it
 */

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8_000),
})

const bodySchema = z.object({
  message: z.string().min(1).max(4_000),
  history: z.array(messageSchema).max(20).optional(),
})

export async function POST(request: Request) {
  // 1. Rate-limit per IP — 30 messages per minute is plenty for one human
  const block = rateLimitOrBlock(request, {
    window: '1m',
    max: 30,
    key: 'aria-chat',
  })
  if (block) return block

  // 2. Auth — only logged-in users can talk to Aria
  const auth = await requireAuth()
  if (auth.error) return auth.error

  // 3. Parse + validate body
  let parsed
  try {
    const json = await request.json()
    parsed = bodySchema.parse(json)
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  // 4. Check env vars
  const webhookUrl = process.env.ARIA_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('ARIA_WEBHOOK_URL not set')
    return NextResponse.json(
      {
        error: 'Aria no está configurada todavía',
        hint: 'El admin debe configurar ARIA_WEBHOOK_URL en las variables de entorno.',
      },
      { status: 503 },
    )
  }

  // 5. Forward to n8n with a 30s timeout (n8n + LLM round-trips can be slow,
  //    and we'd rather fail fast than keep the user waiting indefinitely)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (process.env.ARIA_WEBHOOK_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.ARIA_WEBHOOK_TOKEN}`
    }

    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        message: parsed.message,
        history: parsed.history ?? [],
        user: {
          id: auth.user.id,
          email: auth.user.email,
        },
        // Helpful context for n8n routing
        source: 'crm-aria-widget',
        timestamp: new Date().toISOString(),
      }),
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      console.error('Aria webhook failed:', upstream.status, text)
      return NextResponse.json(
        {
          error: `Aria webhook respondió ${upstream.status}`,
          details: text.slice(0, 500),
        },
        { status: 502 },
      )
    }

    // n8n typically replies with JSON, but some Aria flows may return raw
    // text. Handle both gracefully.
    const contentType = upstream.headers.get('content-type') || ''
    let reply: string
    if (contentType.includes('application/json')) {
      const data = (await upstream.json()) as
        | { reply?: string; output?: string; text?: string; message?: string; response?: string }
        | string
      if (typeof data === 'string') {
        reply = data
      } else {
        // Try common n8n output keys in priority order
        reply =
          data.reply ??
          data.output ??
          data.text ??
          data.message ??
          data.response ??
          ''
        if (!reply) {
          // Fallback: stringify whatever came back so we at least show something
          reply = JSON.stringify(data)
        }
      }
    } else {
      reply = await upstream.text()
    }

    return NextResponse.json({ reply: reply.trim() || '(sin respuesta)' })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Aria tardó demasiado en responder', hint: 'Reintenta en unos segundos.' },
        { status: 504 },
      )
    }
    console.error('Aria proxy error:', err)
    return NextResponse.json(
      { error: 'No pude contactar a Aria', details: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
