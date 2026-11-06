/** Opt-in offline review only. Not imported by index.js or AppShell. */
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ErrorBoundary } from '../errors/ErrorBoundary';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../features/auth/SessionConfirmationScreen';
import { AppError } from '../errors/AppError';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import type { CurrentUser } from '../services/wms/types';
import type { WorkShift } from '../services/wms/workShift';
import './global.css';

setAppStorageForTesting(createStorage(createMemoryBackend()));
let forbiddenNetwork = 0;
window.fetch = async () => {
  forbiddenNetwork++;
  throw new Error('P01 offline review forbids HTTP');
};
const warehouseId = '11111111-1111-4111-8111-111111111111';
const user: CurrentUser = {
  id: 'fixture-actor',
  auth_session_id: 'fixture-session',
  name: 'Minh Anh',
  role: 'Nhân viên kho',
  active_warehouse_id: warehouseId,
  warehouse_context: { status: 'READY' },
};
const readyShift: WorkShift = {
  shift_id: 'fixture-shift',
  actor_id: 'fixture-actor',
  auth_session_id: 'fixture-session',
  warehouse_id: warehouseId,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-13T08:00:00+07:00',
};
const never = <T,>() => new Promise<T>(() => {});
const scenarios = [
  'idle',
  'valid',
  'credentials',
  'network',
  'timeout',
  'denied',
  'parse',
  'loading',
  'submitting',
  'existing-shift',
  'mismatched-shift',
  'missing-context',
  'single-warehouse',
  'multiple-warehouses',
  'stopped',
  'warehouse-unknown',
  'other-user',
  'long',
  'start-unknown',
  'start-403',
  'start-422',
  'start-network-reconciled',
  'expired',
];
function Review() {
  const initial = new URLSearchParams(location.search);
  const [panel, setPanel] = useState(initial.get('panel') ?? 'S01');
  const [scenario, setScenario] = useState(initial.get('scenario') ?? 'idle');
  const [size, setSize] = useState(Number(initial.get('width') ?? 494));
  const [epoch, setEpoch] = useState(0);
  const [event, setEvent] = useState('');
  const deps = useMemo(() => {
    const counts = {
      login: 0,
      me: 0,
      current: 0,
      start: 0,
      context: 0,
      logout: 0,
    };
    const selectedUser =
      scenario === 'other-user'
        ? { ...user, name: 'Lan Nguyễn', role: 'Giám sát kho' }
        : scenario === 'long'
        ? {
            ...user,
            name: 'Nguyễn Thị Minh Anh Quản lý vận hành',
            role: 'Giám sát hoạt động và kiểm soát vận hành',
          }
        : { ...user };
    let fixtureUser: CurrentUser = selectedUser;
    if (
      ['missing-context', 'single-warehouse', 'multiple-warehouses'].includes(
        scenario,
      )
    )
      fixtureUser = {
        ...fixtureUser,
        active_warehouse_id: null,
        warehouse_context: { status: 'REQUIRED' },
        available_warehouses:
          scenario === 'missing-context'
            ? []
            : [
                {
                  warehouse_id: warehouseId,
                  name: 'Kho Hoa Nam',
                  status: 'ACTIVE',
                },
                ...(scenario === 'multiple-warehouses'
                  ? [
                      {
                        warehouse_id: '22222222-2222-4222-8222-222222222222',
                        name: 'Kho khác',
                        status: 'ACTIVE',
                      },
                    ]
                  : []),
              ],
      };
    const error = () =>
      new AppError({
        kind:
          scenario === 'network'
            ? 'network'
            : scenario === 'timeout'
            ? 'timeout'
            : scenario === 'parse'
            ? 'parse'
            : scenario === 'expired'
            ? 'auth'
            : 'http',
        status:
          scenario === 'denied'
            ? 403
            : scenario === 'expired'
            ? 401
            : undefined,
        message: 'Lỗi fixture đã chọn',
      });
    return {
      fixtureEpoch: epoch,
      counts,
      fetchUser: async () => {
        counts.me++;
        if (scenario === 'loading') return never<CurrentUser>();
        if (
          ['network', 'timeout', 'denied', 'parse', 'expired'].includes(
            scenario,
          )
        )
          throw error();
        return fixtureUser;
      },
      fetchShift: async () => {
        counts.current++;
        if (
          scenario === 'existing-shift' ||
          (scenario === 'start-network-reconciled' && counts.start)
        )
          return readyShift;
        if (scenario === 'mismatched-shift')
          return { ...readyShift, auth_session_id: 'wrong-session' };
        if (scenario === 'start-unknown' && counts.start)
          throw new AppError({
            kind: 'network',
            message: 'Current fixture offline',
          });
        return null;
      },
      fetchWarehouses: async () => {
        if (scenario === 'warehouse-unknown')
          throw new AppError({
            kind: 'network',
            message: 'Catalogue fixture offline',
          });
        return {
          items: [
            {
              id: warehouseId,
              name:
                scenario === 'long'
                  ? 'Kho tổng Hoa Nam - Khu vực vận hành và lưu trữ trung tâm'
                  : 'Kho Hoa Nam',
              status: scenario === 'stopped' ? 'INACTIVE' : 'ACTIVE',
            },
          ],
        };
      },
      switchContext: async () => {
        counts.context++;
        fixtureUser = {
          ...fixtureUser,
          active_warehouse_id: warehouseId,
          warehouse_context: { status: 'READY' },
        };
        return fixtureUser;
      },
      startShift: async () => {
        counts.start++;
        if (scenario === 'submitting') return never<WorkShift>();
        if (
          scenario === 'start-unknown' ||
          scenario === 'start-network-reconciled'
        )
          throw new AppError({
            kind: 'timeout',
            message: 'Start fixture timeout',
          });
        if (scenario === 'start-403' || scenario === 'start-422')
          throw new AppError({
            kind: 'http',
            status: scenario === 'start-403' ? 403 : 422,
            message: 'Start fixture rejected',
          });
        return readyShift;
      },
      logoutFn: async () => {
        counts.logout++;
      },
      loginFn: async () => {
        counts.login++;
        if (scenario === 'submitting') return never<{ accessToken: string }>();
        if (scenario === 'credentials')
          throw new AppError({
            kind: 'auth',
            status: 401,
            message: 'Sai tài khoản hoặc mật khẩu.',
          });
        if (['network', 'timeout', 'denied', 'parse'].includes(scenario))
          throw error();
        setPanel('S02');
        setEvent('Login fixture resolved; không API');
        return { accessToken: 'fixture-only-no-network' };
      },
    };
  }, [scenario, epoch]);
  return (
    <>
      {initial.get('pure') !== '1' ? (
        <aside
          style={{ fontFamily: 'Arial', padding: 10, background: '#e5eff4' }}
        >
          <strong>
            P01 native components · OFFLINE FIXTURE ONLY · không API/ca thật
          </strong>
          <br />
          <label>
            Panel{' '}
            <select
              aria-label="Panel"
              value={panel}
              onChange={e => {
                setPanel(e.target.value);
                setEvent('');
                setEpoch(n => n + 1);
              }}
            >
              <option>S01</option>
              <option>S02</option>
            </select>
          </label>{' '}
          <label>
            Trạng thái{' '}
            <select
              aria-label="Trạng thái"
              value={scenario}
              onChange={e => {
                setScenario(e.target.value);
                setEvent('');
                setEpoch(n => n + 1);
              }}
            >
              {scenarios.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>{' '}
          <label>
            Khung{' '}
            <select
              aria-label="Khung"
              value={size}
              onChange={e => setSize(Number(e.target.value))}
            >
              {[320, 360, 411, 438, 494].map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>{' '}
          <button
            onClick={() => {
              setEpoch(n => n + 1);
              setEvent('');
            }}
          >
            Reset fixture
          </button>
          <output id="p01-result" aria-live="polite">
            {event}
          </output>
          <p id="p01-counts">
            {JSON.stringify({ ...deps.counts, forbiddenNetwork })}
          </p>
        </aside>
      ) : null}
      <main
        id="p01-review"
        data-panel={panel}
        data-scenario={scenario}
        style={{
          width: size,
          maxWidth: '100%',
          height: Number(initial.get('height') ?? 950),
          margin: 'auto',
          display: 'flex',
        }}
      >
        <SafeAreaProvider>
          <ErrorBoundary>
            <ThemeProvider>
              {panel === 'S01' ? (
                <LoginScreen
                  key={'login' + epoch + scenario}
                  loginFn={deps.loginFn}
                  onForgotPassword={() =>
                    setEvent('P14 boundary — không gửi reset')
                  }
                />
              ) : (
                <SessionConfirmationScreen
                  key={'confirm' + epoch + scenario}
                  {...deps}
                  contextEnabled
                  onContinue={() =>
                    setEvent('Home boundary — fixture receipt hợp lệ')
                  }
                  onLoggedOut={() => {
                    setPanel('S01');
                    setEvent('Logout fixture local — không revoke thật');
                  }}
                />
              )}
            </ThemeProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
