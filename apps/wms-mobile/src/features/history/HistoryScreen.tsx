/**
 * Lịch sử chứng từ — đồng bộ cấu trúc và quy tắc với
 * `src/pages/ScanHistoryPage` của Mini App.
 *
 * Lịch sử là ảnh chụp dữ liệu đã đồng bộ, không phải hàng đợi duyệt. Vì vậy
 * hai endpoint nhập/xuất được nạp song song, lỗi một bên vẫn phải hiện dữ liệu
 * còn lại, và mọi bộ lọc chỉ áp dụng cục bộ trên snapshot đó.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Sheet } from '../../ui/Sheet';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  fetchInboundDocuments,
  fetchOutboundDocuments,
} from '../../services/wms/queries';
import type {
  InboundDocument,
  OutboundDocument,
} from '../../services/wms/types';

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
  ZALO_LOGIN_FAILED: 'Không đăng nhập được WMS. Vui lòng kiểm tra tài khoản hoặc mật khẩu.',
  WMS_API_ERROR: 'Không xử lý được dữ liệu kho. Vui lòng thử lại.',
  API_ERROR: 'Không xử lý được yêu cầu. Vui lòng thử lại.',
  INVALID_JSON_RESPONSE: 'Máy chủ phản hồi không đúng định dạng. Vui lòng thử lại.',
  AUDIT_DELETE_REVIEW_REQUIRED: 'Chức năng xóa dữ liệu backend đang bị khóa để bảo toàn audit kho.',
  MISSING_INBOUND_DOCUMENT: 'Thiếu phiếu nhập. Vui lòng mở Mini App từ phiếu nhập kho.',
  MISSING_WAREHOUSE: 'Thiếu thông tin kho. Vui lòng mở lại từ hệ thống WMS.',
  MISSING_IF_MATCH: 'Thiếu version phiếu nhập. Vui lòng tải lại phiếu trên WMS rồi quét lại.',
  LINE_NOT_MATCHED: 'Không tìm thấy dòng hàng phù hợp với mã vừa quét trong phiếu nhập.',
  CAMERA_PERMISSION_DENIED: 'Bạn chưa cấp quyền camera. Hãy cấp quyền để quét mã.',
  CAMERA_IN_USE: 'Camera đang được ứng dụng khác sử dụng. Hãy đóng camera khác rồi thử lại.',
  CAMERA_PREVIEW_UNAVAILABLE: 'Không nhận được hình ảnh từ camera. Hãy kiểm tra quyền camera rồi thử lại.',
  CAMERA_NOT_SUPPORTED: 'Thiết bị hiện không hỗ trợ quét mã bằng camera.',
  SCANNER_DUPLICATE_LOCKED: 'Mã này vừa được quét, hệ thống đang chống quét trùng.',
  SCANNER_PENDING_LOCKED: 'Mã này đang được xử lý, vui lòng đợi kết quả trước khi quét lại.',
  UNKNOWN_ERROR: 'Có lỗi xảy ra. Vui lòng thử lại.',
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardHeadBody: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listArea: {},
  warehouse: { flex: 1 },
  clearButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  clearText: { fontWeight: '700' },
  sheetActions: { flexDirection: 'row' },
  sheetAction: { flex: 1 },
});

type HistoryKind = 'inbound' | 'outbound';
type HistoryContextFilter = 'all' | HistoryKind;
type HistoryStatusFilter = 'all' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'POSTED';
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
}

interface HistoryLoadResult {
  readonly rows: readonly HistoryRow[];
  readonly errors: readonly string[];
}

let historyCache: (HistoryLoadResult & { readonly loadedAt: number }) | undefined;
let historyInFlight: Promise<HistoryLoadResult> | undefined;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
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

function toRow(document: AnyDocument, kind: HistoryKind): HistoryRow {
  const record = asRecord(document);
  const docNo = firstText(record.doc_no, record.document_no, record.id) ?? 'Phiếu';
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
    title: firstText(
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
    createdAt: firstText(record.updated_at, record.created_at),
    scanned,
    expected,
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
    .sort((left, right) => sortTime(right.createdAt) - sortTime(left.createdAt));
}

function sortTime(value: string | undefined): number {
  const time = value === undefined ? Number.NaN : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function fetchHistory(
  fetchInbound: typeof fetchInboundDocuments,
  fetchOutbound: typeof fetchOutboundDocuments,
): Promise<HistoryLoadResult> {
  const [inboundResult, outboundResult] = await Promise.allSettled([
    fetchInbound({ query: { per_page: HISTORY_PAGE_SIZE } }),
    fetchOutbound({ query: { per_page: HISTORY_PAGE_SIZE } }),
  ]);
  const errors: string[] = [];
  const inbound = inboundResult.status === 'fulfilled' ? inboundResult.value.items : [];
  const outbound = outboundResult.status === 'fulfilled' ? outboundResult.value.items : [];

  if (inboundResult.status === 'rejected') {
    errors.push('Nhập: ' + errorMessage(inboundResult.reason, 'Không tải được lịch sử phiếu nhập.'));
  }
  if (outboundResult.status === 'rejected') {
    errors.push('Xuất: ' + errorMessage(outboundResult.reason, 'Không tải được lịch sử phiếu xuất.'));
  }

  return {
    rows: mergeRows([
      ...inbound.map(document => toRow(document, 'inbound')),
      ...outbound.map(document => toRow(document, 'outbound')),
    ]),
    errors,
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  return MINI_ERROR_MESSAGES[cause.message] ?? MINI_ERROR_MESSAGES.UNKNOWN_ERROR;
}

async function loadHistory(
  fetchInbound: typeof fetchInboundDocuments,
  fetchOutbound: typeof fetchOutboundDocuments,
  options: { readonly force?: boolean; readonly useCache: boolean },
): Promise<HistoryLoadResult> {
  if (!options.force && options.useCache && historyCache !== undefined) {
    if (Date.now() - historyCache.loadedAt < HISTORY_CACHE_TTL_MS) return historyCache;
  }
  if (!options.force && options.useCache && historyInFlight !== undefined) {
    return historyInFlight;
  }

  const request = fetchHistory(fetchInbound, fetchOutbound);
  if (!options.useCache) return request;

  historyInFlight = request.then(result => {
    historyCache = { ...result, loadedAt: Date.now() };
    return result;
  });
  try {
    return await historyInFlight;
  } finally {
    historyInFlight = undefined;
  }
}

function normalizeStatusGroup(status: string | undefined): Exclude<HistoryStatusFilter, 'all'> {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'APPROVED') return 'APPROVED';
  if (['POSTED', 'COMPLETED', 'CLOSED'].includes(normalized)) return 'POSTED';
  if (
    ['READY_TO_ISSUE', 'WAITING_APPROVAL', 'PENDING_APPROVAL', 'PENDING', 'SUBMITTED'].includes(
      normalized,
    )
  ) {
    return 'PENDING';
  }
  return 'DRAFT';
}

function statusLabel(status: string | undefined): string {
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

function statusTone(status: string | undefined): BadgeTone {
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

export interface HistoryScreenProps {
  /** Tab Chứng từ dùng cùng nguồn WMS nhưng tên màn theo board thiết kế. */
  title?: string;
  eyebrow?: string;
  onOpen?: (row: HistoryRow) => void;
  fetchInbound?: typeof fetchInboundDocuments;
  fetchOutbound?: typeof fetchOutboundDocuments;
  /** Hook phục vụ kho local khi native có dữ liệu tạm cần dọn. */
  onClearLocalHistory?: () => void | Promise<void>;
}

