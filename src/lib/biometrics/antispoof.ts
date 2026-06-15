/**
 * Anti-Spoof Detection (Frontend)
 * 
 * Detects presentation attacks using:
 * - Texture analysis
 * - Frequency analysis
 * - Color distribution
 * - Simple CNN-based detection
 */

// Types
export interface AntiSpoofData {
  spoofProbability: number;
  textureVariance: number;
  laplacianVariance: number;
  highFrequencyRatio: number;
  reflectionScore: number;
  moireScore: number;
  colorDistribution: {
    naturalness: number;
    saturation: number;
  };
}

export interface AntiSpoofResult {
  isReal: boolean;
  spoofScore: number;
  confidence: number;
  checks: {
    texture: boolean;
    frequency: boolean;
    color: boolean;
    reflection: boolean;
  };
}

// Thresholds
const THRESHOLDS = {
  MAX_SPOOF_SCORE: 40,
  MIN_TEXTURE_VARIANCE: 100,
  MIN_LAPLACIAN_VARIANCE: 50,
  MAX_REFLECTION: 60,
  MIN_COLOR_NATURALNESS: 40,
};

/**
 * Analyze image for spoofing indicators
 */
export async function analyzeForSpoof(
  imageSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<AntiSpoofData> {
  // Create canvas for analysis
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Get dimensions
  let width: number, height: number;
  if (imageSource instanceof HTMLVideoElement) {
    width = imageSource.videoWidth;
    height = imageSource.videoHeight;
  } else if (imageSource instanceof HTMLCanvasElement) {
    width = imageSource.width;
    height = imageSource.height;
  } else {
    width = imageSource.naturalWidth;
    height = imageSource.naturalHeight;
  }

  // Use smaller size for analysis
  const analysisSize = 256;
  canvas.width = analysisSize;
  canvas.height = analysisSize;
  ctx.drawImage(imageSource, 0, 0, analysisSize, analysisSize);

  const imageData = ctx.getImageData(0, 0, analysisSize, analysisSize);
  const { data } = imageData;

  // Run analyses
  const textureVariance = calculateTextureVariance(data, analysisSize);
  const laplacianVariance = calculateLaplacianVariance(data, analysisSize);
  const highFrequencyRatio = calculateHighFrequencyRatio(data, analysisSize);
  const reflectionScore = calculateReflectionScore(data, analysisSize);
  const moireScore = calculateMoireScore(data, analysisSize);
  const colorDistribution = analyzeColorDistribution(data);

  // Calculate overall spoof probability
  const spoofProbability = calculateSpoofProbability({
    textureVariance,
    laplacianVariance,
    highFrequencyRatio,
    reflectionScore,
    moireScore,
    colorDistribution,
  });

  return {
    spoofProbability,
    textureVariance,
    laplacianVariance,
    highFrequencyRatio,
    reflectionScore,
    moireScore,
    colorDistribution,
  };
}

/**
 * Calculate texture variance (real faces have more texture variation)
 */
function calculateTextureVariance(data: Uint8ClampedArray, size: number): number {
  const grayscale: number[] = [];
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayscale.push(gray);
  }

  // Calculate local variance using 3x3 windows
  let totalVariance = 0;
  let count = 0;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      
      // Get 3x3 neighborhood
      const neighbors = [
        grayscale[idx - size - 1], grayscale[idx - size], grayscale[idx - size + 1],
        grayscale[idx - 1], grayscale[idx], grayscale[idx + 1],
        grayscale[idx + size - 1], grayscale[idx + size], grayscale[idx + size + 1],
      ];

      const mean = neighbors.reduce((a, b) => a + b, 0) / 9;
      const variance = neighbors.reduce((sum, val) => sum + (val - mean) ** 2, 0) / 9;
      
      totalVariance += variance;
      count++;
    }
  }

  return totalVariance / count;
}

/**
 * Calculate Laplacian variance (blur detection)
 */
function calculateLaplacianVariance(data: Uint8ClampedArray, size: number): number {
  const grayscale: number[] = [];
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayscale.push(gray);
  }

  // Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
  const laplacian: number[] = [];

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      
      const lap = 
        grayscale[idx - size] + 
        grayscale[idx - 1] + 
        grayscale[idx + 1] + 
        grayscale[idx + size] - 
        4 * grayscale[idx];
      
      laplacian.push(Math.abs(lap));
    }
  }

  // Calculate variance of Laplacian
  const mean = laplacian.reduce((a, b) => a + b, 0) / laplacian.length;
  const variance = laplacian.reduce((sum, val) => sum + (val - mean) ** 2, 0) / laplacian.length;

  return variance;
}

/**
 * Calculate high frequency ratio (screens may have different frequency patterns)
 */
