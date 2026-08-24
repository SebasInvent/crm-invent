export type WhatsAppLineId = 'tickean' | 'invent'

export type WhatsAppProvider = 'meta_cloud' | 'evolution'

export type PublicWhatsAppLine = {
  id: WhatsAppLineId
  label: string
  displayPhone: string | null
  provider: WhatsAppProvider
  enabled: boolean
}

type WhatsAppLine = PublicWhatsAppLine & {
  phoneNumberId?: string
  accessToken?: string
  evolutionUrl?: string
  evolutionKey?: string
  evolutionInstance?: string
}

const digitsOnly = (value: string | undefined) =>
  value ? value.replace(/\D/g, '') : null

export function getWhatsAppLines(): WhatsAppLine[] {
  const tickeanPhoneNumberId =
    process.env.TICKEAN_META_PHONE_NUMBER_ID ||
    process.env.TICKEAN_BOT_PHONE_NUMBER_ID
  const tickeanAccessToken = process.env.TICKEAN_META_ACCESS_TOKEN
  const evolutionKey = process.env.EVOLUTION_API_KEY

  return [
    {
      id: 'tickean',
      label: 'Tickean',
      displayPhone:
        digitsOnly(process.env.TICKEAN_META_DISPLAY_PHONE) || '573222665804',
      provider: 'meta_cloud',
      enabled: Boolean(tickeanPhoneNumberId && tickeanAccessToken),
      phoneNumberId: tickeanPhoneNumberId,
      accessToken: tickeanAccessToken,
    },
    {
      id: 'invent',
      label: 'Invent',
      displayPhone: digitsOnly(process.env.EVOLUTION_DISPLAY_PHONE),
      provider: 'evolution',
      enabled: Boolean(evolutionKey),
      evolutionUrl:
        process.env.EVOLUTION_API_URL || 'https://ievoapi.inventagency.co',
      evolutionKey,
      evolutionInstance: process.env.EVOLUTION_INSTANCE || 'Invent',
    },
  ]
}

export function getDefaultWhatsAppLineId(): WhatsAppLineId {
  const configured = process.env.WHATSAPP_DEFAULT_LINE_ID
  if (configured === 'tickean' || configured === 'invent') return configured

  const lines = getWhatsAppLines()
  return lines.find((line) => line.enabled)?.id || 'invent'
}

export function getWhatsAppLine(lineId?: string | null): WhatsAppLine {
  const id =
    lineId === 'tickean' || lineId === 'invent'
      ? lineId
      : getDefaultWhatsAppLineId()
  const line = getWhatsAppLines().find((candidate) => candidate.id === id)

  if (!line || !line.enabled) {
    throw new Error(`La línea de WhatsApp ${id} no está configurada`)
  }

  return line
}

export function toPublicWhatsAppLine(line: WhatsAppLine): PublicWhatsAppLine {
  return {
    id: line.id,
    label: line.label,
    displayPhone: line.displayPhone,
    provider: line.provider,
    enabled: line.enabled,
  }
}

export function lineMetadata(line: WhatsAppLine) {
  return {
    sender_line_id: line.id,
    sender_label: line.label,
    sender_display_phone: line.displayPhone,
    sender_provider: line.provider,
    ...(line.phoneNumberId
      ? { sender_phone_number_id: line.phoneNumberId }
      : {}),
  }
}

export async function sendWhatsAppText(params: {
  line: WhatsAppLine
  phone: string
  text: string
}) {
  const { line, phone, text } = params

  if (line.provider === 'meta_cloud') {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(line.phoneNumberId!)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${line.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const raw = await response.text()
    let payload: Record<string, any> = {}
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      payload = { raw }
    }
    if (!response.ok) {
      const reason =
        payload?.error?.error_user_msg ||
        payload?.error?.message ||
        `Meta respondió HTTP ${response.status}`
      throw new Error(reason)
    }
    return {
      providerMessageId: payload?.messages?.[0]?.id as string | undefined,
      providerStatus:
        (payload?.messages?.[0]?.message_status as string | undefined) ||
        'accepted',
    }
  }

  const response = await fetch(
    `${line.evolutionUrl}/message/sendText/${encodeURIComponent(line.evolutionInstance!)}`,
    {
      method: 'POST',
      headers: {
        apikey: line.evolutionKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: phone, text }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  const raw = await response.text()
  let payload: Record<string, any> = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = { raw }
  }
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Evolution respondió HTTP ${response.status}`,
    )
  }
  return {
    providerMessageId:
      payload?.key?.id || payload?.messageId || payload?.id || undefined,
    providerStatus: 'accepted',
  }
}
