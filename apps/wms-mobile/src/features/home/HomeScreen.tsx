import {HN_UI} from '../../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
/** P02.S01 port of the locked prototype layout. API owners and gates are unchanged. */
import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextStyle,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import {
  HN_HOME,
  HN_OPERATIONS,
  homeScale,
  greetingName,
} from '../../ui/hnHomeTokens';
import { scannerAssets } from '../../theme/scannerAssets';
import { messageForUser } from '../../errors/AppError';
import {
  hasHomePermission,
  warehouseActivity,
  type RecentDocument,
} from '../../services/wms/home';
import type { WorkShift } from '../../services/wms/workShift';
import { NotificationPopover } from '../notifications/NotificationPopover';
import { useHomeSummary } from './useHomeSummary';
import { VietnamClock } from './VietnamClock';
import { homeDocumentTime } from './homeDocumentTime';
import {
  formatDocumentTimestamp,
  parseDocumentTimestamp,
} from '../../services/wms/documentTimestamps';
import { getSessionGeneration } from '../../auth/session';
import { getShiftState } from '../../shift/shiftState';
import { P15ConnectionScreen } from '../system/P15Screen';
export type HomeTaskKey =
  | 'lookup'
  | 'inbound'
  | 'outbound'
  | 'warranty'
  | 'nfc';
