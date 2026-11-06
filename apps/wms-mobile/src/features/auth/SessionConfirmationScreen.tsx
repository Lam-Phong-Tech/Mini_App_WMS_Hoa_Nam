import {UI_KIT_COLORS} from '../../theme/uiKitV3';
import {HN_UI} from '../../theme/uiKitV3';
/**
 * Xác nhận phiên và ca kỹ thuật trước khi vào Home.
 *
 * `GET current` phục hồi ca ACTIVE; null không là negative proof cho START
 * intent cũ. Chỉ ca ACTIVE + preview_ready của đúng phiên/kho mới
 * được phép gọi `onContinue`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { getSession } from '../../auth/session';
import { contextReleaseVerified } from '../../config/homeContextRelease';
import {
  switchWarehouseContext,
  matchesReadyContext,
  contextErrorMessage,
} from '../../services/wms/warehouseContext';
import { AppError, toAppError, messageForUser } from '../../errors/AppError';
import { fetchCurrentUser, fetchWarehouses } from '../../services/wms/queries';
import { logout } from '../../services/wms/auth';
import type { CurrentUser, Warehouse } from '../../services/wms/types';
import {
  clearPendingWorkShiftStart,
  fetchCurrentWorkShift,
  getOrCreatePendingWorkShiftStart,
  isPreviewReadyShift,
  startWorkShift,
  UUID_PATTERN,
  type StartWorkShiftInput,
  type WorkShift,
  readPendingWorkShiftStart,
  markPendingWorkShiftStart,
} from '../../services/wms/workShift';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { shiftStartOwner } from '../../shift/startIntent';
import { getShiftState, hasPendingEndIntent } from '../../shift/shiftState';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { P01Icon } from './P01Icon';
import { Text } from '../../ui/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { P01ConfirmationBackdrop } from './P01ConfirmationBackdrop';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: HN_UI.canvas,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  brandCopy: { flex: 1 },
  shade: { flex: 1 },
  restoring: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: HN_UI.canvas,
  },
  content: { flexGrow: 1 },
  heroSection: { paddingTop: 10 },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_KIT_COLORS['brand.primary'],
    borderRadius: 13,
  },
  hero: { position: 'relative', paddingRight: 58 },
  greeting: { color: HN_UI.onBrand, fontWeight: '700' },
  heroTitle: {
    color: HN_UI.onBrand,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  heroHint: { color: HN_UI.onBrand, fontSize: 16, lineHeight: 23 },
  heroAside: {
    position: 'absolute',
    right: -6,
    top: -10,
    width: 52,
    gap: 3,
  },
  heroAsideText: {
    color: UI_KIT_COLORS['nav.muted'],
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroAsideRule: {
    width: 28,
    height: 2,
    backgroundColor: HN_UI.primary,
    marginTop: 4,
  },
  brandTitle: { color: HN_UI.onBrand },
  brandHint: { color: UI_KIT_COLORS['nav.fg'] },
  card: { borderRadius: 15, borderWidth: 0, elevation: 2 },
  lowerSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: HN_UI.canvas,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: HN_UI.border,
  },
  avatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: HN_UI.primary,
  },
  avatarText: { color: HN_UI.onBrand, fontWeight: '700' },
  accountInfo: { flex: 1, minWidth: 0 },
  accountName: {
    color: HN_UI.textPrimary,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  accountRole: { color: HN_UI.textMuted, fontSize: 13, lineHeight: 19 },
  warehouseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warehouseIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: HN_UI.canvas,
  },
  warehouseInfo: { flex: 1, minWidth: 0 },
  warehouseName: {
    color: HN_UI.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  warehouseHint: { color: HN_UI.textMuted, fontSize: 11, lineHeight: 16 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: HN_UI.successSoft,
  },
  statusPillUnknown: { backgroundColor: HN_UI.warningSoft },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HN_UI.success,
  },
  statusDotUnknown: { backgroundColor: HN_UI.warning },
  statusText: {
    color: HN_UI.success,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  statusTextUnknown: { color: HN_UI.warning },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
  },
  infoCopy: { flex: 1, minWidth: 0, color: HN_UI.textLink },
  startIcon: {
    backgroundColor: HN_UI.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLeading: { position: 'absolute', left: 13 },
  actionTrailing: { position: 'absolute', right: 15 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
  },
  dividerRule: { flex: 1, height: 1, backgroundColor: HN_UI.surfaceSunken },
  dividerText: { color: HN_UI.textMuted, fontSize: 12, lineHeight: 18 },
  logoutButton: { backgroundColor: HN_UI.canvas },
  footerBrand: {
    color: HN_UI.textMuted,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  footerHint: {
    color: HN_UI.textMuted,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loading: { alignItems: 'center' },
  footer: { paddingHorizontal: 25, alignItems: 'center', marginTop: 'auto' },
  footerLine: { height: 1, width: 28, backgroundColor: HN_UI.surfaceSunken },
  footerCaption: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greenAction: { backgroundColor: HN_UI.primary, borderRadius: 11 },
  startLabel: { fontWeight: '700', textAlign: 'center' },
  logoutLabel: { color: HN_UI.textLink, fontWeight: '700' },
});

function initials(value: string | undefined): string {
  if (value === undefined || value.trim() === '') return 'HN';
  return value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function scopeLabel(user: CurrentUser | undefined): string {
  const scopes = user?.warehouse_scope_ids;
  return scopes === null
    ? 'Không giới hạn kho theo phiên'
    : scopes === undefined
    ? 'Chưa xác minh phạm vi kho'
    : scopes.length === 0
    ? 'Chưa có kho trong phạm vi được cấp'
    : scopes.join(', ');
}

export interface SessionConfirmationScreenProps {
  onContinue: (shift: WorkShift) => void;
  onLoggedOut: () => void;
  /** Đồng bộ danh tính đã xác nhận vào phiên ứng dụng. */
  onIdentityResolved?: (user: CurrentUser) => void;
  onReconcileEnd?: () => void;
  fetchUser?: typeof fetchCurrentUser;
  fetchShift?: typeof fetchCurrentWorkShift;
  /** Best-effort danh mục để hiển thị tên của active_warehouse_id. */
  fetchWarehouses?: typeof fetchWarehouses;
  startShift?: typeof startWorkShift;
  logoutFn?: typeof logout;
  contextEnabled?: boolean;
  switchContext?: typeof switchWarehouseContext;
  /** Restoring a saved login, not a new login or an instruction to START. */
  restoring?: boolean;
}

