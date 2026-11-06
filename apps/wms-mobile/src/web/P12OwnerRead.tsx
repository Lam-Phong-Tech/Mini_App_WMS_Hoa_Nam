/** Explicit read-only acceptance entry, not imported in Android/AppShell. */
import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { P12OwnerFlow } from './P12OwnerFlow';
import { P12Screen } from '../features/documents/p12/P12Screen';
import { BottomNav } from '../ui/BottomNav';
import { createP12Service } from '../features/documents/p12/service';
import { createApiClient } from '../api/client';
import { getCurrentEnvironment } from '../config/env';
import { getActiveSession } from '../auth/session';
import { fetchCurrentUser } from '../services/wms/queries';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import type { CurrentUser } from '../services/wms/types';

setAppStorageForTesting(createStorage(createMemoryBackend()));
const origin = 'https://khohoanamdev.lptech.info.vn';
const proxyFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
  if (!url.startsWith(origin + '/api/v1/'))
    throw Error('P12 Web owner chỉ dùng DEV/TEST cố định.');
  return fetch('/wms-api' + url.slice(origin.length), init);
};
const client = createApiClient({
  environment: { ...getCurrentEnvironment(), apiBaseUrl: origin },
  fetchImpl: proxyFetch,
});
const audit: {
  traces: unknown[];
  status: string;
  error?: string;
  read?: (query: any) => Promise<any>;
  detail?: (type: any, id: string) => Promise<any>;
  scope?: () => string;
} = { traces: [], status: 'LOGIN_REQUIRED' };
(window as any).p12OwnerAudit = audit;
function project(value: any) {
  const rows = Array.isArray(value.items)
    ? value.items
    : value.id
    ? [value]
    : [];
  const trace = {
    tested_at: new Date().toISOString(),
    request_id:
      value.responseHeaders?.requestId ?? value.meta?.request_id ?? null,
    timestamp_contract: value.meta?.timestamp_contract ?? null,
    cursor_version: value.meta?.cursor_version ?? null,
    total: value.paging?.total ?? null,
    loaded: rows.length,
    rows: rows.map((row: any) => ({
      uuid: row.id,
      source: row.type,
      row_key: row.rowKey,
      raw_created_at: row.createdAt,
      parsed: row.createdTimestamp,
    })),
  };
  audit.traces.push(trace);
  return trace;
}

function Owner() {
  const [user, setUser] = useState<CurrentUser>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [openContextRead, setOpenContextRead] = useState<
    (() => void) | undefined
  >();
  const onReadContextReady = useCallback(
    (openRead: (() => void) | undefined) => setOpenContextRead(() => openRead),
    [],
  );
  const [service, setService] = useState<ReturnType<typeof createP12Service>>();
  const retained = useRef<any>({});
  const onState = useCallback((status: string, message?: string) => {
    audit.status = status;
    audit.error = message;
    setError(message ?? '');
    if (status !== 'READY') {
      setService(undefined);
      setUser(undefined);
      audit.read = undefined;
      audit.detail = undefined;
      audit.scope = undefined;
    }
  }, []);
  const onReady = useCallback((resolved: CurrentUser) => {
    const api = createP12Service(() => ({ user: resolved }), {
      client,
      origin,
      revalidateUser: () => fetchCurrentUser(),
    });
    if (!api.scopeKey())
      throw Error('BLOCKED: identity/context chưa khớp phiên.');
    audit.read = async query => {
      const page = await api.mixed(query);
      return {
        ...project(page),
        paging: page.paging,
        meta: {
          cursor_version: page.meta.cursor_version,
          source_facets: page.meta.source_facets,
          hasMore: page.paging.hasMore,
        },
        nextCursor: page.paging.nextCursor,
      };
    };
    audit.detail = async (type, id) => project(await api.detail(type, id));
    audit.scope = api.scopeKey;
    retained.current = {};
    setUser(resolved);
    setService(api);
  }, []);

  return (
    <>
      <aside
        style={{
          padding: 12,
          maxWidth: 850,
          margin: 'auto',
          font: '14px/1.5 Arial',
          color: '#27485e',
        }}
      >
        <b>P12 · owner Web local · DEV/TEST GET</b>
        <br />
        DEV70974487 · Đăng nhập qua owner hiện có. Kiểm GET P12 cần đúng
        phiên/kho READY; P14/recovery giữ OFF, không chọn kho, START/END hoặc
        ghi nghiệp vụ.
        <button
          disabled={!getActiveSession()}
          onClick={() => {
            onState('CONFIRMING_SESSION');
            setRevision(value => value + 1);
          }}
          style={{ marginLeft: 10 }}
        >
          Đọc lại phiên (GET)
        </button>
        <button
          disabled={!openContextRead}
          onClick={() => {
            try {
              openContextRead?.();
            } catch (cause) {
              onState('BLOCKED', (cause as Error).message);
            }
          }}
        >
          Mở kiểm thử P12 chỉ đọc
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </aside>
      <main
        id="p12-owner-app"
        style={{
          width: 494,
          height: 950,
          maxWidth: '100%',
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
            <P12OwnerFlow
              key={revision}
              onReady={onReady}
              onState={onState}
              onReadContextReady={onReadContextReady}
              renderDocuments={() =>
                service && user ? (
                  <>
                    <View style={{ flex: 1, minHeight: 0 }}>
                      <P12Screen
                        service={service}
                        user={user}
                        retained={retained.current}
                        onBack={() => {}}
                        onOwnerIntent={() => {
                          throw Error('Writer ngoài phạm vi timestamp');
                        }}
                      />
                    </View>
                    <BottomNav
                      selectedKey="documents"
                      items={[
                        { key: 'home', label: 'Trang chủ', icon: 'home' },
                        {
                          key: 'documents',
                          label: 'Chứng từ',
                          icon: 'approvals',
                        },
                        { key: 'scan', label: 'Quét mã', icon: 'scan' },
                        { key: 'history', label: 'Lịch sử', icon: 'history' },
                        { key: 'profile', label: 'Cá nhân', icon: 'user' },
                      ]}
                      onSelect={() => {}}
                    />
                  </>
                ) : null
              }
            />
          </ThemeProvider>
        </SafeAreaProvider>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Owner />);