export interface HomeScreenProps {
  viewState?: { scrollY: number };
  userName?: string;
  avatarUrl?: string;
  onSelectTask?: (key: HomeTaskKey) => void;
  onChooseTask?: () => void;
  onSeeAll?: () => void;
  onOpenDocument?: (kind: 'inbound' | 'outbound', id: string) => void;
  onOpenProfile?: () => void;
  onOpenNotifications?: () => void;
  onOpenWarrantyCase?: (id: string) => void;
  /** Compatibility prop; v5 Home excludes this shortcut. P20/P14 keep the guarded P21 routes. */
  onOpenComponentResume?: () => void;
  onOpenPendingDocuments?: (kind: 'inbound' | 'outbound') => void;
  onOpenWarrantyList?: (
    status: 'RECEIVED' | 'CHECKING' | 'REPAIRING' | 'COMPLETED',
  ) => void;
  sessionKey?: string;
  confirmedShift?: WorkShift;
  notificationsEnabled?: boolean;
  /** AppShell supplies its existing guarded LOCK footer, not a second nav. */
  systemFooter?: React.ReactNode;
  deps?: Parameters<typeof useHomeSummary>[0];
}
const TASKS: readonly {
  key: Exclude<HomeTaskKey, 'lookup'>;
  icon: HnHomeIconName;
  title: string;
  hint: string;
}[] = [
  {
    key: 'inbound',
    icon: 'box',
    title: 'Nhập kho',
    hint: 'Nhận hàng và kiểm đếm',
  },
  {
    key: 'outbound',
    icon: 'up',
    title: 'Xuất kho',
    hint: 'Soạn hàng theo phiếu',
  },
  {
    key: 'warranty',
    icon: 'tool',
    title: 'Bảo hành',
    hint: 'Tiếp nhận và sửa chữa',
  },
  {
    key: 'nfc',
    icon: 'nfc',
    title: 'Thẻ NFC',
    hint: 'Liên kết và tra cứu thẻ',
  },
];
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
function statusLabel(row: RecentDocument): {
  label: string;
  color: string;
  background: string;
} {
  if (row.statusPresentation) return row.statusPresentation;
  if (row.displayMappingPending)
    return {
      label: 'Chờ xác minh trạng thái',
      color: HN_HOME.muted,
      background: HN_UI.canvas,
    };
  if (row.type === 'warranty') {
    const labels: Record<string, string> = {
      RECEIVED: 'Đã tiếp nhận',
      CHECKING: 'Đang kiểm tra',
      REPAIRING: 'Đang sửa chữa',
      COMPLETED: 'Chờ bàn giao',
      RETURNED: 'Đã trả khách',
      CANCELLED: 'Đã hủy',
    };
    return {
      label: labels[row.status ?? ''] ?? 'Chưa xác minh',
      color: row.status === 'RETURNED' ? HN_UI.success : HN_UI.textLink,
      background: row.status === 'RETURNED' ? HN_UI.successSoft : HN_UI.selected,
    };
  }
  if (row.status === 'POSTED')
    return { label: 'Đã ghi sổ', color: HN_UI.success, background: HN_UI.successSoft };
  if (row.status === 'WAITING_APPROVAL')
    return {
      label: 'Chờ xử lý trên Web',
      color: HN_UI.warning,
      background: HN_UI.warningSoft,
    };
  const labels: Record<string, string> = {
    DRAFT: 'Đang xử lý',
    SCANNING: 'Đang quét',
    CANCELLED: 'Đã hủy',
  };
  return {
    label: labels[row.status ?? ''] ?? 'Chưa xác minh',
    color: HN_HOME.muted,
    background: HN_UI.canvas,
  };
}
function layout(scale: number) {
  const p = (n: number) => n * scale;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: HN_HOME.surface },
    body: { flex: 1, minHeight: 0 },
    heroBackground: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    },
    hero: {
      paddingTop: p(10),
      paddingHorizontal: p(20),
      paddingBottom: p(14),
      minHeight: p(183),
    },
    heroImage: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: p(-65),
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(12),
      height: p(52),
    },
    logo: { width: p(48), alignItems: 'center' },
    brandCopy: { flex: 1, minWidth: 0 },
    bell: {
      width: p(38),
      height: p(48),
      alignItems: 'center',
      justifyContent: 'center',
    },
    count: {
      position: 'absolute',
      top: p(1),
      right: p(-3),
      minWidth: p(22),
      height: p(18),
      paddingHorizontal: p(2),
      borderRadius: p(10),
      borderWidth: p(1),
      borderColor: HN_UI.onBrand,
      backgroundColor: HN_UI.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: p(52),
      height: p(52),
      borderRadius: p(26),
      backgroundColor: HN_UI.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: p(52), height: p(52) },
    intro: { marginTop: p(14) },
    warehouseLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: p(8),
      minHeight: p(28),
    },
    warehouseName: {
      flex: 1,
      minWidth: 0,
      textTransform: 'uppercase',
      letterSpacing: p(0.6),
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(8),
      paddingHorizontal: p(10),
      paddingVertical: p(5),
      borderRadius: p(16),
    },
    dot: { width: p(9), height: p(9), borderRadius: p(5) },
    greeting: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: p(7),
      height: p(34),
      marginTop: p(6),
    },
    name: { flex: 1, minWidth: 0, overflow: 'hidden' },
    greetingPrefix: { flexShrink: 0 },
    subtitle: { marginTop: p(3) },
    scroll: { flex: 1, minHeight: 0 },
    scrollContent: {
      paddingHorizontal: p(20),
      paddingBottom: p(56),
      flexGrow: 1,
    },
    bodySurface: {
      position: 'absolute',
      top: p(37),
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: p(25),
      borderTopRightRadius: p(25),
      backgroundColor: HN_HOME.surface,
    },
    kpis: {
      flexDirection: 'row',
      minHeight: p(100),
      borderWidth: 1,
      borderColor: HN_HOME.line,
      borderRadius: p(14),
      backgroundColor: HN_HOME.surface,
    },
    kpi: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: p(16),
      paddingVertical: p(14),
      justifyContent: 'center',
    },
    kpiFollowing: { paddingLeft: p(17) },
    kpiFirst: { borderTopLeftRadius: p(13), borderBottomLeftRadius: p(13) },
    kpiTop: {
      height: p(36),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: p(6),
    },
    kpiLabel: { marginTop: p(5) },
    divider: {
      position: 'absolute',
      left: 0,
      top: p(16),
      bottom: p(16),
      width: 1,
      backgroundColor: HN_UI.surfaceSunken,
    },
    kpiGlyph: {
      padding: p(3),
      borderRadius: p(7),
      backgroundColor: HN_UI.canvas,
      flexShrink: 0,
    },
    kpiPendingGlyph: { backgroundColor: HN_UI.dangerSoft },
    kpiUnknown: { fontSize: p(12), color: HN_HOME.muted },
    clockNumber: { letterSpacing: p(-0.35), fontVariant: ['tabular-nums'] },
    section: {
      marginTop: p(22),
      marginBottom: p(12),
      minHeight: p(23),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: p(10),
    },
    sectionTitle: { flexShrink: 0 },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: p(14),
      rowGap: p(13),
    },
    taskGuide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(4),
      minWidth: 0,
      flexShrink: 1,
      minHeight: p(44),
      marginVertical: p(-10),
      borderRadius: p(8),
    },
    taskGuideCopy: { flexShrink: 1, textAlign: 'right' },
    task: {
      width: '48.45%',
      minWidth: 0,
      minHeight: p(82),
      paddingVertical: p(13),
      paddingHorizontal: p(14),
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(15),
      backgroundColor: HN_HOME.surface,
      borderWidth: 1,
      borderColor: HN_HOME.line,
      borderRadius: p(14),
    },
    tile: {
      width: p(44),
      height: p(44),
      borderRadius: p(10),
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    taskCopy: { flex: 1, minWidth: 0 },
    taskHint: { marginTop: p(5) },
    chevron: { position: 'absolute', right: p(9), top: p(14) },
    scanner: {
      marginTop: p(12),
      minHeight: p(82),
      paddingVertical: p(13),
      paddingHorizontal: p(17),
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(17),
      borderRadius: p(14),
      backgroundColor: HN_HOME.blue,
    },
    scannerTile: { width: p(57), height: p(54) },
    scannerCopy: { flex: 1, minWidth: 0 },
    scannerHint: { marginTop: p(6) },
    recentHead: { marginTop: p(19), marginBottom: p(9) },
    viewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(4),
      minHeight: p(44),
      paddingHorizontal: p(8),
      paddingVertical: p(10),
      marginVertical: p(-10),
      borderRadius: p(8),
    },
    records: {
      borderWidth: 1,
      borderColor: HN_HOME.line,
      borderRadius: p(14),
      backgroundColor: HN_HOME.surface,
      overflow: 'hidden',
    },
    record: {
      minHeight: p(65),
      paddingVertical: p(9),
      paddingHorizontal: p(13),
      flexDirection: 'row',
      alignItems: 'center',
      gap: p(15),
    },
    recordDivider: { borderTopWidth: 1, borderTopColor: HN_HOME.line },
    recordIcon: { width: p(42), height: p(44) },
    recordCopy: { flex: 1, minWidth: 0 },
    recordHint: { marginTop: p(3) },
    meta: { alignItems: 'center', flexShrink: 0 },
    badge: {
      marginTop: p(3),
      borderRadius: p(4),
      paddingVertical: p(1),
      paddingHorizontal: p(6),
    },
    empty: { paddingHorizontal: p(14), paddingVertical: p(18) },
    pressed: { backgroundColor: HN_UI.selected },
    namePressed: { opacity: 0.8 },
  });
}
export function HomeScreen({
  viewState,
  userName,
  avatarUrl,
  onSelectTask,
  onChooseTask,
  onSeeAll,
  onOpenDocument,
  onOpenProfile,
  onOpenNotifications,
  onOpenWarrantyCase,
  onOpenPendingDocuments,
  onOpenWarrantyList,
  sessionKey,
  confirmedShift,
  notificationsEnabled = false,
  systemFooter,
  deps,
}: HomeScreenProps): React.ReactElement {
  const home = useHomeSummary(deps, { key: sessionKey, confirmedShift });
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pendingRestore = useRef(viewState?.scrollY || undefined);
  const shiftVerificationEpoch = getShiftState().verificationEpoch;
  const currentHome = useRef(home);
  currentHome.current = home;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrentSnapshot = () =>
    mounted.current &&
    home.ownerGeneration === getSessionGeneration() &&
    shiftVerificationEpoch === getShiftState().verificationEpoch &&
    currentHome.current.ownerKey === home.ownerKey &&
    currentHome.current.user === home.user &&
    currentHome.current.summary === home.summary &&
    currentHome.current.error === home.error &&
    currentHome.current.shift === home.shift &&
    !currentHome.current.refreshing;
  const recent = useMemo(
    () =>
      home.summary.recent.slice(0, 3).map(record => ({
        ...record,
        timestamp: record.timestamp ?? parseDocumentTimestamp(record.createdAt),
      })),
    [home.summary.recent],
  );
  const dimensions = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const [width, setWidth] = useState(dimensions.width),
    scale = homeScale(width),
    px = (n: number) => n * scale,
    styles = useMemo(() => layout(scale), [scale]);
  const [nameOpen, setNameOpen] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const dismissedError = useRef<string | null>(null);
  const readRetryLatch = useRef(false);
  const errorActionEpoch = useRef(0);
  const errorKey = home.error
    ? JSON.stringify([
        sessionKey,
        home.error.kind,
        home.error.code,
        home.error.route,
        home.error.message,
      ])
    : null;
  const dismissError = () => {
    if (!isCurrentSnapshot() || readRetryLatch.current) return;
    errorActionEpoch.current++;
    dismissedError.current = errorKey;
    setErrorOpen(false);
  };
  const reload = home.reload;
  const overlayVisible = useRef(false);
  const deferredReload = useRef(false);
  const connectionError =
    home.error?.kind === 'network' || home.error?.kind === 'timeout';
  const errorVisible =
    errorOpen &&
    !nameOpen &&
    !pendingOpen &&
    !warrantyOpen &&
    !notificationsOpen &&
    home.phase === 'error';
  const connectionVisible =
    connectionError && errorVisible && isCurrentSnapshot();
  // Home only owns GET reads. UNKNOWN/command outcomes are never mapped to read retry.
  const canReloadData =
    connectionVisible && !home.refreshing && !readRetryLatch.current;
  const actionEpoch = errorActionEpoch.current;
  const currentConnection = () =>
    actionEpoch === errorActionEpoch.current &&
    connectionVisible &&
    isCurrentSnapshot() &&
    !readRetryLatch.current;
  const closeConnection = () => {
    if (!currentConnection() || home.refreshing) return;
    deferredReload.current = false;
    dismissError();
  };
  const retryHomeRead = () => {
    if (!isCurrentSnapshot() || home.refreshing || readRetryLatch.current)
      return;
    readRetryLatch.current = true;
    errorActionEpoch.current++;
    deferredReload.current = false;
    dismissedError.current = null;
    setErrorOpen(false);
    home.reload();
  };
  const reloadConnection = () => {
    if (canReloadData && currentConnection()) retryHomeRead();
  };
  overlayVisible.current =
    errorOpen || nameOpen || pendingOpen || warrantyOpen || notificationsOpen;
  const unreadChanged = useCallback(
    (_count: number) => {
      if (
        !mounted.current ||
        home.ownerGeneration !== getSessionGeneration() ||
        currentHome.current.ownerKey !== home.ownerKey ||
        shiftVerificationEpoch !== getShiftState().verificationEpoch
      )
        return;
      if (overlayVisible.current) deferredReload.current = true;
      else reload();
    },
    [reload, home.ownerGeneration, home.ownerKey, shiftVerificationEpoch],
  );
  const anyOverlay = overlayVisible.current;
  useEffect(() => {
    if (!anyOverlay && deferredReload.current) {
      deferredReload.current = false;
      reload();
    }
  }, [anyOverlay, reload]);
  useEffect(() => {
    setNameOpen(false);
    setPendingOpen(false);
    setWarrantyOpen(false);
    setNotificationsOpen(false);
    setErrorOpen(false);
    dismissedError.current = null;
    readRetryLatch.current = false;
    errorActionEpoch.current++;
    deferredReload.current = false;
  }, [sessionKey, home.ownerGeneration]);
  useEffect(() => {
    if (!home.refreshing) readRetryLatch.current = false;
  }, [home.refreshing, home.phase, errorKey, actionEpoch]);
  useEffect(() => {
    if (
      home.phase === 'error' &&
      !home.refreshing &&
      errorKey !== dismissedError.current
    )
      setErrorOpen(true);
  }, [home.phase, home.refreshing, errorKey, actionEpoch]);
  useEffect(() => {
    let background =
      AppState.currentState != null && AppState.currentState !== 'active';
    let overlayPause = false;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        background = true;
        overlayPause = overlayVisible.current;
      } else if (state === 'active') {
        if (background && !overlayPause) reload();
        background = false;
        overlayPause = false;
      }
    });
    return () => subscription?.remove();
  }, [reload]);
  const name = home.user?.name?.trim() || userName?.trim() || 'bạn',
    active = warehouseActivity(home.warehouse);
  const font = (
    size: number,
    line: number,
    weight: TextStyle['fontWeight'] = '400',
    color: string = HN_HOME.ink,
  ): TextStyle => ({
    fontFamily: SCANNER_ARIAL_FAMILY,
    fontSize: px(size),
    lineHeight: px(line),
    fontWeight: weight,
    color,
    includeFontPadding: false,
  });
  const canTask = useCallback(
    (key: HomeTaskKey) => {
      if (key === 'lookup') return hasHomePermission(home.user, 'sku.view');
      if (key === 'warranty')
        return hasHomePermission(home.user, 'warranty.view', 'warranty.manage');
      if (active !== true) return false;
      if (key === 'inbound')
        return (
          hasHomePermission(home.user, 'inbound.create') &&
          hasHomePermission(home.user, 'inbound.scan')
        );
      if (key === 'outbound')
        return (
          hasHomePermission(
            home.user,
            'outbound.request.manual_create',
            'outbound.import',
          ) && hasHomePermission(home.user, 'outbound.scan')
        );
      return (
        hasHomePermission(home.user, 'sku.view') &&
        hasHomePermission(home.user, 'physical_code.assign_rfid')
      );
    },
    [active, home.user],
  );
  const canReadDocuments = hasHomePermission(
    home.user,
    'inbound.view',
    'outbound.view',
    'warranty.view',
    'warranty.manage',
  );
  const select = (key: HomeTaskKey) => {
    if (isCurrentSnapshot() && canTask(key)) onSelectTask?.(key);
  };
  const statusColor =
      active === true ? HN_UI.success : active === false ? HN_UI.warning : HN_UI.textSecondary,
    dot =
      active === true ? HN_UI.success : active === false ? HN_UI.warning : HN_UI.selected;
  const kpis = [
    {
      key: 'waiting',
      value: home.summary.pendingApproval,
      label: 'Phiếu chờ xử lý',
      icon: 'document' as const,
    },
    {
      key: 'warranty',
      value: home.summary.openWarranty,
      label: 'Bảo hành đang mở',
      icon: 'tool' as const,
    },
  ];
  return (
    <View
      testID="hn-home-screen"
      style={styles.root}
      onLayout={e => {
        const value = e.nativeEvent.layout.width;
        if (value > 0) setWidth(value);
      }}
    >
      <View
        testID="hn-home-hero"
        style={[styles.hero, { paddingTop: px(10) + insets.top }]}
      >
        <View style={styles.heroImage} pointerEvents="none">
          <Image
            source={scannerAssets.warehouseMain}
            style={styles.heroBackground}
            resizeMode="cover"
            accessible={false}
          />
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient
                id="hn-home-shade"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <Stop offset="0%" stopColor={HN_UI.shell} stopOpacity={0.81} />
                <Stop offset="70%" stopColor={HN_UI.shell} stopOpacity={0.75} />
                <Stop offset="100%" stopColor={HN_UI.onBrand} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="url(#hn-home-shade)"
            />
          </Svg>
        </View>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <HnHomeIcon name="scan" size={px(36)} color={HN_UI.onBrand} />
          </View>
          <View style={styles.brandCopy}>
            <Text numberOfLines={1} style={font(14, 20, '700', HN_UI.onBrand)}>
              HOA NAM SCANNER
            </Text>
            <Text numberOfLines={1} style={font(13, 20, '400', HN_UI.onBrand)}>
              WMS - Vận hành chuyên nghiệp
            </Text>
          </View>
          <Pressable
            style={styles.bell}
            accessibilityRole="button"
            accessibilityLabel={
              home.unread === undefined
                ? 'Mở thông báo. Số chưa đọc chưa được xác minh'
                : 'Mở thông báo. ' + home.unread + ' chưa đọc'
            }
            disabled={!notificationsEnabled || !home.user}
            onPress={() => {
              if (isCurrentSnapshot() && notificationsEnabled && home.user) {
                if (onOpenNotifications) onOpenNotifications();
                else setNotificationsOpen(true);
              }
            }}
          >
            <HnHomeIcon name="bell" size={px(30)} color={HN_UI.onBrand} />
            {home.unread !== undefined && home.unread > 0 ? (
              <View style={styles.count}>
                <Text style={font(11, 12, '600', HN_UI.onBrand)}>
                  {home.unread > 9 ? '9+' : home.unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel="Mở trang cá nhân"
            disabled={!onOpenProfile}
            onPress={() => {
              if (isCurrentSnapshot()) onOpenProfile?.();
            }}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                accessibilityLabel="Ảnh đại diện"
              />
            ) : (
              <Text style={font(18, 22, '700', HN_UI.onBrand)}>{initials(name)}</Text>
            )}
          </Pressable>
        </View>
        <View style={styles.intro}>
          <View style={styles.warehouseLine}>
            <Text
              numberOfLines={1}
              style={[font(15, 20, '400', HN_UI.onBrand), styles.warehouseName]}
            >
              {home.warehouse?.name ?? 'Chưa xác minh tên kho'}
            </Text>
            <View style={[styles.status, { backgroundColor: statusColor }]}>
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <Text style={font(13, 18, '600', HN_UI.onBrand)}>
                {active === true
                  ? 'Đang hoạt động'
                  : active === false
                  ? 'Kho tạm dừng'
                  : 'Chưa xác minh'}
              </Text>
            </View>
          </View>
          <View style={styles.greeting}>
            <Text
              style={[
                font(28, 34, '700', HN_UI.onBrand),
                { letterSpacing: px(-0.7) },
                styles.greetingPrefix,
              ]}
            >
              Chào bạn,
            </Text>
            <Pressable
              style={styles.name}
              accessibilityRole="button"
              testID="hn-home-name"
              accessibilityLabel={'Xem đầy đủ tên: ' + name}
              onPress={() => {
                if (isCurrentSnapshot()) setNameOpen(true);
              }}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  font(28, 34, '700', HN_UI.onBrand),
                  { letterSpacing: px(-0.7) },
                ]}
              >
                {greetingName(name)}
              </Text>
            </Pressable>
          </View>
          <Text
            numberOfLines={1}
            style={[font(16, 22, '400', HN_UI.onBrand), styles.subtitle]}
          >
            Cùng vận hành kho hiệu quả hôm nay!
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.bodySurface} pointerEvents="none" />
        <ScrollView
          ref={scroll}
          testID="hn-home-scroll"
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (pendingRestore.current !== undefined)
              scroll.current?.scrollTo({
                y: pendingRestore.current,
                animated: false,
              });
          }}
          onScrollBeginDrag={() => {
            pendingRestore.current = undefined;
          }}
          scrollEventThrottle={64}
          onScroll={event => {
            const y = event.nativeEvent.contentOffset.y;
            if (pendingRestore.current !== undefined) {
              if (Math.abs(y - pendingRestore.current) > 1) return;
              pendingRestore.current = undefined;
            }
            if (viewState) viewState.scrollY = y;
          }}
        >
          <View testID="hn-home-kpis" style={styles.kpis}>
            {kpis.map((k, index) => (
              <Pressable
                key={k.key}
                style={({ pressed }) => [
                  styles.kpi,
                  index ? styles.kpiFollowing : styles.kpiFirst,
                  pressed ? styles.pressed : undefined,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  k.value === undefined
                    ? 'Chưa xác minh ' + k.label
                    : 'Xem ' + k.label
                }
                disabled={
                  k.value === undefined ||
                  (k.key === 'waiting'
                    ? !home.pendingListVerified || !onOpenPendingDocuments
                    : !onOpenWarrantyList)
                }
                onPress={() => {
                  if (!isCurrentSnapshot()) return;
                  if (
                    k.key === 'waiting' &&
                    home.pendingListVerified &&
                    k.value !== undefined
                  )
                    setPendingOpen(true);
                  else if (
                    k.key === 'warranty' &&
                    k.value !== undefined &&
                    onOpenWarrantyList
                  )
                    setWarrantyOpen(true);
                }}
              >
                {index ? <View style={styles.divider} /> : null}
                <View style={styles.kpiTop}>
                  <Text
                    testID={'hn-home-kpi-value-' + k.key}
                    numberOfLines={1}
                    style={[
                      font(
                        32,
                        36,
                        '700',
                        index === 0 ? HN_UI.danger : HN_HOME.ink,
                      ),
                      k.value !== undefined && String(k.value).length > 4
                        ? { fontSize: px(132 / String(k.value).length) }
                        : undefined,
                      k.value === undefined ? styles.kpiUnknown : undefined,
                    ]}
                  >
                    {k.value === undefined ? 'Chưa xác minh' : k.value}
                  </Text>
                  {k.value !== undefined ? (
                    <View
                      testID={'hn-home-kpi-icon-' + k.key}
                      style={[
                        styles.kpiGlyph,
                        index === 0 ? styles.kpiPendingGlyph : undefined,
                      ]}
                    >
                      <HnHomeIcon
                        name={k.icon}
                        size={px(22)}
                        color={index === 0 ? HN_UI.danger : HN_UI.textLink}
                      />
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[font(13, 20, '400', HN_HOME.muted), styles.kpiLabel]}
                >
                  {k.label}
                </Text>
              </Pressable>
            ))}
            <View style={[styles.kpi, styles.kpiFollowing]}>
              <View style={styles.divider} />
              <View style={styles.kpiTop}>
                {!connectionVisible ? (
                  <VietnamClock
                    style={[font(22, 36, '700'), styles.clockNumber]}
                    confirmedStartedAt={home.shift?.started_at}
                  />
                ) : null}
                <View style={styles.kpiGlyph}>
                  <HnHomeIcon name="clock" size={px(18)} color={HN_UI.textLink} />
                </View>
              </View>
              <Text
                style={[font(13, 20, '400', HN_HOME.muted), styles.kpiLabel]}
                accessibilityLabel="Đồng hồ giờ Việt Nam hiện tại; thời điểm START giữ nguyên trong phiên ca"
              >
                Giờ hiện tại
              </Text>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={[font(20, 23, '700'), styles.sectionTitle]}>
              Tác vụ kho
            </Text>
            <Pressable
              testID="hn-home-task-guide"
              style={({ pressed }) => [
                styles.taskGuide,
                pressed ? styles.pressed : undefined,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Chọn nghiệp vụ để bắt đầu"
              disabled={!onChooseTask}
              onPress={() => {
                if (isCurrentSnapshot()) onChooseTask?.();
              }}
            >
              <Text
                numberOfLines={2}
                style={[font(13, 20, '500', HN_UI.textLink), styles.taskGuideCopy]}
              >
                Chọn nghiệp vụ để bắt đầu
              </Text>
              <HnHomeIcon name="arrow" size={px(14)} color={HN_UI.textLink} />
            </Pressable>
          </View>
          <View testID="hn-home-task-grid" style={styles.grid}>
            {TASKS.map(task => (
              <Pressable
                key={task.key}
                testID={'hn-home-task-' + task.key}
                accessibilityRole="button"
                accessibilityLabel={task.title + '. ' + task.hint}
                accessibilityState={{ disabled: !canTask(task.key) }}
                disabled={!canTask(task.key)}
                onPress={() => select(task.key)}
                style={({ pressed }) => [
                  styles.task,
                  pressed ? styles.pressed : undefined,
                ]}
              >
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: HN_OPERATIONS[task.key].soft },
                  ]}
                >
                  <HnHomeIcon
                    name={task.icon}
                    size={px(28)}
                    color={HN_OPERATIONS[task.key].ink}
                    strokeWidth={2}
                  />
                </View>
                <View style={styles.taskCopy}>
                  <Text style={font(16, 21, '700')}>{task.title}</Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      font(12, 18, '400', HN_HOME.muted),
                      styles.taskHint,
                    ]}
                  >
                    {task.hint}
                  </Text>
                </View>
                <View style={styles.chevron}>
                  <HnHomeIcon name="chevron" size={px(15)} />
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            testID="hn-home-scanner"
            accessibilityRole="button"
            accessibilityLabel="Quét hoặc nhập mã sản phẩm"
            disabled={!canTask('lookup')}
            onPress={() => select('lookup')}
            style={({ pressed }) => [
              styles.scanner,
              pressed ? { opacity: 0.93 } : undefined,
            ]}
          >
            <View
              style={[
                styles.tile,
                styles.scannerTile,
                { backgroundColor: HN_OPERATIONS.lookup.soft },
              ]}
            >
              <HnHomeIcon
                name="scan"
                size={px(28)}
                color={HN_OPERATIONS.lookup.ink}
                strokeWidth={2}
              />
            </View>
            <View style={styles.scannerCopy}>
              <Text style={font(16, 22, '700', HN_UI.onBrand)}>
                Quét hoặc nhập mã sản phẩm
              </Text>
              <Text
                style={[font(13, 18, '400', HN_UI.selected), styles.scannerHint]}
              >
                QR · Serial · SKU
              </Text>
            </View>
            <HnHomeIcon name="chevron" size={px(19)} color={HN_UI.onBrand} />
          </Pressable>
          <View style={[styles.section, styles.recentHead]}>
            <Text style={font(20, 23, '700')}>Chứng từ gần đây</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xem tất cả chứng từ"
              disabled={!onSeeAll || !canReadDocuments}
              onPress={() => {
                if (isCurrentSnapshot() && canReadDocuments) onSeeAll?.();
              }}
              style={({ pressed }) => [
                styles.viewAll,
                pressed ? styles.pressed : undefined,
              ]}
            >
              <Text style={font(13, 20, '500', HN_UI.textLink)}>Xem tất cả</Text>
              <HnHomeIcon name="arrow" size={px(14)} color={HN_UI.textLink} />
            </Pressable>
          </View>
          <View testID="hn-home-records" style={styles.records}>
            {home.phase === 'loading' ? (
              <Text style={[font(14, 21, '400', HN_HOME.muted), styles.empty]}>
                Đang tải chứng từ…
              </Text>
            ) : !home.recentVerified ? (
              <Text style={[font(14, 21, '400', HN_HOME.muted), styles.empty]}>
                Chưa xác minh được nguồn chứng từ gần đây theo kho.
              </Text>
            ) : home.summary.recent.length === 0 ? (
              <Text style={[font(14, 21, '400', HN_HOME.muted), styles.empty]}>
                Chưa có chứng từ gần đây có thời gian được xác minh.
              </Text>
            ) : (
              recent.map((record, index) => {
                const badge = statusLabel(record);
                return (
                  <Pressable
                    key={record.type + ':' + record.id}
                    testID="hn-home-record"
                    accessibilityRole="button"
                    accessibilityLabel={'Mở chứng từ ' + record.number}
                    disabled={
                      record.type === 'warranty'
                        ? !onOpenWarrantyCase
                        : !onOpenDocument
                    }
                    onPress={() => {
                      if (
                        !isCurrentSnapshot() ||
                        !hasHomePermission(
                          home.user,
                          ...(record.type === 'warranty'
                            ? ['warranty.view', 'warranty.manage']
                            : [record.type + '.view']),
                        )
                      )
                        return;
                      if (record.type === 'warranty')
                        onOpenWarrantyCase?.(record.id);
                      else onOpenDocument?.(record.type, record.id);
                    }}
                    style={({ pressed }) => [
                      styles.record,
                      index ? styles.recordDivider : undefined,
                      pressed ? styles.pressed : undefined,
                    ]}
                  >
                    <View
                      style={[
                        styles.tile,
                        styles.recordIcon,
                        { backgroundColor: HN_OPERATIONS[record.type].soft },
                      ]}
                    >
                      <HnHomeIcon
                        name={
                          record.type === 'inbound'
                            ? 'down'
                            : record.type === 'outbound'
                            ? 'up'
                            : 'tool'
                        }
                        size={px(28)}
                        color={HN_OPERATIONS[record.type].ink}
                        strokeWidth={2}
                      />
                    </View>
                    <View style={styles.recordCopy}>
                      <Text style={font(16, 21, '700')}>
                        {record.number ?? 'Chưa xác minh mã'}
                      </Text>
                      <Text
                        style={[
                          font(13, 18, '400', HN_HOME.muted),
                          styles.recordHint,
                        ]}
                      >
                        {record.type === 'inbound'
                          ? 'Nhập kho'
                          : record.type === 'outbound'
                          ? 'Xuất kho'
                          : 'Bảo hành'}
                      </Text>
                    </View>
                    <View style={styles.meta}>
                      <Text
                        accessibilityLabel={formatDocumentTimestamp(
                          record.timestamp,
                          { missing: 'Chưa ghi nhận thời gian' },
                        )}
                        style={font(13, 18, '400', HN_HOME.muted)}
                      >
                        {homeDocumentTime(record.timestamp)}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: badge.background },
                        ]}
                      >
                        <Text style={font(12, 16, '400', badge.color)}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>
                    <HnHomeIcon name="chevron" size={px(16)} />
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
      {connectionError ? (
        <Modal
          testID="hn-home-connection-modal"
          visible={connectionVisible}
          transparent={false}
          animationType="none"
          presentationStyle="fullScreen"
          onRequestClose={closeConnection}
        >
          <P15ConnectionScreen
            active={connectionVisible}
            ownerKey={JSON.stringify([
              sessionKey,
              home.ownerKey,
              home.ownerGeneration,
              errorKey,
              actionEpoch,
            ])}
            isCurrent={currentConnection}
            intent={canReloadData ? 'read' : 'unavailable'}
            busy={home.refreshing || readRetryLatch.current}
            onRead={canReloadData ? reloadConnection : undefined}
            onBack={closeConnection}
            onHome={closeConnection}
            footer={
              connectionVisible && !home.refreshing && !readRetryLatch.current
                ? systemFooter
                : undefined
            }
          />
        </Modal>
      ) : (
        <Sheet
          visible={errorVisible}
          title="Không tải được dữ liệu trang chủ"
          onDismiss={dismissError}
        >
          <Text>
            {home.error
              ? messageForUser(home.error)
              : 'Chưa xác minh được dữ liệu.'}
          </Text>
          <Button
            label="Thử lại"
            disabled={home.refreshing}
            onPress={retryHomeRead}
          />
          <Button label="Đóng" variant="secondary" onPress={dismissError} />
        </Sheet>
      )}
      <Sheet
        visible={warrantyOpen}
        title="Bảo hành đang mở"
        onDismiss={() => setWarrantyOpen(false)}
      >
        <Text>
          Chọn trạng thái để xem hồ sơ. Đã hoàn tất xử lý vẫn tính đang mở khi
          chưa trả khách.
        </Text>
        {(
          [
            ['RECEIVED', 'Đã tiếp nhận'],
            ['CHECKING', 'Đang kiểm tra'],
            ['REPAIRING', 'Đang sửa chữa'],
            ['COMPLETED', 'Chờ bàn giao'],
          ] as const
        ).map(([status, label]) => (
          <Button
            key={status}
            label={label}
            onPress={() => {
              if (
                !isCurrentSnapshot() ||
                !hasHomePermission(
                  home.user,
                  'warranty.view',
                  'warranty.manage',
                )
              )
                return;
              setWarrantyOpen(false);
              onOpenWarrantyList?.(status);
            }}
          />
        ))}
      </Sheet>
      <Sheet
        visible={pendingOpen}
        title="Phiếu quét đủ chờ xử lý"
        onDismiss={() => setPendingOpen(false)}
      >
        <Text>Thống kê theo trạng thái quét. Danh sách có bàn giao được ghi nhận riêng.</Text>
        <Button
          label={
            'Nhập kho' +
            (home.summary.inboundPending === undefined
              ? ''
              : ' · ' + home.summary.inboundPending)
          }
          disabled={
            home.summary.inboundPending === undefined ||
            !home.pendingListVerified ||
            !hasHomePermission(home.user, 'inbound.view')
          }
          onPress={() => {
            if (
              !isCurrentSnapshot() ||
              !home.pendingListVerified ||
              home.summary.inboundPending === undefined ||
              !hasHomePermission(home.user, 'inbound.view')
            )
              return;
            setPendingOpen(false);
            onOpenPendingDocuments?.('inbound');
          }}
        />
        <Button
          label={
            'Xuất kho' +
            (home.summary.outboundPending === undefined
              ? ''
              : ' · ' + home.summary.outboundPending)
          }
          disabled={
            home.summary.outboundPending === undefined ||
            !home.pendingListVerified ||
            !hasHomePermission(home.user, 'outbound.view')
          }
          onPress={() => {
            if (
              !isCurrentSnapshot() ||
              !home.pendingListVerified ||
              home.summary.outboundPending === undefined ||
              !hasHomePermission(home.user, 'outbound.view')
            )
              return;
            setPendingOpen(false);
            onOpenPendingDocuments?.('outbound');
          }}
        />
      </Sheet>
      <Sheet
        visible={nameOpen}
        title="Tên đầy đủ"
        onDismiss={() => setNameOpen(false)}
      >
        <Text>{name}</Text>
        <Button label="Đã hiểu" onPress={() => setNameOpen(false)} />
      </Sheet>
      <NotificationPopover
        visible={notificationsOpen}
        onDismiss={() => setNotificationsOpen(false)}
        onUnreadCountChange={unreadChanged}
      />
    </View>
  );
}
