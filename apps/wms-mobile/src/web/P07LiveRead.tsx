// Dedicated acceptance entry. Actual services/parser/components; no catalog fixtures.
// Physical write + prepare/confirm/release are fenced off on this browser origin.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ErrorBoundary } from '../errors/ErrorBoundary';
import { LoginScreen } from '../features/auth/LoginScreen';
import { P07NativeFlow } from '../features/nfc/P07NativeFlow';
import { fetchCurrentUser } from '../services/wms/queries';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../storage/storage';
import { getSession, updateSessionIdentity } from '../auth/session';
import { toAppError } from '../errors/AppError';
import './global.css';
setAppStorageForTesting(createStorage(createMemoryBackend()));
const embedded = new URLSearchParams(location.search).has('embedded');
const publish = (extra: Record<string, unknown> = {}) => {
  if (embedded)
    parent.postMessage(
      { kind: 'P07_LIVE_READ_META', records: evidence, ...extra },
      location.origin,
    );
};
const evidence: unknown[] = [];
const sourceFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input.url,
    location.href,
  );
  const method = (init?.method || 'GET').toUpperCase();
  const route = url.pathname.replace(/^\/wms-api/, '');
  const read =
    method === 'GET' &&
    (route === '/api/v1/health' ||
      route === '/api/v1/auth/me' ||
      route === '/api/v1/mini-app/nfc-tags' ||
      route === '/api/v1/mini-app/items' ||
      /^\/api\/v1\/mini-app\/nfc-tags\/[0-9a-f-]{36}$/i.test(route));
  const resolve =
    method === 'POST' &&
    [
      '/api/v1/mini-app/nfc/resolve-code',
      '/api/v1/mini-app/nfc/resolve-tag',
    ].includes(route);
  const auth =
    method === 'POST' &&
    ['/api/v1/auth/login', '/api/v1/auth/refresh'].includes(route);
  if (url.origin !== location.origin || !(read || resolve || auth))
    throw new Error(
      'P07_API_READ_ACCEPTANCE_ONLY: thao tác này cần app Android và lượt NFC được phép.',
    );
  const response = await sourceFetch(input, init);
  const body = await response
    .clone()
    .json()
    .catch(() => undefined);
  const meta = body?.meta;
  const data = body?.data;
  evidence.push({
    method,
    route,
    status: response.status,
    request_id:
      response.headers.get('x-request-id') || meta?.request_id || null,
    at: meta?.timestamp || null,
    contract: meta?.contract || null,
    recovery_contract: meta?.recovery_contract || null,
    warehouse_id: meta?.warehouse_id || null,
    count_unit: meta?.count_unit || null,
    total: meta?.total ?? null,
    current_page: meta?.current_page ?? null,
    last_page: meta?.last_page ?? null,
    tab_totals: meta?.tab_totals ?? null,
    rows: Array.isArray(data) ? data.length : null,
    success: body?.success === true,
    code: body?.code || body?.error?.code || null,
    health:
      route === '/api/v1/health'
        ? { sha: data?.build?.sha, environment: data?.environment }
        : undefined,
  });
  publish();
  return response;
};
Object.assign(window, {
  p07LiveRead: {
    status: () => ({
      authenticated: !!getSession(),
      warehouse: !!getSession()?.activeWarehouseId,
      transport: 'ACTUAL_DEV_READ_ONLY',
      physical_write: 'BLOCKED_IN_BROWSER',
    }),
    evidence: () => JSON.parse(JSON.stringify(evidence)),
  },
});
function Review() {
  const [phase, setPhase] = useState<'login' | 'context' | 'ready'>('login'),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    publish({ phase, message });
  }, [phase, message]);
  useEffect(() => {
    const command = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent) return;
      if (e.data?.kind === 'P07_LIVE_READ_RELOAD') setRevision(n => n + 1);
      if (e.data?.kind === 'P07_LIVE_READ_CONTEXT') void hydrate();
    };
    addEventListener('message', command);
    return () => removeEventListener('message', command);
  });
  const hydrate = async () => {
    setPhase('context');
    setMessage('Đang đọc /auth/me từ API DEV…');
    try {
      const user = await fetchCurrentUser();
      if (
        !user.id ||
        !user.auth_session_id ||
        !user.active_warehouse_id ||
        user.warehouse_context?.status !== 'READY'
      ) {
        setMessage(
          `API chưa xác nhận phiên/kho READY (${
            user.warehouse_context?.status || 'chưa có trạng thái'
          }). Không tự chọn kho hoặc tạo ca. Hãy xác nhận phiên bằng luồng app chính.`,
        );
        return;
      }
      updateSessionIdentity({
        userId: user.id,
        authSessionId: user.auth_session_id,
        activeWarehouseId: user.active_warehouse_id,
        userName: user.name,
      });
      setMessage(
        'Dữ liệu và bộ đếm hiện tại lấy từ API DEV. Phần ghi/receipt S03–S04 cần máy NFC thật.',
      );
      setPhase('ready');
    } catch (error) {
      setMessage(toAppError(error).message);
    }
  };
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 494, height: 950 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ErrorBoundary>
        <ThemeProvider>
          {phase === 'login' ? (
            <LoginScreen onSuccess={() => void hydrate()} />
          ) : phase === 'ready' ? (
            <P07NativeFlow
              key={revision}
              onBack={() => setRevision(n => n + 1)}
              onSelectTab={() =>
                setMessage(
                  'Điều hướng ngoài P07 chưa nằm trong entry nghiệm thu đọc; mở app chính để tiếp tục.',
                )
              }
            />
          ) : (
            <div style={{ padding: 24, font: '18px/1.5 Arial' }} role="status">
              {message}
            </div>
          )}
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
function Outer() {
  const [phase, setPhase] = useState('login'),
    [message, setMessage] = useState('');
  const frame = React.useRef<HTMLIFrameElement>(null),
    records = React.useRef<unknown[]>([]);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== frame.current?.contentWindow ||
        e.data?.kind !== 'P07_LIVE_READ_META'
      )
        return;
      if (Array.isArray(e.data.records)) records.current = e.data.records;
      if (typeof e.data.message === 'string') setMessage(e.data.message);
      if (typeof e.data.phase === 'string') setPhase(e.data.phase);
    };
    addEventListener('message', receive);
    return () => removeEventListener('message', receive);
  }, []);
  const command = (kind: string) =>
    frame.current?.contentWindow?.postMessage({ kind }, location.origin);
  return (
    <div style={{ font: '16px/1.5 Arial', padding: 16, color: '#123b54' }}>
      <p>
        <strong>P07 · API DEV thật · Chỉ đọc</strong>
        <br />
        Đích cố định: khohoanamdev.lptech.info.vn. Token chỉ trong bộ nhớ; không
        dữ liệu mẫu, không prepare/PATCH/ghi chip trong browser.
      </p>
      <p role="status">
        {message ||
          'Đăng nhập trực tiếp bằng tài khoản DEV được phép. Không gửi mật khẩu/token vào chat.'}
      </p>
      {phase === 'context' && (
        <button onClick={() => command('P07_LIVE_READ_CONTEXT')}>
          Đọc lại phiên
        </button>
      )}
      {phase === 'ready' && (
        <button onClick={() => command('P07_LIVE_READ_RELOAD')}>
          Mở lại P07 từ nguồn thật
        </button>
      )}{' '}
      <button
        onClick={() => {
          const blob = new Blob(
            [
              JSON.stringify(
                { mode: 'LIVE_DEV_READ_ONLY', records: records.current },
                null,
                2,
              ),
            ],
            { type: 'application/json' },
          );
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'p07-api-read-evidence.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }}
      >
        Tải log API đã che token
      </button>
      <iframe
        ref={frame}
        title="P07 API app"
        src="?embedded=1"
        style={{
          width: 494,
          maxWidth: '100%',
          height: 950,
          display: 'block',
          margin: '16px auto',
          border: 0,
          borderRadius: 24,
          boxShadow: '0 8px 28px #c8dce8',
        }}
      />
    </div>
  );
}
if (embedded) {
  document.documentElement.style.height = '100%';
  document.body.style.cssText = 'margin:0;height:100%;background:#fcfeff';
  document.getElementById('root')!.style.cssText =
    'height:100%;display:flex;flex-direction:column';
}
createRoot(document.getElementById('root')!).render(
  embedded ? <Review /> : <Outer />,
);
