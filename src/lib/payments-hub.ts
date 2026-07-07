import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Cliente del payments-hub (payments.pitchbull.co).
 *
 * invent-crm NUNCA habla con Wompi directo: le pide el checkout al hub, que
 * es el dueño único de la cuenta Wompi y concentra el endurecimiento (firma
 * constant-time, re-consulta autoritativa, idempotencia). El hub nos devuelve
 * un `checkout_url` y, cuando el lead paga, nos hace un callback firmado.
 *
 * Env (Vercel):
 *   PAYMENTS_HUB_URL        — base del hub, ej. https://payments.pitchbull.co
 *   CHECKOUT_SERVICE_TOKEN  — token service-to-service para /v1/checkout
 *   WOMPI_CALLBACK_SECRET   — HMAC compartido; = platforms.callback_secret (code INV) en el hub
 */

const HUB_URL = process.env.PAYMENTS_HUB_URL ?? ''
const SERVICE_TOKEN = process.env.CHECKOUT_SERVICE_TOKEN ?? ''
const CALLBACK_SECRET = process.env.WOMPI_CALLBACK_SECRET ?? ''

/** Prefijo de referencia / code de la plataforma invent-crm en el hub. */
export const PLATFORM_CODE = 'INV'

export type HubCheckout = { intent_id: string; reference: string; checkout_url: string }

/** Pide un checkout al hub. `amountCents` = COP en centavos, entero (convención Wompi). */
export async function createHubCheckout(input: {
  amountCents: number
  currency?: string
  orderId?: string
  redirectUrl?: string
  metadata?: Record<string, unknown>
}): Promise<HubCheckout> {
  if (!HUB_URL || !SERVICE_TOKEN) {
    throw new Error('PAYMENTS_HUB_URL / CHECKOUT_SERVICE_TOKEN no configurados')
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('amountCents debe ser un entero > 0 (centavos COP)')
  }

  const res = await fetch(`${HUB_URL.replace(/\/$/, '')}/v1/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      platform: PLATFORM_CODE,
      amount_cents: input.amountCents,
      currency: input.currency ?? 'COP',
      order_id: input.orderId,
      redirect_url: input.redirectUrl,
      metadata: input.metadata ?? {},
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`hub /v1/checkout ${res.status}: ${detail.slice(0, 200)}`)
  }
  return (await res.json()) as HubCheckout
}

/**
 * Verifica la firma del callback del hub.
 * Header: `x-pitchbull-signature: sha256=<hmacSHA256(rawBody, callback_secret)>`.
 * Comparación constant-time (espeja `hmac`/`hmacEqual` del hub).
 */
export function verifyHubSignature(rawBody: string, header: string | null): boolean {
  if (!CALLBACK_SECRET || !header) return false
  const expected = createHmac('sha256', CALLBACK_SECRET).update(rawBody).digest('hex')
  const got = header.replace(/^sha256=/i, '')
  const a = Buffer.from(expected)
  const b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** COP con 0 decimales (los pesos no usan centavos de uso corriente). */
export function formatCOP(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}
