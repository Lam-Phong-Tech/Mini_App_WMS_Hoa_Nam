import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ErrorState from "@/components/ErrorState";
import { AppButton } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { WmsModal } from "@/components/ui/WmsModal";
import { WmsField, WmsInput, WmsNotice } from "@/components/ui/WmsRuntime";
import { SCAN_CONTEXT_CONFIG } from "@/constants/scan.constants";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useScanRequest } from "@/hooks/useScanRequest";
import {
  getReceiptErrorMessage,
  loadInboundReceiptSession,
  processInboundReceiptScan,
} from "@/services/receipt-flow.service";
import {
  getOutboundDocumentDetail,
  resolveOutboundCode,
  type OutboundDocumentDetail,
  type OutboundResolvedCode,
} from "@/services/scan.service";
import {
  getWmsLinkContext,
  mergeWmsLinkContext,
} from "@/services/wms-link-context";
import { resolveWmsContext } from "@/services/wms-context.service";
import {
  fillNextOutboundScanRow,
  getStoredOutboundSession,
  type OutboundScanUnit,
  type OutboundSession,
  useOutboundSessionStore,
} from "@/stores/outbound-session.store";
import {
  fillNextReceiptScanRow,
  getStoredReceiptSession,
  type ReceiptSession,
  useReceiptSessionStore,
} from "@/stores/receipt-session.store";
import type { ScanContext, ScanDetectedResult } from "@/types/scan.types";
import { isUuid } from "@/utils/isUuid";

const validContexts = Object.keys(SCAN_CONTEXT_CONFIG) as ScanContext[];

interface OutboundProgress {
  scannedQty: number;
  expectedQty: number;
  remainingQty?: number;
  fullScan: boolean;
}

