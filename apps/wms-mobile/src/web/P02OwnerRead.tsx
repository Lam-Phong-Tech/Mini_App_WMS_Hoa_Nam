/** User-approved P01 CTA context/START, followed by live P02/P12 business reads. */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { P02SessionFlow } from './P02SessionFlow';
import { HomeScreen } from '../features/home/HomeScreen';
import { P12Screen } from '../features/documents/p12/P12Screen';
import { createP12Service } from '../features/documents/p12/service';
import { BottomNav } from '../ui/BottomNav';
import { apiClient, type RequestOptions } from '../api/client';
import {
  fetchHomeUser,
  fetchHomeStockSummary,
  fetchHomeWarehouse,
  fetchHomeUnreadCount,
  HOME_CAPABILITIES,
} from '../services/wms/home';
import { fetchHomeRecentDocuments } from '../features/home/homeDocuments';
import { fetchCurrentWorkShift } from '../services/wms/workShift';
import { verifyP02Runtime } from '../config/p02Release';
import { getActiveSession } from '../auth/session';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { kpiAdmission, kpiFailure } from './p02KpiDiagnostic';
import { getShiftState } from '../shift/shiftState';
import type { CurrentUser } from '../services/wms/types';
import type { ReadClient } from '../services/wms/readOnlyClient';
import type { Source } from '../features/documents/p12/contract';

// Use the normal Web storage/auth owner so unresolved START journals survive reload.
const traces: Record<string, unknown>[] = [];
const rows = (v: any) =>
  Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : v?.id ? [v] : [];
