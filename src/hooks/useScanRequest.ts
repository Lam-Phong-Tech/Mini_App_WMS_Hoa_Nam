import { useCallback, useRef } from "react";
import { SCAN_DEBOUNCE_MS } from "@/constants/scan.constants";
import { getErrorMessage } from "@/constants/error-messages";
import { submitScan } from "@/services/scan.service";
import {
  clearWarehouseDashboardCache,
  markWarehouseDashboardChanged,
} from "@/services/warehouse-dashboard-cache";
import { getStoredWarehouseStaff } from "@/services/zalo-auth.service";
import { useScanSessionStore } from "@/stores/scan-session.store";
import type {
  ScanContext,
  ScanHistoryItem,
  ScanMethod,
  ScanRequest,
  ScanResponse,
} from "@/types/scan.types";
import { generateClientScanId } from "@/utils/generateClientScanId";
import { normalizeScanCode } from "@/utils/normalizeScanCode";

interface SubmitCodeInput {
  code: string;
  quantity?: number;
  method: ScanMethod;
  context: ScanContext;
  documentId?: string;
}

type SubmitCodeResult =
  | {
      accepted: true;
      id: string;
      response?: ScanResponse;
    }
  | {
      accepted: false;
      reason: string;
      response?: ScanResponse;
    };

export function useScanRequest() {
  const addPending = useScanSessionStore((state) => state.addPending);
  const updateResult = useScanSessionStore((state) => state.updateResult);
  const recentScanAtRef = useRef<Record<string, number>>({});
  const pendingKeysRef = useRef<Set<string>>(new Set());

  const submitCode = useCallback(
    async ({
      code,
      quantity = 1,
      method,
      context,
      documentId,
    }: SubmitCodeInput): Promise<SubmitCodeResult> => {
      const normalizedCode = normalizeScanCode(code);
      const rawCode = code.trim();
      const shouldPreserveRawCode = Boolean(import.meta.env.VITE_WMS_API_BASE_URL);
      const requestCode = shouldPreserveRawCode ? rawCode : normalizedCode;

      if (!requestCode) {
        return {
          accepted: false,
          reason: "Mã không được để trống.",
        };
      }

      const warehouseStaff = getStoredWarehouseStaff();

      if (!warehouseStaff) {
        return {
          accepted: false,
          reason: "Bạn chưa đăng nhập WMS. Vui lòng đăng nhập rồi thử lại.",
        };
      }

      const dedupeKey = `${context}:${normalizedCode}`;
      const now = Date.now();
      const lastScanAt = recentScanAtRef.current[dedupeKey] || 0;

      if (pendingKeysRef.current.has(dedupeKey)) {
        return {
          accepted: false,
          reason: getErrorMessage("SCANNER_PENDING_LOCKED"),
        };
      }

      if (now - lastScanAt < SCAN_DEBOUNCE_MS) {
        return {
          accepted: false,
          reason: getErrorMessage("SCANNER_DUPLICATE_LOCKED"),
        };
      }

      recentScanAtRef.current[dedupeKey] = now;
      pendingKeysRef.current.add(dedupeKey);

      const request: ScanRequest = {
        client_scan_id: generateClientScanId(),
        code: requestCode,
        quantity,
        scan_method: method,
        scan_context: context,
        document_id: documentId,
        warehouse_staff_id: warehouseStaff.id,
        zalo_user_id: warehouseStaff.zalo_user_id,
        scanned_by_name: warehouseStaff.name,
        scanned_at: new Date().toISOString(),
      };

      const item: ScanHistoryItem = {
        id: request.client_scan_id,
        request,
        status: "PENDING",
      };

      addPending(item);

      try {
        const response = await submitScan(request, documentId);
        updateResult(item.id, {
          status: response.success ? "SUCCESS" : "ERROR",
          response,
          error_message: response.success
            ? undefined
            : getErrorMessage(response.error_code, response.message),
        });

        if (response.success) {
          clearWarehouseDashboardCache({ notify: false });
          markWarehouseDashboardChanged();
        }

        return {
          accepted: true,
          id: item.id,
          response,
        };
      } catch (error) {
        const errorCode =
          error instanceof Error ? error.message : "UNKNOWN_ERROR";
        const response = {
          success: false,
          message: getErrorMessage(errorCode),
          error_code: errorCode,
        };
        updateResult(item.id, {
          status: "ERROR",
          error_message: getErrorMessage(errorCode),
          response,
        });

        return {
          accepted: true,
          id: item.id,
          response,
        };
      } finally {
        pendingKeysRef.current.delete(dedupeKey);
      }
    },
    [addPending, updateResult],
  );

  return { submitCode };
}