function sessionContext(user: CurrentUser): StartWorkShiftInput | undefined {
  if (user.warehouse_context && user.warehouse_context.status !== 'READY')
    return undefined;
  const authSessionId = user.auth_session_id?.trim();
  const warehouseId = user.active_warehouse_id?.trim();
  const actorId = user.id?.trim();
  if (!authSessionId || !warehouseId || !actorId) return undefined;
  return { actorId, authSessionId, warehouseId };
}
function explicitStartDenial(
  user: CurrentUser | undefined,
  warehouse?: Warehouse,
): boolean {
  return (
    user?.status === 'INACTIVE' ||
    user?.canonical_profile?.status === 'INACTIVE' ||
    user?.warehouse_context?.error_code === 'WAREHOUSE_INACTIVE' ||
    warehouse?.status === 'INACTIVE' ||
    user?.available_warehouses?.find(
      row => row.warehouse_id === user.active_warehouse_id,
    )?.status === 'INACTIVE'
  );
}

/** Display one BE-granted option; the existing START CTA explicitly confirms
 * it. Never select from several grants or write context while mounting. */
function singleRequiredWarehouse(user: CurrentUser | undefined) {
  if (
    user?.warehouse_context?.status !== 'REQUIRED' ||
    !user.id?.trim() ||
    !user.auth_session_id?.trim()
  )
    return undefined;
  const active = user.available_warehouses?.filter(w => w.status === 'ACTIVE');
  return active?.length === 1 && UUID_PATTERN.test(active[0]!.warehouse_id)
    ? active[0]
    : undefined;
}

function shouldRecheckCurrent(error: AppError): boolean {
  return (
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    error.kind === 'blocked_by_edge' ||
    error.kind === 'parse' ||
    error.kind === 'unknown' ||
    (error.kind === 'http' &&
      error.status !== undefined &&
      (error.status === 429 || error.status >= 500))
  );
}

function startFailureMessage(error: AppError): string {
  if (error.kind === 'http' && error.status === 422) {
    return 'WMS từ chối dữ liệu bắt đầu ca. Cần kiểm tra UUID kho, Idempotency-Key và body yêu cầu.';
  }
  if (error.kind === 'http' && error.status === 404) {
    return 'Kho làm việc không tồn tại trên WMS. Không thể bắt đầu ca.';
  }
  if (error.kind === 'http' && error.status === 429) {
    return 'WMS đang giới hạn yêu cầu. Chưa có xác nhận bắt đầu ca; ứng dụng vẫn ở màn này.';
  }
  if (shouldRecheckCurrent(error)) {
    return 'Chưa xác nhận được ca đã bắt đầu. Ứng dụng không mở Trang chủ; hãy kiểm tra lại ca hoặc gửi lại cùng yêu cầu.';
  }
  if (error.kind === 'config' || error.kind === 'parse') return error.message;
  return messageForUser(error);
}

