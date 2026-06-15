/**
 * Orquestación cliente del login/enrolamiento facial.
 * Motor InsightFace V2 (portado de Medicare): corre 100% en el navegador —
 * liveness (Mediapipe FaceMesh) + anti-spoof + embedding ArcFace 512-d (ONNX Runtime Web).
 * La COMPARACIÓN ocurre en el servidor (los embeddings no se exponen al cliente).
 */
import {
  initInsightFace,
  extractEmbedding,
  averageEmbeddings,
  calculateQuality,
  cleanupInsightFace,
} from './insightface'
import { initMediapipe, getQuickLivenessScore, cleanupMediapipe } from './mediapipe'
import { analyzeForSpoof } from './antispoof'

const CONFIG = { MIN_LIVENESS: 60, MAX_SPOOF: 40 }

let inited = false

export type Progress = (message: string, progress: number) => void

export async function initBiometrics(onProgress?: Progress): Promise<void> {
  if (inited) return
  onProgress?.('Cargando detección de vida...', 25)
  await initMediapipe()
  onProgress?.('Cargando InsightFace...', 65)
  await initInsightFace()
  inited = true
  onProgress?.('Modelos listos', 100)
}

export function cleanupBiometrics(): void {
  cleanupMediapipe()
  void cleanupInsightFace()
  inited = false
}

function captureImage(video: HTMLVideoElement, maxSize = 480): string {
  const canvas = document.createElement('canvas')
  const vw = video.videoWidth || 640
  const vh = video.videoHeight || 480
  const scale = Math.min(maxSize / vw, maxSize / vh, 1)
  canvas.width = Math.round(vw * scale)
  canvas.height = Math.round(vh * scale)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export interface FaceCapture {
  ok: boolean
  reason?: 'liveness' | 'spoof' | 'noface' | 'capture'
  message?: string
  embedding512?: string
  quality?: number
  livenessScore: number
  spoofScore: number
  imageBase64?: string
}

/** Login: una captura validada (liveness + anti-spoof + embedding ArcFace). */
export async function captureForLogin(
  video: HTMLVideoElement,
  onProgress?: Progress,
): Promise<FaceCapture> {
  await initBiometrics(onProgress)

  onProgress?.('Verificando prueba de vida...', 35)
  const { score: livenessScore } = await getQuickLivenessScore(video, 1500)
  if (livenessScore < CONFIG.MIN_LIVENESS) {
    return {
      ok: false,
      reason: 'liveness',
      livenessScore,
      spoofScore: 0,
      message: 'No se detectó suficiente prueba de vida. Mejora la luz y mira a la cámara.',
    }
  }

  onProgress?.('Anti-suplantación...', 55)
  const anti = await analyzeForSpoof(video)
  const spoofScore = anti.spoofProbability * 100
  if (spoofScore > CONFIG.MAX_SPOOF) {
    return {
      ok: false,
      reason: 'spoof',
      livenessScore,
      spoofScore,
      message: 'Posible suplantación detectada. Usa tu rostro real.',
    }
  }

  onProgress?.('Extrayendo rostro...', 75)
  const emb = await extractEmbedding(video)
  if (!emb.faceDetected || emb.embedding.length === 0) {
    return {
      ok: false,
      reason: 'noface',
      livenessScore,
      spoofScore,
      message: emb.error || 'No se detectó un rostro. Acércate y centra tu cara.',
    }
  }

  onProgress?.('Verificando identidad...', 90)
  return {
    ok: true,
    embedding512: JSON.stringify(emb.embedding),
    livenessScore,
    spoofScore,
    imageBase64: captureImage(video),
  }
}

/** Enrolamiento: 3 capturas promediadas + calidad por varianza. */
export async function captureForEnroll(
  video: HTMLVideoElement,
  onProgress?: Progress,
): Promise<FaceCapture> {
  await initBiometrics(onProgress)

  const embeddings: number[][] = []
  let lastImage = ''
  for (let i = 0; i < 3; i++) {
    onProgress?.(`Capturando ${i + 1}/3...`, 20 + i * 20)
    if (i > 0) await new Promise((r) => setTimeout(r, 500))
    const e = await extractEmbedding(video)
    if (e.faceDetected && e.embedding.length > 0) {
      embeddings.push(e.embedding)
      lastImage = captureImage(video)
    }
  }
  if (embeddings.length < 3) {
    return {
      ok: false,
      reason: 'capture',
      livenessScore: 0,
      spoofScore: 0,
      message: 'No se pudo capturar bien tu rostro. Mejora la luz e intenta de nuevo.',
    }
  }

  const avg = averageEmbeddings(embeddings)
  const quality = calculateQuality(embeddings)

  onProgress?.('Verificando prueba de vida...', 80)
  const { score: livenessScore } = await getQuickLivenessScore(video, 1000)
  if (livenessScore < CONFIG.MIN_LIVENESS) {
    return {
      ok: false,
      reason: 'liveness',
      livenessScore,
      spoofScore: 0,
      message: 'No se detectó prueba de vida. Mejora la luz y mira a la cámara.',
    }
  }

  const anti = await analyzeForSpoof(video)
  const spoofScore = anti.spoofProbability * 100
  if (spoofScore > CONFIG.MAX_SPOOF) {
    return {
      ok: false,
      reason: 'spoof',
      livenessScore,
      spoofScore,
      message: 'Posible suplantación detectada. Usa tu rostro real.',
    }
  }

  return {
    ok: true,
    embedding512: JSON.stringify(avg),
    quality,
    livenessScore,
    spoofScore,
    imageBase64: lastImage,
  }
}
