/**
 * Cliente Supabase con manejo correcto de cookies para SSR/Middleware
 * Usar este cliente (no el de supabase.ts) para operaciones de autenticación
 * en componentes client-side (login, logout).
 */
import { createBrowserClient } from '@supabase/ssr'

export function getAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
