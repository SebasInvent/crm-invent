'use client'

import { useEffect, useRef, useState } from 'react'
import { captureForEnroll, cleanupBiometrics } from '@/lib/biometrics'
import { ScanFace, Loader2, X, CheckCircle2, RefreshCw } from 'lucide-react'

type Step = 'init' | 'ready' | 'capturing' | 'success' | 'failed'

export function FaceEnrollDialog({
  onClose,
  onEnrolled,
}: {
  onClose: () => void
  onEnrolled?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const busy = useRef(false)
  const [step, setStep] = useState<Step>('init')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('Iniciando cámara...')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setStep('ready')
        setStatus('Centra tu rostro y autoriza el tratamiento')
        await new Promise((r) => setTimeout(r, 100))
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch {
        setError('No se pudo acceder a la cámara. Revisa los permisos.')
        setStep('failed')
      }
    })()
    return () => {
      active = false
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopAll() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    cleanupBiometrics()
  }
  function close() {
    stopAll()
    onClose()
  }

  async function enroll() {
    if (busy.current || !videoRef.current || !consent) return
    busy.current = true
    setStep('capturing')
    setError('')
    setProgress(0)
    try {
      const cap = await captureForEnroll(videoRef.current, (m, p) => {
        setStatus(m)
        setProgress(p)
      })
      if (!cap.ok) {
        setError(cap.message || 'No se pudo capturar tu rostro.')
        setStep('failed')
        busy.current = false
        return
      }
      const res = await fetch('/api/biometrics/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedding512: cap.embedding512,
          embeddingQuality: cap.quality,
          livenessScore: cap.livenessScore,
          spoofScore: cap.spoofScore,
          consent: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.message || 'No se pudo registrar tu rostro.')
        setStep('failed')
        busy.current = false
        return
      }
      setStep('success')
      setStatus('Rostro registrado correctamente')
      stopAll()
      onEnrolled?.()
      setTimeout(() => onClose(), 1300)
    } catch (err) {
      setError((err as Error).message || 'Error al registrar.')
      setStep('failed')
      busy.current = false
    }
  }

  function retry() {
    busy.current = false
    setError('')
    setStep('ready')
    setStatus('Centra tu rostro y autoriza el tratamiento')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ScanFace className="h-5 w-5 text-cyan-400" />
            <span className="font-semibold">Registrar tu rostro</span>
          </div>
          <button onClick={close} className="text-zinc-500 transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-44 w-36 rounded-[50%] border-2 ${
                step === 'capturing' ? 'animate-pulse border-cyan-400' : 'border-white/40'
              }`}
            />
          </div>
          {step === 'init' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          )}
          {step === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <CheckCircle2 className="h-14 w-14 text-emerald-400" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-center text-xs text-white">
            {status}
          </div>
        </div>

        {step === 'capturing' && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="mt-3 text-center text-xs text-red-400">{error}</p>}

        {(step === 'ready' || step === 'init') && (
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-cyan-500"
            />
            <span>
              Autorizo el tratamiento de mi dato biométrico (rostro) con fines de autenticación,
              conforme a la <span className="text-zinc-300">Ley 1581 de 2012 (Habeas Data)</span>.
              Puedo revocarlo y eliminarlo cuando quiera.
            </span>
          </label>
        )}

        <div className="mt-4">
          {(step === 'ready' || step === 'init') && (
            <button
              onClick={enroll}
              disabled={!consent || step === 'init'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-100 disabled:opacity-40"
            >
              <ScanFace className="h-4 w-4" />
              Registrar mi rostro
            </button>
          )}
          {step === 'capturing' && (
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2.5 text-sm text-zinc-400"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando...
            </button>
          )}
          {step === 'failed' && (
            <button
              onClick={retry}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-100"
            >
              <RefreshCw className="h-4 w-4" />
              Intentar de nuevo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
