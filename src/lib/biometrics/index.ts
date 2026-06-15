/**
 * Login facial — motor InsightFace V2 (portado de Medicare) para CRM Invent.
 * Reconocimiento en navegador (ArcFace ONNX + Mediapipe + anti-spoof); match en servidor.
 */
export {
  initBiometrics,
  cleanupBiometrics,
  captureForLogin,
  captureForEnroll,
  type FaceCapture,
  type Progress,
} from './flow'