export default function ScannerPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const context = validContexts.includes(params.context as ScanContext)
    ? (params.context as ScanContext)
    : "RECEIPT";
  const [resolvedDocumentId, setResolvedDocumentId] = useState<string>();
  const documentId = resolveScannerDocumentId(
    context,
    searchParams.get("documentId"),
    resolvedDocumentId,
  );
  const retryCode = searchParams.get("retry") || "";
  const config = SCAN_CONTEXT_CONFIG[context];
  const { submitCode } = useScanRequest();
  const storedReceiptSession = useReceiptSessionStore((state) =>
    documentId && context === "RECEIPT"
      ? state.getSession(documentId)
      : undefined,
  );
  const upsertReceiptSession = useReceiptSessionStore(
    (state) => state.upsertSession,
  );
  const clearReceiptSession = useReceiptSessionStore(
    (state) => state.clearSession,
  );
  const [receiptSession, setReceiptSession] = useState<
    ReceiptSession | undefined
  >(storedReceiptSession);
  const storedOutboundSession = useOutboundSessionStore((state) =>
    documentId && context === "OUTBOUND"
      ? state.getSession(documentId)
      : undefined,
  );
  const upsertOutboundSession = useOutboundSessionStore(
    (state) => state.upsertSession,
  );
  const clearOutboundSession = useOutboundSessionStore(
    (state) => state.clearSession,
  );
  const [outboundSession, setOutboundSession] = useState<
    OutboundSession | undefined
  >(storedOutboundSession);
  const [notice, setNotice] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const stopScanningRef = useRef<() => Promise<void>>();
  const startScanningRef = useRef<() => Promise<void>>();
  const resetScannerRef = useRef<() => void>();
  const processingRef = useRef(false);
  const receiptSeenCodesRef = useRef<Set<string>>(new Set());
  const processReceiptCodeRef = useRef<
    (code: string, method: "camera" | "manual") => Promise<void>
  >(async () => undefined);
  const isReceiptFlow = context === "RECEIPT";
  const isOutboundFlow = context === "OUTBOUND";
  const isLocalOutboundFlow = isOutboundFlow && isLocalOutboundId(documentId);
  const [outboundProgress, setOutboundProgress] = useState<OutboundProgress>({
    scannedQty: 0,
    expectedQty: 0,
    fullScan: false,
  });

  useEffect(() => {
    setNotice(undefined);
    setManualOpen(false);
    setManualCode("");
    setIsProcessing(false);
    setCameraRequested(false);
    setImagePickerOpen(false);
    processingRef.current = false;
  }, [context]);

  useEffect(() => {
    if (!isReceiptFlow || !documentId) return;
    let mounted = true;
    const session = storedReceiptSession;

    if (session) {
      setReceiptSession(session);
      return;
    }

    if (isLocalDocumentId(documentId)) {
      const recoveredSession =
        getStoredReceiptSession(documentId) ||
        buildLocalReceiptSessionFromParams(documentId, searchParams);

      if (recoveredSession) {
        setReceiptSession(recoveredSession);
        upsertReceiptSession(recoveredSession);
        return;
      }

      setReceiptSession(undefined);
      setNotice(
        "Chưa nạp được phiếu nhập tạm. Vui lòng quay lại tạo phiếu nếu app vừa bị tải lại.",
      );
      return;
    }

    void loadInboundReceiptSession(documentId)
      .then((loadedSession) => {
        if (!mounted) return;
        const nextSession = { ...loadedSession, status: "scanning" as const };
        setReceiptSession(nextSession);
        upsertReceiptSession(nextSession);
      })
      .catch((error) => {
        if (mounted) setNotice(getReceiptErrorMessage(error));
      });

    return () => {
      mounted = false;
    };
  }, [
    documentId,
    isReceiptFlow,
    navigate,
    searchParams,
    storedReceiptSession,
    upsertReceiptSession,
  ]);

  const refreshOutboundProgress = useCallback(async () => {
    if (!isOutboundFlow || isLocalOutboundFlow || !documentId) return undefined;

    const document = await getOutboundDocumentDetail(documentId);
    const progress = getOutboundDocumentProgress(document);
    setOutboundProgress(progress);
    return progress;
  }, [documentId, isLocalOutboundFlow, isOutboundFlow]);

  useEffect(() => {
    if (!isOutboundFlow || isLocalOutboundFlow || !documentId) return;
    let mounted = true;

    void getOutboundDocumentDetail(documentId)
      .then((document) => {
        if (mounted) setOutboundProgress(getOutboundDocumentProgress(document));
      })
      .catch(() => {
        if (mounted) {
          setNotice(
            "Chưa tải được tiến độ phiếu xuất. Vẫn có thể thử quét lại.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [documentId, isLocalOutboundFlow, isOutboundFlow]);

  useEffect(() => {
    if (!isLocalOutboundFlow || !documentId) return;

    const session =
      storedOutboundSession || getStoredOutboundSession(documentId);

    if (session) {
      setOutboundSession(session);
      setOutboundProgress({
        scannedQty: session.items.length,
        expectedQty: session.expectedQty,
        remainingQty: Math.max(0, session.expectedQty - session.items.length),
        fullScan: session.items.length >= session.expectedQty,
      });
      return;
    }

    setOutboundSession(undefined);
    setNotice(
      "Phiên xuất kho tạm đã hết. Vui lòng quay lại tạo phiên xuất kho mới.",
    );
  }, [documentId, isLocalOutboundFlow, storedOutboundSession]);

  useEffect(() => {
    if (!isOutboundFlow || isLocalOutboundFlow) return;

    setNotice(
      "Xuất kho cần tạo phiên trước khi quét. Vui lòng quay lại màn Xuất kho.",
    );
  }, [isLocalOutboundFlow, isOutboundFlow]);

  useEffect(() => {
    if (!receiptSession) return;
    receiptSeenCodesRef.current = new Set(
      receiptSession.items
        .flatMap((item) => [item.labelId, item.code, item.id])
        .map(getReceiptPhysicalDuplicateKey)
        .filter(Boolean) as string[],
    );
  }, [receiptSession]);

  const submitDirectCode = useCallback(
    async (code: string, method: "CAMERA" | "MANUAL" | "SCANNER") => {
      if (processingRef.current) return;

      const normalizedCode = code.trim();

      if (!normalizedCode) {
        setNotice("Mã không được để trống.");
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);
      await stopScanningRef.current?.();
      setNotice("Đang kiểm tra mã...");

      if (context === "WARRANTY_ITEM") {
        setManualCode("");
        setManualOpen(false);
        navigate(
          `/warranty/receive?code=${encodeURIComponent(
            normalizedCode,
          )}&method=${method}`,
          { replace: true },
        );
        return;
      }

      const submitResult = await submitCode({
        code: normalizedCode,
        quantity: 1,
        method,
        context,
        documentId,
      });

      if (!submitResult.accepted) {
        setNotice(submitResult.reason);
        setIsProcessing(false);
        processingRef.current = false;
        return;
      }

      setManualCode("");
      setManualOpen(false);

      if (isOutboundFlow) {
        const response = submitResult.response;
        const responseDocumentId = response?.data?.document_id || documentId;

        if (!response?.success) {
          setNotice(
            response?.message ||
              "Không ghi nhận được mã xuất kho. Vui lòng quét lại.",
          );
          setIsProcessing(false);
          window.setTimeout(() => {
            processingRef.current = false;
          }, 520);
          return;
        }

        let nextProgress = getOutboundScanProgress(
          response.data,
          outboundProgress,
        );
        const responseExpectedQty = numberValue(response.data?.required_qty);
        const responseMayBeLineProgress =
          Boolean(outboundProgress.expectedQty) &&
          Boolean(responseExpectedQty) &&
          Number(responseExpectedQty) < outboundProgress.expectedQty;

        if (
          !nextProgress.expectedQty ||
          !nextProgress.scannedQty ||
          responseMayBeLineProgress ||
          nextProgress.fullScan
        ) {
          nextProgress =
            (await refreshOutboundProgress().catch(() => undefined)) ||
            nextProgress;
        }

        setOutboundProgress(nextProgress);

        const progressText = nextProgress.expectedQty
          ? `${nextProgress.scannedQty}/${nextProgress.expectedQty}`
          : `${nextProgress.scannedQty}`;

        if (nextProgress.fullScan) {
          setNotice(
            `✓ Đã quét đủ phiếu xuất ${progressText}. Đang mở màn kiểm tra.`,
          );
          setIsProcessing(false);
          processingRef.current = false;
          window.setTimeout(() => {
            if (responseDocumentId) {
              navigate(
                `/approvals/outbound/${encodeURIComponent(responseDocumentId)}?from=approvals&folder=OUTBOUND`,
                { replace: true },
              );
            } else {
              navigate("/approvals?folder=OUTBOUND", { replace: true });
            }
          }, 360);
          return;
        }

        setNotice(`✓ Quét thành công · ${progressText}`);
        setIsProcessing(false);

        window.setTimeout(
          () => {
            setNotice(undefined);
            processingRef.current = false;
            resetScannerRef.current?.();
            if (cameraRequested) void startScanningRef.current?.();
          },
          method === "MANUAL" ? 360 : 520,
        );
        return;
      }

      if (submitResult.id) {
        navigate(`/result/${submitResult.id}`);
      }
    },
    [
      context,
      cameraRequested,
      documentId,
      isOutboundFlow,
      navigate,
      outboundProgress,
      refreshOutboundProgress,
      submitCode,
    ],
  );

  const goToOutboundReview = useCallback(
    async (outboundId: string, replace = false) => {
      processingRef.current = true;
      setIsProcessing(false);
      await stopScanningRef.current?.();
      resetScannerRef.current?.();
      navigate(`/outbound-review/${encodeURIComponent(outboundId)}`, {
        replace,
      });
    },
    [navigate],
  );

  const processOutboundLocalCode = useCallback(
    async (code: string, method: "camera" | "manual") => {
      const session = outboundSession;
      const normalized = code.trim();

      if (!session) {
        setNotice("Phiên xuất kho chưa sẵn sàng. Vui lòng quay lại tạo phiên.");
        return;
      }

      if (!normalized) {
        setNotice("Mã không được để trống.");
        return;
      }

      if (session.items.length >= session.expectedQty) {
        setNotice("Phiên xuất kho đã đủ số lượng.");
        await goToOutboundReview(session.outboundId);
        return;
      }

      if (
        session.items.some(
          (item) =>
            normalizeReceiptCode(item.rawCode || item.code) ===
            normalizeReceiptCode(normalized),
        )
      ) {
        setNotice("Mã này đã được quét. Vui lòng quét sản phẩm khác.");
        return;
      }

      if (!session.warehouseId) {
        setNotice(
          "Thiếu kho xuất để kiểm tra mã. Vui lòng tạo lại phiên xuất kho.",
        );
        return;
      }

      if (!isUuid(session.warehouseId)) {
        setNotice(
          "Kho xuất không hợp lệ. API cần warehouse_id dạng UUID, không dùng mã kho như HN1.",
        );
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);
      setNotice("Đang kiểm tra mã...");

      try {
        const resolved = await resolveOutboundCode({
          warehouse_id: session.warehouseId,
          raw_code: normalized,
        });

        if (!resolved) {
          throw new Error("Backend không trả thông tin mã vừa quét.");
        }

        if (resolved.eligible_for_outbound === false) {
          throw new Error(formatOutboundEligibilityError(resolved));
        }

        const duplicateKey = getOutboundPhysicalDuplicateKey({
          code: normalized,
          rawCode: resolved.raw_code || resolved.code_value || normalized,
          itemCode: resolved.item_unique,
          itemId: resolved.item_id,
          itemUnique: resolved.item_unique,
        });

        if (
          duplicateKey &&
          session.items.some(
            (item) => getOutboundPhysicalDuplicateKey(item) === duplicateKey,
          )
        ) {
          setNotice("Mã này đã được quét. Vui lòng quét sản phẩm khác.");
          return;
        }

        const item: OutboundScanUnit = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          code: normalized,
          rawCode: resolved.raw_code || resolved.code_value || normalized,
          itemCode: resolved.item_unique || resolved.item_id || normalized,
          skuCode: resolved.sku_code,
          skuName: resolved.sku_name,
          itemId: resolved.item_id,
          itemUnique: resolved.item_unique,
          itemStatus: resolved.item_status,
          eligibleForOutbound: resolved.eligible_for_outbound,
          productName: resolved.sku_name,
          quantity: 1,
          scanMethod: method,
          scannedAt: new Date().toISOString(),
        };
        const nextItems = [...session.items, item].slice(
          0,
          session.expectedQty,
        );
        const nextSession: OutboundSession = {
          ...session,
          status:
            nextItems.length >= session.expectedQty ? "review" : "scanning",
          items: nextItems,
          scanRows: fillNextOutboundScanRow(session, item),
        };

        upsertOutboundSession(nextSession);
        setOutboundSession(nextSession);
        setOutboundProgress({
          scannedQty: nextItems.length,
          expectedQty: nextSession.expectedQty,
          remainingQty: Math.max(0, nextSession.expectedQty - nextItems.length),
          fullScan: nextItems.length >= nextSession.expectedQty,
        });
        setNotice(
          `✓ Quét thành công ${item.itemCode} · ${nextItems.length}/${nextSession.expectedQty}`,
        );
        setManualCode("");
        setManualOpen(false);

        if (nextItems.length >= nextSession.expectedQty) {
          await stopScanningRef.current?.();
          resetScannerRef.current?.();
          window.setTimeout(() => {
            void goToOutboundReview(nextSession.outboundId);
          }, 320);
        } else if (method === "manual" && cameraRequested) {
          resetScannerRef.current?.();
          void startScanningRef.current?.();
        }
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Không kiểm tra được mã xuất kho.",
        );
      } finally {
        setIsProcessing(false);
        window.setTimeout(() => {
          processingRef.current = false;
        }, 520);
      }
    },
    [
      cameraRequested,
      goToOutboundReview,
      outboundSession,
      upsertOutboundSession,
    ],
  );

  const handleDetected = useCallback(
    async (result: ScanDetectedResult) => {
      if (processingRef.current) return;

      if (isReceiptFlow) {
        await processReceiptCodeRef.current(result.code, "camera");
        return;
      }

      if (isLocalOutboundFlow) {
        await processOutboundLocalCode(result.code, "camera");
        return;
      }

      if (isOutboundFlow) {
        setNotice(
          "Xuất kho cần tạo phiên trước khi quét. Vui lòng quay lại màn Xuất kho.",
        );
        return;
      }

      await submitDirectCode(result.code, "CAMERA");
    },
    [
      isLocalOutboundFlow,
      isOutboundFlow,
      isReceiptFlow,
      processOutboundLocalCode,
      submitDirectCode,
    ],
  );

  const scanner = useBarcodeScanner(handleDetected);
  stopScanningRef.current = scanner.stopScanning;
  startScanningRef.current = scanner.startScanning;
  resetScannerRef.current = scanner.resetScanner;
  const canStartScanner = isReceiptFlow
    ? Boolean(receiptSession)
    : isOutboundFlow
      ? Boolean(outboundSession)
      : true;
  const stopScanning = scanner.stopScanning;

  useEffect(() => {
    if (canStartScanner) return;

    void stopScanning();
    setCameraRequested(false);
  }, [canStartScanner, stopScanning]);

  useEffect(() => {
    if (
      !cameraRequested ||
      !canStartScanner ||
      manualOpen ||
      imagePickerOpen ||
      isProcessing ||
      scanner.scannerError ||
      scanner.isInitializing ||
      scanner.isScanning
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      scanner.resetScanner();
      void scanner.startScanning();
    }, 650);

    return () => window.clearTimeout(timer);
  }, [
    canStartScanner,
    cameraRequested,
    imagePickerOpen,
    isProcessing,
    manualOpen,
    scanner,
  ]);

  useEffect(() => {
    if (context !== "RECEIPT") {
      setResolvedDocumentId(undefined);
      return;
    }

    let mounted = true;

    void resolveWmsContext()
      .then((resolved) => {
        if (mounted) setResolvedDocumentId(resolved.context.documentId);
      })
      .catch(() => {
        if (mounted) setResolvedDocumentId(getWmsLinkContext().documentId);
      });

    return () => {
      mounted = false;
    };
  }, [context]);

  const openImagePicker = async () => {
    await scanner.stopScanning();
    setImagePickerOpen(true);
    const restoreAfterPicker = () => {
      window.setTimeout(() => setImagePickerOpen(false), 120);
    };
    window.addEventListener("focus", restoreAfterPicker, { once: true });
    imageInputRef.current?.click();
  };

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImagePickerOpen(false);
    if (!file) return;
    await scanner.scanImageFile(file);
  };

  const openManualEntry = async () => {
    setNotice(undefined);
    setManualOpen(true);
    await scanner.stopScanning();
  };

  const closeManualEntry = () => {
    setManualOpen(false);
    if (
      cameraRequested &&
      canStartScanner &&
      !isProcessing &&
      !scanner.scannerError
    ) {
      void scanner.startScanning();
    }
  };

  const restartCamera = async () => {
    if (!canStartScanner) {
      setNotice(
        isOutboundFlow
          ? "Xuất kho cần tạo phiên trước khi quét. Vui lòng quay lại màn Xuất kho."
          : "Chưa đủ ngữ cảnh để bật camera.",
      );
      return;
    }

    setNotice(undefined);
    setIsProcessing(false);
    processingRef.current = false;
    setCameraRequested(true);
    scanner.resetScanner();
    await scanner.startScanning();
  };

  const clearCurrentLocalSessionAndCreateAgain = async () => {
    await scanner.stopScanning();
    scanner.resetScanner();
    receiptSeenCodesRef.current.clear();
    setManualOpen(false);
    setManualCode("");
    setNotice(undefined);
    setIsProcessing(false);
    processingRef.current = false;
    setCameraRequested(false);

    if (
      isReceiptFlow &&
      receiptSession &&
      isLocalDocumentId(receiptSession.receiptId)
    ) {
      clearReceiptSession(receiptSession.receiptId);
      setReceiptSession(undefined);
      navigate("/documents/RECEIPT", { replace: true });
      return;
    }

    if (
      isLocalOutboundFlow &&
      outboundSession &&
      isLocalOutboundId(outboundSession.outboundId)
    ) {
      clearOutboundSession(outboundSession.outboundId);
      setOutboundSession(undefined);
      setOutboundProgress({
        scannedQty: 0,
        expectedQty: 0,
        fullScan: false,
      });
      navigate("/documents/OUTBOUND", { replace: true });
    }
  };

  const processReceiptCode = useCallback(
    async (code: string, method: "camera" | "manual") => {
      const session = receiptSession;
      const normalized = normalizeReceiptCode(code);
      const duplicateKey = getReceiptPhysicalDuplicateKey(code);

      if (!session) {
        setNotice(
          documentId
            ? "Đang tải phiếu nhập, vui lòng thử lại sau vài giây."
            : "Thiếu phiếu nhập. Hãy tạo phiếu trước khi quét.",
        );
        return;
      }

      if (!normalized) {
        setNotice("Mã không được để trống.");
        return;
      }

      if (duplicateKey && receiptSeenCodesRef.current.has(duplicateKey)) {
        setNotice("Mã này đã được quét. Vui lòng quét sản phẩm khác.");
        return;
      }

      if (duplicateKey) receiptSeenCodesRef.current.add(duplicateKey);
      processingRef.current = true;
      setIsProcessing(true);
      setNotice("Đang kiểm tra mã...");

      try {
        const result = await processInboundReceiptScan({
          session,
          code,
          method,
        });
        const baseSession = result.receiptSession || session;
        const nextItems = [...baseSession.items, result.item];
        const nextSession: ReceiptSession = {
          ...baseSession,
          ifMatch: result.nextIfMatch || baseSession.ifMatch,
          status: "scanning",
          items: nextItems,
          scanRows: fillNextReceiptScanRow(baseSession, result.item),
        };

        if (baseSession.receiptId !== session.receiptId) {
          clearReceiptSession(session.receiptId);
          mergeWmsLinkContext({
            documentId: baseSession.receiptId,
            warehouseId: baseSession.warehouseId,
            ifMatch: nextSession.ifMatch,
          });
          navigate(
            `/scanner/RECEIPT?documentId=${encodeURIComponent(baseSession.receiptId)}`,
            { replace: true },
          );
        }

        upsertReceiptSession(nextSession);
        setReceiptSession(nextSession);
        setNotice(
          `✓ Quét thành công ${result.item.skuCode || result.item.itemCode || result.item.code} · Tổng ${nextItems.length} mã`,
        );
        setManualCode("");
        setManualOpen(false);

        if (method === "manual" && cameraRequested && !scanner.scannerError) {
          scanner.resetScanner();
          void scanner.startScanning();
        }
      } catch (error) {
        if (duplicateKey) receiptSeenCodesRef.current.delete(duplicateKey);
        setNotice(getReceiptErrorMessage(error));
      } finally {
        setIsProcessing(false);
        window.setTimeout(() => {
          processingRef.current = false;
        }, 520);
      }
    },
    [
      clearReceiptSession,
      cameraRequested,
      documentId,
      navigate,
      receiptSession,
      scanner,
      upsertReceiptSession,
    ],
  );
  processReceiptCodeRef.current = processReceiptCode;

  const hasBlockingOverlay =
    scanner.scannerError || isProcessing || !scanner.isScanning;
  const isNoticeSuccess = Boolean(notice?.startsWith("✓"));
  const showManualNotice = Boolean(manualOpen && notice && !isProcessing);
  const showScannerNotice = Boolean(!manualOpen && notice && !isProcessing);

  const isWarranty =
    context === "WARRANTY_ITEM" || context === "WARRANTY_COMPONENT";
  const receiptScannedQty = receiptSession?.items.length || 0;
  const outboundScannedQty = outboundProgress.scannedQty || 0;
  const outboundExpectedQty = outboundProgress.expectedQty || 0;
  const canClearCurrentLocalSession =
    Boolean(notice && !notice.startsWith("✓")) &&
    ((isReceiptFlow &&
      receiptSession &&
      isLocalDocumentId(receiptSession.receiptId)) ||
      (isLocalOutboundFlow &&
        outboundSession &&
        isLocalOutboundId(outboundSession.outboundId)));

  return (
    <main className="wms-scanner-page fixed inset-0 z-50 h-[100dvh] overflow-hidden overscroll-none text-white">
      <video
        ref={scanner.setVideoElement}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          scanner.isScanning ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        disablePictureInPicture
        muted
        playsInline
      />

      <div className="wms-scanner-camera-mask absolute inset-0" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+26px)]">
        <button
          aria-label="Quay lại"
          className="wms-scanner-glass-control grid h-11 w-11 place-items-center text-white"
          onClick={() => navigate(-1)}
          type="button"
        >
          <Icon name="chevron-left" size={22} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-semibold tracking-[-0.03em]">
            {isReceiptFlow
              ? "Quét hàng nhập"
              : isOutboundFlow
                ? "Quét hàng xuất"
                : isWarranty
                  ? "Quét tra bảo hành"
                  : "Quét mã"}
          </h1>
          <p className="text-white/72 mt-1 text-[11px] font-semibold">
            {isReceiptFlow
              ? receiptSession?.receiptName || "Phiếu nhập đang mở"
              : isWarranty
                ? "Mã máy / hồ sơ / mã tạm"
                : documentId
                  ? `Phiếu xuất ${documentId}`
                  : "Đưa Barcode / QR vào khung"}
          </p>
        </div>
        <span className="wms-scanner-context-chip px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-white">
          {isReceiptFlow
            ? `${receiptScannedQty} mã`
            : isOutboundFlow && outboundExpectedQty
              ? `${outboundScannedQty}/${outboundExpectedQty}`
              : config.shortTitle}
        </span>
      </header>

      <section className="pointer-events-none absolute inset-x-0 top-[30%] z-10 mx-auto h-[30vh] max-h-[240px] max-w-[70vw]">
        <Corner className="left-0 top-0 rotate-0" />
        <Corner className="right-0 top-0 rotate-90" />
        <Corner className="bottom-0 right-0 rotate-180" />
        <Corner className="bottom-0 left-0 -rotate-90" />
      </section>

      <aside className="absolute bottom-[232px] right-3 z-20 flex flex-col items-center gap-4">
        <RoundAction
          icon="flash"
          label={scanner.torchEnabled ? "Flash bật" : "Bật flash"}
          active={scanner.torchEnabled}
          disabled={!scanner.isScanning}
          onClick={scanner.toggleTorch}
        />
        <RoundAction
          icon="image"
          label="Chọn ảnh"
          disabled={imagePickerOpen || isProcessing}
          onClick={openImagePicker}
        />
      </aside>

      <section className="pointer-events-none absolute inset-x-0 bottom-[226px] z-10 px-4 text-center">
        <p className="text-[13px] font-semibold text-white">
          {isProcessing
            ? "Đã nhận diện mã"
            : scanner.isScanning
              ? "Giữ thiết bị ổn định"
              : "Sẵn sàng mở camera"}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-white/70">
          {isProcessing
            ? "Đang kiểm tra để tránh quét trùng"
            : !cameraRequested
              ? "Chỉ bật camera khi bạn bấm nút để quét"
              : !scanner.isScanning
                ? "Đang kết nối camera an toàn"
                : isReceiptFlow
                  ? `Đã quét ${receiptScannedQty} sản phẩm`
                  : isOutboundFlow
                    ? `Đã quét ${outboundScannedQty} trên ${outboundExpectedQty || "?"} sản phẩm`
                    : "Mã sẽ được đọc tự động"}
        </p>
      </section>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelected}
      />

      <section className="wms-scanner-sheet absolute inset-x-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom)+76px)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-[var(--wms-text-strong)]">
              {isReceiptFlow
                ? "Phiên quét nhập kho"
                : isOutboundFlow
                  ? "Phiếu xuất đang quét"
                  : isWarranty
                    ? "Tra cứu bảo hành"
                    : documentId
                      ? "Phiếu xuất đang mở"
                      : "Sẵn sàng quét"}
            </p>
            <p className="mt-0.5 text-[11px] font-normal text-[var(--wms-text-muted)]">
              {isReceiptFlow
                ? `${receiptSession?.receiptName || "Đang tải phiếu"} · đã quét ${receiptScannedQty} mã`
                : isOutboundFlow
                  ? `Quét liên tục đến khi đủ ${outboundExpectedQty || "N"} sản phẩm · chưa trừ tồn`
                  : isWarranty
                    ? "Chỉ đọc · không thay đổi tồn kho"
                    : "Quét Barcode/QR sản phẩm đang tồn kho · stock_effect=NONE"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="min-h-11 rounded-[var(--wms-radius-control)] bg-[var(--wms-primary-soft)] px-3 text-[12px] font-semibold text-[var(--wms-primary-strong)]"
              type="button"
              onClick={openManualEntry}
            >
              Nhập tay
            </button>
            <button
              className="min-h-11 rounded-[var(--wms-radius-control)] bg-[var(--wms-success-soft)] px-3 text-[12px] font-semibold text-[var(--wms-success-text)] disabled:opacity-45"
              type="button"
              disabled={isReceiptFlow && receiptScannedQty <= 0}
              onClick={() => {
                if (isReceiptFlow && receiptSession) {
                  navigate(
                    `/receipt-review/${encodeURIComponent(receiptSession.receiptId)}`,
                  );
                  return;
                }

                navigate(
                  `/documents/${context}${documentId ? `?documentId=${documentId}` : ""}`,
                );
              }}
            >
              {isReceiptFlow ? "Kiểm tra phiếu" : "Đổi phiếu"}
            </button>
          </div>
        </div>
      </section>

      <WmsModal
        ariaLabel="Nhập mã thủ công"
        className="wms-modal-sheet w-full self-end px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 text-[var(--wms-text)]"
        closeOnBackdrop={!isProcessing}
        open={manualOpen}
        onClose={() => {
          if (!isProcessing) closeManualEntry();
        }}
      >
        <div className="mx-auto max-w-md space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
                Nhập mã thủ công
              </h2>
              <p className="mt-0.5 text-[12px] font-normal text-[var(--wms-text-muted)]">
                {isReceiptFlow
                  ? "Mã nhập tay cũng kiểm tra trùng và tồn tại trên WMS"
                  : context === "INVENTORY_LOOKUP"
                    ? "Nhập QR/Barcode để tra cứu chi tiết sản phẩm trên WMS"
                    : "Dùng để kiểm tra Barcode/QR khi chưa có tem in sẵn"}
              </p>
            </div>
            <button
              className="grid h-11 w-11 place-items-center rounded-[var(--wms-radius-control)] bg-[var(--wms-surface-subtle)] text-[var(--wms-text-muted)]"
              type="button"
              onClick={closeManualEntry}
            >
              <Icon name="x-circle" size={20} />
            </button>
          </div>
          {showManualNotice && (
            <WmsNotice
              tone={isNoticeSuccess ? "success" : "danger"}
              title={
                isNoticeSuccess ? "Đã kiểm tra mã" : "Không thể dùng mã này"
              }
              description={notice}
            />
          )}
          <WmsField label="Mã sản phẩm / mã tem">
            <WmsInput
              value={manualCode}
              placeholder="Nhập mã cần kiểm tra"
              onChange={(event) => {
                setManualCode(event.target.value);
                if (showManualNotice) setNotice(undefined);
              }}
            />
          </WmsField>
          <div className="grid grid-cols-2 gap-3">
            <AppButton fullWidth variant="secondary" onClick={closeManualEntry}>
              Hủy
            </AppButton>
            <AppButton
              fullWidth
              icon="keyboard"
              loading={isProcessing}
              onClick={() =>
                isReceiptFlow
                  ? processReceiptCode(manualCode, "manual")
                  : isWarranty
                    ? submitDirectCode(manualCode, "MANUAL")
                    : isOutboundFlow
                      ? isLocalOutboundFlow
                        ? processOutboundLocalCode(manualCode, "manual")
                        : setNotice(
                            "Xuất kho cần tạo phiên trước khi quét. Vui lòng quay lại màn Xuất kho.",
                          )
                      : submitDirectCode(manualCode, "MANUAL")
              }
            >
              Kiểm tra mã
            </AppButton>
          </div>
        </div>
      </WmsModal>

      {hasBlockingOverlay && (
        <section className="absolute inset-x-4 top-[45%] z-30 space-y-3">
          {isProcessing && (
            <ScannerLoadingCard
              title={
                isWarranty
                  ? "Đang tra thông tin bảo hành..."
                  : "Đang kiểm tra mã..."
              }
              description={
                isReceiptFlow
                  ? "Counter chỉ tăng khi mã hợp lệ và không trùng"
                  : "Camera đã khóa để tránh gửi trùng"
              }
            />
          )}

          {scanner.scannerError && (
            <div className="wms-scanner-overlay-card p-4">
              <ErrorState errorCode={scanner.scannerError} />
              <AppButton
                className="mt-3"
                fullWidth
                icon={
                  scanner.permissionStatus === "DENIED" ? "keyboard" : "camera"
                }
                onClick={
                  scanner.permissionStatus === "DENIED"
                    ? openManualEntry
                    : restartCamera
                }
              >
                {scanner.permissionStatus === "DENIED"
                  ? "Vẫn có thể nhập mã thủ công"
                  : "Bật camera"}
              </AppButton>
              <AppButton
                className="mt-2"
                fullWidth
                variant="secondary"
                icon="keyboard"
                onClick={openManualEntry}
              >
                Nhập mã thủ công
              </AppButton>
            </div>
          )}

          {!scanner.scannerError && !scanner.isScanning && !isProcessing && (
            <ScannerCameraStartCard
              isLoading={cameraRequested || scanner.isInitializing}
              canStart={canStartScanner}
              onStart={() => void restartCamera()}
              onManual={() => void openManualEntry()}
            />
          )}

          {retryCode && !isProcessing && (
            <AppButton
              fullWidth
              variant="secondary"
              onClick={() => scanner.simulateScan(retryCode)}
            >
              Quét lại mã vừa nhập
            </AppButton>
          )}
        </section>
      )}

      {showScannerNotice && (
        <section className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+108px)] z-40 mx-auto max-w-md space-y-3">
          <div
            className={`wms-scanner-toast p-3 text-center text-sm font-semibold text-white ${
              isNoticeSuccess
                ? "wms-scanner-toast--success"
                : "wms-scanner-toast--danger"
            }`}
            role="alert"
          >
            <p>{notice}</p>
          </div>
          {canClearCurrentLocalSession && (
            <AppButton
              fullWidth
              variant="danger"
              onClick={clearCurrentLocalSessionAndCreateAgain}
            >
              Xoá danh sách và tạo lại
            </AppButton>
          )}
          {notice?.includes("Chưa nạp được phiếu nhập tạm") && (
            <AppButton
              fullWidth
              variant="secondary"
              onClick={() => navigate("/documents/RECEIPT", { replace: true })}
            >
              Tạo lại phiếu nhập
            </AppButton>
          )}
        </section>
      )}
    </main>
  );
}

