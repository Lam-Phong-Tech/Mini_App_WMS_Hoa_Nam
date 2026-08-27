import { MOCK_SCAN_CODES } from "@/constants/scan.constants";
import {
  getCameraConstraints,
  getMainBackCameraConstraints,
  releasePrewarmedCameraStream,
} from "@/services/camera-permission.service";
import type { ScanDetectedResult } from "@/types/scan.types";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

export interface BarcodeScannerAdapter {
  attachVideoElement?(videoElement: HTMLVideoElement | null): void;
  initialize(): Promise<void>;
  start(onDetected: (result: ScanDetectedResult) => void): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  switchCamera?(): Promise<void>;
  toggleTorch?(): Promise<boolean>;
  scanImageFile?(file: File): Promise<ScanDetectedResult>;
  isSupported(): boolean;
  isContinuous(): boolean;
  getName(): string;
}

export class MockScannerAdapter implements BarcodeScannerAdapter {
  private onDetected?: (result: ScanDetectedResult) => void;
  private timer?: number;
  private codeIndex = 0;
  private paused = false;

  isSupported() {
    return true;
  }

  isContinuous() {
    return true;
  }

  getName() {
    return "MockScannerAdapter";
  }

  async initialize() {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }

  async start(onDetected: (result: ScanDetectedResult) => void) {
    this.onDetected = onDetected;
    this.paused = false;
    this.stopTimer();
    this.timer = window.setInterval(() => {
      if (this.paused) return;
      this.emit(MOCK_SCAN_CODES[this.codeIndex % MOCK_SCAN_CODES.length]);
      this.codeIndex += 1;
    }, 5200);
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
  }

  async stop() {
    this.stopTimer();
    this.onDetected = undefined;
  }

  async switchCamera() {
    return Promise.resolve();
  }

  async toggleTorch() {
    return Promise.resolve(true);
  }

  async scanImageFile(file: File) {
    return {
      code: file.name.replace(/\.[^.]+$/, "") || "VALID-001",
      format: "QR_CODE",
      detected_at: new Date().toISOString(),
    };
  }

  emit(code: string) {
    this.onDetected?.({
      code,
      format: code.startsWith("VALID") ? "QR_CODE" : "CODE_128",
      detected_at: new Date().toISOString(),
    });
  }

  private stopTimer() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

function normalizeCameraError(error: unknown) {
  const errorName = error instanceof Error ? error.name : "";
  const errorMessage = error instanceof Error ? error.message : "";
  const errorText = `${errorName} ${errorMessage}`.toUpperCase();

  if (errorText.includes("CAMERA_PREVIEW_UNAVAILABLE")) {
    return "CAMERA_PREVIEW_UNAVAILABLE";
  }

  if (errorText.includes("CAMERA_IN_USE")) {
    return "CAMERA_IN_USE";
  }

  if (
    errorName === "NotAllowedError" ||
    errorName === "PermissionDeniedError" ||
    errorName === "SecurityError" ||
    errorText.includes("NOTALLOWED") ||
    errorText.includes("PERMISSIONDENIED")
  ) {
    return "CAMERA_PERMISSION_DENIED";
  }

  if (
    errorName === "NotReadableError" ||
    errorName === "TrackStartError" ||
    errorText.includes("NOTREADABLE") ||
    errorText.includes("TRACKSTART")
  ) {
    return "CAMERA_IN_USE";
  }

  return "CAMERA_NOT_SUPPORTED";
}

function withCameraStartTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 7000,
  timeoutErrorCode = "CAMERA_PREVIEW_UNAVAILABLE",
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(timeoutErrorCode)),
      timeoutMs,
    );

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function isLiveVideoPreview(video: HTMLVideoElement) {
  const stream = video.srcObject;
  const hasLiveVideoTrack =
    stream instanceof MediaStream &&
    stream.getVideoTracks().some((track) => track.readyState === "live");

  return (
    hasLiveVideoTrack &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

/**
 * `getUserMedia` có thể thành công trong WebView nhưng preview không phát được.
 * Chỉ tiếp tục quét khi video thực sự có frame để không hiện placeholder mờ.
 */
function waitForLiveVideoPreview(video: HTMLVideoElement, timeoutMs = 5500) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let frameCallbackId: number | undefined;
    const videoWithFrameCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: unknown) => void,
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      ["loadedmetadata", "loadeddata", "canplay", "playing", "resize"].forEach(
        (eventName) => video.removeEventListener(eventName, checkPreview),
      );
      if (frameCallbackId !== undefined) {
        videoWithFrameCallback.cancelVideoFrameCallback?.(frameCallbackId);
      }
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("CAMERA_PREVIEW_UNAVAILABLE"));
    };

    const checkPreview = () => {
      if (isLiveVideoPreview(video)) succeed();
    };

    const timer = window.setTimeout(fail, timeoutMs);
    ["loadedmetadata", "loadeddata", "canplay", "playing", "resize"].forEach(
      (eventName) => video.addEventListener(eventName, checkPreview),
    );

    if (videoWithFrameCallback.requestVideoFrameCallback) {
      frameCallbackId = videoWithFrameCallback.requestVideoFrameCallback(() => {
        checkPreview();
      });
    }

    void Promise.resolve(video.play()).then(checkPreview).catch(() => undefined);
    checkPreview();
  });
}