export function HistoryScreen({
  title = 'Lịch sử chứng từ',
  eyebrow = 'Theo phiếu',
  onOpen,
  fetchInbound = fetchInboundDocuments,
  fetchOutbound = fetchOutboundDocuments,
  onClearLocalHistory,
}: HistoryScreenProps): React.ReactElement {
  const theme = useTheme();
  const [keyword, setKeyword] = useState('');
  const [contextFilter, setContextFilter] = useState<HistoryContextFilter>('all');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all');
  const [rows, setRows] = useState<readonly HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);
  const useCache = fetchInbound === fetchInboundDocuments && fetchOutbound === fetchOutboundDocuments;

  const load = useCallback(
    async (force = false) => {
      const loadId = loadIdRef.current + 1;
      loadIdRef.current = loadId;
      setIsLoading(true);
      setError(undefined);
      try {
        const result = await loadHistory(fetchInbound, fetchOutbound, { force, useCache });
        if (!mountedRef.current || loadIdRef.current !== loadId) return;
        setRows(result.rows);
        setError(result.errors.length > 0 ? result.errors.join(' · ') : undefined);
      } finally {
        if (mountedRef.current && loadIdRef.current === loadId) setIsLoading(false);
      }
    },
    [fetchInbound, fetchOutbound, useCache],
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

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return rows.filter(row => {
      if (contextFilter !== 'all' && row.kind !== contextFilter) return false;
      if (statusFilter !== 'all' && normalizeStatusGroup(row.status) !== statusFilter) {
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

  const clearLocalHistory = useCallback(async () => {
    if (isClearing) return;
    setIsClearing(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await onClearLocalHistory?.();
      // Cache là dữ liệu duy nhất native lưu cục bộ cho màn này; WMS không bị
      // tác động và lần Đồng bộ kế tiếp luôn lấy snapshot mới.
      historyCache = undefined;
      historyInFlight = undefined;
      setNotice('Đã xóa lịch sử phiếu cục bộ. Phiếu/audit trên WMS vẫn giữ nguyên.');
    } catch (cause) {
      setError(errorMessage(cause, 'Không xóa được lịch sử cục bộ.'));
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  }, [isClearing, onClearLocalHistory]);

  const initialLoading = isLoading && filtered.length === 0;

  return (
    <Page title={title} eyebrow={eyebrow} scroll>
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
            load(true).catch(cause => setError(errorMessage(cause, 'Không tải được lịch sử phiếu.')));
          }}
        />
        <Text variant="caption" tone="muted">
          {String(filtered.length) + ' phiếu · lấy theo chứng từ'}
        </Text>
      </View>

      {isLoading && filtered.length > 0 ? (
        <Banner tone="info" message="Đang đồng bộ thêm phiếu từ WMS..." />
      ) : null}
      {notice === undefined ? null : <Banner tone="success" message={notice} />}
      {error === undefined ? null : (
        <Banner tone="danger" title="Không xử lý được lịch sử" message={error} />
      )}

      <View style={[styles.listArea, { gap: theme.spacing.md }]}>
        {initialLoading ? (
          <Box card padding="xl" align="center" gap="md">
            <ActivityIndicator color={theme.colors.primary} />
            <Text variant="body" tone="muted">Đang tải lịch sử phiếu...</Text>
          </Box>
        ) : filtered.length === 0 ? (
          <Box card padding="xl">
            <EmptyState
              icon={<AppIcon name="history" color={theme.colors.primary} />}
              title="Chưa có lịch sử phiếu"
              hint="Phiếu nhập/xuất sau khi tạo hoặc đồng bộ từ WMS sẽ hiển thị ở đây."
            />
          </Box>
        ) : (
          <>
            {filtered.map(row => (
              <Box key={row.kind + ':' + row.id} card padding="lg" gap="md">
                <Pressable
                  accessibilityRole={onOpen === undefined ? undefined : 'button'}
                  accessibilityLabel={
                    onOpen === undefined ? undefined : 'Xem chi tiết phiếu ' + row.docNo
                  }
                  disabled={onOpen === undefined}
                  onPress={() => onOpen?.(row)}
                >
                  <View style={[styles.cardHead, { gap: theme.spacing.md }]}>
                    <View style={[styles.cardHeadBody, { gap: theme.spacing.xs }]}>
                      <Text variant="caption" tone="muted">
                        {row.kind === 'inbound' ? 'Phiếu nhập' : 'Phiếu xuất'}
                      </Text>
                      <Text variant="cardTitle" tone="strong">{row.docNo}</Text>
                      <Text variant="caption" tone="muted" numberOfLines={2}>{row.title}</Text>
                    </View>
                    <Badge label={statusLabel(row.status)} tone={statusTone(row.status)} />
                  </View>
                  <View style={[styles.cardMeta, { marginTop: theme.spacing.lg, gap: theme.spacing.md }]}>
                    <Text variant="caption" tone="muted" numberOfLines={1} style={styles.warehouse}>
                      {row.warehouseName ?? 'Theo phiếu WMS'}
                    </Text>
                    <Text variant="caption" tone="muted">{quantityLabel(row)}</Text>
                  </View>
                  {row.expected > 0 ? (
                    <ProgressBar
                      value={row.scanned}
                      target={row.expected}
                      accessibilityLabel={'Đã quét ' + String(row.scanned) + ' trên ' + String(row.expected)}
                      style={{ marginTop: theme.spacing.sm }}
                    />
                  ) : (
                    <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                      Phiếu scan-driven, số lượng lấy theo mã đã quét.
                    </Text>
                  )}
                </Pressable>
              </Box>
            ))}
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xóa lịch sử cục bộ"
        onPress={() => setShowClearConfirm(true)}
        style={styles.clearButton}
      >
        <Text variant="caption" style={[styles.clearText, { color: theme.colors.dangerText }]}>
          Xóa lịch sử cục bộ
        </Text>
      </Pressable>

      <Sheet
        visible={showClearConfirm}
        onDismiss={() => {
          if (!isClearing) setShowClearConfirm(false);
        }}
        title="Xóa lịch sử cục bộ?"
        message="Chỉ xóa phiếu tạm/lưu trên thiết bị. Phiếu thật trên WMS không bị xóa."
      >
        <View style={[styles.sheetActions, { gap: theme.spacing.sm }]}>
          <View style={styles.sheetAction}>
            <Button label="Hủy" variant="secondary" disabled={isClearing} onPress={() => setShowClearConfirm(false)} />
          </View>
          <View style={styles.sheetAction}>
            <Button label="Xóa" variant="danger" loading={isClearing} onPress={() => { clearLocalHistory().catch(() => undefined); }} />
          </View>
        </View>
      </Sheet>
    </Page>
  );
}
