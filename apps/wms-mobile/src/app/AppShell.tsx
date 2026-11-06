import {
  P12Screen,
  type OwnerIntent,
} from '../features/documents/p12/P12Screen';
import { type State as P12State } from '../features/documents/p12/controller';
import { p04Seed } from '../features/documents/p12/contract';
import { requestProfileNavigation } from '../features/profile/profileNavigation';
import { OwnerHandoffHost } from './OwnerHandoffHost';
import { p12CanCreate } from '../features/documents/p12/service';
import {useNotificationDelivery} from '../features/notifications/delivery/useNotificationDelivery';
import { createP09Service } from '../services/wms/p09Warranty';
import {
  readP09Product,
  p09CatalogReadBridge,
} from '../features/warranty/p09ProductRead';
import { subscribeP09IssuedQrRead } from '../features/warranty/p09IssuedQrRead';
import { P09_RELEASE, p09DevReadEnabled } from '../config/p09Release';
import { P09Boundary } from '../features/warranty/P09Support';
import {
  ownerUuid,
  type ReadOwnerRoute,
  type OwnerDocumentTarget,
} from './ownerNavigation';
import { captureSessionScope } from '../auth/session';
import { getAuthSessionNotice, clearAuthSessionNotice } from '../auth/session';
import { useForegroundSessionCheck } from '../auth/useForegroundSessionCheck';
import type { P13Retained } from '../features/notifications/P13NotificationsScreen';
import type { P21Retained } from '../features/warranty/P21ResumeScreen';
/**
 * Khung ứng dụng — quyết định hiện màn đăng nhập hay khung có thanh tab.
 *
 * ## Năm tab cho nhân viên quét
 *
 * App chỉ quét và gửi phiếu. Duyệt/Ghi sổ tồn kho thuộc Web WMS, nên App không
 * có tab thao tác Post trên thiết bị quét. Tab Chứng từ chỉ để xem danh
 * sách/chi tiết có thật, không duyệt hoặc ghi sổ.
 *
 * Suốt đợt 1–4 thanh tab chỉ hiện tab đã dựng, vì nguyên tắc #4 của Prompt 4 cấm
 * *"màn hình demo để thay thế"* — một tab bấm vào ra màn trống đúng là thứ đó,
 * và tệ hơn: thủ kho tưởng chức năng **hỏng** chứ không phải **chưa làm**.
 *
 * Tab *Quét mã* mở màn **Tra cứu**, đúng như ảnh 13–17: quét ở đây chỉ để tra
 * cứu, **không** ghi gì. Quét để nhập/xuất đi qua ô tương ứng ở trang chủ.
 *
 * ## Preflight môi trường khi mở app
 *
 * 🔒 Mục 2 của luồng bắt buộc (2026-09-06): gọi `GET /api/v1/health` và chỉ bật
 * quét khi header `X-WMS-Deployment-Tier` khớp bản dựng. Chạy ở đây — **một
 * lần, sớm nhất có thể** — thay vì để từng màn tự hỏi: nhiều request có thể
 * đi tới nhiều kết luận khác nhau.
 *
 * ## Khôi phục phiên khi mở app
 *
 * `recoverAfterRestart()` chạy **trước** khi quyết định hiện màn nào: nếu app bị
 * kill giữa lúc đang gia hạn token, phiên cũ không dùng lại được và người dùng
 * phải đăng nhập lại một lần (xem `auth/tokenRefresh.ts`).
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { recoverableLazy as lazy } from '../errors/recoverableLazy';
import { ErrorBoundary } from '../errors/ErrorBoundary';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { BottomNav, type BottomNavItem } from '../ui/BottomNav';
import { LoginScreen } from '../features/auth/LoginScreen';
import {
  getSecurityResultNotice,
  subscribeSecurityResultNotice,
  clearSecurityResultNotice,
  forcedPasswordBootstrapContext,
} from '../services/wms/security';
import {
  P11PasswordResultScreen,
  P11PasswordScreen,
} from '../features/profile/P11SecurityScreens';
import { SessionConfirmationScreen } from '../features/auth/SessionConfirmationScreen';
import {
  getShiftState,
  subscribeShiftState,
  resetShiftState,
  publishShiftState,
  currentShiftOwner,
} from '../shift/shiftState';
import { createP14ShiftService } from '../shift/p14ShiftService';
import { readShiftLocalOwners } from '../shift/localOwners';
import { registerNativeP14Owners } from '../shift/nativeOwnerEvidence';
import { loadP14DraftOverview } from '../shift/p14DraftOverview';
import { logout } from '../services/wms/auth';
import {
  LogoutProgressScreen,
  SessionExpiredScreen,
} from '../features/auth/StatusScreen';
import { HomeScreen, type HomeTaskKey } from '../features/home/HomeScreen';
import { useHardwareBack } from './useHardwareBack';
import type { CurrentUser, WarrantyCase } from '../services/wms/types';
import type { P19LocalDraftChoice } from '../features/warranty/p19/p19LocalDrafts';
import type { HistoryViewState } from '../features/history/HistoryScreen';
import type { P08State } from '../features/history/p08HistoryController';
import type { P08Context } from '../services/wms/p08Types';
import {
  createP08History,
  type P08HistoryService,
} from '../services/wms/p08History';
import type { P06ViewState } from '../features/lookup/p06LookupFlow';
import { NotFoundScreen } from '../features/auth/StatusScreen';
import {
  getSession,
  hydrateSession,
  clearPersistedSession,
  subscribeSession,
  updateSessionIdentity,
  type Session,
} from '../auth/session';
import { fetchCurrentUser } from '../services/wms/queries';
import { recoverAfterRestart } from '../auth/tokenRefresh';
import {
  checkDeploymentTier,
  getLastTierCheck,
} from '../services/wms/tierCheck';
import { getCurrentEnvironment } from '../config/env';
import { type WorkShift } from '../services/wms/workShift';
import {
  subscribeLogoutOutcome,
  type LogoutOutcome,
} from '../services/wms/auth';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Board 02 đã chốt năm tab, gồm lối vào Chứng từ riêng. */
const IMPLEMENTED_TABS: readonly BottomNavItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home' },
  { key: 'documents', label: 'Chứng từ', icon: 'approvals' },
  { key: 'scan', label: 'Quét mã', icon: 'scan' },
  { key: 'history', label: 'Lịch sử', icon: 'history' },
  { key: 'profile', label: 'Cá nhân', icon: 'profile' },
];

/**
 * Tải các màn chỉ dùng sau thao tác của thủ kho theo nhu cầu.
 *
 * AppShell từng import toàn bộ 14 luồng ngay lúc mở app, làm bundle Home lớn
 * và kéo dài thời gian interactive trên PDA. Màn đăng nhập, xác nhận phiên và
 * Home vẫn được tải ngay; các luồng quét/phiếu/lịch sử được lấy đúng lúc mở.
 */
const InboundFlow = lazy(async () => {
  const module = await import('../features/inbound/P04NativeFlow');
  return { default: module.P04NativeFlow };
});
let outboundFlowModule:
  | Promise<typeof import('../features/outbound/P05NativeFlow')>
  | undefined;
const loadOutboundFlowModule = () => {
  if (!outboundFlowModule)
    outboundFlowModule = import('../features/outbound/P05NativeFlow').catch(
      error => {
        outboundFlowModule = undefined;
        throw error;
      },
    );
  return outboundFlowModule;
};
const OutboundFlow = lazy(async () => {
  const module = await loadOutboundFlowModule();
  return { default: module.P05NativeFlow };
});

