'use client'

import { useQuery } from '@tanstack/react-query'

export type WhatsAppLineId = 'tickean' | 'invent'

export type WhatsAppLine = {
  id: WhatsAppLineId
  label: string
  displayPhone: string | null
  provider: 'meta_cloud' | 'evolution'
  enabled: boolean
}

type LinesResponse = {
  defaultLineId: WhatsAppLineId
  lines: WhatsAppLine[]
}

export type WhatsAppSenderMetadata = {
  delivery_status?: string
  delivery_error?: string
  provider_message_id?: string
  sender_line_id?: WhatsAppLineId
  sender_label?: string
  sender_display_phone?: string | null
  sender_phone_number_id?: string
  sender_provider?: string
}

export function formatWhatsAppNumber(value?: string | null) {
  if (!value) return 'número no visible'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return `+${digits}`
}

export function senderLineLabel(metadata?: WhatsAppSenderMetadata | null) {
  if (!metadata?.sender_label && !metadata?.sender_display_phone) return null
  const label = metadata.sender_label || 'WhatsApp'
  return metadata.sender_display_phone
    ? `${label} · ${formatWhatsAppNumber(metadata.sender_display_phone)}`
    : label
}

export function useWhatsAppLines() {
  return useQuery<LinesResponse>({
    queryKey: ['whatsapp', 'lines'],
    queryFn: async () => {
      const response = await fetch('/api/whatsapp/lines', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
