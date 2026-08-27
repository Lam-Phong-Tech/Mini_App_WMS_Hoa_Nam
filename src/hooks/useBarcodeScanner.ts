import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBarcodeScannerAdapter,
  type BarcodeScannerAdapter,
} from "@/services/scanner-adapter";
import type {
  ActiveCamera,
  CameraPermissionStatus,
  ScanDetectedResult,
} from "@/types/scan.types";

export function useBarcodeScanner(
  onDetected?: (result: ScanDetectedResult) => void,
) {
  const adapterRef = useRef<BarcodeScannerAdapter>(createBarcodeScannerAdapter());
  const [isSupported, setIsSupported] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<CameraPermissionStatus>("UNKNOWN");
  const [activeCamera, setActiveCamera] = useState<ActiveCamera>("BACK");
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [lastDetectedCode, setLastDetectedCode] = useState<string>();
  const [scannerError, setScannerError] = useState<string>();
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const onDetectedRef = useRef(onDetected);

  const adapter = adapterRef.current;

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const initializeScanner = useCallback(async () => {
    setIsInitializing(true);
    setScannerError(undefined);
    setPermissionStatus("REQUESTING");

    try {
      const supported = adapter.isSupported();
      setIsSupported(supported);

      if (!supported) {
        setPermissionStatus("UNKNOWN");
        setScannerError("CAMERA_NOT_SUPPORTED");
        return;
      }

      await adapter.initialize();
      setPermissionStatus("UNKNOWN");
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "CAMERA_NOT_SUPPORTED";

      setPermissionStatus(
        errorCode === "CAMERA_PERMISSION_DENIED" ? "DENIED" : "UNKNOWN",
      );
      setScannerError(errorCode);
    } finally {
      setIsInitializing(false);
    }
  }, [adapter]);

  const startScanning = useCallback(async () => {
    if (!isSupported) return;
    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    setIsInitializing(true);
    setScannerError(undefined);
    setPermissionStatus("REQUESTING");

    const startPromise = (async () => {
      await adapter.start((result) => {
        setLastDetectedCode(result.code);
        onDetectedRef.current?.(result);
      });

      setPermissionStatus("GRANTED");
      setIsScanning(true);
      setIsPaused(false);

      if (!adapter.isContinuous()) {
        setIsScanning(false);
        setIsPaused(false);
      }
    })();

    startPromiseRef.current = startPromise;

    try {
      await startPromise;
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "CAMERA_NOT_SUPPORTED";

      setIsScanning(false);
      setIsPaused(false);
      setPermissionStatus(
        errorCode === "CAMERA_PERMISSION_DENIED" ? "DENIED" : "UNKNOWN",
      );
      setScannerError(errorCode);
    } finally {
      startPromiseRef.current = null;
      setIsInitializing(false);
    }
  }, [adapter, isSupported]);

  const pauseScanning = useCallback(async () => {
    await adapter.pause();
    setIsPaused(true);
  }, [adapter]);

  const resumeScanning = useCallback(async () => {
    await adapter.resume();
    setIsPaused(false);
  }, [adapter]);

  const stopScanning = useCallback(async () => {
    const pendingStart = startPromiseRef.current;
    if (pendingStart) {
      await pendingStart.catch(() => undefined);
    }

    await adapter.stop();
    setIsScanning(false);
    setIsPaused(false);
  }, [adapter]);

  const switchCamera = useCallback(async () => {
    if (!adapter.switchCamera) return;
    setScannerError(undefined);

    try {
      await adapter.switchCamera();
      setActiveCamera((current) => (current === "BACK" ? "FRONT" : "BACK"));
      setIsScanning(true);
      setIsPaused(false);
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "CAMERA_NOT_SUPPORTED";
      setScannerError(errorCode);
      setIsScanning(false);
      setIsPaused(false);
    }
  }, [adapter]);

  const toggleTorch = useCallback(async () => {
    if (!adapter.toggleTorch) return;
    try {
      const enabled = await adapter.toggleTorch();
      setTorchEnabled(enabled);
    } catch {
      setTorchEnabled(false);
    }
  }, [adapter]);

  const scanImageFile = useCallback(
    async (file: File) => {
      if (!adapter.scanImageFile) return;

      setIsInitializing(true);
      setScannerError(undefined);

      try {
        const result = await adapter.scanImageFile(file);
        setLastDetectedCode(result.code);
        onDetectedRef.current?.(result);
      } catch (error) {
        const errorCode =
          error instanceof Error ? error.message : "BARCODE_NOT_FOUND";
        setScannerError(errorCode);
      } finally {
        setIsInitializing(false);
      }
    },
    [adapter],
  );

  const resetScanner = useCallback(() => {
    setLastDetectedCode(undefined);
    setScannerError(undefined);
  }, []);

  const setVideoElement = useCallback(
    (videoElement: HTMLVideoElement | null) => {
      adapter.attachVideoElement?.(videoElement);
    },
    [adapter],
  );

  const simulateScan = useCallback(
    (code: string) => {
      const result = {
        code,
        format: code.startsWith("VALID") ? "QR_CODE" : "CODE_128",
        detected_at: new Date().toISOString(),
      };

      setLastDetectedCode(result.code);
      onDetectedRef.current?.(result);
    },
    [],
  );

  useEffect(() => {
    return () => {
      void adapter.stop();
    };
  }, [adapter]);

  return useMemo(
    () => ({
      isSupported,
      isInitializing,
      isScanning,
      isPaused,
      permissionStatus,
      activeCamera,
      torchEnabled,
      lastDetectedCode,
      scannerError,
      adapterName: adapter.getName(),
      canSwitchCamera: Boolean(adapter.switchCamera),
      canToggleTorch: Boolean(adapter.toggleTorch),
      initializeScanner,
      startScanning,
      pauseScanning,
      resumeScanning,
      stopScanning,
      switchCamera,
      toggleTorch,
      resetScanner,
      setVideoElement,
      simulateScan,
      scanImageFile,
    }),
    [
      activeCamera,
      adapter,
      initializeScanner,
      isInitializing,
      isPaused,
      isScanning,
      isSupported,
      lastDetectedCode,
      pauseScanning,
      permissionStatus,
      resetScanner,
      resumeScanning,
      scannerError,
      setVideoElement,
      simulateScan,
      scanImageFile,
      startScanning,
      stopScanning,
      switchCamera,
      toggleTorch,
      torchEnabled,
    ],
  );
}