const WarrantyListScreen = lazy(async () => {
  const module = await import('../features/warranty/WarrantyListScreen');
  return { default: module.WarrantyListScreen };
});
const WarrantyIntakeScreen = lazy(async () => {
  const module = await import('../features/warranty/WarrantyIntakeScreen');
  return { default: module.WarrantyIntakeScreen };
});
const WarrantyCaseDetail = lazy(async () => {
  const module = await import('../features/warranty/WarrantyCaseDetail');
  return { default: module.WarrantyCaseDetail };
});
const P19EntryScreen = lazy(async () => {
  const module = await import('../features/warranty/p19/P19EntryScreen');
  return { default: module.P19EntryScreen };
});
const P20HistoryScreen = lazy(async () => ({
  default: (await import('../features/warranty/P20HistoryScreen'))
    .P20HistoryScreen,
}));
const P13NotificationsScreen = lazy(async () => ({
  default: (await import('../features/notifications/P13NotificationsScreen'))
    .P13NotificationsScreen,
}));
const P13WebQueueScreen = lazy(async () => ({
  default: (await import('../features/notifications/P13WebQueueScreen'))
    .P13WebQueueScreen,
}));
const P18BoxesScreen = lazy(async () => ({
  default: (await import('../features/warehouse/P18BoxesScreen'))
    .P18BoxesScreen,
}));
const P18LocationScreen = lazy(async () => ({
  default: (await import('../features/warehouse/P18LocationScreen'))
    .P18LocationScreen,
}));
const HistoryHubScreen = lazy(async () => ({
  default: (await import('../features/history/HistoryHubScreen'))
    .HistoryHubScreen,
}));
const P22NfcHistoryScreen = lazy(async () => ({
  default: (await import('../features/history/P22NfcHistoryScreen'))
    .P22NfcHistoryScreen,
}));
const P21ResumeScreen = lazy(async () => ({
  default: (await import('../features/warranty/P21ResumeScreen'))
    .P21ResumeScreen,
}));
const P23WarrantySessionsScreen = lazy(async () => ({
  default: (await import('../features/history/P23WarrantySessionsScreen'))
    .P23WarrantySessionsScreen,
}));
const BusinessScanScreen = lazy(async () => {
  const module = await import('../features/scan/BusinessScanScreen');
  return { default: module.BusinessScanScreen };
});
const P08HistoryScreen = lazy(async () => {
  const module = await import('../features/history/P08HistoryScreen');
  return { default: module.P08HistoryScreen };
});
const LookupScreen = lazy(async () => {
  const module = await import('../features/lookup/P06LookupScreen');
  return { default: module.P06LookupScreen };
});
const ScanTaskPickerScreen = lazy(async () => {
  const module = await import('../features/scan/ScanTaskPickerScreen');
  return { default: module.ScanTaskPickerScreen };
});
const NfcAssignmentScreen = lazy(async () => {
  const module = await import('../features/nfc/NfcAssignmentScreen');
  return { default: module.NfcAssignmentScreen };
});
const NfcLookupScreen = lazy(async () => {
  const module = await import('../features/nfc/NfcLookupScreen');
  return { default: module.NfcLookupScreen };
});
const NfcTagListScreen = lazy(async () => {
  const module = await import('../features/nfc/NfcTagListScreen');
  return { default: module.NfcTagListScreen };
});
const ProfileScreen = lazy(async () => {
  const module = await import('../features/profile/ProfileScreen');
  return { default: module.ProfileScreen };
});
const P14ShiftScreen = lazy(async () => {
  const module = await import('../features/auth/P14ShiftScreen');
  return { default: module.P14ShiftScreen };
});
const ForgotPasswordFlow = lazy(async () => {
  const module = await import('../features/auth/ForgotPasswordFlow');
  return { default: module.ForgotPasswordFlow };
});