export function SessionConfirmationScreen({
  onContinue,
  onLoggedOut,
  onIdentityResolved,
  onReconcileEnd,
  fetchUser = fetchCurrentUser,
  fetchShift = fetchCurrentWorkShift,
  fetchWarehouses: fetchWarehouseList = fetchWarehouses,
  startShift = startWorkShift,
  logoutFn = logout,
  contextEnabled = contextReleaseVerified(),
  switchContext = switchWarehouseContext,
  restoring = false,
}: SessionConfirmationScreenProps): React.ReactElement {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const frameWidth = Math.min(width, 494);
  const scale = frameWidth / 494;
  const heroHeight = 276 * scale;
  const { top: safeTop } = useSafeAreaInsets();
  const [measuredHeroHeight, setMeasuredHeroHeight] = useState<number>();
  const shownHeroHeight = measuredHeroHeight ?? heroHeight;
  const artworkHeroHeight = shownHeroHeight + safeTop;
  const artworkHeight = artworkHeroHeight + 50 * scale;
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [warehouse, setWarehouse] = useState<Warehouse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>();
  const [startError, setStartError] = useState<string | undefined>();
  const [startErrorStep, setStartErrorStep] = useState<
    'context' | 'current' | 'start'
  >('start');
  const [readyToStart, setReadyToStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const requestSequence = useRef(0);
  const startLatch = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const originalAuth = captureSessionScope();
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(undefined);
    setStartError(undefined);
    setReadyToStart(false);
    setWarehouse(undefined);
    try {
      const resolvedUser = await fetchUser();
      if (!mounted.current || requestId !== requestSequence.current) return;
      if (
        fetchUser === fetchCurrentUser &&
        originalAuth.generation !== captureSessionScope().generation
      )
        return;
      if (
        fetchUser === fetchCurrentUser &&
        ((originalAuth.userId && resolvedUser.id !== originalAuth.userId) ||
          (originalAuth.authSessionId &&
            resolvedUser.auth_session_id !== originalAuth.authSessionId))
      )
        throw new AppError({
          kind: 'parse',
          route: '/api/v1/auth/me',
          message: 'Danh tính /auth/me không khớp auth owner hiện tại.',
        });
      setUser(resolvedUser);
      onIdentityResolved?.(resolvedUser);
      const context = sessionContext(resolvedUser);
      if (context === undefined) {
        if (resolvedUser.warehouse_context?.status === 'REQUIRED') {
          if (!contextEnabled || !singleRequiredWarehouse(resolvedUser))
            throw new AppError({
              kind: 'config',
              route: '/api/v1/auth/me',
              message: !contextEnabled
                ? 'Xác nhận context kho chưa được mở. Giữ phiên, không tự bắt đầu ca.'
                : 'Phiên cần đúng một kho ACTIVE hợp lệ được BE cấp. Không tự chọn kho đầu tiên.',
            });
          // User13/10: explicit choice is the existing START CTA, not a picker.
          // No switch-context or START occurs before that deliberate click.
          setReadyToStart(true);
          return;
        } else {
          throw new AppError({
            kind: 'config',
            route: '/api/v1/auth/me',
            message:
              'Context kho chưa READY. Giữ phiên, không tự chọn hoặc nâng quyền.',
          });
        }
      }
      // Warehouse names are presentation data. A failure must not block the
      // contract-critical /auth/me + current-shift checks or make the app pick
      // a different warehouse; the UUID remains the start payload authority.
      fetchWarehouseList()
        .then(page => {
          if (!mounted.current || requestId !== requestSequence.current) return;
          setWarehouse(
            page.items.find(item => item.id === context.warehouseId),
          );
        })
        .catch(() => undefined);

      const currentShift = await fetchShift();
      if (!mounted.current || requestId !== requestSequence.current) return;
      if (currentShift === null) {
        // Pending START must keep its original key across reload/current:null.
        // It may have committed and ended; null is not negative execution proof.
        setReadyToStart(true);
        return;
      }
      if (!isPreviewReadyShift(currentShift, context)) {
        throw new AppError({
          kind: 'parse',
          route: '/api/v1/mini-app/work-shifts/current',
          message: 'Ca hiện tại không khớp phiên/kho hoặc chưa sẵn sàng.',
        });
      }
      // current does not identify the original START key, including journals
      // from older builds with no outcome. Only its exact receipt clears it.
      onContinue(currentShift);
    } catch (cause) {
      if (!mounted.current || requestId !== requestSequence.current) return;
      setError(toAppError(cause));
    } finally {
      if (mounted.current && requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [
    fetchShift,
    fetchUser,
    fetchWarehouseList,
    onContinue,
    onIdentityResolved,
    contextEnabled,
  ]);

  useEffect(() => {
    mounted.current = true;
    load().catch(() => undefined);
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, [load]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    // Huỷ mọi callback current/start đang bay trước khi xoá phiên local.
    requestSequence.current += 1;
    startLatch.current = true;
    setLoggingOut(true);
    // logout() captures credentials and clears local state synchronously.
    // Leave now; a late server response must never reset a later login.
    const request = logoutFn();
    onLoggedOut();
    try {
      await request;
    } catch {
      // Local teardown already completed. Server result is reported by auth.
    }
  }, [loggingOut, logoutFn, onLoggedOut]);

  const handleStartShift = useCallback(async () => {
    if (startLatch.current || starting || !readyToStart || user === undefined)
      return;
    let context = sessionContext(user);
    const grant = singleRequiredWarehouse(user);
    const selected =
      context ??
      (grant
        ? {
            actorId: user.id!.trim(),
            authSessionId: user.auth_session_id!.trim(),
            warehouseId: grant.warehouse_id,
          }
        : undefined);
    if (!selected) {
      setStartErrorStep('context');
      setStartError('Chưa có đúng một kho được cấp và danh tính hợp lệ.');
      return;
    }
    startLatch.current = true;
    const operationId = ++requestSequence.current;
    const originalScope = captureSessionScope();
    let authScope = originalScope;
    let step: 'context' | 'current' | 'start' = context ? 'start' : 'context';
    let startDispatched = false;
    const current = () => {
      if (!mounted.current || requestSequence.current !== operationId)
        return false;
      const now = captureSessionScope();
      const knownOwner =
        originalScope.userId !== undefined &&
        originalScope.authSessionId !== undefined;
      if (
        knownOwner &&
        (now.generation !== originalScope.generation ||
          now.userId !== selected.actorId ||
          now.authSessionId !== selected.authSessionId)
      )
        return false;
      if (
        knownOwner &&
        now.warehouseId?.toLowerCase() !==
          originalScope.warehouseId?.toLowerCase() &&
        now.warehouseId?.toLowerCase() !== selected.warehouseId.toLowerCase()
      )
        return false;
      return startShift !== startWorkShift || knownOwner;
    };
    setStarting(true);
    setReadyToStart(false);
    setStartError(undefined);
    try {
      if (!current()) return;
      const saved = readPendingWorkShiftStart();
      if (!saved && explicitStartDenial(user, warehouse))
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'SHIFT_ADMISSION_DENIED',
          message:
            'Tài khoản hoặc kho đã bị ngừng hoạt động. Chưa gửi yêu cầu bắt đầu ca.',
        });
      if (hasPendingEndIntent(selected))
        throw new AppError({
          kind: 'unknown',
          code: 'SHIFT_END_PENDING',
          message:
            'END cũ cần đối chiếu bằng key gốc. Không xác nhận kho/mở ca bù.',
        });
      if (
        saved?.authSessionId === selected.authSessionId &&
        (saved.actorId !== selected.actorId ||
          saved.warehouseId !== selected.warehouseId)
      )
        throw new AppError({
          kind: 'unknown',
          code: 'SHIFT_START_INTENT_CONFLICT',
          message:
            'START intent cũ cần đối chiếu. Không đổi kho/owner để mở ca khác.',
        });
      const shared = getShiftState();
      if (
        startShift === startWorkShift &&
        !saved &&
        (shared.shift?.lifecycle?.mode === 'DRAINING' ||
          (shared.phase === 'ENDED' &&
            shared.shift?.lifecycle?.mode === 'DISABLED'))
      )
        throw new AppError({
          kind: 'blocked_by_gate',
          message:
            'Lifecycle hiện tại không nhận ca mới. Giữ đăng nhập và ca/intent cũ.',
        });
      if (!context) {
        if (!contextEnabled || !grant)
          throw new AppError({
            kind: 'config',
            message: 'Chưa đủ điều kiện xác nhận kho.',
          });
        const confirmed = await switchContext(selected);
        if (!current()) return;
        if (!matchesReadyContext(confirmed, selected))
          throw new AppError({
            kind: 'parse',
            route: '/api/v1/auth/switch-context',
            message: 'Context response không khớp kho và owner đã xác nhận.',
          });
        const reread = await fetchUser();
        if (!current()) return;
        if (!matchesReadyContext(reread, selected))
          throw new AppError({
            kind: 'unknown',
            route: '/api/v1/auth/me',
            message:
              'Context đọc lại chưa khớp người/phiên/kho. Chưa gửi START.',
          });
        context = sessionContext(reread);
        if (!context)
          throw new AppError({
            kind: 'parse',
            message: 'Context đọc lại chưa READY.',
          });
        setUser(reread);
        onIdentityResolved?.(reread);
        authScope = captureSessionScope();
        step = 'current';
        const recovered = await fetchShift();
        if (
          !current() ||
          (startShift === startWorkShift && !isSessionScopeCurrent(authScope))
        )
          return;
        if (recovered !== null) {
          if (!isPreviewReadyShift(recovered, context))
            throw new AppError({
              kind: 'parse',
              route: '/api/v1/mini-app/work-shifts/current',
              message:
                'Ca hiện tại không khớp owner/kho hoặc chưa sẵn sàng. Không tạo ca khác.',
            });
          // This proves own ACTIVE current, not the result of an old START key.
          onContinue(recovered);
          return;
        }
      }
      // Reobserve advisory admission for a new intent. An old START/END keeps
      // its original reconciliation owner and is never resolved by current:null.
      if (startShift === startWorkShift && !saved) {
        step = 'current';
        const reobserved = await fetchShift();
        if (!current() || !isSessionScopeCurrent(authScope)) return;
        if (reobserved !== null) {
          if (!isPreviewReadyShift(reobserved, context))
            throw new AppError({
              kind: 'parse',
              message: 'Ca đọc lại chưa khớp owner. Không mở ca khác.',
            });
          onContinue(reobserved);
          return;
        }
      }
      step = 'start';
      authScope = captureSessionScope();
      const pending = getOrCreatePendingWorkShiftStart(
        context.authSessionId,
        context.warehouseId,
        context.actorId,
      );
      markPendingWorkShiftStart('IN_FLIGHT');
      startDispatched = true;
      const shift =
        startShift === startWorkShift
          ? await shiftStartOwner.start(context, true)
          : await startShift(context, pending.idempotencyKey);
      if (
        !current() ||
        (startShift === startWorkShift && !isSessionScopeCurrent(authScope))
      )
        return;
      if (
        shift.status === 'ENDED' &&
        shift.actor_id === context.actorId &&
        shift.auth_session_id === context.authSessionId &&
        shift.warehouse_id === context.warehouseId
      ) {
        clearPendingWorkShiftStart(context.authSessionId);
        setReadyToStart(true);
        setStartErrorStep('start');
        setStartError(
          'START key cũ trả ca ENDED. Ca mới chỉ bắt đầu bằng lần bấm mới và key mới.',
        );
        return;
      }
      if (!isPreviewReadyShift(shift, context))
        throw new AppError({
          kind: 'parse',
          route: '/api/v1/mini-app/work-shifts/start',
          message: 'WMS chưa xác nhận ca ACTIVE và preview_ready.',
        });
      clearPendingWorkShiftStart(context.authSessionId);
      onContinue(shift);
    } catch (cause) {
      if (
        !current() ||
        (step !== 'context' &&
          startShift === startWorkShift &&
          !isSessionScopeCurrent(authScope))
      )
        return;
      const failure = toAppError(cause);
      // Context/current failures must never fabricate a START journal/outcome.
      if (startDispatched && context) {
        markPendingWorkShiftStart('UNKNOWN');
        if (shouldRecheckCurrent(failure)) {
          try {
            const recovered = await fetchShift();
            if (
              !current() ||
              (startShift === startWorkShift &&
                !isSessionScopeCurrent(authScope))
            )
              return;
            if (recovered !== null && isPreviewReadyShift(recovered, context)) {
              onContinue(recovered);
              return;
            }
            if (recovered === null) setReadyToStart(true);
          } catch {
            /* original START key/body remain unresolved, no retry */
          }
        }
      }
      setStartErrorStep(step);
      setStartError(
        step === 'context'
          ? contextErrorMessage(failure)
          : !startDispatched
          ? failure.message
          : startFailureMessage(failure),
      );
    } finally {
      startLatch.current = false;
      if (mounted.current && requestSequence.current === operationId)
        setStarting(false);
    }
  }, [
    fetchShift,
    fetchUser,
    onContinue,
    onIdentityResolved,
    startShift,
    switchContext,
    contextEnabled,
    starting,
    readyToStart,
    user,
    warehouse,
  ]);

  const session = getSession();
  const name =
    user?.name ?? session?.userName ?? session?.userId ?? 'Tài khoản WMS';
  const grantedWarehouse =
    user?.available_warehouses?.find(
      item => item.warehouse_id === user.active_warehouse_id,
    ) ?? singleRequiredWarehouse(user);
  const warehouseName =
    warehouse?.name ??
    grantedWarehouse?.name ??
    grantedWarehouse?.code ??
    grantedWarehouse?.warehouse_id ??
    user?.active_warehouse_id ??
    scopeLabel(user);
  const warehouseStatus = warehouse?.status ?? grantedWarehouse?.status;
  const warehouseIsActive = warehouseStatus === 'ACTIVE';

  // A restored login still needs /auth/me + owner current proof. Do not flash
  // the new-shift confirmation while those reads are pending, or bypass them.
  if (restoring && loading) {
    return (
      <View
        testID="P01.session.restore-loading"
        style={styles.restoring}
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator />
        <Text>Đang khôi phục ca làm việc…</Text>
        <Button
          label="Đăng xuất"
          variant="secondary"
          loading={loggingOut}
          onPress={() => {
            handleLogout().catch(() => undefined);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { width: frameWidth }]}>
      <P01ConfirmationBackdrop
        width={frameWidth}
        height={artworkHeight}
        heroHeight={artworkHeroHeight}
      />
      <View
        style={[
          styles.lowerSurface,
          { top: shownHeroHeight + safeTop + 50 * scale },
        ]}
        pointerEvents="none"
      />
      <SafeAreaView edges={['top', 'bottom']} style={styles.shade}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 18 * scale },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View
            testID="P01.session.hero"
            onLayout={event =>
              setMeasuredHeroHeight(event.nativeEvent.layout.height)
            }
            style={[
              styles.heroSection,
              { minHeight: heroHeight, paddingHorizontal: 26 * scale },
            ]}
          >
            <View style={[styles.brand, { gap: 15 * scale }]}>
              <View
                testID="P01.session.brand-mark"
                style={[styles.mark, { width: 56 * scale, height: 58 * scale }]}
              >
                <P01Icon
                  name="auth-scan"
                  color={HN_UI.onBrand}
                  size={42 * scale}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.brandCopy}>
                <Text
                  variant="cardTitle"
                  style={[
                    styles.brandTitle,
                    { fontSize: 16 * scale, lineHeight: 22 * scale },
                  ]}
                >
                  HOA NAM SCANNER
                </Text>
                <Text
                  variant="caption"
                  style={[
                    styles.brandHint,
                    { fontSize: 14 * scale, lineHeight: 19 * scale },
                  ]}
                >
                  WMS - Vận hành chuyên nghiệp
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.hero,
                {
                  marginTop: 54 * scale,
                  paddingBottom: 22 * scale,
                  paddingRight: 58 * scale,
                },
              ]}
            >
              <View accessible accessibilityLabel={'Chào ' + name}>
                <Text
                  style={[
                    styles.greeting,
                    { fontSize: 22 * scale, lineHeight: 29 * scale },
                  ]}
                >
                  Chào bạn,
                </Text>
                <Text
                  style={[
                    styles.heroTitle,
                    { fontSize: 36 * scale, lineHeight: 40 * scale },
                  ]}
                >
                  {name}
                </Text>
                <Text
                  style={[
                    styles.heroHint,
                    {
                      marginTop: 8 * scale,
                      fontSize: 16 * scale,
                      lineHeight: 23 * scale,
                    },
                  ]}
                >
                  Sẵn sàng bắt đầu{'\n'}ca làm việc?
                </Text>
              </View>
              <View
                style={[
                  styles.heroAside,
                  {
                    right: -6 * scale,
                    top: -10 * scale,
                    width: 52 * scale,
                    gap: 3 * scale,
                  },
                ]}
                accessible={false}
              >
                {['MỖI', 'THAO TÁC', 'TẠO NÊN', 'GIÁ TRỊ'].map(line => (
                  <Text
                    key={line}
                    style={[
                      styles.heroAsideText,
                      { fontSize: 9 * scale, lineHeight: 13 * scale },
                    ]}
                  >
                    {line}
                  </Text>
                ))}
                <View
                  style={[
                    styles.heroAsideRule,
                    { width: 28 * scale, marginTop: 4 * scale },
                  ]}
                />
              </View>
            </View>
          </View>

          <Box
            testID="P01.session.card"
            card
            style={[
              styles.card,
              {
                marginHorizontal: 11 * scale,
                paddingHorizontal: 20 * scale,
                paddingTop: 22 * scale,
                paddingBottom: 21 * scale,
              },
            ]}
          >
            <View
              style={[
                styles.accountRow,
                { gap: 19 * scale, paddingBottom: 14 * scale },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    width: 70 * scale,
                    height: 70 * scale,
                    borderRadius: 35 * scale,
                  },
                ]}
              >
                <Text
                  variant="metric"
                  style={[
                    styles.avatarText,
                    { fontSize: 24 * scale, lineHeight: 28 * scale },
                  ]}
                >
                  {initials(name)}
                </Text>
              </View>
              <View style={styles.accountInfo}>
                <Text
                  style={[
                    styles.accountName,
                    { fontSize: 21 * scale, lineHeight: 28 * scale },
                  ]}
                >
                  {name}
                </Text>
                <Text
                  style={[
                    styles.accountRole,
                    { fontSize: 16 * scale, lineHeight: 22 * scale },
                  ]}
                >
                  {user?.role ?? 'Chưa xác minh vai trò'}
                </Text>
              </View>
              <P01Icon name="chevron" color={HN_UI.textMuted} size={22 * scale} />
            </View>

            {loading ? (
              <View
                style={[
                  styles.loading,
                  { gap: theme.spacing.sm, paddingVertical: theme.spacing.lg },
                ]}
              >
                <ActivityIndicator />
                <Text variant="caption" tone="muted">
                  Đang tải thông tin phiên…
                </Text>
              </View>
            ) : error !== undefined ? (
              <Banner
                tone="danger"
                title={
                  error.kind === 'config' && error.route === '/api/v1/auth/me'
                    ? 'Chưa xác nhận kho làm việc'
                    : 'Không tải được thông tin tài khoản'
                }
                message={
                  error.route === '/api/v1/auth/switch-context'
                    ? contextErrorMessage(error)
                    : error.kind === 'config'
                    ? error.message
                    : messageForUser(error)
                }
              >
                <Button
                  label="Thử lại"
                  variant="secondary"
                  onPress={() => {
                    load().catch(() => undefined);
                  }}
                />
              </Banner>
            ) : (
              <>
                <View
                  style={[
                    styles.warehouseRow,
                    {
                      marginTop: 17 * scale,
                      minHeight: 48 * scale,
                      marginBottom: 21 * scale,
                    },
                  ]}
                >
                  <View
                    testID="P01.session.warehouse-tile"
                    style={[
                      styles.warehouseIcon,
                      {
                        width: 48 * scale,
                        height: 48 * scale,
                        borderRadius: 10 * scale,
                      },
                    ]}
                  >
                    <P01Icon
                      name="warehouse"
                      color={HN_UI.textLink}
                      size={27 * scale}
                    />
                  </View>
                  <View
                    style={[styles.warehouseInfo, { marginLeft: 14 * scale }]}
                  >
                    <Text
                      style={[
                        styles.warehouseName,
                        { fontSize: 17 * scale, lineHeight: 23 * scale },
                      ]}
                    >
                      {warehouseName}
                    </Text>
                    <Text
                      style={[
                        styles.warehouseHint,
                        { fontSize: 13 * scale, lineHeight: 18 * scale },
                      ]}
                    >
                      WMS - Vận hành chuyên nghiệp
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        minWidth: 122 * scale,
                        minHeight: 28 * scale,
                        paddingVertical: 5 * scale,
                        paddingHorizontal: 8 * scale,
                        gap: 7 * scale,
                      },
                      warehouseIsActive ? undefined : styles.statusPillUnknown,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          width: 9 * scale,
                          height: 9 * scale,
                          borderRadius: 4.5 * scale,
                        },
                        warehouseIsActive ? undefined : styles.statusDotUnknown,
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { fontSize: 12 * scale, lineHeight: 18 * scale },
                        warehouseIsActive
                          ? undefined
                          : styles.statusTextUnknown,
                      ]}
                    >
                      {warehouseIsActive
                        ? 'Đang hoạt động'
                        : warehouseStatus === 'INACTIVE'
                        ? 'Ngừng hoạt động'
                        : 'Chưa xác minh'}
                    </Text>
                  </View>
                </View>

                <View
                  testID="P01.session.notice"
                  accessible
                  style={[
                    styles.infoBanner,
                    {
                      minHeight: 74 * scale,
                      paddingVertical: 16 * scale,
                      paddingHorizontal: 15 * scale,
                      gap: 13 * scale,
                    },
                  ]}
                >
                  <P01Icon name="info" color={HN_UI.textSecondary} size={23 * scale} />
                  <Text
                    testID="P01.session.notice-copy"
                    style={[
                      styles.infoCopy,
                      {
                        fontSize: 15 * scale,
                        lineHeight: 21 * scale,
                        maxWidth: 300 * scale,
                      },
                    ]}
                  >
                    Thao tác theo quyền được cấp cho tài khoản của bạn.
                  </Text>
                </View>
              </>
            )}

            {startError === undefined ? null : (
              <Banner
                tone="danger"
                title={
                  startErrorStep === 'context'
                    ? 'Chưa xác nhận kho làm việc'
                    : 'Chưa xác nhận bắt đầu ca'
                }
                message={startError}
              >
                <Button
                  label={
                    startErrorStep === 'context'
                      ? 'Kiểm tra lại phiên'
                      : 'Kiểm tra lại ca'
                  }
                  variant="secondary"
                  onPress={() => {
                    load().catch(() => undefined);
                  }}
                />
              </Banner>
            )}

            {onReconcileEnd && hasPendingEndIntent() ? (
              <Button
                label="Đối chiếu yêu cầu kết thúc ca trước"
                onPress={onReconcileEnd}
              />
            ) : null}
            <Button
              label="Bắt đầu ca làm việc"
              accessibilityLabel="Bắt đầu ca"
              accessibilityHint={
                readyToStart
                  ? singleRequiredWarehouse(user)
                    ? 'Xác nhận kho đang hiển thị, đọc lại context rồi bắt đầu ca'
                    : 'Chưa bắt đầu ca'
                  : undefined
              }
              onPress={() => {
                handleStartShift().catch(() => undefined);
              }}
              disabled={
                loading ||
                error !== undefined ||
                !readyToStart ||
                (explicitStartDenial(user, warehouse) &&
                  !readPendingWorkShiftStart()) ||
                hasPendingEndIntent()
              }
              loading={starting}
              leading={
                <View
                  style={[
                    styles.startIcon,
                    styles.actionLeading,
                    { width: 44 * scale, height: 44 * scale },
                  ]}
                >
                  <P01Icon name="play" color={HN_UI.onBrand} size={25 * scale} />
                </View>
              }
              trailing={
                <View style={styles.actionTrailing}>
                  <P01Icon name="chevron" color={HN_UI.onBrand} size={22 * scale} />
                </View>
              }
              style={[
                styles.greenAction,
                {
                  marginTop: 20 * scale,
                  minHeight: Math.max(44, 70 * scale),
                  paddingLeft: 64 * scale,
                  paddingRight: 38 * scale,
                },
              ]}
              labelStyle={[
                styles.startLabel,
                { fontSize: 18 * scale, lineHeight: 24 * scale },
              ]}
            />

            <View
              style={[styles.divider, { marginVertical: 16 * scale }]}
              accessible={false}
            >
              <View style={styles.dividerRule} />
              <Text
                style={[
                  styles.dividerText,
                  { fontSize: 14 * scale, lineHeight: 16 * scale },
                ]}
              >
                hoặc
              </Text>
              <View style={styles.dividerRule} />
            </View>

            <Button
              label="Đăng xuất"
              accessibilityLabel="Đăng xuất"
              variant="secondary"
              loading={loggingOut}
              leading={
                <P01Icon name="logout" color={HN_UI.textLink} size={25 * scale} />
              }
              onPress={() => {
                handleLogout().catch(() => undefined);
              }}
              style={[
                styles.logoutButton,
                { minHeight: Math.max(44, 58 * scale) },
              ]}
              labelStyle={[styles.logoutLabel, { fontSize: 17 * scale }]}
            />
          </Box>

          <View
            testID="P01.session.footer"
            style={[styles.footer, { paddingTop: 28 * scale }]}
          >
            <Text
              variant="caption"
              style={[
                styles.footerBrand,
                { fontSize: 12 * scale, lineHeight: 18 * scale },
              ]}
            >
              HOA NAM SCANNER
            </Text>
            <View style={[styles.footerCaption, { gap: 16 * scale }]}>
              <View style={[styles.footerLine, { width: 40 * scale }]} />
              <Text
                variant="caption"
                style={[
                  styles.footerHint,
                  { fontSize: 11 * scale, lineHeight: 18 * scale },
                ]}
              >
                AN TOÀN - CHÍNH XÁC - HIỆU QUẢ
              </Text>
              <View style={[styles.footerLine, { width: 40 * scale }]} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