const CAMERA_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

const IMAGE_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

const NATIVE_BARCODE_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "data_matrix",
];

let zxingWarningFilterDepth = 0;
let originalConsoleWarn: typeof console.warn | undefined;

function installZxingExpectedWarningFilter() {
  if (typeof console === "undefined") return () => undefined;

  zxingWarningFilterDepth += 1;

  if (!originalConsoleWarn) {
    originalConsoleWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (isExpectedZxingFrameWarning(args)) return;
      originalConsoleWarn?.(...args);
    };
  }

  let restored = false;

  return () => {
    if (restored) return;
    restored = true;
    zxingWarningFilterDepth = Math.max(0, zxingWarningFilterDepth - 1);

    if (zxingWarningFilterDepth === 0 && originalConsoleWarn) {
      console.warn = originalConsoleWarn;
      originalConsoleWarn = undefined;
    }
  };
}

function isExpectedZxingFrameWarning(args: unknown[]) {
  const message = args
    .map((arg) =>
      arg instanceof Error
        ? `${arg.name} ${arg.message}`
        : typeof arg === "string"
          ? arg
          : "",
    )
    .join(" ");

  return (
    message.includes("MultiFormatReader: non-ReaderException") ||
    message.includes("NotFoundException") ||
    message.includes("Could not create a Canvas element")
  );
}

function createScanHints(formats: BarcodeFormat[]) {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, formats],
    [DecodeHintType.TRY_HARDER, true],
  ]);
}

