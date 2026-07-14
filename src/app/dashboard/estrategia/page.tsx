'use client'

/**
 * Estrategia de Marketing — módulo del CRM.
 *
 * Embebe el portal de estrategia del mes (producido por la fábrica Dits):
 * grid del perfil, calendario clickeable por día y la narrativa/funnel detrás.
 * El portal es un artefacto self-contained servido desde /estrategia-portal.html
 * (se regenera cuando cambia el calendario de contenido). Se muestra en un panel
 * a pantalla casi completa, dentro del shell auth-gated del dashboard.
 */
export default function EstrategiaMarketingPage() {
  return (
    <div className="h-[calc(100dvh-5rem)] w-full">
      <iframe
        src="/estrategia-portal.html"
        title="Estrategia de Marketing · Invent"
        className="h-full w-full rounded-xl border border-white/10 bg-black"
      />
    </div>
  )
}
