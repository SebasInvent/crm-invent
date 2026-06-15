/**
 * Mediapipe FaceMesh - Liveness Detection
 * 
 * Uses facial landmarks (468 points) to detect:
 * - Blink detection
 * - Head pose estimation
 * - Movement detection
 * - Depth cues
 */

import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// Types
export interface LivenessData {
  blinkDetected: boolean;
  blinkCount: number;
  eyeAspectRatio: number;
  headPose: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  movementDetected: boolean;
  movementScore: number;
  landmarksDetected: number;
  meshQuality: number;
  depthScore: number;
  textureScore: number;
}

export interface LivenessChallenge {
  type: 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'NOD' | 'SMILE';
  completed: boolean;
  progress: number;
}

// Landmark indices for eye detection
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];

// Landmark indices for head pose
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
const LEFT_MOUTH = 61;
const RIGHT_MOUTH = 291;

let faceLandmarker: FaceLandmarker | null = null;
let lastLandmarks: any[] = [];
let blinkHistory: boolean[] = [];
let poseHistory: { yaw: number; pitch: number; roll: number }[] = [];

/**
 * Initialize Mediapipe FaceMesh
 */
export async function initMediapipe(): Promise<void> {
  if (faceLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  console.log('✅ Mediapipe FaceMesh initialized');
}

/**
 * Detect face and extract liveness data
 */
export async function detectLiveness(
  video: HTMLVideoElement,
  timestamp: number
): Promise<LivenessData | null> {
  if (!faceLandmarker) {
    await initMediapipe();
  }

  if (!faceLandmarker) return null;

  const results = faceLandmarker.detectForVideo(video, timestamp);

  if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = results.faceLandmarks[0];
  const blendshapes = results.faceBlendshapes?.[0]?.categories || [];
  const matrix = results.facialTransformationMatrixes?.[0];

  // Calculate Eye Aspect Ratio for blink detection
  const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
  const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
  const avgEAR = (leftEAR + rightEAR) / 2;

  // Detect blink
  const isBlinking = avgEAR < 0.2;
  blinkHistory.push(isBlinking);
  if (blinkHistory.length > 30) blinkHistory.shift();

  // Count blinks (transitions from open to closed)
  let blinkCount = 0;
  for (let i = 1; i < blinkHistory.length; i++) {
    if (!blinkHistory[i - 1] && blinkHistory[i]) {
      blinkCount++;
    }
  }

  // Calculate head pose
  const headPose = calculateHeadPose(landmarks, matrix);
  poseHistory.push(headPose);
  if (poseHistory.length > 30) poseHistory.shift();

  // Detect movement
  const movementScore = calculateMovementScore(poseHistory);
  const movementDetected = movementScore > 20;

  // Calculate depth score from landmarks
  const depthScore = calculateDepthScore(landmarks);

  // Calculate texture score (simplified)
  const textureScore = calculateTextureScore(blendshapes);

  // Store landmarks for comparison
  lastLandmarks = landmarks;

  return {
    blinkDetected: blinkCount > 0,
    blinkCount,
    eyeAspectRatio: avgEAR,
    headPose,
    movementDetected,
    movementScore,
    landmarksDetected: landmarks.length,
    meshQuality: (landmarks.length / 478) * 100,
    depthScore,
    textureScore,
  };
}

/**
 * Calculate Eye Aspect Ratio
 */
function calculateEAR(landmarks: any[], indices: number[]): number {
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  // Vertical distances
  const v1 = Math.sqrt(
    Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2)
  );
  const v2 = Math.sqrt(
    Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2)
  );

  // Horizontal distance
  const h = Math.sqrt(
    Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2)
  );

  return (v1 + v2) / (2 * h);
}

/**
 * Calculate head pose from landmarks
 */
function calculateHeadPose(
  landmarks: any[],
  matrix?: any
): { yaw: number; pitch: number; roll: number } {
  if (matrix && matrix.data) {
    // Use transformation matrix if available
    const m = matrix.data;
    const yaw = Math.atan2(m[8], m[0]) * (180 / Math.PI);
    const pitch = Math.asin(-m[4]) * (180 / Math.PI);
    const roll = Math.atan2(m[5], m[6]) * (180 / Math.PI);
    return { yaw, pitch, roll };
  }

  // Fallback: estimate from landmarks
  const nose = landmarks[NOSE_TIP];
  const leftEye = landmarks[LEFT_EYE_OUTER];
  const rightEye = landmarks[RIGHT_EYE_OUTER];

  // Yaw: horizontal rotation
  const eyeCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };
  const yaw = (nose.x - eyeCenter.x) * 100;

  // Pitch: vertical rotation
  const pitch = (nose.y - eyeCenter.y) * 100;

  // Roll: tilt
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return { yaw, pitch, roll };
}

