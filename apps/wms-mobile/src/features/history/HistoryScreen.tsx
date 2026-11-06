/**
 * Lịch sử chứng từ — đồng bộ cấu trúc và quy tắc với
 * `src/pages/ScanHistoryPage` của Mini App.
 *
 * Lịch sử là ảnh chụp dữ liệu đã đồng bộ, không phải hàng đợi duyệt. Vì vậy
 * hai endpoint nhập/xuất được nạp song song, lỗi một bên vẫn phải hiện dữ liệu
 * còn lại, và mọi bộ lọc chỉ áp dụng cục bộ trên snapshot đó.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { ProgressBar } from '../../ui/ProgressBar';
import { EmptyState } from '../../ui/EmptyState';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { formatVietnamClock, vietnamDateKey } from '../../time/vietnamTime';
import {
  fetchInboundDocuments,
  fetchOutboundDocuments,
} from '../../services/wms/queries';
import type {
  InboundDocument,
  OutboundDocument,
  Page as WmsPage,
} from '../../services/wms/types';
import { validCount } from '../../services/wms/home';
import { AppError, messageForUser } from '../../errors/AppError';
import { UUID_PATTERN } from '../../services/wms/workShift';

const HISTORY_PAGE_SIZE = 25;
const HISTORY_CACHE_TTL_MS = 12_000;

// Giữ cùng bảng mã và fallback với `constants/error-messages.ts` của Mini App.
// API có thể trả một mã nghiệp vụ trong `Error.message`; không hiện mã kỹ thuật
// thô cho thủ kho.
const MINI_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BARCODE_NOT_FOUND: 'Không tìm thấy sản phẩm tương ứng với mã vừa quét.',
  ITEM_ALREADY_SCANNED: 'Sản phẩm này đã được quét trước đó.',
  SKU_NOT_REQUIRED: 'Sản phẩm này không thuộc danh sách cần xử lý.',
  LINE_ALREADY_FULL: 'Dòng chứng từ này đã đủ số lượng cần quét.',
  ITEM_NOT_IN_WAREHOUSE: 'Sản phẩm không thuộc kho đang thao tác.',
  NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.',
  REQUEST_TIMEOUT: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.',
  AUTH_REQUIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ZALO_LOGIN_FAILED:
    'Không đăng nhập được WMS. Vui lòng kiểm tra tài khoản hoặc mật khẩu.',
  WMS_API_ERROR: 'Không xử lý được dữ liệu kho. Vui lòng thử lại.',
  API_ERROR: 'Không xử lý được yêu cầu. Vui lòng thử lại.',
  INVALID_JSON_RESPONSE:
    'Máy chủ phản hồi không đúng định dạng. Vui lòng thử lại.',
  AUDIT_DELETE_REVIEW_REQUIRED:
    'Chức năng xóa dữ liệu backend đang bị khóa để bảo toàn audit kho.',
  MISSING_INBOUND_DOCUMENT:
    'Thiếu phiếu nhập. Vui lòng mở Mini App từ phiếu nhập kho.',
  MISSING_WAREHOUSE: 'Thiếu thông tin kho. Vui lòng mở lại từ hệ thống WMS.',
  MISSING_IF_MATCH:
    'Thiếu version phiếu nhập. Vui lòng tải lại phiếu trên WMS rồi quét lại.',
  LINE_NOT_MATCHED:
    'Không tìm thấy dòng hàng phù hợp với mã vừa quét trong phiếu nhập.',
  CAMERA_PERMISSION_DENIED:
    'Bạn chưa cấp quyền camera. Hãy cấp quyền để quét mã.',
  CAMERA_IN_USE:
    'Camera đang được ứng dụng khác sử dụng. Hãy đóng camera khác rồi thử lại.',
  CAMERA_PREVIEW_UNAVAILABLE:
    'Không nhận được hình ảnh từ camera. Hãy kiểm tra quyền camera rồi thử lại.',
  CAMERA_NOT_SUPPORTED: 'Thiết bị hiện không hỗ trợ quét mã bằng camera.',
  SCANNER_DUPLICATE_LOCKED:
    'Mã này vừa được quét, hệ thống đang chống quét trùng.',
  SCANNER_PENDING_LOCKED:
    'Mã này đang được xử lý, vui lòng đợi kết quả trước khi quét lại.',
  UNKNOWN_ERROR: 'Có lỗi xảy ra. Vui lòng thử lại.',
};

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLead: {
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  cardHeadBody: { flex: 1 },
  cardActions: { alignItems: 'flex-end' },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeading: { fontWeight: '700' },
  listArea: {},
  warehouse: { flex: 1 },
});

export type HistoryKind = 'inbound' | 'outbound';
export type HistoryContextFilter = 'all' | HistoryKind;
export type HistoryStatusFilter =
  | 'all'
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'POSTED';
type AnyDocument = InboundDocument | OutboundDocument;

/** Hai hàng chip có nhãn và thứ tự đúng Mini App. */
const KIND_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'inbound', label: 'Nhập kho' },
  { key: 'outbound', label: 'Xuất kho' },
] as const;