function trace(path: string, response: any) {
  const body = response.data,
    data = body?.data,
    meta = body?.meta;
  const value = {
    tested_at: new Date().toISOString(),
    method: 'GET',
    path,
    http: response.status,
    request_id: response.header?.('X-Request-ID') ?? meta?.request_id ?? null,
    contract: meta?.contract ?? null,
    timestamp_contract: meta?.timestamp_contract ?? null,
    cursor_version: meta?.cursor_version ?? null,
    ...(path === '/api/v1/auth/me'
      ? {
          context_status: data?.warehouse_context?.status ?? null,
          warehouse_confirmed: typeof data?.active_warehouse_id === 'string',
        }
      : {}),
    ...(path === '/api/v1/mini-app/dashboard/summary'
      ? {
          data_scope: data?.data_scope,
          pending_total: data?.pending_approval_count,
          inbound_pending: data?.inbound?.pending_approval_count ?? null,
          outbound_pending: data?.outbound?.pending_approval_count ?? null,
          warranty_open: data?.warranty?.open_count ?? null,
        }
      : {}),
    ...(/documents/.test(path)
      ? {
          rows: rows(data).map((r: any) => ({
            uuid: r.id ?? null,
            source: r.source ?? r.doc_type ?? null,
            raw_created_at: r.created_at ?? null,
          })),
          total: meta?.total ?? null,
          transport_verified: {
            private_no_store:
              (response.header?.('Cache-Control') ?? '').includes('private') &&
              (response.header?.('Cache-Control') ?? '').includes('no-store'),
            json_content_type:
              response.header?.('Content-Type')?.split(';')[0] ===
              'application/json',
            nosniff: response.header?.('X-Content-Type-Options') === 'nosniff',
            vary_authorization:
              response
                .header?.('Vary')
                ?.toLowerCase()
                .split(',')
                .some((v: string) => v.trim() === 'authorization') ?? false,
          },
        }
      : {}),
  };
  traces.push(value);
  return value;
}
function Live() {
  const [user, setUser] = useState<CurrentUser>();
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState('LOGIN_REQUIRED'),
    [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0),
    [traceRevision, setTraceRevision] = useState(0);
  const [kpiDiagnostic, setKpiDiagnostic] = useState('Chờ nguồn KPI.');
  const [readIssues, setReadIssues] = useState<Record<string, string>>({});
  const [entry, setEntry] = useState<{
    key: number;
    document?: { type: Source; id: string };
    queue?: { source: Source; key: string; status?: string };
  }>();
  const retained = useRef<any>({});
  const readClient = useMemo<ReadClient>(
    () => ({
      get: async <T,>(
        path: string,
        options?: Omit<RequestOptions, 'path' | 'method'>,
      ) => {
        try {
          const result = await apiClient.get<T>(path, options);
          trace(path, result);
          setTraceRevision(n => n + 1);
          return result;
        } catch (cause) {
          const e = cause as any;
          traces.push({
            tested_at: new Date().toISOString(),
            method: 'GET',
            path,
            http: e.status ?? null,
            request_id: e.requestId ?? null,
            error_code: e.code ?? e.kind ?? 'UNAVAILABLE',
          });
          setTraceRevision(n => n + 1);
          throw cause;
        }
      },
    }),
    [],
  );
  const fetchUser = useCallback(
    async (options: any = {}) => {
      const scope = captureSessionScope();
      const result = await fetchHomeUser(options, readClient);
      if (!options.signal?.aborted && isSessionScopeCurrent(scope)) {
        const admission = kpiAdmission(result);
        traces.push({
          tested_at: new Date().toISOString(),
          step: 'HOME_KPI_ADMISSION',
          ...admission,
        });
        if (admission.code !== 'P02_KPI_ADMITTED')
          setKpiDiagnostic(admission.code + ' — ' + admission.label);
        setTraceRevision(n => n + 1);
      }
      return result;
    },
    [readClient],
  );
  const readPart = useCallback(
    async <T,>(
      source: string,
      options: any,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const scope = captureSessionScope(),
        epoch = getShiftState().verificationEpoch;
      const current = () =>
        !options?.signal?.aborted &&
        isSessionScopeCurrent(scope) &&
        getShiftState().verificationEpoch === epoch;
      try {
        const result = await operation();
        if (current())
          setReadIssues(previous => {
            if (!Object.hasOwn(previous, source)) return previous;
            const next = { ...previous };
            delete next[source];
            return next;
          });
        return result;
      } catch (cause) {
        if (current()) {
          const failure = kpiFailure(cause);
          setReadIssues(previous => ({ ...previous, [source]: failure.code }));
          traces.push({
            tested_at: new Date().toISOString(),
            step: 'HOME_SOURCE',
            source,
            result: 'FAILED',
            ...failure,
          });
          setTraceRevision(n => n + 1);
        }
        throw cause;
      }
    },
    [],
  );
  const service = useMemo(
    () =>
      createP12Service(() => ({ user, session: getActiveSession() }), {
        client: readClient,
        origin: 'https://khohoanamdev.lptech.info.vn',
        revalidateUser: () => fetchUser(),
      }),
    [readClient, user, fetchUser],
  );
  const deps = useMemo(
    () => ({
      capabilities: HOME_CAPABILITIES,
      readSession: getActiveSession,
      readSharedShift: getShiftState,
      fetchUser,
      fetchWarehouse: (id: string, options: any) =>
        readPart('warehouse', options, () =>
          fetchHomeWarehouse(id, options, readClient),
        ),
      fetchUnread: (options: any) =>
        readPart('unread', options, () =>
          fetchHomeUnreadCount(options, readClient),
        ),
      fetchShift: (options: any) =>
        readPart('shift', options, () => fetchCurrentWorkShift(options)),
      fetchStockSummary: async (id: string, options: any) => {
        const scope = captureSessionScope(),
          epoch = getShiftState().verificationEpoch;
        const current = () =>
          !options.signal?.aborted &&
          isSessionScopeCurrent(scope) &&
          getShiftState().verificationEpoch === epoch;
        if (current())
          setKpiDiagnostic('Đang xác minh runtime và đọc GET summary…');
        try {
          await verifyP02Runtime();
          const result = await fetchHomeStockSummary(id, options, readClient);
          if (current()) {
            setKpiDiagnostic(
              'GET summary đã đạt contract/kho. Khối thiếu quyền giữ chưa xác minh.',
            );
            traces.push({
              tested_at: new Date().toISOString(),
              step: 'HOME_KPI_ADAPTER',
              result: 'VERIFIED',
              inbound_visible: result.inbound !== null,
              outbound_visible: result.outbound !== null,
              warranty_visible: result.warranty !== null,
            });
            setTraceRevision(n => n + 1);
          }
          return result;
        } catch (cause) {
          if (current()) {
            const failure = kpiFailure(cause);
            setKpiDiagnostic(failure.code + ' — ' + failure.label);
            traces.push({
              tested_at: new Date().toISOString(),
              step: 'HOME_KPI_ADAPTER',
              result: 'FAILED',
              ...failure,
            });
            setTraceRevision(n => n + 1);
          }
          throw cause;
        }
      },
      fetchRecentDocuments: (u: CurrentUser, options: any) =>
        readPart('recent', options, () =>
          fetchHomeRecentDocuments(u, options, service),
        ),
    }),
    [readClient, fetchUser, service, readPart],
  );
  const onState = useCallback((next: string, text?: string) => {
    setStatus(next);
    setMessage(text ?? '');
    if (next !== 'READY') {
      setReady(false);
      setUser(undefined);
      setEntry(undefined);
    }
  }, []);
  const onReady = useCallback((u: CurrentUser) => {
    setUser(u);
    setReady(true);
    setEntry(undefined);
    retained.current = {};
    setKpiDiagnostic('Chờ nguồn KPI.');
    setReadIssues({});
  }, []);
  const documents = (
    document?: { type: Source; id: string },
    queue?: { source: Source; key: string; status?: string },
  ) => {
    retained.current = {};
    setEntry({ key: Date.now(), document, queue });
  };
  const home = () => setEntry(undefined);
  return (
    <>
      <aside
        style={{
          maxWidth: 950,
          margin: 'auto',
          padding: 12,
          font: '14px/1.5 Arial',
        }}
      >
        <b>P02 Web live · DEV/TEST · API chính</b>
        <div>
          https://khohoanamdev.lptech.info.vn · release70974487 · xác nhận
          kho/START qua CTA P01; Home/chứng từ chỉ đọc.
        </div>
        <button
          disabled={!getActiveSession()}
          onClick={() => {
            onState('CONFIRMING_SESSION');
            setRevision(n => n + 1);
          }}
        >
          Đọc lại phiên (GET)
        </button>
        <span style={{ marginLeft: 12 }}>Trạng thái: {status}</span>
        {message ? <p role="alert">{message}</p> : null}
        <div data-testid="p02-kpi-diagnostic" style={{ minHeight: 22 }}>
          KPI: {kpiDiagnostic}
          {Object.keys(readIssues).length
            ? ' | Nguồn Home lỗi: ' +
              Object.entries(readIssues)
                .map(([source, code]) => source + '=' + code)
                .join(', ')
            : ''}
        </div>
      </aside>
      <main
        style={{
          width: 494,
          height: 950,
          margin: 'auto',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 494, height: 950 },
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
          }}
        >
          <ThemeProvider>
            <P02SessionFlow
              key={revision}
              onReady={onReady}
              onState={onState}
              renderHome={() =>
                ready && user ? (
                  <View style={{ flex: 1, minHeight: 0 }}>
                    <View style={{ flex: 1, minHeight: 0 }}>
                      {entry ? (
                        <P12Screen
                          key={entry.key}
                          user={user}
                          service={service}
                          retained={retained.current}
                          initialDocument={entry.document}
                          initialQueue={entry.queue}
                          onBack={home}
                          onOwnerIntent={() =>
                            setMessage(
                              'Ghi nghiệp vụ nằm ngoài lượt kiểm P02 chỉ đọc.',
                            )
                          }
                        />
                      ) : (
                        <HomeScreen
                          deps={deps}
                          notificationsEnabled={false}
                          sessionKey={JSON.stringify([
                            user.id,
                            user.auth_session_id,
                            user.active_warehouse_id,
                          ])}
                          onSeeAll={() => documents()}
                          onOpenDocument={(type, id) => documents({ type, id })}
                          onOpenWarrantyCase={id =>
                            documents({ type: 'warranty', id })
                          }
                          onOpenPendingDocuments={source =>
                            documents(undefined, {
                              source,
                              key: 'home-' + source,
                            })
                          }
                          onOpenWarrantyList={state =>
                            documents(undefined, {
                              source: 'warranty',
                              key: 'home-warranty-' + state,
                              status: state,
                            })
                          }
                          onOpenProfile={() =>
                            setMessage(
                              'Hồ sơ thuộc owner P10; lượt này chỉ kiểm P02/P12 GET.',
                            )
                          }
                          onSelectTask={() =>
                            setMessage(
                              'Tác vụ giữ owner hiện hữu; lượt này không ghi nghiệp vụ.',
                            )
                          }
                        />
                      )}
                    </View>
                    <BottomNav
                      activeKey={entry ? 'documents' : 'home'}
                      onSelect={key => {
                        if (key === 'home') home();
                        else if (key === 'documents') documents();
                        else
                          setMessage(
                            'Tab giữ owner hiện hữu; lượt kiểm này chỉ P02/P12 GET.',
                          );
                      }}
                    />
                  </View>
                ) : null
              }
            />
          </ThemeProvider>
        </SafeAreaProvider>
      </main>
      <details style={{ maxWidth: 950, margin: '16px auto', padding: 12 }}>
        <summary>Trace GET đã che thông tin nhạy cảm ({traceRevision})</summary>
        <pre data-testid="p02-live-safe-trace">
          {JSON.stringify(traces, null, 2)}
        </pre>
      </details>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Live />);
