/**
 * Cliente Supabase con manejo correcto de cookies para SSR/Middleware
 * Usar este cliente (no el de supabase.ts) para operaciones de autenticación
 * en componentes client-side (login, logout).
 */
import { createBrowserClient } from '@supabase/ssr'

export function getAuthClient() {
  // .trim() es CRÍTICO aquí: este cliente crea el WebSocket de Realtime, y un
  // trailing \r\n en la env de Vercel rompe el handshake con HTTP 401.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
  )
}