const STATUS_CHIPS = [
  { key: 'all', label: 'Mọi trạng thái' },
  { key: 'DRAFT', label: 'Đang xử lý' },
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'APPROVED', label: 'Đã duyệt' },
  { key: 'POSTED', label: 'Đã post' },
] as const;

export interface HistoryRow {
  readonly id: string;
  readonly kind: HistoryKind;
  readonly docNo: string;
  readonly title: string;
  readonly status?: string;
  readonly warehouseName?: string;
  readonly createdAt?: string;
  readonly scanned: number;
  readonly expected: number;
  /** Readiness comes from the endpoint filter, never from quantities in the UI. */
  readonly queueReady?: boolean;
}

interface SourcePage {
  readonly page: number;
  readonly total?: number;
  readonly hasMore: boolean;
}
type HistoryPaging = Partial<Record<HistoryKind, SourcePage>>;

export interface HistoryLoadResult {
  readonly rows: readonly HistoryRow[];
  readonly errors: readonly string[];
  /** Nguồn hỏng được giữ bản snapshot cũ khi người dùng làm mới. */
  readonly failedKinds: readonly HistoryKind[];
  readonly paging?: HistoryPaging;
}

interface HistoryCache extends HistoryLoadResult {
  readonly loadedAt: number;
  readonly scope: string;
}

interface HistoryInFlight {
  readonly scope: string;
  readonly request: Promise<HistoryLoadResult>;
}

let historyCache: HistoryCache | undefined;
let historyInFlight: HistoryInFlight | undefined;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return undefined;
}

