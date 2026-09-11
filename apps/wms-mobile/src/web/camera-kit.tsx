import React, { useEffect, useRef } from 'react';

export const CameraType = { Back: 'back', Front: 'front' } as const;

interface CameraProps {
  readonly style?: unknown;
  readonly onReadCode?: (event: {
    nativeEvent: {
      codeStringValue: string;
      codeFormat: string;
      /** Giữ tương thích interface camera-kit native. */
      previewUri?: string;
    };
  }) => void;
  readonly onError?: (event: { nativeEvent: { errorMessage: string } }) => void;
  readonly [prop: string]: unknown;
}

interface DetectedBarcode {
  readonly rawValue?: string;
  readonly format?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new () => BarcodeDetectorLike;

/**
 * Browser implementation for the small camera-kit surface the WMS uses.
 *
 * Android Chromium dùng BarcodeDetector của hệ điều hành để quét nhanh. Safari
 * iOS không hỗ trợ API này ổn định, nên khi API vắng mặt app nạp ZXing (Java-
 * Script) để quét cùng QR và barcode 1D. Cả hai nhánh dùng một MediaStream và
 * tiếp tục giải mã trên chính stream đó. Camera chỉ dừng khi rời màn, app ra
 * nền hoặc luồng nghiệp vụ chủ động tạm ngừng — không bị tháo/mở lại sau từng
 * mã vì thao tác đó làm preview chớp và khiến thủ kho phải chờ "đang tải".
 */
export function Camera({
  onReadCode,
  onError,
  scanThrottleDelay,
}: CameraProps): React.ReactElement {
  const video = useRef<HTMLVideoElement | null>(null);
  const onReadCodeRef = useRef(onReadCode);
  const onErrorRef = useRef(onError);
  // Đừng dùng 0 như một tín hiệu "one-shot" trên web. `scanThrottleDelay` là
  // khoảng lấy frame, còn chống callback trùng là trách nhiệm của
  // `createScanGuard` tại BusinessScanScreen.
  const scanIntervalMs =
    typeof scanThrottleDelay === 'number' && scanThrottleDelay > 0
      ? Math.max(80, scanThrottleDelay)
      : 140;
  // Giữ tốc độ quét mới nhất mà không đóng/mở lại MediaStream chỉ vì component
  // cha render lại với một cấu hình throttle khác.
  const scanIntervalRef = useRef(scanIntervalMs);
  scanIntervalRef.current = scanIntervalMs;

  // Callback của BusinessScanScreen thay đổi khi trạng thái quét đổi. Giữ nó
  // trong ref để React không stop/reopen getUserMedia cho mỗi render — đây là
  // nguyên nhân trực tiếp khiến preview camera bị giật trước đây.
  onReadCodeRef.current = onReadCode;
  onErrorRef.current = onError;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let detectorTimer: number | undefined;
    let stopFallbackReader: (() => void) | undefined;
    let disposed = false;
    let reading = false;

    const stopTrack = (): void => {
      stream?.getTracks().forEach(track => track.stop());
    };

    const stopScanner = (): void => {
      if (detectorTimer !== undefined) {
        window.clearTimeout(detectorTimer);
      }
      stopFallbackReader?.();
    };

    const deliverCode = (rawValue: string, codeFormat: string): void => {
      const code = rawValue.trim();
      if (disposed || code === '') {
        return;
      }
      onReadCodeRef.current?.({
        nativeEvent: {
          codeStringValue: code,
          codeFormat,
        },
      });
    };

    const reportCameraError = (error: unknown, fallback: string): void => {
      onErrorRef.current?.({
        nativeEvent: {
          errorMessage: error instanceof Error ? error.message : fallback,
        },
      });
    };

    const startNativeDetector = (
      Detector: BarcodeDetectorConstructor,
    ): void => {
      const detector = new Detector();

      const schedule = (): void => {
        if (!disposed) {
          detectorTimer = window.setTimeout(() => {
            inspect().catch(() => undefined);
          }, scanIntervalRef.current);
        }
      };

      const inspect = async (): Promise<void> => {
        if (
          disposed ||
          reading ||
          video.current === null ||
          video.current.readyState < 2
        ) {
          schedule();
          return;
        }
        reading = true;
        try {
          const code = (await detector.detect(video.current))[0];
          if (code?.rawValue !== undefined) {
            deliverCode(code.rawValue, code.format ?? 'unknown');
          }
        } catch (error) {
          reportCameraError(error, 'Không đọc được mã từ camera.');
        } finally {
          reading = false;
          // Luôn hẹn frame kế tiếp, kể cả vừa đọc được mã. Trước đây nhánh
          // thành công `return` trước `schedule()` nên Chromium chỉ quét đúng
          // một lần: mã đầu bị WMS từ chối là camera đã im hẳn và mã sau không
          // còn callback. Đây là vòng lặp quét liên tục, không phải one-shot.
          schedule();
        }
      };

      schedule();
    };

    const startSafariFallback = async (): Promise<void> => {
      const videoElement = video.current;
      if (videoElement === null) {
        return;
      }
      // Dynamic import để Chrome/Android không gánh bộ giải mã JavaScript. Nó
      // chỉ tải ở Safari/iOS hoặc trình duyệt chưa có BarcodeDetector.
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (disposed) {
        return;
      }
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: scanIntervalRef.current,
      });
      const controls = await reader.decodeFromVideoElement(
        videoElement,
        (result, _decodeError, callbackControls) => {
          if (disposed) {
            callbackControls.stop();
            return;
          }
          if (result !== undefined) {
            deliverCode(result.getText(), String(result.getBarcodeFormat()));
          }
          // `NotFoundException` được ZXing trả về cho từng frame chưa có mã;
          // không báo lỗi vì sẽ làm iPhone nhấp nháy cảnh báo liên tục.
        },
      );
      stopFallbackReader = controls.stop;
      if (disposed) {
        controls.stop();
      }
    };

    const start = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (disposed) {
          stopTrack();
          return;
        }
        if (video.current === null) {
          stopTrack();
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        if (disposed) {
          stopTrack();
          return;
        }

        const Detector = (
          globalThis as unknown as {
            BarcodeDetector?: BarcodeDetectorConstructor;
          }
        ).BarcodeDetector;
        if (Detector === undefined) {
          await startSafariFallback();
        } else {
          startNativeDetector(Detector);
        }
      } catch (error) {
        reportCameraError(error, 'Không mở được camera trình duyệt.');
      }
    };

    start().catch(() => undefined);
    return () => {
      disposed = true;
      stopScanner();
      stopTrack();
    };
  }, []);

  return React.createElement('video', {
    ref: video,
    muted: true,
    playsInline: true,
    autoPlay: true,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      background: '#000',
    },
  });
}