export class BrowserCameraBarcodeAdapter implements BarcodeScannerAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private cameraReader = new BrowserMultiFormatReader(
    createScanHints(CAMERA_SCAN_FORMATS),
    {
      delayBetweenScanAttempts: 90,
      delayBetweenScanSuccess: 360,
      tryPlayVideoTimeout: 2200,
    },
  );
  private imageReader = new BrowserMultiFormatReader(
    createScanHints(IMAGE_SCAN_FORMATS),
    {
      delayBetweenScanAttempts: 260,
      delayBetweenScanSuccess: 500,
      tryPlayVideoTimeout: 4500,
    },
  );
  private cropReader = new BrowserMultiFormatReader(
    createScanHints(CAMERA_SCAN_FORMATS),
    {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 360,
      tryPlayVideoTimeout: 2200,
    },
  );
  private controls?: IScannerControls;
  private onDetected?: (result: ScanDetectedResult) => void;
  private nativeDetector?: BarcodeDetector;
  private nativeLoopId?: number;
  private cropCanvas?: HTMLCanvasElement;
  private nativeLoopActive = false;
  private nativeDetecting = false;
  private activeFacingMode: "environment" | "user" = "environment";
  private cameraStream?: MediaStream;
  private paused = false;
  private torchEnabled = false;
  private restoreZxingWarningFilter?: () => void;

  attachVideoElement(videoElement: HTMLVideoElement | null) {
    this.videoElement = videoElement;
  }

  isSupported() {
    return Boolean(
      navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function" &&
        typeof HTMLVideoElement !== "undefined",
    );
  }

  isContinuous() {
    return true;
  }

  getName() {
    return "BrowserCameraBarcodeAdapter";
  }

  async initialize() {
    if (!this.videoElement) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    if (!this.isSupported()) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    await this.initializeImageReader();
    await this.initializeNativeDetector();
  }

  async start(onDetected: (result: ScanDetectedResult) => void) {
    if (!this.videoElement) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    await this.initialize();
    await this.stopControls();

    this.onDetected = onDetected;
    this.paused = false;
    this.restoreZxingWarningFilter?.();
    this.restoreZxingWarningFilter = installZxingExpectedWarningFilter();

    try {
      const callback = (
        result?: { getText(): string; getBarcodeFormat(): number },
        error?: unknown,
      ) => {
        if (error || this.paused || !result) return;

        const code = result.getText();
        if (!code) return;

        this.emitDetected(code, BarcodeFormat[result.getBarcodeFormat()]);
      };

      this.stopVideoTracks();
      this.cameraStream = await withCameraStartTimeout(
        this.requestCameraStream(),
        7500,
        "CAMERA_PREVIEW_UNAVAILABLE",
      );
      await this.attachAndVerifyCameraPreview(this.cameraStream);
      this.controls = await withCameraStartTimeout(
        this.cameraReader.decodeFromVideoElement(this.videoElement, callback),
      );
      this.startNativeDetectionLoop();
    } catch (error) {
      this.restoreZxingWarningFilter?.();
      this.restoreZxingWarningFilter = undefined;
      this.stopVideoTracks();
      throw new Error(normalizeCameraError(error));
    }
  }

  async pause() {
    this.paused = true;
    await this.stopControls();
  }

  async resume() {
    this.paused = false;
    if (this.onDetected) {
      await this.start(this.onDetected);
    }
  }

  async stop() {
    this.paused = false;
    this.onDetected = undefined;
    await this.stopControls();
    BrowserMultiFormatReader.releaseAllStreams();
    this.stopVideoTracks();
  }

  async switchCamera() {
    releasePrewarmedCameraStream();
    this.activeFacingMode =
      this.activeFacingMode === "environment" ? "user" : "environment";

    if (this.onDetected) {
      await this.start(this.onDetected);
    }
  }

  async toggleTorch() {
    if (this.controls?.switchTorch) {
      const nextTorchState = !this.torchEnabled;
      try {
        await this.controls.switchTorch(nextTorchState);
        this.torchEnabled = nextTorchState;
      } catch {
        this.torchEnabled = false;
      }
      return this.torchEnabled;
    }

    const track = this.cameraStream?.getVideoTracks()[0];
    const capabilities = (track as Omit<MediaStreamTrack, "getCapabilities"> & {
      getCapabilities?: () => { torch?: boolean };
    })?.getCapabilities?.();

    if (!track || !capabilities?.torch) {
      this.torchEnabled = false;
      return false;
    }

    const nextTorchState = !this.torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState } as MediaTrackConstraintSet],
      });
      this.torchEnabled = nextTorchState;
    } catch {
      this.torchEnabled = false;
    }

    return this.torchEnabled;
  }

  async scanImageFile(file: File) {
    await this.initializeImageReader();

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    try {
      const nativeResult = await this.scanImageWithNativeDetector(
        image,
        imageUrl,
      ).catch(() => undefined);
      if (nativeResult) return nativeResult;

      const result = await this.imageReader.decodeFromImageUrl(imageUrl);
      const code = result.getText();

      if (!code) {
        throw new Error("BARCODE_NOT_FOUND");
      }

      return {
        code,
        format: BarcodeFormat[result.getBarcodeFormat()],
        detected_at: new Date().toISOString(),
      };
    } catch {
      throw new Error("BARCODE_NOT_FOUND");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  private async initializeImageReader() {
    this.cameraReader.setHints(createScanHints(CAMERA_SCAN_FORMATS));
    this.cropReader.setHints(createScanHints(CAMERA_SCAN_FORMATS));
    this.imageReader.setHints(createScanHints(IMAGE_SCAN_FORMATS));
  }

  private async requestCameraStream() {
    const preferredConstraints =
      this.activeFacingMode === "environment"
        ? await getMainBackCameraConstraints()
        : getCameraConstraints(this.activeFacingMode);
    const softFacingConstraints: MediaStreamConstraints = {
      audio: false,
      video: { facingMode: { ideal: this.activeFacingMode } },
    };
    const fallbackConstraints: MediaStreamConstraints = {
      audio: false,
      video: true,
    };
    const candidates = [
      preferredConstraints,
      getCameraConstraints(this.activeFacingMode),
      softFacingConstraints,
      fallbackConstraints,
    ];
    let lastError: unknown;

    for (const constraints of candidates) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "";
        if (
          errorName === "NotAllowedError" ||
          errorName === "PermissionDeniedError" ||
          errorName === "SecurityError" ||
          errorName === "NotReadableError" ||
          errorName === "TrackStartError"
        ) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError || new Error("CAMERA_NOT_SUPPORTED");
  }

  private async attachAndVerifyCameraPreview(stream: MediaStream) {
    if (!this.videoElement) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    const video = this.videoElement;
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("autoplay", "true");
    video.setAttribute("muted", "true");
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.srcObject = stream;
    await waitForLiveVideoPreview(video);
  }

  private async initializeNativeDetector() {
    if (this.nativeDetector || typeof BarcodeDetector === "undefined") return;

    try {
      const supportedFormats =
        (await BarcodeDetector.getSupportedFormats?.()) || NATIVE_BARCODE_FORMATS;
      const formats = NATIVE_BARCODE_FORMATS.filter((format) =>
        supportedFormats.includes(format),
      );

      if (!formats.length) return;

      this.nativeDetector = new BarcodeDetector({ formats });
    } catch {
      this.nativeDetector = undefined;
    }
  }

  private startNativeDetectionLoop() {
    this.stopNativeDetectionLoop();

    if (!this.videoElement) return;

    this.nativeLoopActive = true;

    const scanFrame = async () => {
      if (
        !this.nativeLoopActive ||
        !this.videoElement ||
        this.paused
      ) {
        return;
      }

      const cropCanvas = this.createCenteredCropCanvas();
      if (!cropCanvas) {
        this.nativeLoopId = window.setTimeout(scanFrame, 160);
        return;
      }

      if (!this.nativeDetecting) {
        this.nativeDetecting = true;
        try {
          const [barcode] = this.nativeDetector
            ? await this.nativeDetector.detect(cropCanvas)
            : [];
          if (barcode?.rawValue && !this.paused) {
            this.emitDetected(barcode.rawValue, barcode.format);
          } else if (!this.paused) {
            this.decodeCropWithZxing(cropCanvas);
          }
        } catch {
          this.decodeCropWithZxing(cropCanvas);
        } finally {
          this.nativeDetecting = false;
        }
      }

      if (this.nativeLoopActive) {
        this.nativeLoopId = window.setTimeout(scanFrame, 160);
      }
    };

    this.nativeLoopId = window.setTimeout(scanFrame, 160);
  }

  private decodeCropWithZxing(cropCanvas: HTMLCanvasElement) {
    try {
      const result = this.cropReader.decodeFromCanvas(cropCanvas);
      const code = result.getText();
      if (!code) return;

      this.emitDetected(code, BarcodeFormat[result.getBarcodeFormat()]);
    } catch {
      // Most frames have no centered code; the next frame will be tried.
    }
  }

  private createCenteredCropCanvas() {
    const video = this.videoElement;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return undefined;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const cropSize = Math.floor(Math.min(sourceWidth, sourceHeight) * 0.82);
    const sourceX = Math.floor((sourceWidth - cropSize) / 2);
    const sourceY = Math.floor((sourceHeight - cropSize) / 2);
    const canvas = this.cropCanvas || document.createElement("canvas");
    const outputSize = Math.min(900, Math.max(360, cropSize));

    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    if (!context) return undefined;

    context.drawImage(
      video,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    this.cropCanvas = canvas;
    return canvas;
  }

  private stopNativeDetectionLoop() {
    this.nativeLoopActive = false;
    if (this.nativeLoopId) {
      window.clearTimeout(this.nativeLoopId);
      this.nativeLoopId = undefined;
    }
    this.nativeDetecting = false;
    this.restoreZxingWarningFilter?.();
    this.restoreZxingWarningFilter = undefined;
  }

  private emitDetected(code: string, format?: string) {
    if (this.paused) return;

    this.onDetected?.({
      code,
      format,
      detected_at: new Date().toISOString(),
    });
  }

  private async scanImageWithNativeDetector(
    image: HTMLImageElement,
    imageUrl: string,
  ) {
    await this.initializeNativeDetector();
    if (!this.nativeDetector) return undefined;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("BARCODE_NOT_FOUND"));
      image.src = imageUrl;
    });

    const [barcode] = await this.nativeDetector.detect(image);
    if (!barcode?.rawValue) return undefined;

    return {
      code: barcode.rawValue,
      format: barcode.format,
      detected_at: new Date().toISOString(),
    };
  }

  private async stopControls() {
    this.stopNativeDetectionLoop();

    if (!this.controls) return;

    const controls = this.controls;
    this.controls = undefined;

    try {
      await Promise.resolve(controls.stop());
    } catch {
      // Một số WebView iOS/Android ném DOMException khi thư viện tắt torch
      // trong lúc dừng stream. Nuốt lỗi này để console không báo đỏ.
    }
  }

  private stopVideoTracks() {
    const streams = new Set<MediaStream>();
    if (this.cameraStream) streams.add(this.cameraStream);

    const previewStream = this.videoElement?.srcObject;
    if (previewStream instanceof MediaStream) streams.add(previewStream);

    streams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    this.cameraStream = undefined;
    this.torchEnabled = false;

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}

export function createBarcodeScannerAdapter() {
  if (import.meta.env.VITE_SCAN_ADAPTER === "mock") {
    return new MockScannerAdapter();
  }

  return new BrowserCameraBarcodeAdapter();
}