function normalizeReceiptCode(value?: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function getReceiptPhysicalDuplicateKey(value?: string) {
  const raw = String(value || "").trim();
  const compositeItem = raw.match(/^HN\d+\|.*(?:^|\|)ITEM=([^|]+)/i)?.[1];
  if (compositeItem) return normalizeReceiptCode(compositeItem);

  // Với mã SKU/barcode thường, cho phép quét lặp lại để nhập nhiều sản phẩm cùng mã.
  // Backend sẽ nhận code_value dạng HN1|SKU=...|ITEM=... riêng cho từng lần quét.
  if (!raw || /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/i.test(raw)) return undefined;

  return normalizeReceiptCode(raw);
}

function isLocalDocumentId(documentId?: string) {
  return String(documentId || "").startsWith("local-");
}

function isLocalOutboundId(documentId?: string) {
  return String(documentId || "").startsWith("local-outbound-");
}

function resolveScannerDocumentId(
  context: ScanContext,
  queryDocumentId: string | null,
  resolvedDocumentId?: string,
) {
  const explicitDocumentId = queryDocumentId?.trim();

  if (context === "OUTBOUND") {
    return explicitDocumentId || undefined;
  }

  if (context === "RECEIPT") {
    return (
      explicitDocumentId ||
      resolvedDocumentId ||
      getWmsLinkContext().documentId ||
      undefined
    );
  }

  // Tra cứu và bảo hành là luồng đọc độc lập, tuyệt đối không kế thừa
  // documentId của phiếu nhập/xuất trước đó.
  return undefined;
}

function getOutboundPhysicalDuplicateKey(value: {
  code?: string;
  rawCode?: string;
  itemCode?: string;
  itemId?: string;
  itemUnique?: string;
}) {
  const itemCode = String(value.itemUnique || value.itemCode || "").trim();
  const itemId = String(value.itemId || "").trim();
  const code = String(value.rawCode || value.code || "").trim();
  const compositeItem = code.match(/^HN\d+\|.*(?:^|\|)ITEM=([^|]+)/i)?.[1];

  if (compositeItem) return normalizeReceiptCode(compositeItem);
  if (itemId) return normalizeReceiptCode(itemId);
  if (itemCode && itemCode !== code) return normalizeReceiptCode(itemCode);

  // Mã SKU/barcode thường có thể được quét lặp lại cho nhiều sản phẩm cùng đầu hàng.
  if (!code || /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/i.test(code)) return undefined;

  return normalizeReceiptCode(code);
}

function getOutboundScanProgress(
  data:
    | {
        required_qty?: number;
        scanned_qty?: number;
        remaining_qty?: number;
        full_scan?: boolean;
        ready_for_issue?: boolean;
      }
    | undefined,
  fallback: OutboundProgress,
): OutboundProgress {
  const responseExpectedQty = numberValue(data?.required_qty);
  const responseScannedQty = numberValue(data?.scanned_qty);
  const expectedQty = Math.max(
    responseExpectedQty || 0,
    fallback.expectedQty || 0,
  );
  const scannedQty = Math.max(
    responseScannedQty || 0,
    fallback.scannedQty || 0,
  );
  const responseLooksDocumentWide =
    !fallback.expectedQty ||
    !responseExpectedQty ||
    responseExpectedQty >= fallback.expectedQty;
  const remainingQty =
    (responseLooksDocumentWide
      ? numberValue(data?.remaining_qty)
      : undefined) ??
    (expectedQty > 0 ? Math.max(0, expectedQty - scannedQty) : undefined);
  const fullScan =
    (responseLooksDocumentWide &&
      (Boolean(data?.full_scan) || Boolean(data?.ready_for_issue))) ||
    (expectedQty > 0 && scannedQty >= expectedQty) ||
    remainingQty === 0;

  return {
    scannedQty,
    expectedQty,
    remainingQty,
    fullScan,
  };
}

function getOutboundDocumentProgress(
  document?: OutboundDocumentDetail,
): OutboundProgress {
  const lines = [
    ...(document?.lines || []),
    ...(document?.document_lines || []),
    ...(document?.items || []),
  ];
  const expectedFromLines = lines.reduce(
    (total, line) => total + getOutboundLineExpectedQty(line),
    0,
  );
  const scannedFromLines = lines.reduce(
    (total, line) => total + getOutboundLineScannedQty(line),
    0,
  );
  const expectedQty =
    numberValue(document?.expected_total_qty) ??
    numberValue(document?.required_total_qty) ??
    numberValue(document?.required_total) ??
    expectedFromLines;
  const scannedQty =
    numberValue(document?.scanned_total_qty) ??
    numberValue(document?.scanned_qty) ??
    scannedFromLines;
  const remainingQty =
    numberValue(document?.remaining_qty) ??
    (expectedQty > 0 ? Math.max(0, expectedQty - scannedQty) : undefined);
  const fullScan =
    Boolean(document?.full_scan) ||
    Boolean(document?.ready_for_issue) ||
    String(document?.mini_app_status || "").toUpperCase() ===
      "READY_TO_ISSUE" ||
    (expectedQty > 0 && scannedQty >= expectedQty) ||
    remainingQty === 0;

  return {
    scannedQty,
    expectedQty,
    remainingQty,
    fullScan,
  };
}

function getOutboundLineExpectedQty(line: {
  qty_planned?: number;
  expected_qty?: number;
  required_quantity?: number;
  quantity?: number;
  qty_actual?: number;
}) {
  return (
    numberValue(line.qty_planned) ??
    numberValue(line.expected_qty) ??
    numberValue(line.required_quantity) ??
    numberValue(line.quantity) ??
    numberValue(line.qty_actual) ??
    0
  );
}

function getOutboundLineScannedQty(line: {
  scanned_qty?: number;
  scanned_quantity?: number;
}) {
  return (
    numberValue(line.scanned_qty) ?? numberValue(line.scanned_quantity) ?? 0
  );
}

function numberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function formatOutboundEligibilityError(resolved: OutboundResolvedCode) {
  const code = String(resolved.eligibility_code || "").toUpperCase();
  const reservation = resolved.reservation?.doc_no
    ? ` Mã đang bị giữ bởi phiếu ${resolved.reservation.doc_no}.`
    : "";

  if (code === "ITEM_NOT_AVAILABLE") {
    return `Mã không đủ điều kiện xuất kho vì item không còn IN_STOCK.${reservation}`;
  }

  if (code === "ITEM_ALREADY_MATCHED") {
    return `Mã đã được match vào phiếu xuất khác.${reservation}`;
  }

  if (code === "INSUFFICIENT_STOCK") {
    return `SKU không đủ tồn khả dụng để xuất. Tồn khả dụng: ${resolved.available_qty ?? 0}.`;
  }

  return resolved.item_status
    ? `Mã không đủ điều kiện xuất kho. Trạng thái item: ${resolved.item_status}.`
    : "Mã không đủ điều kiện xuất kho.";
}

function buildLocalReceiptSessionFromParams(
  documentId: string,
  params: URLSearchParams,
): ReceiptSession | undefined {
  const receiptName = params.get("receiptName")?.trim();
  const warehouseId = params.get("warehouseId")?.trim();

  if (!receiptName || !warehouseId) {
    return undefined;
  }

  return {
    receiptId: documentId,
    receiptName,
    warehouseId,
    warehouseName: params.get("warehouseName")?.trim() || undefined,
    expectedQty: 0,
    scanDriven: true,
    status: "scanning",
    items: [],
    scanRows: [],
    createdAt: new Date().toISOString(),
  };
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={`absolute h-9 w-9 border-l-[4px] border-t-[4px] border-white drop-shadow-[0_0_12px_rgba(255,255,255,0.42)] ${className}`}
    />
  );
}

function ScannerLoadingCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="wms-scanner-overlay-card mx-auto max-w-[245px] p-4 text-center">
      <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-[var(--wms-primary-soft)] border-t-[var(--wms-primary)]" />
      <p className="mt-3 text-sm font-semibold text-[var(--wms-text-strong)]">
        {title}
      </p>
      <p className="mt-1 text-[11px] font-normal text-[var(--wms-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function ScannerCameraStartCard({
  canStart,
  isLoading,
  onStart,
  onManual,
}: {
  canStart: boolean;
  isLoading: boolean;
  onStart: () => void;
  onManual: () => void;
}) {
  return (
    <div className="wms-scanner-overlay-card mx-auto max-w-[280px] p-4 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--wms-radius-control)] bg-[var(--wms-primary-soft)] text-[var(--wms-primary-strong)]">
        <Icon name="camera" size={22} />
      </span>
      <p className="mt-3 text-sm font-semibold text-[var(--wms-text-strong)]">
        {isLoading ? "Đang kết nối camera..." : "Sẵn sàng quét mã"}
      </p>
      <p className="mt-1 text-[11px] font-normal leading-4 text-[var(--wms-text-muted)]">
        {isLoading
          ? "Đang chờ hình ảnh thật từ camera."
          : canStart
            ? "Bấm bật camera để cấp quyền và bắt đầu quét."
            : "Đang chuẩn bị phiên quét. Bạn vẫn có thể nhập mã thủ công."}
      </p>
      <AppButton
        className="mt-3"
        disabled={!canStart}
        fullWidth
        icon="camera"
        loading={isLoading}
        onClick={onStart}
      >
        Bật camera để quét
      </AppButton>
      <button
        className="mt-2 min-h-11 px-3 text-[12px] font-semibold text-[var(--wms-primary-strong)]"
        type="button"
        onClick={onManual}
      >
        Nhập mã thủ công
      </button>
    </div>
  );
}

function RoundAction({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={`wms-scanner-round-action grid h-11 w-11 place-items-center rounded-full border text-white ${
          active
            ? "wms-scanner-round-action--active"
            : "wms-scanner-round-action--default"
        }`}
      >
        <Icon name={icon} size={18} />
      </span>
    </button>
  );
}
