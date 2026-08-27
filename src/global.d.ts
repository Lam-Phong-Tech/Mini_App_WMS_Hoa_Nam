interface Window {
  APP_ID?: string;
  BASE_PATH?: string;
  APP_CONFIG: any;
}

interface DetectedBarcode {
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: Array<{ x: number; y: number }>;
  format: string;
  rawValue: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(
    image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<DetectedBarcode[]>;
  static getSupportedFormats?(): Promise<string[]>;
}
