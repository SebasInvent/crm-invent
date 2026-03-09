// @ts-nocheck
// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { client_id, message, channel, timestamp } = body

    if (!client_id || !message || !channel) {
      return NextResponse.json(
        { error: 'Missing required fields: client_id, message, channel' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        client_id,
        message,
        channel,
        created_at: timestamp || new Date().toISOString(),
      } as any)
      .select()
      .single()

    if (error) {
      console.error('Error saving conversation:', error)
      return NextResponse.json(
        { error: 'Failed to save conversation' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, data },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error in OpenClaw webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
