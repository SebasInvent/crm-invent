'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { Eye, EyeOff, Loader2, Lock, ScanFace } from 'lucide-react'
import { FaceLoginDialog } from '@/components/biometric/FaceLoginDialog'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFace, setShowFace] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getAuthClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Credenciales incorrectas. Intenta de nuevo.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img
            src="https://www.inventagency.co/logo-white.png"
            alt="Invent Agency"
            className="h-9 w-auto"
            onError={(e) => {
              // Fallback si no carga la imagen
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>

        {/* Card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

          {/* Header */}
          <div className="mb-7 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 mb-4">
              <Lock className="h-4 w-4 text-zinc-400" />
            </div>
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Acceso Privado
            </h1>
            <p className="text-zinc-500 text-sm mt-1">Invent Agency CRM</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@inventagency.co"
                required
                autoComplete="email"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-lg px-3.5 py-2.5">
                <p className="text-red-400 text-xs text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-white text-black font-semibold text-sm rounded-lg py-2.5 hover:bg-zinc-100 active:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar al CRM'
              )}
            </button>
          </form>

          {/* Login facial */}
          <div className="mt-6 pt-5 border-t border-zinc-900">
            <button
              type="button"
              onClick={() => setShowFace(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:text-white"
            >
              <ScanFace className="h-4 w-4 text-cyan-400" />
              Entrar con rostro
            </button>
          </div>

        </div>

        <p className="text-center text-zinc-800 text-xs mt-6">
          © {new Date().getFullYear()} Invent Agency · Acceso restringido
        </p>
      </div>

      {showFace && <FaceLoginDialog onClose={() => setShowFace(false)} />}
    </div>
  )
}
