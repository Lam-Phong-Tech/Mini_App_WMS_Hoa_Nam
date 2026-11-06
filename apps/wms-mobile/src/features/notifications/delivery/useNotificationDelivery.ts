import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { captureDeliveryOwner, isDeliveryOwnerCurrent } from './ownerScope';
import { publishNotificationFreshness } from './freshness';
import { publishForegroundNotification } from './ForegroundNotification';
import {
  captureSessionScope,
  isSessionScopeCurrent,
} from '../../../auth/session';
import { notificationPush } from '../../../native/notificationPush';
import {
  fetchNotification,
  fetchUnreadNotificationCount,
} from '../../../services/wms/notifications';
import { createDeliveryService } from './registrationService';
import {
  collectNativeDiagnostic,
  NATIVE_DIAGNOSTIC_LOG_PREFIX,
} from './diagnostic';
import type { DeliveryService } from './types';
import {
  NotificationDeliveryController,
  type DeliveryState,
} from './controller';
export interface NotificationDeliveryModel {
  state: DeliveryState;
  enable(): void;
  disable(): void;
  refresh(): void;
  selfTest(): void;
  diagnose?(): void;
  diagnosticBusy?: boolean;
  diagnosticMessage?: string;
}
export function useNotificationDelivery(
  enabled: boolean,
  onOpen: (id: string) => void,
): NotificationDeliveryModel {
  const scope = captureDeliveryOwner(),
    key = JSON.stringify(scope),
    open = useRef(onOpen);
  open.current = onOpen;
  const controller = useRef<NotificationDeliveryController | undefined>(
      undefined,
    ),
    [state, setState] = useState<DeliveryState>({
      phase: 'checking',
      message: 'Đang kiểm tra thông báo thiết bị…',
    });
  const service = useRef<DeliveryService | undefined>(undefined),
    diagnosticRun = useRef<object | undefined>(undefined);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false),
    [diagnosticResult, setDiagnosticResult] = useState<
      { key: string; text: string } | undefined
    >(undefined);
  useEffect(() => {
    if (!enabled || !scope.userId || !scope.authSessionId) return;
    const api = createDeliveryService({ platform: notificationPush.platform });
    service.current = api;
    setDiagnosticBusy(false);
    const c = new NotificationDeliveryController(notificationPush, api, {
      isCurrent: () => isDeliveryOwnerCurrent(scope),
      onState: setState,
      onSignal: async id => {
        const count = await fetchUnreadNotificationCount();
        if (isDeliveryOwnerCurrent(scope)) {
          publishNotificationFreshness(scope, count, true);
          publishForegroundNotification(() => {
            if (isDeliveryOwnerCurrent(scope)) open.current(id);
          });
          setState(s => ({
            ...s,
            message: 'Bạn có thông báo nghiệp vụ mới. Mở danh sách để xem.',
          }));
        }
      },
      onOpen: async id => {
        const item = await fetchNotification(id);
        if (isDeliveryOwnerCurrent(scope) && item.id === id) open.current(id);
      },
    });
    controller.current = c;
    void c.refresh();
    const foreground = AppState.addEventListener('change', v => {
      if (v === 'active') void c.refresh();
    });
    const token = notificationPush.onTokenChange?.(() => {
      void c.refresh();
    });
    return () => {
      token?.();
      foreground.remove();
      c.dispose();
      diagnosticRun.current = undefined;
      if (service.current === api) service.current = undefined;
      if (controller.current === c) controller.current = undefined;
    };
    // Scope includes generation and warehouse; push never changes that scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return {
    state,
    enable: () => {
      void controller.current?.enable();
    },
    disable: () => {
      void controller.current?.disable();
    },
    refresh: () => {
      void controller.current?.refresh();
    },
    selfTest: () => {
      void controller.current?.selfTest();
    },
    ...(notificationPush.platform === 'ANDROID' && enabled
      ? {
          diagnosticBusy,
          diagnosticMessage:
            diagnosticResult?.key === key ? diagnosticResult.text : undefined,
          diagnose: () => {
            const api = service.current;
            if (
              !api ||
              diagnosticRun.current ||
              state.phase === 'checking' ||
              state.phase === 'busy' ||
              !isDeliveryOwnerCurrent(scope)
            )
              return;
            const run = {};
            diagnosticRun.current = run;
            setDiagnosticBusy(true);
            setDiagnosticResult({ key, text: 'Đang chẩn đoán chỉ đọc…' });
            void (async () => {
              try {
                const report = await collectNativeDiagnostic(
                  notificationPush,
                  api,
                  () => isDeliveryOwnerCurrent(scope),
                );
                if (
                  !report ||
                  diagnosticRun.current !== run ||
                  !isDeliveryOwnerCurrent(scope)
                )
                  return;
                // Explicit support action; report is an allowlist, never raw headers/body.
                console.info(
                  NATIVE_DIAGNOSTIC_LOG_PREFIX + JSON.stringify(report),
                );
                setDiagnosticResult({
                  key,
                  text:
                    'Đã xác minh chẩn đoán · Request-ID ' + report.request_id,
                });
              } catch {
                if (
                  diagnosticRun.current === run &&
                  isDeliveryOwnerCurrent(scope)
                )
                  setDiagnosticResult({
                    key,
                    text: 'Chưa xác minh được chẩn đoán. Kiểm tra phiên DEV/TEST rồi thử lại.',
                  });
              } finally {
                if (diagnosticRun.current === run) {
                  diagnosticRun.current = undefined;
                  if (isDeliveryOwnerCurrent(scope)) setDiagnosticBusy(false);
                }
              }
            })();
          },
        }
      : {}),
  };
}
