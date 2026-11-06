/** Lazy fallback decoder; never reopens or replaces the real MediaStream. */
export const loadCameraDecoder = () => import('@zxing/browser');
