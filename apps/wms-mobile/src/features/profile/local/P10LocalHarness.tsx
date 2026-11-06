import {HN_UI} from '../../../theme/uiKitV3';
/** Opt-in local audit uses actual native components/decoders. Never imported by AppShell. */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { ErrorBoundary } from '../../../errors/ErrorBoundary';
function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>{children}</ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
import { ProfileScreen, type ProfilePanel } from '../ProfileScreen';
import { requestProfileNavigation } from '../profileNavigation';
import { BottomNav } from '../../../ui/BottomNav';
import { Text } from '../../../ui/Text';
import { AppError } from '../../../errors/AppError';
import { clearSession, setSession } from '../../../auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../../../storage/storage';
import {
  fetchCurrentProfile,
  updateCurrentProfile,
  changeProfilePassword,
  fetchProfileSessions,
  revokeProfileSession,
} from '../../../services/wms/profile';
import {
  decodePasswordChangeResult,
  clearSecurityResultNotice,
} from '../../../services/wms/security';
import { P11PasswordResultScreen } from '../P11SecurityScreens';
import {
  profileResponse,
  authResponse,
  sessionsResponse,
  revokeResponse,
  USER_ID,
  FAMILY,
  ROW,
} from './contractFixtures';
import type { ApiResponse, RequestOptions } from '../../../api/client';
export type Scenario =
  | 'default'
  | 'missing'
  | 'long'
  | 'loading'
  | 'read-error'
  | 'save-403'
  | 'save-412'
  | 'save-428'
  | 'save-422'
  | 'save-unknown'
  | 'save-invalid'
  | 'save-busy'
  | 'avatar-error'
  | 'sessions-empty'
  | 'sessions-error'
  | 'password-422'
  | 'password-unknown'
  | 'logout-local';