/**
 * Calculate movement score from pose history
 */
function calculateMovementScore(history: { yaw: number; pitch: number; roll: number }[]): number {
  if (history.length < 2) return 0;

  let totalMovement = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    totalMovement += Math.abs(curr.yaw - prev.yaw);
    totalMovement += Math.abs(curr.pitch - prev.pitch);
    totalMovement += Math.abs(curr.roll - prev.roll);
  }

  return Math.min(100, totalMovement / history.length * 5);
}

/**
 * Calculate depth score from landmarks
 */
function calculateDepthScore(landmarks: any[]): number {
  // Use z-coordinates to estimate depth variation
  const zValues = landmarks.map(l => l.z || 0);
  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  const zRange = maxZ - minZ;

  // Real faces have more depth variation than flat images
  // Typical range for real face: 0.05-0.15
  if (zRange > 0.05) {
    return Math.min(100, zRange * 1000);
  }
  return zRange * 500;
}

/**
 * Calculate texture score from blendshapes
 */
function calculateTextureScore(blendshapes: any[]): number {
  // Use blendshape activations as proxy for natural expressions
  if (blendshapes.length === 0) return 50;

  let totalActivation = 0;
  for (const shape of blendshapes) {
    totalActivation += shape.score || 0;
  }

  // Natural faces have varied blendshape activations
  const avgActivation = totalActivation / blendshapes.length;
  return Math.min(100, avgActivation * 200 + 50);
}

/**
 * Run liveness challenge
 */
export async function runLivenessChallenge(
  video: HTMLVideoElement,
  challenge: LivenessChallenge['type'],
  onProgress: (progress: number) => void,
  timeoutMs: number = 5000
): Promise<boolean> {
  const startTime = Date.now();
  let completed = false;

  // Reset history
  blinkHistory = [];
  poseHistory = [];

  while (Date.now() - startTime < timeoutMs && !completed) {
    const timestamp = performance.now();
    const data = await detectLiveness(video, timestamp);

    if (!data) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    switch (challenge) {
      case 'BLINK':
        if (data.blinkCount >= 2) {
          completed = true;
        }
        onProgress(Math.min(100, data.blinkCount * 50));
        break;

      case 'TURN_LEFT':
        if (data.headPose.yaw < -15) {
          completed = true;
        }
        onProgress(Math.min(100, Math.abs(data.headPose.yaw) * 6.67));
        break;

      case 'TURN_RIGHT':
        if (data.headPose.yaw > 15) {
          completed = true;
        }
        onProgress(Math.min(100, data.headPose.yaw * 6.67));
        break;

      case 'NOD':
        if (Math.abs(data.headPose.pitch) > 10) {
          completed = true;
        }
        onProgress(Math.min(100, Math.abs(data.headPose.pitch) * 10));
        break;

      case 'SMILE':
        // Would need blendshape for smile detection
        completed = data.textureScore > 70;
        onProgress(data.textureScore);
        break;
    }

    await new Promise(r => setTimeout(r, 50));
  }

  return completed;
}

/**
 * Get quick liveness score
 */
export async function getQuickLivenessScore(
  video: HTMLVideoElement,
  durationMs: number = 1500
): Promise<{ score: number; data: LivenessData | null }> {
  const startTime = Date.now();
  let bestData: LivenessData | null = null;
  let totalScore = 0;
  let samples = 0;

  // Reset history
  blinkHistory = [];
  poseHistory = [];

  while (Date.now() - startTime < durationMs) {
    const timestamp = performance.now();
    const data = await detectLiveness(video, timestamp);

    if (data) {
      bestData = data;
      
      // Calculate score
      let score = 50; // Base score
      if (data.blinkDetected) score += 20;
      if (data.movementDetected) score += 15;
      if (data.depthScore > 50) score += 10;
      if (data.meshQuality > 90) score += 5;
      
      totalScore += Math.min(100, score);
      samples++;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  const avgScore = samples > 0 ? totalScore / samples : 0;
  return { score: avgScore, data: bestData };
}

/**
 * Cleanup
 */
export function cleanupMediapipe(): void {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
  blinkHistory = [];
  poseHistory = [];
  lastLandmarks = [];
}
