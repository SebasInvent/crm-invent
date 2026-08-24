import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import {
  getDefaultWhatsAppLineId,
  getWhatsAppLines,
  toPublicWhatsAppLine,
} from '@/lib/whatsapp-lines.server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  return NextResponse.json({
    defaultLineId: getDefaultWhatsAppLineId(),
    lines: getWhatsAppLines().map(toPublicWhatsAppLine),
  })
}