function LazyScreen({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <ErrorBoundary
      resetKey={React.isValidElement(children) ? children.type : undefined}
    >
      <Suspense
        fallback={
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <Text variant="caption" tone="muted">
              Đang mở màn hình…
            </Text>
          </View>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/** Nội dung từng tab. Tab lạ rơi vào màn fallback của ảnh 47, không màn trắng. */
function renderTab(
  key: string,
  handlers: {
    onEndShift: (user: CurrentUser | undefined) => void;
    onLoggedOut: () => void;
    onLogoutStarted: () => void;
    onProfileEditorChange: (editing: boolean) => void;
    onPasswordFormActiveChange: (active: boolean) => void;
    footerNavigation?: React.ReactNode;
    onSelectTask: (task: HomeTaskKey) => void;
    onHome: () => void;
    onOpenDocuments: () => void;
    onOpenDocument: (
      kind: 'inbound' | 'outbound' | 'warranty',
      documentId: string,
    ) => void;
    onOpenProfile: () => void;
    onOpenReadOwner: (route: ReadOwnerRoute) => void;
    onLookupNfc: () => void;
    onSelectTab: (key: string) => void;
    onScanLookup: () => void;
    confirmedShift?: WorkShift;
    sessionKey?: string;
    userName?: string;
    avatarUrl?: string;
    historyCacheScope?: string;
    historyViewState?: HistoryViewState;
    p08Context: P08Context;
    p08State: { current: P08State | undefined };
    p08Service: P08HistoryService;
    onHistoryBack: () => void;
    onHistoryViewStateChange: (state: HistoryViewState) => void;
    documentsViewState?: HistoryViewState;
    p12State: { current?: P12State };
    onP12Owner: (intent: OwnerIntent) => void;
    onDocumentsCreateMode: (active: boolean) => void;
    onDocumentsScannerMode: (active: boolean) => void;
    documentsRootRequest?: number;
    onDocumentsRootHandled: (id: number) => void;
    onIdentityResolved: (user: CurrentUser) => void;
    onConfirmSession: () => void;
    onDocumentsViewStateChange: (state: HistoryViewState) => void;
    warehouseId?: string;
    onOpenPendingDocuments: (kind: 'inbound' | 'outbound') => void;
    onOpenWarrantyList: (status: string) => void;
    homeQueue?: {
      source: 'inbound' | 'outbound' | 'warranty';
      key: string;
      status?: string;
    };
    homeView: { scrollY: number };
  },
): React.ReactElement {
  switch (key) {
    case 'documents':
      return (
        <P12Screen
          onCreateModeChange={handlers.onDocumentsCreateMode}
          onScannerModeChange={handlers.onDocumentsScannerMode}
          rootRequest={handlers.documentsRootRequest}
          onRootRequestHandled={handlers.onDocumentsRootHandled}
          retained={handlers.p12State}
          initialQueue={handlers.homeQueue}
          user={handlers.p08Context.user}
          onIdentity={handlers.onIdentityResolved}
          onBack={handlers.onHome}
          onOwnerIntent={handlers.onP12Owner}
        />
      );
    case 'scan':
      return (
        <ScanTaskPickerScreen
          key={handlers.sessionKey}
          onSelect={handlers.onSelectTask}
          onHome={handlers.onHome}
          onLookupNfc={handlers.onLookupNfc}
          onSelectTab={handlers.onSelectTab}
          onConfirmSession={handlers.onConfirmSession}
        />
      );
    case 'history':
      return (
        <HistoryHubScreen
          footer={handlers.footerNavigation}
          onOpen={handlers.onOpenReadOwner}
          onBack={handlers.onHistoryBack}
          warehouseName={
            handlers.p08Context.user?.available_warehouses?.find(
              w =>
                w.warehouse_id ===
                handlers.p08Context.session?.activeWarehouseId,
            )?.name
          }
        />
      );
    case 'profile':
      return (
        <ProfileScreen
          onEndShift={handlers.onEndShift}
          onBack={handlers.onHome}
          onLogoutStarted={handlers.onLogoutStarted}
          onLoggedOut={handlers.onLoggedOut}
          onEditorChange={handlers.onProfileEditorChange}
          onPasswordFormActiveChange={handlers.onPasswordFormActiveChange}
        />
      );
    case 'home':
      return (
        <HomeScreen
          systemFooter={handlers.footerNavigation}
          viewState={handlers.homeView}
          confirmedShift={handlers.confirmedShift}
          sessionKey={handlers.sessionKey}
          userName={handlers.userName}
          avatarUrl={handlers.avatarUrl}
          onSelectTask={handlers.onSelectTask}
          onChooseTask={() => handlers.onSelectTab('scan')}
          onSeeAll={handlers.onOpenDocuments}
          onOpenDocument={handlers.onOpenDocument}
          onOpenWarrantyCase={id => handlers.onOpenDocument('warranty', id)}
          onOpenComponentResume={() =>
            handlers.onOpenReadOwner({ owner: 'P21' })
          }
          onOpenProfile={handlers.onOpenProfile}
          onOpenNotifications={() => handlers.onOpenReadOwner({ owner: 'P13' })}
          onOpenPendingDocuments={handlers.onOpenPendingDocuments}
          onOpenWarrantyList={handlers.onOpenWarrantyList}
          notificationsEnabled
        />
      );
    default:
      // Ảnh 47 — không bao giờ để màn trắng.
      return <NotFoundScreen onHome={handlers.onHome} />;
  }
}

export function AppShell(): React.ReactElement {
  const [readRoute, setReadRoute] = useState<{
    route: ReadOwnerRoute;
    scope: string;
  }>();
  const readStack = useRef<ReadOwnerRoute[]>([]),
    readNavigationBusy = useRef(false),
    p13Retained = useRef<P13Retained>({}),
    p21Retained = useRef<P21Retained>({});
  const [selectedComponentId, setSelectedComponentId] = useState<string>();
  const readScope = () => {
    const s = captureSessionScope();
    return JSON.stringify([
      s.userId,
      s.authSessionId,
      s.warehouseId,
      s.generation,
    ]);
  };
  const scopeBound = <A extends unknown[]>(action: (...args: A) => void) => {
    const expected = readScope();
    return (...args: A) => {
      if (expected === readScope()) action(...args);
    };
  };
  const openReadOwner = (route: ReadOwnerRoute) => {
    if (readNavigationBusy.current) return;
    if (readRoute?.scope === readScope()) {
      if (JSON.stringify(readRoute.route) === JSON.stringify(route)) return;
      readStack.current.push(readRoute.route);
    } else readStack.current = [];
    readNavigationBusy.current = true;
    setReadRoute({ route, scope: readScope() });
  };
  const closeReadOwner = () => {
    if (readNavigationBusy.current) return;
    readNavigationBusy.current = true;
    const route = readStack.current.pop();
    setReadRoute(route ? { route, scope: readScope() } : undefined);
  };
  useEffect(() => {
    readNavigationBusy.current = false;
  }, [readRoute]);
  const [session, setSessionState] = useState<Session | undefined>(() =>
    getSession(),
  );
  const homeView = useMemo(
    () => ({
      scrollY: 0,
      scope: JSON.stringify([
        session?.userId,
        session?.authSessionId,
        session?.activeWarehouseId,
      ]),
    }),
    [session?.userId, session?.authSessionId, session?.activeWarehouseId],
  );
  const [authSessionNotice, setAuthSessionNotice] =
    useState(getAuthSessionNotice);
  /** Không gửi request có access token cũ trước khi Keystore nạp refresh token. */
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const notificationDelivery=useNotificationDelivery(sessionHydrated&&!!session&&!session.mustChangePassword,id=>openReadOwner({owner:'P13',recipientId:id}));
  const requiredPasswordOwnerMissing =
    session?.mustChangePassword === true &&
    (!session.userId || !session.authSessionId);
  useEffect(() => {
    if (!sessionHydrated || !requiredPasswordOwnerMissing) return;
    clearPersistedSession().catch(() => undefined);
  }, [requiredPasswordOwnerMissing, sessionHydrated]);
  useForegroundSessionCheck(sessionHydrated && session !== undefined);
  const [restoringSavedSession, setRestoringSavedSession] = useState(false);
  /** Bỏ kết quả `/auth/me` của phiên cũ nếu người dùng đổi phiên giữa chừng. */
  const identityRequest = useRef(0);
  const [sharedShift, setSharedShift] = useState(getShiftState);
  const [p14User, setP14User] = useState<CurrentUser | undefined>();
  const p14HistoryReturn = useRef(false);
  const p14ActiveShift = useRef<string | undefined>(undefined);
  // END reconciliation may publish a last shift for the first time. Only a
  // verified ACTIVE shift changes the presentation owner, never END readback.
  if (sharedShift.phase === 'ACTIVE' && sharedShift.shift)
    p14ActiveShift.current = sharedShift.shift.shift_id;
  const p14ShiftKey = p14ActiveShift.current;
  const p14Service = useMemo(
    () =>
      session?.userId && session.authSessionId && session.activeWarehouseId
        ? createP14ShiftService({ readLocal: readShiftLocalOwners })
        : undefined,
    // A new ACTIVE shift needs a new service, even within the same auth family.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      session?.userId,
      session?.authSessionId,
      session?.activeWarehouseId,
      p14ShiftKey,
    ],
  );
  // A new owner service must get a fresh retained view, even with no field read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const p14View = useMemo(() => ({ scrollY: 0 }), [p14Service]);
  const readyShift =
    sharedShift.phase === 'ACTIVE' ? sharedShift.shift : undefined;
  useEffect(
    () => subscribeShiftState(() => setSharedShift(getShiftState())),
    [],
  );
  useEffect(
    () => registerNativeP14Owners(),
    [session?.userId, session?.authSessionId, session?.activeWarehouseId],
  );
  const [p08User, setP08User] = useState<CurrentUser | undefined>();
  const p08State = useRef<P08State | undefined>(undefined);
  const p08ContextRef = useRef<P08Context>({ session, user: p08User });
  p08ContextRef.current = { session, user: p08User };
  const p09Service = useMemo(
    () => createP09Service(() => p08ContextRef.current),
    [],
  );
  const p08Service = useMemo(
    () => createP08History(() => p08ContextRef.current),
    [],
  );
  const [logoutOutcome, setLogoutOutcome] = useState<
    LogoutOutcome | undefined
  >();
  useEffect(() => subscribeLogoutOutcome(setLogoutOutcome), []);
  useEffect(subscribeP09IssuedQrRead, []);
  const [tab, setTab] = useState('home');
  const [profileEditorActive, setProfileEditorActive] = useState(false);
  const [profilePasswordFormActive, setProfilePasswordFormActive] =
    useState(false);
  const [documentsCreateActive, setDocumentsCreateActive] = useState(false);
  const [documentsScannerActive, setDocumentsScannerActive] = useState(false);
  const outboundResultReturn = useRef<string | undefined>(undefined);
  const inboundResultReturn = useRef<string | undefined>(undefined);
  const p14ResumeDraft = useRef<string | undefined>(undefined);
  /** Luồng nghiệp vụ đang mở chồng lên tab. `undefined` = đang ở tab. */
  const [flow, setFlow] = useState<
    | 'inbound'
    | 'outbound'
    | 'warranty'
    | 'warranty-scan'
    | 'warranty-intake'
    | 'warranty-lookup'
    | 'warranty-case'
    | 'warranty-components'
    | 'warranty-component-history'
    | 'nfc-assign'
    | 'nfc-scan'
    | 'nfc-lookup'
    | 'nfc-tags'
    | 'inventory-scan'
    | 'inventory-lookup'
    | 'session-confirmation'
    | 'forgot-password'
    | 'p14-shift'
    | undefined
  >();
  useEffect(() => {
    if (!sessionHydrated || !session || tab !== 'home' || flow !== undefined)
      return;
    loadOutboundFlowModule().catch(() => {
      // Cho phép lượt bấm sau tải lại chunk thay vì giữ promise lỗi vĩnh viễn.
      outboundFlowModule = undefined;
    });
  }, [sessionHydrated, session, tab, flow]);
  /**
   * Mã đang chờ tiếp nhận bảo hành.
   *
   * Máy quét / màn nhập tay **chỉ chuyển mã** — `resolve-code` do luồng tiếp
   * nhận gọi (mô tả 2026-09-06). Giữ ở đây để chuyển giữa hai màn.
   */
  const [warrantyCode, setWarrantyCode] = useState<
    { rawCode: string; tempOnly?: boolean } | undefined
  >();
  const [nfcAssignmentCode, setNfcAssignmentCode] = useState<
    string | undefined
  >();
  const nfcReturnFlow = useRef<'outbound' | undefined>(undefined);
  /** QR/Barcode vừa quét cho luồng kiểm tra tồn, không ghi vào WMS. */
  const [inventoryLookupCode, setInventoryLookupCode] = useState<
    string | undefined
  >();
  // Navigation metadata only, scoped by P06; never cache stock/permissions.
  const lookupViewState = useRef<P06ViewState | undefined>(undefined);
  const warrantyLookupView = useRef<{ scope?: string; view?: P06ViewState }>(
    {},
  );
  useEffect(() => {
    if (flow !== 'warranty-lookup') warrantyLookupView.current = {};
  }, [flow]);
  /**
   * Hồ sơ bảo hành đang mở chi tiết.
   *
   * 🔴 Thêm 2026-09-06: bấm một hồ sơ ở danh sách trước đây **không làm gì** —
   * `onOpenCase` chưa được nối. Nghĩa là toàn bộ màn chi tiết (chuyển trạng
   * thái, timeline, ảnh/video) **không tới được từ trong app**.
   */
  const [openCase, setOpenCase] = useState<WarrantyCase | undefined>();
  const [warrantyCaseCreated, setWarrantyCaseCreated] = useState(false);
  const [caseTabRequest, setCaseTabRequest] = useState<{
    scope: string;
    caseId: string;
    tab: 'info' | 'parts';
  }>();
  const [forcedRelogin, setForcedRelogin] = useState<string | undefined>();
  const [securityResult, setSecurityResult] = useState(getSecurityResultNotice);
  useEffect(() => subscribeSecurityResultNotice(setSecurityResult), []);
  useEffect(() => {
    if (session !== undefined && getSecurityResultNotice())
      clearSecurityResultNotice();
  }, [session]);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  /**
   * Chứng từ đang mở chi tiết, chồng lên tab.
   *
   * 🔴 Thêm 2026-09-06 vì người dùng chỉ ra *"bên duyệt không xem được chi tiết
   * phiếu"*. Mở chồng chứ không đổi tab: bấm Quay lại phải về đúng chỗ đang
   * đứng, không phải về Trang chủ.
   */
  const [openDocument, setOpenDocument] = useState<
    | {
        kind: 'inbound' | 'outbound' | 'warranty';
        id: string;
        tab?: 'events' | 'files';
      }
    | undefined
  >();
  /** Lịch sử và Chứng từ dùng cùng source nhưng giữ bộ lọc/vị trí riêng. */
  const historyViewState = useRef<HistoryViewState | undefined>(undefined);
  const documentsViewState = useRef<HistoryViewState | undefined>(undefined);
  const p12State = useRef<P12State | undefined>(undefined);
  const documentsRootSequence = useRef(0);
  const [documentsRootRequest, setDocumentsRootRequest] = useState<number>();
  const requestDocumentsRoot = () => {
    setDocumentsRootRequest(++documentsRootSequence.current);
    setTab('documents');
  };
  const homeQueue = useRef<
    | {
        source: 'inbound' | 'outbound' | 'warranty';
        key: string;
        status?: string;
      }
    | undefined
  >(undefined);
  const p12OwnerReturn = useRef(false);
  const p12Seed = useRef<
    | {
        supplierId: string | null;
        supplierName?: string;
        note: string;
        docDate?: string;
      }
    | undefined
  >(undefined);
  // Không cache nếu /auth/me chưa xác nhận userId. Key gồm tier build để snapshot
  // DEV không thể được dùng lại khi app đổi target môi trường.
  const historyCacheScope = session?.userId?.trim()
    ? JSON.stringify([
        getCurrentEnvironment().expectedTier,
        session.userId,
        session.authSessionId,
        session.activeWarehouseId,
      ])
    : undefined;

  /**
   * Nút Quay lại của Android — lùi **một lớp**, không đóng app.
   *
   * Trước 2026-09-06 không có handler nào nên Back **đóng hẳn app** ở mọi màn
   * (đo thật: đang xem danh sách bảo hành, bấm Back → về màn hình điện thoại).
   * Xem `useHardwareBack.ts` để biết hậu quả với phiếu đang điền dở.
   *
   * Thứ tự lùi khớp đúng với nút "Quay lại" trên màn hình. Chỉ ở tab gốc mới
   * trả `false` để Android đóng app như bình thường.
   */
  useHardwareBack(() => {
    // Trong 800ms xoá phiên, Back không được quay lại trang có dữ liệu cũ.
    if (logoutInProgress) {
      return true;
    }
    if (openDocument !== undefined) {
      setOpenDocument(undefined);
      return true;
    }
    if (readRoute?.scope === readScope()) {
      closeReadOwner();
      return true;
    }
    // Xác nhận phiên chỉ được rời bằng hai CTA có chủ đích. Back không được
    // bỏ qua nó để nhảy thẳng vào Home sau một đăng nhập mới.
    if (flow === 'session-confirmation') {
      return true;
    }
    if (flow === 'forgot-password') {
      setFlow(undefined);
      return true;
    }
    if (
      flow === 'warranty-components' ||
      flow === 'warranty-component-history'
    ) {
      setFlow('warranty-case');
      return true;
    }
    if (flow === 'warranty-case') {
      setOpenCase(undefined);
      setWarrantyCaseCreated(false);
      setFlow('warranty');
      return true;
    }
    if (flow === 'warranty-lookup') {
      setFlow('warranty-intake');
      return true;
    }
    if (flow === 'warranty-scan' || flow === 'warranty-intake') {
      setWarrantyCode(undefined);
      setFlow('warranty');
      return true;
    }
    if (flow === 'nfc-scan') {
      setFlow('nfc-assign');
      return true;
    }
    if (flow === 'inventory-scan') {
      setFlow('inventory-lookup');
      return true;
    }
    if (flow === 'inventory-lookup') {
      setInventoryLookupCode(undefined);
      lookupViewState.current = undefined;
      setFlow(undefined);
      return true;
    }
    if (flow !== undefined) {
      setFlow(undefined);
      return true;
    }
    if (tab !== 'home') {
      if (tab === 'history' && outboundResultReturn.current) {
        setTab('home');
        setFlow('outbound');
        return true;
      }
      if (tab === 'history' && inboundResultReturn.current) {
        setTab('home');
        setFlow('inbound');
        return true;
      }
      setTab('home');
      return true;
    }
    return false;
  });

  // 🔒 Mục 2 (2026-09-06): preflight tier NGAY khi app mở, không đợi tới lúc
  // vào màn quét. Hỏi sớm thì thủ kho biết ngay là bản cài sai, thay vì phát
  // hiện sau khi đã đi bộ tới kệ hàng và mở camera.
  useEffect(() => {
    if (getLastTierCheck().status === 'unchecked') {
      // Không bao giờ ném — mọi hỏng hóc đã thành một `TierCheckResult`.
      checkDeploymentTier().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const outcome = recoverAfterRestart();
    if (outcome.outcome === 'forced_relogin') {
      setForcedRelogin(outcome.reason);
      setSessionState(undefined);
    }
    let live = true;
    hydrateSession()
      .then(next => {
        if (live && outcome.outcome === 'clean') {
          setSessionState(next);
          // Mỗi lần khôi phục app phải hỏi ca hiện tại. Có ca ACTIVE thì màn
          // xác nhận tự vào Home; data:null giữ người dùng lại để bắt đầu ca.
          if (next !== undefined) {
            setRestoringSavedSession(true);
            setFlow('session-confirmation');
          }
        }
      })
      .catch(() => {
        if (live) setSessionState(undefined);
      })
      .finally(() => {
        if (live) setSessionHydrated(true);
      });
    const unsubscribe = subscribeSession(value => {
      setSessionState(value);
      setAuthSessionNotice(getAuthSessionNotice());
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const handleLoggedIn = useCallback(() => {
    setRestoringSavedSession(false);
    homeQueue.current = undefined;
    resetShiftState();
    setLogoutOutcome(undefined);
    setForcedRelogin(undefined);
    setSessionState(getSession());
    setTab('home');
    setFlow('session-confirmation');
    setOpenDocument(undefined);
    setOpenCase(undefined);
  }, []);

  const handleTask = useCallback((key: HomeTaskKey) => {
    if (getShiftState().closing) {
      setFlow('p14-shift');
      return;
    }
    p12OwnerReturn.current = false;
    p12Seed.current = undefined;
    if (key === 'lookup') {
      setInventoryLookupCode(undefined);
      // Home CTA mở thẳng tra cứu. Camera là một lựa chọn bên trong màn đó,
      // không bắt thủ kho đi qua màn quét khi họ chỉ muốn gõ SKU/serial.
      setFlow('inventory-lookup');
    } else if (key === 'inbound' || key === 'outbound' || key === 'warranty') {
      inboundResultReturn.current = undefined;
      outboundResultReturn.current = undefined;
      setFlow(key);
    } else if (key === 'nfc') {
      setNfcAssignmentCode(undefined);
      setFlow('nfc-assign');
    }
  }, []);

  const handleLoggedOut = useCallback(() => {
    warrantyLookupView.current = {};
    setCaseTabRequest(undefined);
    setProfilePasswordFormActive(false);
    setRestoringSavedSession(false);
    setReadRoute(undefined);
    readStack.current = [];
    p13Retained.current = {};
    p21Retained.current = {};
    setSelectedComponentId(undefined);
    homeQueue.current = undefined;
    inboundResultReturn.current = undefined;
    outboundResultReturn.current = undefined;
    resetShiftState();
    setLogoutInProgress(false);
    setSessionState(undefined);
    setTab('home');
    setFlow(undefined);
    setOpenDocument(undefined);
    setOpenCase(undefined);
    historyViewState.current = undefined;
    p08State.current = undefined;
    setP08User(undefined);
    documentsViewState.current = undefined;
    p12State.current = undefined;
    p12Seed.current = undefined;
    p12OwnerReturn.current = false;
    lookupViewState.current = undefined;
  }, []);

  const handleLogoutStarted = useCallback(() => {
    setLogoutInProgress(true);
  }, []);

  const handleRequiredPasswordLogout = useCallback(() => {
    if (logoutInProgress) return;
    setLogoutInProgress(true);
    logout()
      .catch(() => undefined)
      .finally(() => {
        setLogoutInProgress(false);
        handleLoggedOut();
      });
  }, [handleLoggedOut, logoutInProgress]);

  // Mở chi tiết hồ sơ ngay khi chọn — không đợi một bước bấm nữa.
  useEffect(() => {
    if (openCase !== undefined) {
      setFlow(current =>
        current === 'warranty-components' ||
        current === 'warranty-component-history'
          ? current
          : 'warranty-case',
      );
    }
  }, [openCase]);

  const handleOpenDocument = useCallback(
    (
      kind: 'inbound' | 'outbound' | 'warranty',
      documentId: string,
      documentTab?: 'files',
    ) => {
      if (ownerUuid(documentId))
        setOpenDocument({ kind, id: documentId, tab: documentTab });
    },
    [],
  );

  const saveHistoryViewState = useCallback((state: HistoryViewState) => {
    historyViewState.current = state;
  }, []);

  const saveDocumentsViewState = useCallback((state: HistoryViewState) => {
    documentsViewState.current = state;
  }, []);

  const handleOpenPendingDocuments = useCallback(
    (kind: 'inbound' | 'outbound') => {
      homeQueue.current = { source: kind, key: String(Date.now()) };
      p12State.current = undefined;
      setTab('documents');
      setFlow(undefined);
    },
    [],
  );
  const handleOpenWarrantyList = useCallback((status: string) => {
    homeQueue.current = { source: 'warranty', status, key: String(Date.now()) };
    p12State.current = undefined;
    setTab('documents');
    setFlow(undefined);
  }, []);

  const handleIdentityResolved = useCallback((user: CurrentUser) => {
    setP08User(user);
    const next = updateSessionIdentity({
      accountSessionPolicy: user.accountSessionPolicy,
      userId: user.id,
      authSessionId: user.auth_session_id,
      activeWarehouseId:
        user.active_warehouse_id ??
        (user.warehouse_context?.status === 'REQUIRED' ? null : undefined),
      userName: user.name ?? user.email,
      avatarUrl: user.avatar_url,
      mustChangePassword: user.must_change_password,
    });
    if (next !== undefined) {
      setSessionState(next);
    }
  }, []);

  const handleWorkShiftReady = useCallback((shift: WorkShift) => {
    const owner = currentShiftOwner();
    if (!owner) return;
    publishShiftState(shift, owner);
    setRestoringSavedSession(false);
    setFlow(undefined);
  }, []);

  /**
   * Bản app cũ chưa lưu `name`/`avatar_url` vào session. Khi mở lại bằng
   * phiên hợp lệ đó, tải một lần `/auth/me` để Home không vĩnh viễn chào
   * chung chung. Phiên đăng nhập mới đã làm việc này ở màn xác nhận, nên
   * nhánh đó được loại trừ để không gọi trùng.
   */
  useEffect(() => {
    if (
      session === undefined ||
      flow === 'session-confirmation' ||
      (p08User?.id === session.userId &&
        p08User?.auth_session_id === session.authSessionId &&
        p08User?.active_warehouse_id === session.activeWarehouseId)
    ) {
      return;
    }
    const requestId = ++identityRequest.current;
    fetchCurrentUser()
      .then(user => {
        if (requestId === identityRequest.current) {
          handleIdentityResolved(user);
        }
      })
      // Không chặn phiên đang dùng chỉ vì tải thông tin hiển thị lỗi. Các màn
      // nghiệp vụ vẫn tự báo lỗi API khi người dùng thực hiện thao tác thật.
      .catch(() => undefined);
    return () => {
      identityRequest.current += 1;
    };
  }, [flow, handleIdentityResolved, session, p08User]);

  if (logoutInProgress) {
    return <LogoutProgressScreen />;
  }

  if (!sessionHydrated) {
    return (
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <Text variant="caption" tone="muted">
          Đang khôi phục phiên bảo mật…
        </Text>
      </View>
    );
  }

  // Non-secret S03 is handed off before the confirmed password response clears auth.
  if (session === undefined && securityResult)
    return (
      <P11PasswordResultScreen
        result={securityResult}
        onContinue={() => {
          clearSecurityResultNotice();
          setForcedRelogin(undefined);
          handleLoggedOut();
        }}
      />
    );

  // Phiên dở dang: nói rõ vì sao phải đăng nhập lại thay vì ném thẳng vào form.
  if (session === undefined && forcedRelogin !== undefined) {
    return (
      <SessionExpiredScreen onRelogin={() => setForcedRelogin(undefined)} />
    );
  }

  if (session === undefined && authSessionNotice) {
    return (
      <SessionExpiredScreen
        reasonCode={authSessionNotice.code}
        onRelogin={() => {
          clearAuthSessionNotice();
          setAuthSessionNotice(undefined);
          setForcedRelogin(undefined);
          setFlow(undefined);
        }}
      />
    );
  }

  if (session === undefined) {
    if (flow === 'forgot-password') {
      return (
        <LazyScreen>
          <ForgotPasswordFlow
            onBack={() => setFlow(undefined)}
            onDone={() => setFlow(undefined)}
          />
        </LazyScreen>
      );
    }
    return (
      <View style={styles.root}>
        <LoginScreen
          onSuccess={handleLoggedIn}
          onForgotPassword={() => setFlow('forgot-password')}
        />
        <Sheet
          visible={logoutOutcome?.kind === 'local-only'}
          onDismiss={() => setLogoutOutcome(undefined)}
          title="Đã đóng phiên trên thiết bị"
          message={
            'Chưa xác nhận được kết quả thu hồi phiên trên máy chủ.' +
            (logoutOutcome?.requestId
              ? '\nMã đối chiếu: ' + logoutOutcome.requestId
              : '')
          }
        >
          <Button label="Đã hiểu" onPress={() => setLogoutOutcome(undefined)} />
        </Sheet>
      </View>
    );
  }

  if (session.mustChangePassword === true) {
    if (requiredPasswordOwnerMissing)
      return (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <Text variant="caption" tone="muted">
            Đang làm mới phiên đổi mật khẩu…
          </Text>
        </View>
      );
    return (
      <P11PasswordScreen
        user={undefined}
        fetchUser={fetchCurrentUser}
        initialContext={forcedPasswordBootstrapContext()}
        onBack={handleRequiredPasswordLogout}
      />
    );
  }

  if (readRoute?.scope === readScope()) {
    const activeRoute = readRoute.route,
      context = { session, user: p08User };
    const documentTarget = (target: OwnerDocumentTarget) => {
      if (target.warehouseId === getSession()?.activeWarehouseId)
        handleOpenDocument(target.kind, target.id);
    };
    const footer = (
      <BottomNav
        items={IMPLEMENTED_TABS}
        activeKey={tab}
        onSelect={key => {
          setReadRoute(undefined);
          readStack.current = [];
          setFlow(undefined);
          setTab(key);
        }}
      />
    );
    const screen = (route: ReadOwnerRoute) =>
      route.owner === 'P13' ? (
        <P13NotificationsScreen
          initialRecipientId={route.recipientId}
          notificationDelivery={notificationDelivery}
          footer={footer}
          retained={p13Retained.current}
          warehouseNamesById={
            p08User !== undefined &&
            p08User.id === session.userId &&
            p08User.auth_session_id === session.authSessionId &&
            p08User.active_warehouse_id === session.activeWarehouseId &&
            p08User.warehouse_context?.status === 'READY'
              ? Object.fromEntries(
                  (p08User.available_warehouses ?? []).flatMap(warehouse =>
                    warehouse.name?.trim()
                      ? [[warehouse.warehouse_id, warehouse.name.trim()]]
                      : [],
                  ),
                )
              : {}
          }
          onBack={closeReadOwner}
          onOpenDocument={documentTarget}
          onOpenQueue={() => openReadOwner({ owner: 'P13_QUEUE' })}
        />
      ) : route.owner === 'P13_QUEUE' ? (
        <P13WebQueueScreen
          context={context}
          footer={footer}
          onBack={closeReadOwner}
          onOpenDocument={documentTarget}
        />
      ) : route.owner === 'P18_BOXES' ? (
        <P18BoxesScreen
          context={context}
          initialKeyword={route.keyword}
          onBack={closeReadOwner}
        />
      ) : route.owner === 'P18_LOCATION' ? (
        <P18LocationScreen
          context={context}
          target={{ kind: route.kind, id: route.id }}
          onBack={closeReadOwner}
        />
      ) : route.owner === 'P20' ? (
        <P20HistoryScreen
          caseId={route.caseId}
          selectedDocumentId={route.documentId}
          service={p09Service}
          onBack={closeReadOwner}
          onOpenCase={scopeBound((caseId: string) => {
            if (ownerUuid(caseId)) handleOpenDocument('warranty', caseId);
          })}
          onResume={caseId => openReadOwner({ owner: 'P21', caseId })}
          onTimeline={caseId =>
            openReadOwner({ owner: 'P23', kind: 'warranty', caseId })
          }
        />
      ) : route.owner === 'P21' ? (
        <P21ResumeScreen
          key={JSON.stringify(route)}
          retained={p21Retained.current}
          service={p09Service}
          context={context}
          caseId={route.caseId}
          onBack={closeReadOwner}
          onOpenResult={(caseId, documentId) =>
            openReadOwner({ owner: 'P20', caseId, documentId })
          }
          onResumeLocalDraft={scopeBound(
            (row: WarrantyCase, target: P19LocalDraftChoice) => {
              if (
                row.warranty_case_id !== target.caseId ||
                !ownerUuid(target.caseId) ||
                !ownerUuid(target.draftId) ||
                !ownerUuid(target.scanSessionId)
              )
                return;
              setReadRoute(undefined);
              readStack.current = [];
              setOpenDocument(undefined);
              setCaseTabRequest(undefined);
              setOpenCase(row);
              setWarrantyCaseCreated(false);
              setFlow('warranty-components');
            },
          )}
          onHistory={() => {
            setReadRoute(undefined);
            readStack.current = [];
            setFlow(undefined);
            setTab('history');
          }}
        />
      ) : route.owner === 'P22' ? (
        <P22NfcHistoryScreen
          context={context}
          footer={footer}
          onBack={closeReadOwner}
          initial={
            route.eventId
              ? { eventId: route.eventId }
              : route.recordId && route.activityId
              ? { recordId: route.recordId, activityId: route.activityId }
              : undefined
          }
        />
      ) : route.owner === 'P23' ? (
        <P23WarrantySessionsScreen
          key={JSON.stringify(route)}
          footer={footer}
          context={context}
          kind={route.kind}
          initialCaseId={route.caseId}
          initialSessionId={route.sessionId}
          onBack={closeReadOwner}
          onComponents={caseId => openReadOwner({ owner: 'P20', caseId })}
        />
      ) : (
        <P08HistoryScreen
          key={JSON.stringify(route)}
          context={context}
          service={p08Service}
          onBack={closeReadOwner}
          onHome={scopeBound(() => {
            setReadRoute(undefined);
            readStack.current = [];
            setFlow(undefined);
            setTab('home');
          })}
          onOpenDocument={handleOpenDocument}
          onOpenWarranty={(id, tabName) =>
            handleOpenDocument('warranty', id, tabName)
          }
          onOpenNfc={(recordId, activityId) =>
            openReadOwner({ owner: 'P22', recordId, activityId })
          }
          onOpenSession={sessionId => {
            if (ownerUuid(sessionId))
              openReadOwner({ owner: 'P23', kind: 'sessions', sessionId });
          }}
          initialMode={route.mode}
          initialRecordId={
            route.documentId && ownerUuid(route.documentId)
              ? 'DOCUMENT:' + route.documentId
              : undefined
          }
          initialFilters={{
            date_mode: 'ALL',
            source: route.source ?? 'ALL',
            ...(route.business ? { business: route.business } : {}),
          }}
        />
      );
    return (
      <OwnerHandoffHost
        handoff={openDocument ? documentOverlay() : undefined}
        owner={
          <View style={styles.root}>
            <View style={styles.body}>
              {[...readStack.current, activeRoute].map(
                (route, index, stack) => {
                  const hidden = index !== stack.length - 1;
                  return (
                    <View
                      key={index + ':' + JSON.stringify(route)}
                      testID={'read-owner-stack-' + index}
                      style={[styles.body, hidden && { display: 'none' }]}
                      accessibilityElementsHidden={hidden}
                      importantForAccessibility={
                        hidden ? 'no-hide-descendants' : 'auto'
                      }
                      pointerEvents={hidden ? 'none' : 'auto'}
                    >
                      <LazyScreen>{screen(route)}</LazyScreen>
                    </View>
                  );
                },
              )}
            </View>
            {['P13', 'P13_QUEUE', 'P20', 'P21', 'P22', 'P23'].includes(
              activeRoute.owner,
            )
              ? null
              : footer}
          </View>
        }
      />
    );
  }
  if (flow === 'p14-shift' && p14Service && !openDocument) {
    return (
      <LazyScreen>
        <P14ShiftScreen
          key={JSON.stringify([
            session.userId,
            session.authSessionId,
            session.activeWarehouseId,
            p14ShiftKey,
          ])}
          service={p14Service}
          loadDrafts={loadP14DraftOverview}
          retained={p14View}
          user={
            p14User?.id === session.userId &&
            p14User?.active_warehouse_id === session.activeWarehouseId
              ? p14User
              : undefined
          }
          onBack={() => {
            setFlow(undefined);
            setTab('profile');
          }}
          onHistory={() => {
            p14HistoryReturn.current = true;
            setFlow(undefined);
            setTab('history');
          }}
          onResumeOwner={(owner, draft) => {
            inboundResultReturn.current = undefined;
            outboundResultReturn.current = undefined;
            p12Seed.current = undefined;
            p14ResumeDraft.current =
              owner === 'P04' || owner === 'P05'
                ? draft?.document_id
                : undefined;
            if (owner === 'P19') {
              setFlow(undefined);
              let caseId: string | undefined;
              try {
                const form =
                  typeof draft?.form === 'string'
                    ? JSON.parse(draft.form)
                    : draft?.form;
                if (ownerUuid(form?.p19?.warranty_case_id))
                  caseId = form.p19.warranty_case_id;
              } catch {
                /* A missing case mapping opens the verified chooser. */
              }
              openReadOwner({ owner: 'P21', ...(caseId ? { caseId } : {}) });
              return;
            }
            setReadRoute(undefined);
            readStack.current = [];
            setTab(owner === 'P09' ? 'home' : 'scan');
            setFlow(
              owner === 'P04'
                ? 'inbound'
                : owner === 'P05'
                ? 'outbound'
                : owner === 'P07'
                ? 'nfc-assign'
                : owner === 'P09'
                ? 'warranty'
                : undefined,
            );
          }}
          onLogout={async () => {
            handleLogoutStarted();
            try {
              await logout();
            } finally {
              handleLoggedOut();
            }
          }}
          footer={
            <BottomNav
              items={IMPLEMENTED_TABS}
              activeKey={tab}
              onSelect={key => {
                setFlow(undefined);
                setTab(key);
              }}
            />
          }
        />
      </LazyScreen>
    );
  }
  function openP12Owner(intent: OwnerIntent) {
    const currentSession = getSession();
    const owner = JSON.parse(intent.scope) as {
      actorId: string;
      authSessionId: string;
      warehouseId: string;
    };
    if (
      !currentSession ||
      owner.actorId !== currentSession.userId ||
      owner.authSessionId !== currentSession.authSessionId ||
      owner.warehouseId !== currentSession.activeWarehouseId ||
      p08User?.id !== owner.actorId ||
      p08User.auth_session_id !== owner.authSessionId ||
      p08User.active_warehouse_id !== owner.warehouseId ||
      !p12CanCreate(intent.type, p08User.permissions ?? [])
    )
      return;
    p12OwnerReturn.current = true;
    p12Seed.current =
      intent.type === 'inbound' && intent.seed
        ? { ...p04Seed(intent.seed), supplierName: intent.seed.supplierName }
        : undefined;
    inboundResultReturn.current = undefined;
    outboundResultReturn.current = undefined;
    setOpenDocument(undefined);
    setTab('documents');
    setFlow(intent.type);
  }
  // P12 owns the four read panels; parent owner/caller remains independent.
  function documentOverlay() {
    if (openDocument === undefined) return undefined;
    return (
      <View style={styles.root}>
        <View style={styles.body}>
          <P12Screen
            initialDocument={{
              type: openDocument.kind,
              id: openDocument.id,
              tab: openDocument.tab,
            }}
            user={p08User}
            onIdentity={handleIdentityResolved}
            onBack={() => setOpenDocument(undefined)}
            onOwnerIntent={openP12Owner}
          />
        </View>
        <BottomNav
          items={IMPLEMENTED_TABS}
          activeKey="documents"
          highlightActive={false}
          onSelect={key => {
            setOpenDocument(undefined);
            setReadRoute(undefined);
            readStack.current = [];
            setFlow(undefined);
            if (key === 'documents') requestDocumentsRoot();
            else setTab(key);
          }}
        />
      </View>
    );
  }
  if (openDocument !== undefined) return documentOverlay()!;

  if (flow === 'session-confirmation') {
    return (
      <SessionConfirmationScreen
        restoring={restoringSavedSession}
        onContinue={handleWorkShiftReady}
        onLoggedOut={handleLoggedOut}
        onIdentityResolved={handleIdentityResolved}
        onReconcileEnd={
          p14Service?.pending ? () => setFlow('p14-shift') : undefined
        }
      />
    );
  }

  // Luồng nghiệp vụ chiếm toàn màn: thanh tab bị ẩn để không ai bấm nhầm sang
  // tab khác giữa lúc đang quét dở một phiếu.
  if (flow === 'inbound') {
    return (
      <LazyScreen>
        <InboundFlow
          footerActiveKey={tab}
          onConfirmSession={() => setFlow('session-confirmation')}
          onSelectTab={key => {
            p14ResumeDraft.current = undefined;
            setFlow(undefined);
            setTab(key);
          }}
          returnDocumentId={inboundResultReturn.current}
          resumeDraftId={p14ResumeDraft.current}
          initialSeed={p12Seed.current}
          onExit={() => {
            p14ResumeDraft.current = undefined;
            inboundResultReturn.current = undefined;
            p12Seed.current = undefined;
            setFlow(undefined);
            if (p12OwnerReturn.current) setTab('documents');
            p12OwnerReturn.current = false;
          }}
          onViewDocument={id => {
            inboundResultReturn.current = id;
            setOpenDocument({ kind: 'inbound', id });
          }}
          onHistory={id => {
            inboundResultReturn.current = id;
            if (ownerUuid(id))
              openReadOwner({
                owner: 'P08',
                mode: 'records',
                source: 'DOCUMENT',
                business: 'INBOUND',
                documentId: id,
              });
          }}
        />
      </LazyScreen>
    );
  }
  const nfcChild =
    flow === 'nfc-scan' ? (
      <BusinessScanScreen
        title="Quét QR/SKU để gán NFC"
        documentName="Gán NFC"
        sessionLabel="Nhận diện hiện vật"
        scannedCount={0}
        doneLabel="Nhập mã"
        onScan={raw => {
          setNfcAssignmentCode(raw);
          setFlow('nfc-assign');
        }}
        onBack={() => setFlow('nfc-assign')}
        onDone={() => setFlow('nfc-assign')}
      />
    ) : flow === 'nfc-tags' ? (
      <NfcTagListScreen onBack={() => setFlow('nfc-assign')} />
    ) : undefined;
  const nfcScreen = ['nfc-assign', 'nfc-scan', 'nfc-tags'].includes(
    flow ?? '',
  ) ? (
    <OwnerHandoffHost
      handoff={nfcChild}
      owner={
        <NfcAssignmentScreen
          onSelectTab={key => {
            setFlow(undefined);
            setNfcAssignmentCode(undefined);
            nfcReturnFlow.current = undefined;
            if (
              ['home', 'documents', 'scan', 'history', 'profile'].includes(key)
            )
              setTab(key);
          }}
          initialCode={nfcAssignmentCode}
          onBack={() => {
            const returnFlow = nfcReturnFlow.current;
            setNfcAssignmentCode(undefined);
            nfcReturnFlow.current = undefined;
            setFlow(returnFlow);
          }}
          onScanCode={() => setFlow('nfc-scan')}
          onManageTags={() => setFlow('nfc-tags')}
        />
      }
    />
  ) : null;
  const outboundHandoff =
    nfcReturnFlow.current === 'outbound' ? nfcScreen : null;
  if (flow === 'outbound' || outboundHandoff) {
    return (
      <LazyScreen>
        <OwnerHandoffHost
          handoff={outboundHandoff}
          owner={
            <OutboundFlow
              footerActiveKey={tab}
              onSelectTab={key => {
                p14ResumeDraft.current = undefined;
                setFlow(undefined);
                setTab(key);
              }}
              returnDocumentId={outboundResultReturn.current}
              resumeDraftId={p14ResumeDraft.current}
              onHistory={id => {
                outboundResultReturn.current = id;
                if (ownerUuid(id))
                  setOpenDocument({ kind: 'outbound', id, tab: 'events' });
              }}
              onExit={() => {
                p14ResumeDraft.current = undefined;
                outboundResultReturn.current = undefined;
                setFlow(undefined);
                setTab(p12OwnerReturn.current ? 'documents' : 'home');
                p12OwnerReturn.current = false;
              }}
              onViewDocument={documentId => {
                outboundResultReturn.current = documentId;
                setOpenDocument({ kind: 'outbound', id: documentId });
              }}
              onAssignNfc={rawCode => {
                nfcReturnFlow.current = 'outbound';
                setNfcAssignmentCode(rawCode);
                setFlow('nfc-assign');
              }}
            />
          }
        />
      </LazyScreen>
    );
  }
  if (nfcScreen) return <LazyScreen>{nfcScreen}</LazyScreen>;
  if (flow === 'nfc-lookup') {
    return (
      <LazyScreen>
        <NfcLookupScreen onBack={() => setFlow(undefined)} />
      </LazyScreen>
    );
  }
  if (flow === 'inventory-scan') {
    return (
      <LazyScreen>
        <BusinessScanScreen
          title="Kiểm tra tồn"
          documentName="Tra cứu QR/Barcode"
          sessionLabel="Phiên tra cứu tồn"
          scannedCount={0}
          doneLabel="Nhập mã"
          onScan={raw => {
            // Không gọi WMS trên khung camera. Chuyển mã sang màn tra cứu để
            // camera tắt ngay, rồi cùng một lookup xử lý cả QR lẫn nhập tay.
            setInventoryLookupCode(raw);
            setFlow('inventory-lookup');
          }}
          onBack={() => setFlow('inventory-lookup')}
          onDone={() => setFlow('inventory-lookup')}
        />
      </LazyScreen>
    );
  }
  if (flow === 'inventory-lookup') {
    return (
      <LazyScreen>
        <LookupScreen
          onOpenBoxes={keyword =>
            openReadOwner({ owner: 'P18_BOXES', keyword })
          }
          onOpenComponentLocation={scopeBound(
            (target: { kind: 'ITEM'; id: string }) => {
              if (ownerUuid(target.id))
                openReadOwner({ owner: 'P18_LOCATION', ...target });
            },
          )}
          onOpenDocument={target => {
            if (ownerUuid(target.id))
              handleOpenDocument(
                target.owner === 'P09'
                  ? 'warranty'
                  : target.type === 'receipt'
                  ? 'inbound'
                  : 'outbound',
                target.id,
              );
          }}
          initialCode={inventoryLookupCode}
          initialViewState={lookupViewState.current}
          onViewStateChange={view => {
            lookupViewState.current = view;
          }}
          onHome={() => {
            setInventoryLookupCode(undefined);
            lookupViewState.current = undefined;
            setFlow(undefined);
            setTab('home');
          }}
          onScan={() => {
            setInventoryLookupCode(undefined);
            setFlow('inventory-scan');
          }}
          onConfirmSession={() => setFlow('session-confirmation')}
          onSelectTab={key => {
            setInventoryLookupCode(undefined);
            setFlow(undefined);
            if (
              key === 'documents' ||
              key === 'scan' ||
              key === 'history' ||
              key === 'profile'
            )
              setTab(key);
          }}
        />
      </LazyScreen>
    );
  }
  if (
    flow?.startsWith('warranty') &&
    !P09_RELEASE.productionEnabled &&
    !p09DevReadEnabled()
  )
    return <P09Boundary onBack={() => setFlow(undefined)}>{null}</P09Boundary>;

  if (flow === 'warranty') {
    return (
      <LazyScreen>
        <WarrantyListScreen
          key={p09Service.contextKey()}
          service={p09Service}
          footer={
            <BottomNav
              items={IMPLEMENTED_TABS}
              activeKey={tab}
              onSelect={key => {
                requestProfileNavigation(() => {
                  setFlow(undefined);
                  setTab(key);
                });
              }}
            />
          }
          // Mini App đưa cả nhập tay lẫn mất mã về cùng một form tiếp nhận.
          onBack={() => setFlow(undefined)}
          onScan={() => setFlow('warranty-scan')}
          onManualEntry={() => {
            setWarrantyCode({ rawCode: '', tempOnly: false });
            setFlow('warranty-intake');
          }}
          onCreateWithoutCode={() => {
            // "Mất tem/mã": KHÔNG gọi resolve, vào thẳng hồ sơ tạm.
            setWarrantyCode({ rawCode: '', tempOnly: true });
            setFlow('warranty-intake');
          }}
          onOpenCase={warrantyCase => {
            setCaseTabRequest(undefined);
            setWarrantyCaseCreated(false);
            setOpenCase(warrantyCase);
          }}
        />
      </LazyScreen>
    );
  }
  if (flow === 'warranty-case' && openCase !== undefined) {
    return (
      <LazyScreen>
        <WarrantyCaseDetail
          key={p09Service.contextKey()}
          service={p09Service}
          warrantyCase={openCase}
          initialTab={
            caseTabRequest?.scope === readScope() &&
            caseTabRequest.caseId === openCase.warranty_case_id
              ? caseTabRequest.tab
              : undefined
          }
          created={warrantyCaseCreated}
          onIssueComponents={warrantyCase => {
            setOpenCase(warrantyCase);
            setWarrantyCaseCreated(false);
            setFlow('warranty-components');
          }}
          onOpenComponent={link => {
            setSelectedComponentId(link.component_issue_document_id);
            setFlow('warranty-component-history');
          }}
          onBack={() => {
            setOpenCase(undefined);
            setWarrantyCaseCreated(false);
            setFlow('warranty');
          }}
        />
      </LazyScreen>
    );
  }
  if (flow === 'warranty-component-history' && openCase !== undefined) {
    return (
      <LazyScreen>
        <P20HistoryScreen
          caseId={openCase.warranty_case_id}
          selectedDocumentId={selectedComponentId}
          service={p09Service}
          onBack={() => setFlow('warranty-case')}
          onOpenCase={scopeBound((caseId: string) => {
            if (caseId !== openCase.warranty_case_id) return;
            setCaseTabRequest({ scope: readScope(), caseId, tab: 'info' });
            setFlow('warranty-case');
          })}
          onIssueNew={row => {
            setOpenCase(row);
            setFlow('warranty-components');
          }}
          onResume={caseId => openReadOwner({ owner: 'P21', caseId })}
          onTimeline={caseId =>
            openReadOwner({ owner: 'P23', kind: 'warranty', caseId })
          }
        />
      </LazyScreen>
    );
  }
  if (flow === 'warranty-components' && openCase !== undefined) {
    return (
      <LazyScreen>
        <P19EntryScreen
          service={p09Service}
          warrantyCase={openCase}
          onBack={() => setFlow('warranty-case')}
          onVerifiedResult={scopeBound(
            (target: {
              caseId: string;
              businessDocumentId: string;
              requestId: string;
            }) => {
              if (
                target.caseId !== openCase.warranty_case_id ||
                !ownerUuid(target.caseId) ||
                !ownerUuid(target.businessDocumentId) ||
                !ownerUuid(target.requestId)
              )
                return;
              setSelectedComponentId(target.businessDocumentId);
              setCaseTabRequest({
                scope: readScope(),
                caseId: target.caseId,
                tab: 'parts',
              });
              setWarrantyCaseCreated(false);
              setFlow('warranty-case');
            },
          )}
        />
      </LazyScreen>
    );
  }
  if (flow === 'warranty-lookup') {
    const lookupScope = readScope();
    if (warrantyLookupView.current.scope !== lookupScope)
      warrantyLookupView.current = { scope: lookupScope };
    return (
      <LazyScreen>
        <LookupScreen
          initialCode={inventoryLookupCode}
          service={p09CatalogReadBridge}
          initialViewState={warrantyLookupView.current.view}
          onViewStateChange={view => {
            if (
              lookupScope === readScope() &&
              warrantyLookupView.current.scope === lookupScope
            )
              warrantyLookupView.current.view = view;
          }}
          onOpenDocument={target => {
            if (ownerUuid(target.id))
              handleOpenDocument(
                target.owner === 'P09'
                  ? 'warranty'
                  : target.type === 'receipt'
                  ? 'inbound'
                  : 'outbound',
                target.id,
              );
          }}
          onExitLookup={() => {
            warrantyLookupView.current = {};
            setInventoryLookupCode(undefined);
            setFlow('warranty-intake');
          }}
          onHome={() => {
            warrantyLookupView.current = {};
            setInventoryLookupCode(undefined);
            setFlow(undefined);
            setTab('home');
          }}
          onScan={() => setFlow('warranty-intake')}
          onSelectTab={key => {
            setFlow(undefined);
            setTab(key);
          }}
          onConfirmSession={() => setFlow('session-confirmation')}
        />
      </LazyScreen>
    );
  }
  if (flow === 'warranty-intake' || flow === 'warranty-scan') {
    return (
      <LazyScreen>
        <WarrantyIntakeScreen
          key={p09Service.contextKey()}
          service={p09Service}
          initialCode={warrantyCode?.rawCode}
          loadResolvedPresentation={readP09Product}
          initialTempOnly={warrantyCode?.tempOnly}
          onBack={() => setFlow('warranty')}
          onScan={() => setFlow('warranty-scan')}
          onLookup={code => {
            setInventoryLookupCode(code);
            setFlow('warranty-lookup');
          }}
          onOpenExisting={row => {
            setWarrantyCaseCreated(false);
            setOpenCase(row);
          }}
          // 🔴 Sửa 2026-09-06. Bản trước **vứt bỏ** hồ sơ vừa tạo và quay về
          // màn hub. Chạy thật cho thấy hậu quả: danh sách chỉ lấy 25 hồ sơ đầu
          // (`per_page=25`, không có tham số sắp xếp) nên hồ sơ vừa tạo **không
          // xuất hiện** — thủ kho không còn đường nào mở lại thứ mình vừa lập,
          // không đính kèm ảnh được, không chuyển trạng thái được.
          //
          // Mini App gốc mở thẳng chi tiết:
          // `navigate('/warranty/' + response.case.id + '?created=1')`
          // (`src/pages/WarrantyReceivePage/index.tsx:239`). Làm y như vậy.
          onCreated={created => {
            setWarrantyCode(undefined);
            setWarrantyCaseCreated(true);
            setOpenCase(created);
          }}
        />
      </LazyScreen>
    );
  }

  const footerScope = readScope();
  const rootFooter = (
    <BottomNav
      items={IMPLEMENTED_TABS}
      activeKey={tab}
      highlightActive
      onSelect={key => {
        if (footerScope !== readScope()) return;
        requestProfileNavigation(() => {
          if (footerScope !== readScope()) return;
          if (key === 'documents') requestDocumentsRoot();
          else if (key !== tab) setTab(key);
        });
      }}
    />
  );
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <LazyScreen>
          {renderTab(tab, {
            onLoggedOut: handleLoggedOut,
            onEndShift: user => {
              setP14User(user);
              setFlow('p14-shift');
            },
            onLogoutStarted: handleLogoutStarted,
            onProfileEditorChange: setProfileEditorActive,
            onPasswordFormActiveChange: setProfilePasswordFormActive,
            footerNavigation: rootFooter,
            onSelectTask: handleTask,
            onHome: () => setTab('home'),
            onOpenDocuments: () => {
              homeQueue.current = undefined;
              p12State.current = undefined;
              setTab('documents');
            },
            onOpenDocument: handleOpenDocument,
            onOpenProfile: () => setTab('profile'),
            onOpenReadOwner: openReadOwner,
            onLookupNfc: () => setFlow('nfc-lookup'),
            onSelectTab: key => {
              if (
                ['home', 'documents', 'scan', 'history', 'profile'].includes(
                  key,
                )
              ) {
                if (key === 'documents') requestDocumentsRoot();
                else setTab(key);
              }
            },
            onScanLookup: () => {
              setInventoryLookupCode(undefined);
              setFlow('inventory-lookup');
            },
            confirmedShift: readyShift,
            sessionKey: JSON.stringify([
              session.userId,
              session.authSessionId,
              session.activeWarehouseId,
            ]),
            userName: session.userName,
            avatarUrl: session.avatarUrl,
            historyCacheScope,
            historyViewState: historyViewState.current,
            p08Context: { session, user: p08User },
            p08State,
            p12State,
            onP12Owner: openP12Owner,
            onDocumentsCreateMode: setDocumentsCreateActive,
            onDocumentsScannerMode: setDocumentsScannerActive,
            documentsRootRequest,
            onDocumentsRootHandled: id => {
              setDocumentsRootRequest(current =>
                current === id ? undefined : current,
              );
            },
            onIdentityResolved: handleIdentityResolved,
            onConfirmSession: () => setFlow('session-confirmation'),
            p08Service,
            onHistoryBack: () => {
              if (p14HistoryReturn.current) {
                p14HistoryReturn.current = false;
                setTab('profile');
                setFlow('p14-shift');
                return;
              }
              if (outboundResultReturn.current) {
                setTab('home');
                setFlow('outbound');
              } else if (inboundResultReturn.current) {
                setTab('home');
                setFlow('inbound');
              } else setTab('home');
            },
            onHistoryViewStateChange: saveHistoryViewState,
            documentsViewState: documentsViewState.current,
            onDocumentsViewStateChange: saveDocumentsViewState,
            warehouseId: session.activeWarehouseId,
            onOpenPendingDocuments: handleOpenPendingDocuments,
            onOpenWarrantyList: handleOpenWarrantyList,
            homeQueue: homeQueue.current,
            homeView,
          })}
        </LazyScreen>
      </View>
      {tab !== 'history' &&
      !(
        tab === 'profile' &&
        (profileEditorActive || profilePasswordFormActive)
      ) &&
      !(
        tab === 'documents' &&
        (documentsCreateActive || documentsScannerActive)
      )
        ? rootFooter
        : null}
    </View>
  );
}
