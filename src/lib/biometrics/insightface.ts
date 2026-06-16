/**
 * InsightFace - ArcFace 512D Embeddings (Frontend)
 *
 * Ejecuta el modelo ArcFace (ONNX) en el navegador con ONNX Runtime Web.
 * Genera embeddings faciales de 512-d para comparación.
 *
 * Nota de integración (CRM Invent): ONNX Runtime Web se carga desde CDN en
 * runtime (no por `import` npm) para no romper el bundle de webpack del CRM
 * (su backend de Node rompe Terser). La lógica ArcFace es idéntica a la
 * implementación original de Medicare.
 */

// Types
export interface EmbeddingResult {
  embedding: number[]
  quality: number
  faceDetected: boolean
  processingTimeMs: number
  error?: string
}

export interface ComparisonResult {
  distance: number
  similarity: number
  isMatch: boolean
  confidence: number
}

// ─── ONNX Runtime Web desde CDN (evita empaquetar el backend node) ───────────
// 1.20.x — 1.16.x rompía en Chrome sin WebGPU con
// "JS execution provider is not supported in this build".
const ORT_VERSION = '1.20.1'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadOrt(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('ONNX Runtime solo está disponible en el navegador'))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.ort) return Promise.resolve(w.ort)
  if (ortPromise) return ortPromise

  ortPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js`
    script.async = true
    script.onload = () => {
      const ort = w.ort
      if (!ort) {
        reject(new Error('ONNX Runtime no se inicializó'))
        return
      }
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
      resolve(ort)
    }
    script.onerror = () => reject(new Error('No se pudo cargar ONNX Runtime Web'))
    document.head.appendChild(script)
  })
  return ortPromise
}

// Model state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null
let isInitializing = false

// ArcFace model configuration
// Modelo por defecto: w600k_r50.onnx (ResNet50 webface600k, 512-d) — el mismo que usa
// Medicare en producción, alojado en el R2 público de Invent. Se puede sobrescribir
// con NEXT_PUBLIC_MODELS_URL + NEXT_PUBLIC_FACE_MODEL.
const MODEL_CONFIG = {
  inputSize: 112, // ArcFace expects 112x112 input
  outputSize: 512, // 512-dimensional embedding
  modelPath: `${
    process.env.NEXT_PUBLIC_MODELS_URL ||
    'https://pub-9d169f7a228744c8b2828de2f4645bb5.r2.dev'
  }/${process.env.NEXT_PUBLIC_FACE_MODEL || 'w600k_r50.onnx'}`,
}

// Thresholds
const THRESHOLDS = {
  MATCH: 0.45,
  HIGH_CONFIDENCE: 0.35,
}

/**
 * Initialize InsightFace model
 */
export async function initInsightFace(): Promise<void> {
  if (session || isInitializing) return

  isInitializing = true
  console.log('🔄 Loading InsightFace ArcFace model...')

  try {
    const ort = await loadOrt()
    // Solo WASM por compatibilidad: WebGPU no está disponible en muchos
    // Chrome de escritorio y el fallback interno rompe con
    // "JS execution provider is not supported".
    session = await ort.InferenceSession.create(MODEL_CONFIG.modelPath, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })

    console.log('✅ InsightFace model loaded')
  } catch (error) {
    console.error('❌ Failed to load InsightFace model:', (error as Error).message)
    throw new Error('Failed to load InsightFace model')
  } finally {
    isInitializing = false
  }
}

/**
 * Extract face embedding from image
 *
 * IMPORTANTE: ArcFace fue entrenado con caras cropeadas/alineadas, NO con frames
 * enteros. Si el source es un video, detectamos la cara con Mediapipe y le pasamos
 * SOLO el crop con margen. Sin esto, los embeddings son inestables y el match
 * coseno entre enroll y verify se rompe (la causa raíz del NO_MATCH crónico).
 */
export async function extractEmbedding(
  imageSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<EmbeddingResult> {
  const startTime = performance.now()

  if (!session) {
    await initInsightFace()
  }

  if (!session) {
    return {
      embedding: [],
      quality: 0,
      faceDetected: false,
      processingTimeMs: performance.now() - startTime,
      error: 'Model not loaded',
    }
  }

  try {
    const ort = await loadOrt()

    // Si es video, cropeamos al bbox del rostro detectado por Mediapipe.
    // Esto es CRÍTICO para que enroll/verify produzcan embeddings comparables.
    let preprocessSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement =
      imageSource
    if (imageSource instanceof HTMLVideoElement) {
      const { getFaceBoundingBox } = await import('./mediapipe')
      const bbox = await getFaceBoundingBox(imageSource)
      if (!bbox) {
        return {
          embedding: [],
          quality: 0,
          faceDetected: false,
          processingTimeMs: performance.now() - startTime,
          error: 'No se detectó un rostro centrado',
        }
      }
      const cropCanvas = document.createElement('canvas')
      cropCanvas.width = Math.max(1, Math.round(bbox.w))
      cropCanvas.height = Math.max(1, Math.round(bbox.h))
      const cropCtx = cropCanvas.getContext('2d')!
      cropCtx.drawImage(
        imageSource,
        bbox.x,
        bbox.y,
        bbox.w,
        bbox.h,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height,
      )
      preprocessSource = cropCanvas
    }

    // Preprocess image (acepta video/canvas/image; ya viene cropeada si era video)
    const inputTensor = preprocessImage(ort, preprocessSource)

    // Run inference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = inputTensor

    const results = await session.run(feeds)
    const outputTensor = results[session.outputNames[0]]
    const embedding = Array.from(outputTensor.data as Float32Array)

    // Normalize embedding
    const normalizedEmbedding = normalizeEmbedding(embedding)

    // Calculate quality (based on embedding magnitude before normalization)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    const quality = Math.min(1, magnitude / 20) // Typical magnitude is around 15-25

    return {
      embedding: normalizedEmbedding,
      quality,
      faceDetected: true,
      processingTimeMs: performance.now() - startTime,
    }
  } catch (error) {
    return {
      embedding: [],
      quality: 0,
      faceDetected: false,
      processingTimeMs: performance.now() - startTime,
      error: (error as Error).message,
    }
  }
}

/**
 * Preprocess image for ArcFace model
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function preprocessImage(
  ort: any,
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
) {
  // Create canvas for preprocessing
  const canvas = document.createElement('canvas')
  canvas.width = MODEL_CONFIG.inputSize
  canvas.height = MODEL_CONFIG.inputSize
  const ctx = canvas.getContext('2d')!

  // Draw and resize image
  ctx.drawImage(source, 0, 0, MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize)

  // Get image data
  const imageData = ctx.getImageData(0, 0, MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize)
  const { data } = imageData

  // Convert to tensor format: [1, 3, 112, 112] with normalization
  const tensorData = new Float32Array(1 * 3 * MODEL_CONFIG.inputSize * MODEL_CONFIG.inputSize)

  // ArcFace normalization: (pixel - 127.5) / 128
  for (let i = 0; i < MODEL_CONFIG.inputSize * MODEL_CONFIG.inputSize; i++) {
    const r = (data[i * 4] - 127.5) / 128
    const g = (data[i * 4 + 1] - 127.5) / 128
    const b = (data[i * 4 + 2] - 127.5) / 128

    // RGB channels
    tensorData[i] = r
    tensorData[MODEL_CONFIG.inputSize * MODEL_CONFIG.inputSize + i] = g
    tensorData[2 * MODEL_CONFIG.inputSize * MODEL_CONFIG.inputSize + i] = b
  }

  return new ort.Tensor('float32', tensorData, [
    1,
    3,
    MODEL_CONFIG.inputSize,
    MODEL_CONFIG.inputSize,
  ])
}

/**
 * Normalize embedding to unit length
 */
function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  if (norm === 0) return embedding
  return embedding.map((val) => val / norm)
}

/**
 * Calculate cosine distance between embeddings
 */
export function cosineDistance(emb1: number[], emb2: number[]): number {
  if (emb1.length !== emb2.length) {
    throw new Error('Embedding dimension mismatch')
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < emb1.length; i++) {
    dotProduct += emb1[i] * emb2[i]
    norm1 += emb1[i] * emb1[i]
    norm2 += emb2[i] * emb2[i]
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  return 1 - similarity // Convert to distance
}

/**
 * Compare two embeddings
 */
export function compareEmbeddings(emb1: number[], emb2: number[]): ComparisonResult {
  const distance = cosineDistance(emb1, emb2)
  const similarity = (1 - distance / 2) * 100
  const isMatch = distance < THRESHOLDS.MATCH

  let confidence: number
  if (distance < THRESHOLDS.HIGH_CONFIDENCE) {
    confidence = 100
  } else if (distance < THRESHOLDS.MATCH) {
    confidence =
      80 + ((THRESHOLDS.MATCH - distance) / (THRESHOLDS.MATCH - THRESHOLDS.HIGH_CONFIDENCE)) * 20
  } else {
    confidence = Math.max(0, 80 - (distance - THRESHOLDS.MATCH) * 100)
  }

  return { distance, similarity, isMatch, confidence }
}

/**
 * Average multiple embeddings
 */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return []

  const dim = embeddings[0].length
  const avg = new Array(dim).fill(0)

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i]
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length
  }

  return normalizeEmbedding(avg)
}

/**
 * Calculate embedding quality from multiple captures
 */
export function calculateQuality(embeddings: number[][]): number {
  if (embeddings.length < 2) return 1

  const avg = averageEmbeddings(embeddings)
  let totalVariance = 0

  for (const emb of embeddings) {
    const dist = cosineDistance(emb, avg)
    totalVariance += dist * dist
  }

  const avgVariance = totalVariance / embeddings.length
  return Math.max(0, 1 - avgVariance * 10)
}

/**
 * Find best match among registered users
 */
export function findBestMatch(
  sourceEmbedding: number[],
  users: Array<{ id: string; name: string; embedding512: string }>,
): { user: (typeof users)[0] | null; result: ComparisonResult } {
  let bestUser: (typeof users)[0] | null = null
  let bestResult: ComparisonResult = {
    distance: Infinity,
    similarity: 0,
    isMatch: false,
    confidence: 0,
  }

  for (const user of users) {
    try {
      const targetEmbedding = JSON.parse(user.embedding512)
      const result = compareEmbeddings(sourceEmbedding, targetEmbedding)

      if (result.distance < bestResult.distance) {
        bestUser = user
        bestResult = result
      }
    } catch {
      console.warn(`Failed to parse embedding for user ${user.id}`)
    }
  }

  return { user: bestUser, result: bestResult }
}

/**
 * Cleanup
 */
export async function cleanupInsightFace(): Promise<void> {
  if (session) {
    await session.release()
    session = null
  }
}

/**
 * Check if model is loaded
 */
export function isModelLoaded(): boolean {
  return session !== null
}
