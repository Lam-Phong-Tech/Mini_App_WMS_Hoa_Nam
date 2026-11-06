/** P02 revision2: scoped server summary, no page-length totals or fixture fallback. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getSession,
  getSessionGeneration,
  subscribeSession,
  type Session,
} from '../../auth/session';
import { AppError, toAppError } from '../../errors/AppError';
import {subscribeNotificationFreshness} from '../notifications/delivery/freshness';
import {isDeliveryOwnerCurrent} from '../notifications/delivery/ownerScope';
import {
  fetchCurrentUser,
  fetchInboundDocuments,
  fetchOutboundDocuments,
} from '../../services/wms/queries';
import {
  fetchCurrentWorkShift,
  isPreviewReadyShift,
  type WorkShift,
} from '../../services/wms/workShift';
import {
  HOME_CAPABILITIES,
  fetchHomeUser,
  confirmedHomeWarehouse,
  hasHomePermission,
  aggregatePending,
  fetchHomeWarehouse,
  fetchHomeStockSummary,
  fetchHomeUnreadCount,
  validCount,
  type HomeCapabilities,
  type RecentDocument,
} from '../../services/wms/home';
import type {
  CurrentUser,
  Page,
  Warehouse,
  WarrantyCase,
} from '../../services/wms/types';
import type { ReadOptions } from '../../services/wms/readOnlyClient';
import { fetchHomeRecentDocuments } from './homeDocuments';
import { logger } from '../../logging/logger';
import {
  getShiftState,
  subscribeShiftState,
  sameShiftOwner,
  type ShiftState,
} from '../../shift/shiftState';
export const STATUS_WAITING_APPROVAL = 'WAITING_APPROVAL';
export interface HomeSummary {
  readonly pendingApproval?: number;
  readonly inboundPending?: number;
  readonly outboundPending?: number;
  readonly openWarranty?: number;
  readonly recent: readonly RecentDocument[];
}
export type HomePhase = 'loading' | 'ready' | 'error';
export interface HomeState {
  readonly ownerKey?: string;
  readonly ownerGeneration?: number;
  readonly phase: HomePhase;
  readonly summary: HomeSummary;
  readonly user?: CurrentUser;
  readonly warehouse?: Warehouse;
  readonly shift?: WorkShift;
  readonly unread?: number;
  readonly recentVerified: boolean;
  readonly pendingListVerified: boolean;
  readonly error?: AppError;
  readonly loadedAt?: Date;
  readonly refreshing: boolean;
}
export interface UseHomeSummaryDeps {
  readonly fetchUser?: typeof fetchCurrentUser;
  readonly fetchStockSummary?: typeof fetchHomeStockSummary;
  readonly fetchWarehouse?: typeof fetchHomeWarehouse;
  readonly fetchShift?: typeof fetchCurrentWorkShift;
  readonly fetchUnread?: typeof fetchHomeUnreadCount;
  readonly fetchInboundRecent?: typeof fetchInboundDocuments;
  readonly fetchOutboundRecent?: typeof fetchOutboundDocuments;
  readonly fetchRecentDocuments?: typeof fetchHomeRecentDocuments;
  // Deprecated injection compatibility: P02 v2 never uses this list for KPI.
  readonly fetchScopedWarranty?: (
    warehouseId: string,
    options: ReadOptions,
  ) => Promise<Page<WarrantyCase>>;
  readonly capabilities?: HomeCapabilities;
  readonly readSession?: () => Session | undefined;
  readonly readSharedShift?: typeof getShiftState;
}
export interface HomeScope {
  readonly key?: string;
  readonly confirmedShift?: WorkShift;
}
const EMPTY: HomeState = {
  phase: 'loading',
  summary: { recent: [] },
  recentVerified: false,
  pendingListVerified: false,
  refreshing: false,
};
const UNVERIFIED_SHIFT: ShiftState = Object.freeze({ phase: 'UNVERIFIED', verificationEpoch: 0 });
const readUnverifiedShift = () => UNVERIFIED_SHIFT;
const sessionKey = (s: Session | undefined) =>
  JSON.stringify([s?.userId, s?.authSessionId, s?.activeWarehouseId]);
const unavailable = async (): Promise<never> => {
  throw new AppError({
    kind: 'config',
    message: 'Nguồn đọc chưa được cấu hình.',
  });
};
export function useHomeSummary(
  deps?: UseHomeSummaryDeps,
  scope: HomeScope = {},
): HomeState & { reload: () => void } {
  // Dependency injection never falls through to a live request during tests.
  const live = deps === undefined;
  const generation = useSyncExternalStore(
    subscribeSession,
    getSessionGeneration,
  );
  const readSharedShift =
    deps?.readSharedShift ?? (live ? getShiftState : readUnverifiedShift);
  const sharedShift = useSyncExternalStore(
    subscribeShiftState,
    readSharedShift,
  );
  const fetchUser = deps?.fetchUser ?? (live ? fetchHomeUser : unavailable);
  const fetchSummary =
    deps?.fetchStockSummary ?? (live ? fetchHomeStockSummary : unavailable);
  const fetchWarehouse =
    deps?.fetchWarehouse ?? (live ? fetchHomeWarehouse : unavailable);
  const fetchShift =
    deps?.fetchShift ?? (live ? fetchCurrentWorkShift : unavailable);
  const fetchUnread =
    deps?.fetchUnread ?? (live ? fetchHomeUnreadCount : unavailable);
  const fetchRecent =
    deps?.fetchRecentDocuments ?? (live ? fetchHomeRecentDocuments : undefined);
  const capabilities = deps?.capabilities ?? HOME_CAPABILITIES;
  const readSession =
    deps?.readSession ?? (live ? getSession : () => undefined);
  const readSessionRef = useRef(readSession);
  readSessionRef.current = readSession;
  const [state, setState] = useState<HomeState>(EMPTY);
  useEffect(()=>subscribeNotificationFreshness(event=>{if(isDeliveryOwnerCurrent(event.owner))setState(s=>s.ownerGeneration===event.owner.generation?{...s,unread:event.unreadCount}:s);}),[]);
  const sequence = useRef(0),
    controller = useRef<AbortController | undefined>(undefined);
  const verifiedScope = useRef<string | undefined>(undefined);
  const load = useCallback(
    async (refresh: boolean) => {
      const request = ++sequence.current;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const before = readSessionRef.current(),
        beforeKey = sessionKey(before);
      const beforeGeneration = generation;
      const beforeVerificationEpoch = sharedShift.verificationEpoch;
      const ownerKey = scope.key ?? beforeKey;
      const current = () =>
        request === sequence.current &&
        !abort.signal.aborted &&
        beforeGeneration === getSessionGeneration() &&
        beforeVerificationEpoch === readSharedShift().verificationEpoch &&
        beforeKey === sessionKey(readSessionRef.current());
      const options = { signal: abort.signal };
      setState(s =>
        refresh &&
        s.ownerKey === ownerKey &&
        s.ownerGeneration === beforeGeneration
          ? { ...s, refreshing: true, error: undefined }
          : { ...EMPTY, ownerKey, ownerGeneration: beforeGeneration },
      );
      try {
        const user = await fetchUser(options);
        if (!current()) return;
        if (
          !user.id ||
          !user.auth_session_id ||
          (before?.userId && user.id !== before.userId) ||
          (before?.authSessionId &&
            user.auth_session_id !== before.authSessionId) ||
          (before?.activeWarehouseId &&
            user.active_warehouse_id !== before.activeWarehouseId)
        )
          throw new AppError({
            kind: 'parse',
            message: 'Danh tính nguồn đọc không khớp phiên hiện tại.',
          });
        const warehouseId = confirmedHomeWarehouse(user);
        const sourceScope = JSON.stringify([
          user.id,
          user.auth_session_id,
          warehouseId,
          user.permissions,
          user.warehouse_scope_ids,
        ]);
        if (verifiedScope.current !== sourceScope) {
          verifiedScope.current = sourceScope;
          setState({
            ...EMPTY,
            ownerKey,
            ownerGeneration: beforeGeneration,
            user,
          });
        }
        const canStock =
          capabilities.stockSummary &&
          warehouseId !== undefined &&
          hasHomePermission(
            user,
            'inbound.view',
            'outbound.view',
            'warranty.view',
            'warranty.manage',
          );
        const canMixedRecent =
          warehouseId !== undefined &&
          capabilities.recentAggregate &&
          !!fetchRecent &&
          hasHomePermission(
            user,
            'inbound.view',
            'outbound.view',
            'warranty.view',
            'warranty.manage',
          );
        // A mixed recent-document read is an independent P12 source. It must
        // not turn the whole Home screen into an error sheet; the recent
        // section renders its own unverified state while KPI/shift/unread can
        // still remain usable.
        const errors: AppError[] = [];
        const part = async <T>(
          source: string,
          operation: () => Promise<T>,
        ): Promise<T | undefined> => {
          try {
            return await operation();
          } catch (e) {
            if (!abort.signal.aborted) {
              const rawCode = (e as { code?: unknown })?.code;
              const failure =
                !(e instanceof AppError) && typeof rawCode === 'string'
                  ? new AppError({
                      kind: 'parse',
                      code: rawCode,
                      message: (e as Error).message,
                      route:
                        source === 'recent'
                          ? '/api/v1/mini-app/documents'
                          : undefined,
                    })
                  : toAppError(e);
              logger.warn('P02 read failed', {
                source,
                kind: failure.kind,
                code: (e as { code?: string })?.code ?? failure.code ?? null,
                route: failure.route ?? null,
                requestId: failure.requestId ?? null,
                ...(e instanceof TypeError
                  ? { javascriptError: e.message.slice(0, 180) }
                  : {}),
              });
              if (source !== 'recent') errors.push(failure);
            }
            return undefined;
          }
        };
        const [stock, warehouse, shift, unread, recentResult] =
          await Promise.all([
            canStock
              ? part('summary', () => fetchSummary(warehouseId, options))
              : undefined,
            warehouseId && hasHomePermission(user, 'warehouse.view')
              ? part('warehouse', () => fetchWarehouse(warehouseId, options))
              : undefined,
            warehouseId
              ? part('shift', async () => {
                  const expected = {
                    actorId: user.id!,
                    authSessionId: user.auth_session_id!,
                    warehouseId,
                  };
                  const shared = readSharedShift();
                  const sharedOwned =
                    shared.owner && sameShiftOwner(shared.owner, expected);
                  const receipt = sharedOwned
                    ? shared.shift
                    : scope.confirmedShift;
                  if (
                    sharedOwned &&
                    (shared.phase === 'NO_SHIFT' || shared.phase === 'ENDED')
                  )
                    return undefined;
                  const result =
                    receipt && isPreviewReadyShift(receipt, expected)
                      ? receipt
                      : await fetchShift(options);
                  if (result === null) return undefined;
                  if (!isPreviewReadyShift(result, expected))
                    throw new AppError({
                      kind: 'parse',
                      message: 'Ca không khớp actor/phiên/kho.',
                    });
                  return result;
                })
              : undefined,
            part('unread', () => fetchUnread(options)),
            canMixedRecent
              ? part('recent', () => fetchRecent!(user, options))
              : undefined,
          ]);
        if (!current()) return;
        setState({
          ownerKey,
          ownerGeneration: beforeGeneration,
          phase: errors.length ? 'error' : 'ready',
          refreshing: false,
          loadedAt: new Date(),
          error: errors[0],
          user,
          warehouse,
          shift,
          unread: validCount(unread) ? unread : undefined,
          recentVerified: recentResult !== undefined,
          pendingListVerified: capabilities.warehouseListFilter,
          summary: {
            pendingApproval: stock ? aggregatePending(stock, user) : undefined,
            inboundPending:
              stock && hasHomePermission(user, 'inbound.view')
                ? stock.inbound?.pending
                : undefined,
            outboundPending:
              stock && hasHomePermission(user, 'outbound.view')
                ? stock.outbound?.pending
                : undefined,
            openWarranty:
              stock &&
              hasHomePermission(user, 'warranty.view', 'warranty.manage')
                ? stock.warranty?.open
                : undefined,
            recent: recentResult ?? [],
          },
        });
      } catch (e) {
        if (current())
          setState({
            ...EMPTY,
            ownerKey,
            ownerGeneration: beforeGeneration,
            phase: 'error',
            error: toAppError(e),
          });
      }
    },
    [
      fetchUser,
      fetchSummary,
      fetchWarehouse,
      fetchShift,
      fetchUnread,
      fetchRecent,
      capabilities.stockSummary,
      capabilities.warehouseListFilter,
      capabilities.recentAggregate,
      scope.confirmedShift,
      scope.key,
      generation,
      sharedShift.verificationEpoch,
      readSharedShift,
    ],
  );
  useEffect(() => {
    const owner = sequence,
      request = controller;
    load(false).catch(() => undefined);
    return () => {
      owner.current++;
      request.current?.abort();
    };
  }, [load]);
  const reload = useCallback(() => {
    load(true).catch(() => undefined);
  }, [load]);
  const visible =
    state.ownerKey === (scope.key ?? sessionKey(readSessionRef.current())) &&
    state.ownerGeneration === generation
      ? state
      : EMPTY;
  const expected = visible.user && confirmedHomeWarehouse(visible.user);
  const sharedOwned =
    expected &&
    sharedShift.owner &&
    sameShiftOwner(sharedShift.owner, {
      actorId: visible.user!.id!,
      authSessionId: visible.user!.auth_session_id!,
      warehouseId: expected,
    });
  return {
    ...visible,
    shift: sharedOwned
      ? sharedShift.phase === 'ACTIVE' &&
        sharedShift.shift &&
        isPreviewReadyShift(sharedShift.shift, sharedShift.owner!)
        ? sharedShift.shift
        : undefined
      : visible.shift,
    reload,
  };
}
