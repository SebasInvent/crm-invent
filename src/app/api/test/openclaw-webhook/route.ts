// @ts-nocheck
import { NextResponse } from 'next/server'

// POST /api/test/openclaw-webhook - Simular webhook de OpenClaw
export async function POST(request: Request) {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'
    
    // Simular payload de OpenClaw
    const testPayload = {
      event: 'conversation.message',
      session_id: `test_session_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        client: {
          name: 'Juan Pérez Test',
          email: `juan.perez.${Date.now()}@test.com`,
          phone: '+57 300 123 4567',
          company: 'Empresa Test S.A.S.'
        },
        message: {
          id: `msg_${Date.now()}`,
          content: 'Hola, estoy interesado en cotizar una página web para mi empresa. Necesito algo moderno y profesional.',
          sender: 'client',
          timestamp: new Date().toISOString()
        },
        agent: {
          id: 'agent_001',
          name: 'AI Assistant'
        },
        metadata: {
          source: 'webchat',
          test: true
        }
      }
    }
    
    console.log('[Test] Enviando payload a webhook:', testPayload)
    
    // Llamar al webhook de OpenClaw
    const webhookUrl = `${baseUrl}/api/webhook/openclaw`
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Si SYNC_SECRET está configurado, descomenta la siguiente línea:
        // 'Authorization': `Bearer ${process.env.SYNC_SECRET || ''}`
      },
      body: JSON.stringify(testPayload)
    })
    
    const result = await response.json()
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      webhook_url: webhookUrl,
      sent_payload: testPayload,
      webhook_response: result
    })
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

// GET /api/test/openclaw-webhook - Verificar configuración
export async function GET(request: Request) {
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000'
    
  return NextResponse.json({
    status: 'OK',
    message: 'Endpoint para probar webhook de OpenClaw',
    instructions: {
      step_1: 'Configura esta URL en OpenClaw:',
      webhook_url: `${baseUrl}/api/webhook/openclaw`,
      step_2: 'Si tienes SYNC_SECRET configurado, asegúrate de enviarlo en el header Authorization: Bearer TOKEN',
      step_3: 'Para probar, haz POST a este endpoint y simulará una llamada de OpenClaw'
    },
    environment: {
      vercel_url: process.env.VERCEL_URL,
      has_sync_secret: !!process.env.SYNC_SECRET,
      base_url: baseUrl
    }
  })
}