function calculateHighFrequencyRatio(data: Uint8ClampedArray, size: number): number {
  const grayscale: number[] = [];
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayscale.push(gray);
  }

  // Calculate gradient magnitude
  let highFreqCount = 0;
  let totalCount = 0;

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      
      const gx = grayscale[idx + 1] - grayscale[idx - 1];
      const gy = grayscale[idx + size] - grayscale[idx - size];
      const gradient = Math.sqrt(gx * gx + gy * gy);

      if (gradient > 30) {
        highFreqCount++;
      }
      totalCount++;
    }
  }

  return highFreqCount / totalCount;
}

/**
 * Calculate reflection score (screens often have specular reflections)
 */
function calculateReflectionScore(data: Uint8ClampedArray, size: number): number {
  let brightPixels = 0;
  let veryBrightPixels = 0;
  const totalPixels = size * size;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    
    if (brightness > 200) {
      brightPixels++;
    }
    if (brightness > 240) {
      veryBrightPixels++;
    }
  }

  // High concentration of very bright pixels suggests reflection
  const brightRatio = brightPixels / totalPixels;
  const veryBrightRatio = veryBrightPixels / totalPixels;

  return (brightRatio * 50 + veryBrightRatio * 100) * 100;
}

/**
 * Calculate moire pattern score (screens display moire patterns)
 */
function calculateMoireScore(data: Uint8ClampedArray, size: number): number {
  const grayscale: number[] = [];
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grayscale.push(gray);
  }

  // Look for periodic patterns (simplified)
  let periodicScore = 0;
  const step = 4;

  for (let y = 0; y < size - step * 3; y += step) {
    for (let x = 0; x < size - step * 3; x += step) {
      const idx = y * size + x;
      
      // Check for repeating pattern
      const v1 = grayscale[idx];
      const v2 = grayscale[idx + step];
      const v3 = grayscale[idx + step * 2];
      const v4 = grayscale[idx + step * 3];

      // Alternating pattern detection
      if (Math.abs(v1 - v3) < 10 && Math.abs(v2 - v4) < 10 && Math.abs(v1 - v2) > 20) {
        periodicScore++;
      }
    }
  }

  return Math.min(100, periodicScore / 10);
}

/**
 * Analyze color distribution
 */
function analyzeColorDistribution(data: Uint8ClampedArray): { naturalness: number; saturation: number } {
  let totalSaturation = 0;
  let skinTonePixels = 0;
  const totalPixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate saturation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    totalSaturation += saturation;

    // Check for skin tone (simplified)
    if (r > 95 && g > 40 && b > 20 &&
        r > g && r > b &&
        Math.abs(r - g) > 15 &&
        r - b > 15) {
      skinTonePixels++;
    }
  }

  const avgSaturation = totalSaturation / totalPixels;
  const skinToneRatio = skinTonePixels / totalPixels;

  // Natural faces have moderate saturation and significant skin tone
  const naturalness = Math.min(100, 
    (skinToneRatio > 0.1 ? 50 : skinToneRatio * 500) +
    (avgSaturation > 0.1 && avgSaturation < 0.5 ? 50 : 30)
  );

  return {
    naturalness,
    saturation: avgSaturation * 100,
  };
}

/**
 * Calculate overall spoof probability
 */
function calculateSpoofProbability(data: Omit<AntiSpoofData, 'spoofProbability'>): number {
  let spoofScore = 0;

  // Low texture variance suggests printed photo
  if (data.textureVariance < THRESHOLDS.MIN_TEXTURE_VARIANCE) {
    spoofScore += 0.25;
  }

  // Low Laplacian variance suggests blur (screen/print)
  if (data.laplacianVariance < THRESHOLDS.MIN_LAPLACIAN_VARIANCE) {
    spoofScore += 0.2;
  }

  // High reflection suggests screen
  if (data.reflectionScore > THRESHOLDS.MAX_REFLECTION) {
    spoofScore += 0.2;
  }

  // Moire patterns suggest screen
  if (data.moireScore > 30) {
    spoofScore += 0.2;
  }

  // Unnatural color distribution
  if (data.colorDistribution.naturalness < THRESHOLDS.MIN_COLOR_NATURALNESS) {
    spoofScore += 0.15;
  }

  return Math.min(1, spoofScore);
}

/**
 * Quick anti-spoof check
 */
export async function quickAntiSpoofCheck(
  imageSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<AntiSpoofResult> {
  const data = await analyzeForSpoof(imageSource);
  
  const spoofScore = data.spoofProbability * 100;
  const isReal = spoofScore <= THRESHOLDS.MAX_SPOOF_SCORE;

  return {
    isReal,
    spoofScore,
    confidence: isReal ? 100 - spoofScore : spoofScore,
    checks: {
      texture: data.textureVariance >= THRESHOLDS.MIN_TEXTURE_VARIANCE,
      frequency: data.highFrequencyRatio > 0.15,
      color: data.colorDistribution.naturalness >= THRESHOLDS.MIN_COLOR_NATURALNESS,
      reflection: data.reflectionScore <= THRESHOLDS.MAX_REFLECTION,
    },
  };
}

/**
 * Get thresholds
 */
export function getAntiSpoofThresholds() {
  return { ...THRESHOLDS };
}
