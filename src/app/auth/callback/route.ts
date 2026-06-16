import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /auth/callback — intercambia el `code` del OAuth (Google) por la sesión Supabase
 * y redirige a la ruta de destino.
 *
 * IMPORTANTE: las cookies de sesión hay que escribirlas en el `NextResponse`
 * que devolvemos (no en `cookies()`/cookieStore), porque al hacer redirect
 * el cookieStore del request no se propaga al cliente. Patrón oficial del
 * Supabase SSR para route handlers.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Creamos el response primero para que el cliente Supabase escriba las
  // cookies de sesión directamente en él.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options })
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=oauth_failed&reason=${encodeURIComponent(error.message)}`,
    )
  }

  return response
}