function firstPositiveNumber(...values: readonly unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function toRow(
  document: AnyDocument,
  kind: HistoryKind,
  queueReady = false,
): HistoryRow {
  const record = asRecord(document);
  const docNo =
    firstText(record.doc_no, record.document_no, record.id) ?? 'Phiếu';
  const isInbound = kind === 'inbound';
  const scanned = firstPositiveNumber(
    isInbound ? record.scanned_total_qty : record.matched_count,
    record.scanned_total_qty,
    record.scanned_qty,
    record.scanned_quantity,
  );
  const expected = firstPositiveNumber(
    record.expected_total_qty,
    record.required_total,
    record.required_total_qty,
    record.required_qty,
    record.required_quantity,
    record.total_qty,
  );

  return {
    id: firstText(record.id, record.document_id, docNo) ?? docNo,
    kind,
    docNo,
    title:
      firstText(
        record.purpose,
        docNo,
        isInbound ? 'Phiếu nhập WMS' : 'Phiếu xuất WMS',
      ) ?? docNo,
    status: isInbound
      ? firstText(record.mini_app_status, record.status)
      : firstText(record.status),
    warehouseName: firstText(
      record.warehouse_name,
      isInbound ? record.dst_warehouse_id : record.src_warehouse_id,
      record.dst_warehouse_id,
      record.warehouse_id,
    ),
    // P02 recent/list recency is created_at. updated_at is only a fallback for
    // older records that genuinely have no creation timestamp.
    createdAt: firstText(record.created_at, record.updated_at),
    scanned,
    expected,
    queueReady,
  };
}

function mergeRows(rows: readonly HistoryRow[]): readonly HistoryRow[] {
  const seen = new Set<string>();
  return rows
    .filter(row => {
      const key = row.kind + ':' + row.id;
      if (row.id === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        sortTime(right.createdAt) - sortTime(left.createdAt) ||
        left.kind.localeCompare(right.kind) ||
        right.id.localeCompare(left.id),
    );
}

function sortTime(value: string | undefined): number {
  const time = value === undefined ? Number.NaN : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function fetchHistory(
  fetchInbound: typeof fetchInboundDocuments,
  fetchOutbound: typeof fetchOutboundDocuments,
  options: {
    readonly warehouseId?: string;
    readonly pendingOnly?: boolean;
    readonly pages?: Partial<Record<HistoryKind, number>>;
    readonly kinds?: readonly HistoryKind[];
  } = {},
): Promise<HistoryLoadResult> {
  const baseQuery = options.warehouseId
    ? { warehouse_id: options.warehouseId }
    : {};
  const inboundQuery = {
    ...baseQuery,
    ...(options.pendingOnly ? { status: 'WAITING_APPROVAL' } : {}),
    per_page: options.pendingOnly ? 50 : HISTORY_PAGE_SIZE,
    ...(options.warehouseId || options.pages
      ? { page: options.pages?.inbound ?? 1 }
      : {}),
  };
  const outboundQuery = {
    ...baseQuery,
    ...(options.pendingOnly ? { ready_for_issue: 1 } : {}),
    per_page: options.pendingOnly ? 50 : HISTORY_PAGE_SIZE,
    ...(options.warehouseId || options.pages
      ? { page: options.pages?.outbound ?? 1 }
      : {}),
  };
  const enabled = (kind: HistoryKind) => options.kinds?.includes(kind) ?? true;
  const [inboundResult, outboundResult] = await Promise.allSettled([
    enabled('inbound')
      ? fetchInbound({ query: inboundQuery })
      : Promise.resolve(undefined),
    enabled('outbound')
      ? fetchOutbound({ query: outboundQuery })
      : Promise.resolve(undefined),
  ]);
  const errors: string[] = [];
  const failedKinds: HistoryKind[] = [];
  const inbound =
    inboundResult.status === 'fulfilled'
      ? inboundResult.value?.items ?? []
      : [];
  const outbound =
    outboundResult.status === 'fulfilled'
      ? outboundResult.value?.items ?? []
      : [];
  const paging: HistoryPaging = {};
  const recordPage = (
    kind: HistoryKind,
    result: PromiseSettledResult<WmsPage<AnyDocument> | undefined>,
  ) => {
    if (result.status !== 'fulfilled' || result.value === undefined) return;
    const at = options.pages?.[kind] ?? 1,
      size = options.pendingOnly ? 50 : HISTORY_PAGE_SIZE;
    const total = result.value.meta?.total;
    paging[kind] = {
      page: at,
      total: validCount(total) ? total : undefined,
      hasMore: validCount(total)
        ? at * size < total
        : result.value.links?.next != null,
    };
  };
  recordPage('inbound', inboundResult);
  recordPage('outbound', outboundResult);

  if (inboundResult.status === 'rejected') {
    failedKinds.push('inbound');
    errors.push(
      'Nhập: ' +
        errorMessage(
          inboundResult.reason,
          'Không tải được lịch sử phiếu nhập.',
        ),
    );
  }
  if (outboundResult.status === 'rejected') {
    failedKinds.push('outbound');
    errors.push(
      'Xuất: ' +
        errorMessage(
          outboundResult.reason,
          'Không tải được lịch sử phiếu xuất.',
        ),
    );
  }

  return {
    rows: mergeRows([
      ...inbound.map(document =>
        toRow(document, 'inbound', options.pendingOnly),
      ),
      ...outbound.map(document =>
        toRow(document, 'outbound', options.pendingOnly),
      ),
    ]),
    errors,
    failedKinds,
    paging,
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  if (
    cause instanceof AppError &&
    MINI_ERROR_MESSAGES[cause.message] !== undefined
  )
    return MINI_ERROR_MESSAGES[cause.message];
  if (cause instanceof AppError && cause.kind === 'config')
    return messageForUser(cause);
  if (!(cause instanceof Error)) return fallback;
  return (
    MINI_ERROR_MESSAGES[cause.message] ?? MINI_ERROR_MESSAGES.UNKNOWN_ERROR
  );
}

export function createHistoryCacheScope(
  userId: string | undefined,
  deploymentTier: string | undefined,
): string | undefined {
  const user = userId?.trim();
  const tier = deploymentTier?.trim();
  // Không có user id được server xác nhận thì không cache: dùng key tạm có thể
  // trộn lịch sử của hai phiên khác nhau trên cùng máy.
  if (user === undefined || user === '' || tier === undefined || tier === '') {
    return undefined;
  }
  return encodeURIComponent(tier) + ':' + encodeURIComponent(user);
}

export function clearHistoryCacheForTesting(): void {
  historyCache = undefined;
  historyInFlight = undefined;
}

export async function loadHistory(
  fetchInbound: typeof fetchInboundDocuments,
  fetchOutbound: typeof fetchOutboundDocuments,
  options: {
    readonly force?: boolean;
    readonly useCache: boolean;
    readonly cacheScope?: string;
    readonly warehouseId?: string;
    readonly pendingOnly?: boolean;
    readonly restorePages?: Partial<Record<HistoryKind, number>>;
  },
): Promise<HistoryLoadResult> {
  const scope =
    options.cacheScope === undefined
      ? undefined
      : JSON.stringify([
          options.cacheScope,
          options.warehouseId,
          options.pendingOnly === true,
        ]);
  if (!options.useCache || scope === undefined) {
    return fetchHistoryRestored(fetchInbound, fetchOutbound, options);
  }

  // Không giữ snapshot hoặc request của account/tier khác ở cache hoạt động.
  if (historyCache?.scope !== scope) historyCache = undefined;
  if (historyInFlight?.scope !== scope) historyInFlight = undefined;

  if (!options.force && historyCache !== undefined) {
    if (Date.now() - historyCache.loadedAt < HISTORY_CACHE_TTL_MS)
      return historyCache;
  }
  if (!options.force && historyInFlight !== undefined) {
    return historyInFlight.request;
  }

  let request: Promise<HistoryLoadResult>;
  request = fetchHistoryRestored(fetchInbound, fetchOutbound, options).then(
    result => {
      if (historyInFlight?.request === request) {
        historyCache = { ...result, scope, loadedAt: Date.now() };
      }
      return result;
    },
  );
  historyInFlight = { scope, request };

  request
    .finally(() => {
      if (historyInFlight?.request === request) historyInFlight = undefined;
    })
    .catch(() => undefined);
  return request;
}

async function fetchHistoryRestored(
  inbound: typeof fetchInboundDocuments,
  outbound: typeof fetchOutboundDocuments,
  options: {
    warehouseId?: string;
    pendingOnly?: boolean;
    restorePages?: Partial<Record<HistoryKind, number>>;
  },
): Promise<HistoryLoadResult> {
  let result = await fetchHistory(inbound, outbound, options);
  for (const kind of ['inbound', 'outbound'] as const) {
    const target = options.restorePages?.[kind] ?? 1;
    for (
      let page = 2;
      page <= target && result.paging?.[kind]?.hasMore;
      page++
    ) {
      const next = await fetchHistory(inbound, outbound, {
        ...options,
        kinds: [kind],
        pages: { [kind]: page },
      });
      result = {
        rows: mergeRows([...result.rows, ...next.rows]),
        paging: { ...result.paging, ...next.paging },
        errors: [...result.errors, ...next.errors],
        failedKinds: [...new Set([...result.failedKinds, ...next.failedKinds])],
      };
      if (next.failedKinds.length) break;
    }
  }
  return result;
}

function normalizeStatusGroup(
  status: string | undefined,
): Exclude<HistoryStatusFilter, 'all'> {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'APPROVED') return 'APPROVED';
  if (['POSTED', 'COMPLETED', 'CLOSED'].includes(normalized)) return 'POSTED';
  if (
    [
      'READY_TO_ISSUE',
      'WAITING_APPROVAL',
      'PENDING_APPROVAL',
      'PENDING',
      'SUBMITTED',
    ].includes(normalized)
  ) {
    return 'PENDING';
  }
  return 'DRAFT';
}

function statusLabel(status: string | undefined, queueReady = false): string {
  if (queueReady) return 'Chờ xử lý trên Web';
  const normalized = String(status ?? '').toUpperCase();
  const group = normalizeStatusGroup(status);
  if (normalized === 'SCANNING') return 'Đang quét';
  if (normalized === 'DRAFT') return 'Đang xử lý';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'Đã hủy';
  if (group === 'APPROVED') return 'Đã duyệt';
  if (group === 'POSTED') return 'Hoàn tất';
  if (group === 'PENDING') return 'Chờ duyệt';
  return status ?? 'Đang xử lý';
}

function statusTone(status: string | undefined, queueReady = false): BadgeTone {
  if (queueReady) return 'warning';
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'danger';
  const group = normalizeStatusGroup(status);
  if (group === 'APPROVED' || group === 'POSTED') return 'success';
  if (group === 'PENDING') return 'warning';
  return 'primary';
}

function quantityLabel(row: HistoryRow): string {
  if (row.expected > 0) return String(row.scanned) + '/' + String(row.expected);
  if (row.scanned > 0) return 'Đã quét ' + String(row.scanned);
  return 'Chưa có mã';
}

interface HistoryDayGroup {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly HistoryRow[];
}

function dayKey(value: string | undefined): string {
  return vietnamDateKey(value) ?? 'unknown';
}

function dayLabel(value: string): string {
  if (value === 'unknown') return 'Không rõ ngày';
  const [year, month, day] = value.split('-');
  return String(day) + '/' + String(month) + '/' + String(year);
}

function timestampLabel(value: string | undefined): string | undefined {
  return formatVietnamClock(value, { missing: '' }) || undefined;
}

function groupRowsByDay(
  rows: readonly HistoryRow[],
): readonly HistoryDayGroup[] {
  const groups = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key = dayKey(row.createdAt);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: dayLabel(key),
    rows: group,
  }));
}

export interface HistoryViewState {
  readonly keyword: string;
  readonly contextFilter: HistoryContextFilter;
  readonly statusFilter: HistoryStatusFilter;
  readonly scrollY: number;
  readonly loadedPages?: Partial<Record<HistoryKind, number>>;
}

export interface HistoryScreenProps {
  /** Tab Chứng từ dùng cùng nguồn WMS nhưng tên màn theo board thiết kế. */
  title?: string;
  eyebrow?: string;
  onOpen?: (row: HistoryRow) => void;
  fetchInbound?: typeof fetchInboundDocuments;
  fetchOutbound?: typeof fetchOutboundDocuments;
  /** Cache chỉ hoạt động khi AppShell có account+tier đã xác nhận. */
  cacheScope?: string;
  /** Trạng thái UI khi Back từ chi tiết về danh sách. */
  viewState?: HistoryViewState;
  onViewStateChange?: (state: HistoryViewState) => void;
  /** Context đã xác nhận từ /auth/me; không tự chọn kho. */
  warehouseId?: string;
  requireWarehouse?: boolean;
}

export function HistoryScreen({
  title = 'Lịch sử',
  eyebrow = 'Theo phiếu',
  onOpen,
  fetchInbound = fetchInboundDocuments,
  fetchOutbound = fetchOutboundDocuments,
  cacheScope,
  viewState,
  onViewStateChange,
  warehouseId,
  requireWarehouse = false,
}: HistoryScreenProps): React.ReactElement {
  const theme = useTheme();
  const [keyword, setKeyword] = useState(viewState?.keyword ?? '');
  const [contextFilter, setContextFilter] = useState<HistoryContextFilter>(
    viewState?.contextFilter ?? 'all',
  );
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    viewState?.statusFilter ?? 'all',
  );
  const [rows, setRows] = useState<readonly HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [paging, setPaging] = useState<HistoryPaging>({});
  const pagingRef = useRef<HistoryPaging>({});
  const loadingMore = useRef(false);
  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);
  const sourceKey = JSON.stringify([
    cacheScope,
    warehouseId,
    statusFilter === 'PENDING',
  ]);
  const cacheScopeRef = useRef(sourceKey);
  const scrollYRef = useRef(viewState?.scrollY ?? 0);
  const restorePagesRef = useRef(viewState?.loadedPages);
  const useCache = cacheScope !== undefined;
  const pendingOnly = statusFilter === 'PENDING';

  const load = useCallback(
    async (force = false) => {
      const loadId = loadIdRef.current + 1;
      loadIdRef.current = loadId;
      const scopeChanged = cacheScopeRef.current !== sourceKey;
      cacheScopeRef.current = sourceKey;
      if (scopeChanged) {
        // Không để snapshot của account/tier cũ còn vẽ trong lúc request mới chạy.
        setRows([]);
        setPaging({});
        pagingRef.current = {};
        setError(undefined);
      }
      setIsLoading(true);
      setError(undefined);
      try {
        if (
          requireWarehouse &&
          (!warehouseId || !UUID_PATTERN.test(warehouseId))
        )
          throw new AppError({
            kind: 'config',
            message: 'Chưa xác nhận kho của danh sách chứng từ.',
          });
        const result = await loadHistory(fetchInbound, fetchOutbound, {
          force,
          useCache,
          cacheScope:
            cacheScope === undefined
              ? undefined
              : `${cacheScope}|warehouse=${warehouseId ?? 'unknown'}|pending=${
                  pendingOnly ? '1' : '0'
                }`,
          warehouseId,
          pendingOnly,
          restorePages:
            force || scopeChanged ? undefined : restorePagesRef.current,
        });
        if (!mountedRef.current || loadIdRef.current !== loadId) return;
        setRows(previous => {
          const retained = scopeChanged
            ? []
            : previous.filter(row => result.failedKinds.includes(row.kind));
          return mergeRows([...result.rows, ...retained]);
        });
        pagingRef.current = result.paging ?? {};
        setPaging(pagingRef.current);
        restorePagesRef.current = undefined;
        setError(
          result.errors.length > 0 ? result.errors.join(' · ') : undefined,
        );
      } catch (cause) {
        if (mountedRef.current && loadIdRef.current === loadId)
          setError(errorMessage(cause, 'Không tải được chứng từ.'));
      } finally {
        if (mountedRef.current && loadIdRef.current === loadId)
          setIsLoading(false);
      }
    },
    [
      cacheScope,
      fetchInbound,
      fetchOutbound,
      pendingOnly,
      requireWarehouse,
      sourceKey,
      useCache,
      warehouseId,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;
    load().catch(cause => {
      if (mountedRef.current) {
        setError(errorMessage(cause, 'Không tải được lịch sử phiếu.'));
        setIsLoading(false);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const publishViewState = useCallback(
    (scrollY: number = scrollYRef.current) => {
      onViewStateChange?.({
        keyword,
        contextFilter,
        statusFilter,
        scrollY,
      });
    },
    [contextFilter, keyword, onViewStateChange, statusFilter],
  );

  useEffect(() => {
    publishViewState();
  }, [paging, publishViewState]);

  const handleScrollPositionChange = useCallback(
    (scrollY: number) => {
      scrollYRef.current = scrollY;
      publishViewState(scrollY);
    },
    [publishViewState],
  );

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return rows.filter(row => {
      if (contextFilter !== 'all' && row.kind !== contextFilter) return false;
      if (
        statusFilter !== 'all' &&
        !(statusFilter === 'PENDING' && row.queueReady) &&
        normalizeStatusGroup(row.status) !== statusFilter
      ) {
        return false;
      }
      const haystack = [
        row.docNo,
        row.title,
        row.status,
        row.warehouseName,
        row.kind === 'inbound' ? 'nhập kho' : 'xuất kho',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return normalizedKeyword === '' || haystack.includes(normalizedKeyword);
    });
  }, [contextFilter, keyword, rows, statusFilter]);

  const initialLoading = isLoading && filtered.length === 0;
  const moreKinds = (['inbound', 'outbound'] as const).filter(
    kind =>
      paging[kind]?.hasMore &&
      (contextFilter === 'all' || contextFilter === kind),
  );
  const loadMore = async () => {
    if (loadingMore.current || isLoading || !moreKinds.length) return;
    loadingMore.current = true;
    setIsLoading(true);
    setError(undefined);
    const request = ++loadIdRef.current,
      owner = sourceKey;
    try {
      const next = await fetchHistory(fetchInbound, fetchOutbound, {
        warehouseId,
        pendingOnly,
        kinds: moreKinds,
        pages: Object.fromEntries(
          moreKinds.map(kind => [
            kind,
            (pagingRef.current[kind]?.page ?? 1) + 1,
          ]),
        ),
      });
      if (
        !mountedRef.current ||
        loadIdRef.current !== request ||
        cacheScopeRef.current !== owner
      )
        return;
      setRows(previous => mergeRows([...previous, ...next.rows]));
      pagingRef.current = { ...pagingRef.current, ...next.paging };
      setPaging(pagingRef.current);
      setError(next.errors.length ? next.errors.join(' · ') : undefined);
    } catch (cause) {
      if (mountedRef.current && loadIdRef.current === request)
        setError(errorMessage(cause, 'Không tải được trang tiếp theo.'));
    } finally {
      loadingMore.current = false;
      if (mountedRef.current && loadIdRef.current === request)
        setIsLoading(false);
    }
  };
  const hasActiveFilters =
    keyword.trim() !== '' || contextFilter !== 'all' || statusFilter !== 'all';
  const groupedRows = useMemo(() => groupRowsByDay(filtered), [filtered]);
  const clearFilters = useCallback(() => {
    setKeyword('');
    setContextFilter('all');
    setStatusFilter('all');
  }, []);

  return (
    <Page
      title={title}
      eyebrow={eyebrow}
      scroll
      onPullRefresh={() => {
        load(true).catch(cause =>
          setError(errorMessage(cause, 'Không tải được lịch sử phiếu.')),
        );
      }}
      refreshing={isLoading && rows.length > 0}
      initialScrollY={viewState?.scrollY}
      onScrollPositionChange={handleScrollPositionChange}
      persistentScrollbar
    >
      <Input
        label="Tìm kiếm phiếu"
        placeholder="Mã phiếu, tên phiếu hoặc kho"
        value={keyword}
        onChangeText={setKeyword}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <FilterChipRow
        chips={KIND_CHIPS}
        activeKey={contextFilter}
        onSelect={key => setContextFilter(key as HistoryContextFilter)}
      />
      <FilterChipRow
        chips={STATUS_CHIPS}
        activeKey={statusFilter}
        onSelect={key => setStatusFilter(key as HistoryStatusFilter)}
      />

      <View style={styles.head}>
        <Button
          label="Đồng bộ WMS"
          variant="secondary"
          onPress={() => {
            load(true).catch(cause =>
              setError(errorMessage(cause, 'Không tải được lịch sử phiếu.')),
            );
          }}
        />
        <Text variant="caption" tone="muted">
          {String(filtered.length) +
            ' phiếu đã tải' +
            (keyword.trim() ? ' · Tìm trong phiếu đã tải' : '')}
        </Text>
      </View>

      {isLoading && rows.length > 0 ? (
        <Banner tone="info" message="Đang cập nhật lịch sử từ WMS..." />
      ) : null}
      {error === undefined ? null : (
        <Banner tone="danger" title="Không xử lý được lịch sử" message={error}>
          <Button
            label="Thử lại"
            variant="secondary"
            disabled={isLoading}
            onPress={() => {
              load(true).catch(cause =>
                setError(errorMessage(cause, 'Không tải được lịch sử phiếu.')),
              );
            }}
          />
        </Banner>
      )}

      <View style={[styles.listArea, { gap: theme.spacing.md }]}>
        {initialLoading ? (
          <Box card padding="xl" align="center" gap="md">
            <ActivityIndicator color={theme.colors.primary} />
            <Text variant="body" tone="muted">
              Đang tải lịch sử phiếu...
            </Text>
          </Box>
        ) : filtered.length === 0 ? (
          <Box card padding="xl">
            <EmptyState
              icon={<AppIcon name="history" color={theme.colors.primary} />}
              title={
                hasActiveFilters
                  ? 'Không tìm thấy phiếu phù hợp'
                  : 'Chưa có lịch sử phiếu'
              }
              hint={
                hasActiveFilters
                  ? 'Thử đổi từ khóa hoặc bộ lọc để xem lại danh sách.'
                  : 'Phiếu nhập/xuất sau khi tạo hoặc đồng bộ từ WMS sẽ hiển thị ở đây.'
              }
              action={
                hasActiveFilters ? (
                  <Button
                    label="Xóa bộ lọc"
                    variant="secondary"
                    onPress={clearFilters}
                  />
                ) : undefined
              }
            />
          </Box>
        ) : (
          groupedRows.map(group => (
            <View key={group.key} style={{ gap: theme.spacing.sm }}>
              <Text variant="caption" tone="muted" style={styles.dayHeading}>
                {group.label}
              </Text>
              {group.rows.map(row => (
                <Box key={row.kind + ':' + row.id} card padding="lg" gap="md">
                  <Pressable
                    accessibilityRole={
                      onOpen === undefined ? undefined : 'button'
                    }
                    accessibilityLabel={
                      onOpen === undefined
                        ? undefined
                        : 'Xem chi tiết phiếu ' + row.docNo
                    }
                    disabled={onOpen === undefined}
                    onPress={() => {
                      publishViewState();
                      onOpen?.(row);
                    }}
                  >
                    <View style={[styles.cardHead, { gap: theme.spacing.md }]}>
                      <View
                        style={[styles.cardLead, { gap: theme.spacing.md }]}
                      >
                        <View
                          style={[
                            styles.cardIcon,
                            {
                              borderRadius: theme.radius.control,
                              backgroundColor:
                                row.kind === 'inbound'
                                  ? theme.colors.primarySoft
                                  : theme.colors.successSoft,
                            },
                          ]}
                        >
                          <AppIcon
                            name={
                              row.kind === 'inbound' ? 'inbound' : 'outbound'
                            }
                            color={
                              row.kind === 'inbound'
                                ? theme.colors.primary
                                : theme.colors.success
                            }
                            size={24}
                          />
                        </View>
                        <View
                          style={[
                            styles.cardHeadBody,
                            { gap: theme.spacing.xs },
                          ]}
                        >
                          <Text variant="caption" tone="muted">
                            {row.kind === 'inbound'
                              ? 'Phiếu nhập'
                              : 'Phiếu xuất'}
                          </Text>
                          <Text variant="cardTitle" tone="strong">
                            {row.docNo}
                          </Text>
                          <Text
                            variant="caption"
                            tone="muted"
                            numberOfLines={2}
                          >
                            {row.title}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[styles.cardActions, { gap: theme.spacing.xs }]}
                      >
                        <Badge
                          label={statusLabel(row.status, row.queueReady)}
                          tone={statusTone(row.status, row.queueReady)}
                        />
                        <AppIcon
                          name="chevron-right"
                          color={theme.colors.textMuted}
                          size={18}
                        />
                      </View>
                    </View>
                    <View
                      style={[
                        styles.cardMeta,
                        { marginTop: theme.spacing.lg, gap: theme.spacing.md },
                      ]}
                    >
                      <Text
                        variant="caption"
                        tone="muted"
                        numberOfLines={1}
                        style={styles.warehouse}
                      >
                        {row.warehouseName ?? 'Theo phiếu WMS'}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {timestampLabel(row.createdAt) ?? quantityLabel(row)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.cardMeta,
                        { marginTop: theme.spacing.sm, gap: theme.spacing.md },
                      ]}
                    >
                      <Text variant="caption" tone="muted">
                        Tiến độ quét
                      </Text>
                      <Text variant="caption" tone="muted">
                        {quantityLabel(row)}
                      </Text>
                    </View>
                    {row.expected > 0 ? (
                      <ProgressBar
                        value={row.scanned}
                        target={row.expected}
                        accessibilityLabel={
                          'Đã quét ' +
                          String(row.scanned) +
                          ' trên ' +
                          String(row.expected)
                        }
                        style={{ marginTop: theme.spacing.sm }}
                      />
                    ) : null}
                  </Pressable>
                </Box>
              ))}
            </View>
          ))
        )}
      </View>
      {moreKinds.length ? (
        <Button
          label="Tải thêm chứng từ"
          variant="secondary"
          disabled={isLoading}
          onPress={() => {
            loadMore().catch(() => undefined);
          }}
        />
      ) : null}
    </Page>
  );
}