export const P10_SCENARIOS: readonly Scenario[] = [
  'default',
  'missing',
  'long',
  'loading',
  'read-error',
  'save-403',
  'save-412',
  'save-428',
  'save-422',
  'save-unknown',
  'save-invalid',
  'save-busy',
  'avatar-error',
  'sessions-empty',
  'sessions-error',
  'password-422',
  'password-unknown',
  'logout-local',
];
const WARE = '55555555-5555-4555-8555-555555555555';
let seq = 0;
export interface LocalAudit {
  calls: Array<{
    method: string;
    path: string;
    fields: string[];
    ifMatch?: string;
  }>;
  value: Record<string, unknown>;
  blockedHttp: number;
  saveAttempts: number;
  pendingResolve?: () => void;
  panel: ProfilePanel;
  loggedOut: boolean;
  scenario: Scenario;
}
export let currentAudit: LocalAudit;
function makeLocal(scenario: Scenario) {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  clearSecurityResultNotice();
  setSession({
    accessToken: 'offline-local-' + ++seq,
    userId: USER_ID,
    authSessionId: FAMILY,
    activeWarehouseId: WARE,
    issuedAtMs: Date.UTC(2026, 9, 13, 1),
    userName: 'Minh Anh',
  });
  const response = profileResponse();
  Object.assign(response.data.data, {
    display_name: 'Minh Anh',
    phone: '0901234567',
    email: 'minhanh@hoanam.com',
    warehouse_scope_ids: [WARE],
    active_warehouse_id: WARE,
    warehouse_context: { status: 'READY', error_code: null },
    available_warehouses: [
      { warehouse_id: WARE, name: 'Kho Hoa Nam', status: 'ACTIVE' },
    ],
    roles: [{ role_name: 'Nhân viên kho', role_code: 'WAREHOUSE_STAFF' }],
    permissions: ['inbound.read', 'outbound.read', 'documents.read'],
  });
  if (scenario === 'missing')
    Object.assign(response.data.data, {
      display_name: '',
      phone: null,
      email: null,
      roles: [],
      permissions: [],
      active_warehouse_id: null,
      warehouse_scope_ids: null,
      warehouse_context: {
        status: 'REQUIRED',
        error_code: 'WAREHOUSE_CONTEXT_REQUIRED',
      },
    });
  if (scenario === 'long')
    Object.assign(response.data.data, {
      display_name:
        'Nguyễn Minh Ánh — người phụ trách kho có tên dài và Unicode',
      roles: [
        {
          role_name:
            'Nhân viên quản lý vận hành kho Hoa Nam với vai trò dài nhiều dòng',
        },
      ],
    });
  if (scenario === 'avatar-error')
    (response.data.data as any).avatar_url = 'data:image/png;base64,invalid';
  if (scenario === 'missing')
    setSession({
      accessToken: 'offline-local-' + seq,
      userId: USER_ID,
      authSessionId: FAMILY,
    });
  const audit: LocalAudit = {
    calls: [],
    value: response.data.data,
    blockedHttp: 0,
    saveAttempts: 0,
    panel: 'S01',
    loggedOut: false,
    scenario,
  };
  currentAudit = audit;
  let readAttempts=0;
  const request = async <T,>(o: RequestOptions): Promise<ApiResponse<T>> => {
    audit.calls.push({
      method: o.method ?? 'GET',
      path: o.path,
      fields: Object.keys((o.body ?? {}) as object),
      ifMatch: o.headers?.['If-Match'],
    });
    if (o.path === '/api/v1/auth/me' && (!o.method || o.method === 'GET')) {
      if (scenario === 'loading')
        await new Promise<void>(r => {
          audit.pendingResolve = r;
        });
      if (scenario === 'read-error' && readAttempts++===0)
        throw new AppError({
          kind: 'network',
          message: 'Nguồn local tạm không đọc được.',
        });
      return {
        ...response,
        header: (n: string) =>
          n.toLowerCase() === 'etag'
            ? '"' + audit.value.version + '"'
            : undefined,
      } as unknown as ApiResponse<T>;
    }
    if (o.path === '/api/v1/auth/me' && o.method === 'PATCH') {
      audit.saveAttempts++;
      if (scenario === 'save-busy')
        await new Promise<void>(r => {
          audit.pendingResolve = r;
        });
      const code = {
        'save-403': 403,
        'save-412': 412,
        'save-428': 428,
        'save-422': 422,
      }[scenario as string];
      if (code)
        throw new AppError({
          kind: 'http',
          status: code,
          code:
            code === 412
              ? 'STALE_VERSION'
              : code === 428
              ? 'PRECONDITION_REQUIRED'
              : 'VALIDATION_ERROR',
          message: 'Nguồn local từ chối yêu cầu.',
          ...(code === 422
            ? { fieldErrors: { phone: ['Số điện thoại không hợp lệ.'] } }
            : {}),
        });
      if (scenario === 'save-unknown')
        throw new AppError({
          kind: 'timeout',
          message: 'Không nhận được phản hồi.',
        });
      const expected = '"' + audit.value.version + '"';
      if (o.headers?.['If-Match'] !== expected)
        throw new AppError({
          kind: 'http',
          status: 412,
          code: 'STALE_VERSION',
          message: 'Phiên bản đã thay đổi.',
        });
      Object.assign(audit.value, o.body, {
        version: Number(audit.value.version) + 1,
      });
      if (scenario === 'save-invalid')
        return {
          status: 200,
          data: { success: true, data: { user_id: USER_ID } } as T,
        };
      return {
        ...response,
        header: (n: string) =>
          n.toLowerCase() === 'etag'
            ? '"' + audit.value.version + '"'
            : undefined,
      } as unknown as ApiResponse<T>;
    }
    if (o.path === '/api/v1/auth/change-password') {
      if (scenario === 'password-422')
        throw new AppError({
          kind: 'http',
          status: 422,
          code: 'CURRENT_PASSWORD_INCORRECT',
          message: 'Mật khẩu hiện tại không đúng.',
          fieldErrors: { current_password: ['Mật khẩu hiện tại không đúng.'] },
        });
      if (scenario === 'password-unknown')
        throw new AppError({ kind: 'timeout', message: 'Không có phản hồi.' });
      return authResponse('password') as unknown as ApiResponse<T>;
    }
    if (o.path === '/api/v1/auth/sessions') {
      if (scenario === 'sessions-error')
        throw new AppError({
          kind: 'network',
          message: 'Không đọc được danh sách phiên local.',
        });
      const page = sessionsResponse();
      page.data.data =
        scenario === 'sessions-empty'
          ? []
          : [
              {
                ...page.data.data[0],
                id: FAMILY,
                auth_session_id: FAMILY,
                session_id: FAMILY,
                is_current: true,
                can_revoke: false,
              },
              { ...page.data.data[0] },
            ];
      Object.assign(page.data.meta, {
        total: page.data.data.length,
        last_page: 1,
        per_page: 20,
        from: page.data.data.length ? 1 : null,
        to: page.data.data.length || null,
      });
      return page as unknown as ApiResponse<T>;
    }
    if (o.method === 'DELETE' && o.path === '/api/v1/auth/sessions/' + ROW)
      return revokeResponse() as unknown as ApiResponse<T>;
    throw Error('Local runner refuses undeclared route: ' + o.path);
  };
  return {
    audit,
    fetchUser: () => fetchCurrentProfile({ request }),
    updateProfileFn: (
      input: Parameters<typeof updateCurrentProfile>[0],
      snapshot: Parameters<typeof updateCurrentProfile>[1],
    ) => updateCurrentProfile(input, snapshot, { request }),
    changePasswordFn: (
      input: Parameters<typeof changeProfilePassword>[0],
      deps: Parameters<typeof changeProfilePassword>[1],
    ) =>
      changeProfilePassword(input, {
        ...deps,
        request,
        clearLocalSession: async () => clearSession(),
      }),
    fetchSessionsFn: (_deps: unknown = {}, page = 1, per = 20) =>
      fetchProfileSessions({ request }, page, per),
    revokeSessionFn: (target: Parameters<typeof revokeProfileSession>[0]) =>
      revokeProfileSession(target, { request }),
    logoutFn: async () => {
      audit.loggedOut = true;
      clearSession();
    },
  };
}
export function P10LocalHarness({
  scenario = 'default',
  onAudit,
  Screen = ProfileScreen,
}: {
  scenario?: Scenario;
  onAudit?: (audit: LocalAudit) => void;
  Screen?: typeof ProfileScreen;
}) {
  const service = useMemo(() => makeLocal(scenario), [scenario]),
    [editor, setEditor] = useState(false),
    [tab, setTab] = useState('profile'),
    [loggedOut, setLoggedOut] = useState(false),
    [result, setResult] = useState(false);
  useEffect(() => {
    onAudit?.(service.audit);
    setLoggedOut(false);
    setResult(false);
    setTab('profile');
    setEditor(false);
  }, [service, onAudit]);
  const handlePanel = useCallback(
    (p: ProfilePanel) => {
      service.audit.panel = p;
    },
    [service],
  );
  return (
    <AppProviders>
      <View
        testID="p10-local-app"
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          backgroundColor: HN_UI.surface,
        }}
      >
        {loggedOut ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
            <Text>Đăng nhập · phiên local đã đóng</Text>
            <Text>Bản nháp local vẫn được cách ly theo phiên.</Text>
          </View>
        ) : result ? (
          <P11PasswordResultScreen
            result={decodePasswordChangeResult(authResponse('password'))}
            onContinue={() => {
              setLoggedOut(true);
              setResult(false);
            }}
          />
        ) : tab !== 'profile' ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
            <Text>
              {tab === 'home' ? 'Trang chủ local' : 'Dependency local'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Về Cá nhân"
              onPress={() => setTab('profile')}
            >
              <Text>Về Cá nhân</Text>
            </Pressable>
          </View>
        ) : (
          <Screen
            {...service}
            onPanelChange={handlePanel}
            onEditorChange={setEditor}
            onLoggedOut={() => setLoggedOut(true)}
            changePasswordFn={async (input, deps) => {
              const r = await service.changePasswordFn(input, deps);
              setResult(true);
              return r;
            }}
          />
        )}
        {!editor && !loggedOut && !result ? (
          <BottomNav
            activeKey={tab}
            onSelect={key => {
              if (key !== tab) requestProfileNavigation(() => setTab(key));
            }}
          />
        ) : null}
      </View>
    </AppProviders>
  );
}
