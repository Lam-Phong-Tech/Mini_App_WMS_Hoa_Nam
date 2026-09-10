/**
 * Hàng đợi duyệt phiếu native, đồng bộ với `src/pages/ApprovalQueuePage`.
 *
 * Mini App duyệt theo lô cho cả hai folder: chọn các phiếu đủ điều kiện, Post
 * lần lượt, giữ lại phiếu lỗi và nói rõ kết quả một phần. Không có nút Post
 * riêng từng thẻ trong luồng này.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { Badge } from '../../ui/Badge';
import { EmptyState } from '../../ui/EmptyState';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import {
  fetchInboundDocument,
  fetchInboundDocuments,
  fetchOutboundDocument,
  fetchOutboundDocuments,
} from '../../services/wms/queries';
import { postReceipt } from '../../services/wms/inboundWrite';
import { postIssue } from '../../services/wms/outboundWrite';
import type {
  InboundDocument,
  OutboundDocument,
} from '../../services/wms/types';
import { postReceiptIdempotencyKey } from './usePostReceipt';
import { postIssueIdempotencyKey } from './usePostIssue';
import {
  APPROVAL_QUEUE_PAGE_SIZE,
  approvalQueueQuery,
  approvalQueueTotal,
} from './approvalQueue';

const APPROVAL_CACHE_TTL_MS = 10_000;

const styles = StyleSheet.create({
  sync: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  checkMark: {
    color: '#ffffff',
    fontWeight: '700',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
  },
  documentCode: {
    fontWeight: '700',
  },
  documentMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  bottomCopy: {
    flex: 1,
  },
  reconcile: {
    fontWeight: '700',
  },
});

export type ApprovalTab = 'inbound' | 'outbound';
type ApprovalFilter = 'ALL' | 'READY' | 'NEEDS_ATTENTION';
type AnyDocument = InboundDocument | OutboundDocument;
type DocumentsByTab = Record<ApprovalTab, readonly AnyDocument[]>;
type NumberByTab = Record<ApprovalTab, number>;
type BoolByTab = Record<ApprovalTab, boolean>;
type SelectionByTab = Record<ApprovalTab, readonly string[]>;

const EMPTY_DOCUMENTS: DocumentsByTab = { inbound: [], outbound: [] };
const FIRST_PAGE: NumberByTab = { inbound: 1, outbound: 1 };
const EMPTY_TOTALS: NumberByTab = { inbound: 0, outbound: 0 };
const NO_MORE: BoolByTab = { inbound: false, outbound: false };

export interface ApprovalsScreenProps {
  onCreateOutbound?: () => void;
  onOpenDocument?: (kind: ApprovalTab, documentId: string) => void;
  /** Injection points keep UI tests strictly offline. */
  fetchInbound?: typeof fetchInboundDocuments;
  fetchOutbound?: typeof fetchOutboundDocuments;
  fetchInboundDetail?: typeof fetchInboundDocument;
  fetchOutboundDetail?: typeof fetchOutboundDocument;
  postInbound?: typeof postReceipt;
  postOutbound?: typeof postIssue;
}

export function ApprovalsScreen({
  onCreateOutbound,
  onOpenDocument,
  fetchInbound = fetchInboundDocuments,
  fetchOutbound = fetchOutboundDocuments,
  fetchInboundDetail = fetchInboundDocument,
  fetchOutboundDetail = fetchOutboundDocument,
  postInbound = postReceipt,
  postOutbound = postIssue,
}: ApprovalsScreenProps): React.ReactElement {
  const theme = useTheme();
  const [tab, setTab] = useState<ApprovalTab>('inbound');
  // Mở mặc định Tất cả để người dùng luôn thấy danh sách thực tế của hàng đợi;
  // các phiếu chưa đủ hàng vẫn ở đây với nhãn "Cần xử lý", không bị giấu đi.
  const [filter, setFilter] = useState<ApprovalFilter>('ALL');
  const [documentsByTab, setDocumentsByTab] =
    useState<DocumentsByTab>(EMPTY_DOCUMENTS);
  const [totalByTab, setTotalByTab] = useState<NumberByTab>(EMPTY_TOTALS);
  const [pageByTab, setPageByTab] = useState<NumberByTab>(FIRST_PAGE);
  const [hasMoreByTab, setHasMoreByTab] = useState<BoolByTab>(NO_MORE);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<AppError | undefined>();
  const [selectedByTab, setSelectedByTab] = useState<SelectionByTab>({
    inbound: [],
    outbound: [],
  });
  const [isApproving, setIsApproving] = useState(false);
  const [runningDocumentId, setRunningDocumentId] = useState<string | undefined>();
  const [approveError, setApproveError] = useState<string | undefined>();
  const [approveSuccess, setApproveSuccess] = useState<string | undefined>();
  const loadedAt = useRef<Partial<Record<ApprovalTab, number>>>({});
  // `load` không được phụ thuộc trực tiếp state danh sách: nếu không mỗi lần
  // nhận trang nhập lại tạo callback mới và effect sẽ đồng bộ lặp cả hai API.
  const documentsByTabRef = useRef<DocumentsByTab>(EMPTY_DOCUMENTS);
  // `isApproving` chỉ đổi sau render. Ref này chặn ngay cú chạm đúp vào nút
  // duyệt, tránh hai lệnh Post cùng một phiếu và các 409 xung đột không cần có.
  const approvingRef = useRef(false);

  const documents = documentsByTab[tab];
  const totalPendingDocuments = totalByTab.inbound + totalByTab.outbound;
  const rows = useMemo(
    () => documents.map(document => ({ document, ready: isReady(tab, document) })),
    [documents, tab],
  );
  const readyRows = rows.filter(row => row.ready);
  const attentionRows = rows.filter(row => !row.ready);
  const visibleRows = rows.filter(row =>
    filter === 'ALL'
      ? true
      : filter === 'READY'
        ? row.ready
        : !row.ready,
  );
  const selectedIds = selectedByTab[tab];
  const activeSelectedCount = selectedIds.filter(id =>
    readyRows.some(row => row.document.id === id),
  ).length;
  const isAllReadySelected =
    readyRows.length > 0 && activeSelectedCount === readyRows.length;

  const load = useCallback(
    async (
      which: ApprovalTab,
      options: { append?: boolean; force?: boolean; page?: number } = {},
    ) => {
      const targetPage = options.page ?? 1;
      const cachedAt = loadedAt.current[which];
      if (
        !options.force &&
        !options.append &&
        cachedAt !== undefined &&
        Date.now() - cachedAt < APPROVAL_CACHE_TTL_MS
      ) {
        setPhase('ready');
        return;
      }

      setPhase('loading');
      setLoadError(undefined);
      try {
        const page =
          which === 'inbound'
            ? await fetchInbound({
                query: approvalQueueQuery('inbound', targetPage),
              })
            : await fetchOutbound({
                query: approvalQueueQuery('outbound', targetPage),
              });
        const incoming = page.items as readonly AnyDocument[];
        const next = options.append
          ? dedupeDocuments([...documentsByTabRef.current[which], ...incoming])
          : incoming;
        documentsByTabRef.current = { ...documentsByTabRef.current, [which]: next };
        setDocumentsByTab(current => ({ ...current, [which]: next }));
        setTotalByTab(current => ({
          ...current,
          [which]: approvalQueueTotal(next.length),
        }));
        setPageByTab(current => ({ ...current, [which]: targetPage }));
        setHasMoreByTab(current => ({
          ...current,
          // `meta.total` hiện không cùng tập lọc với data ở mọi backend; chỉ
          // biết còn trang khi trang vừa nhận đã đầy.
          [which]: page.items.length >= APPROVAL_QUEUE_PAGE_SIZE,
        }));
        loadedAt.current[which] = Date.now();
        setPhase('ready');
      } catch (cause) {
        setLoadError(toAppError(cause));
        setPhase('error');
      }
    },
    [fetchInbound, fetchOutbound],
  );

  useEffect(() => {
    // Nạp đồng thời cả hai nguồn ngay khi vào màn. Nhờ đó badge và danh sách
    // phản ánh cùng một hàng đợi với Trang chủ, không còn phải đổi tab mới biết
    // số phiếu xuất đang chờ duyệt.
    Promise.all([load('inbound'), load('outbound')]).catch(() => undefined);
  }, [load]);

  const selectAllReady = useCallback(() => {
    setSelectedByTab(current => ({
      ...current,
      [tab]: isAllReadySelected ? [] : readyRows.map(row => row.document.id),
    }));
  }, [isAllReadySelected, readyRows, tab]);

  const toggleDocument = useCallback((documentId: string) => {
    setSelectedByTab(current => ({
      ...current,
      [tab]: current[tab].includes(documentId)
        ? current[tab].filter(id => id !== documentId)
        : [...current[tab], documentId],
    }));
  }, [tab]);

  const approveBatch = useCallback(async () => {
    const selectedRows = readyRows.filter(row => selectedIds.includes(row.document.id));
    if (selectedRows.length === 0 || approvingRef.current) return;

    approvingRef.current = true;
    setIsApproving(true);
    setApproveError(undefined);
    setApproveSuccess(undefined);
    const failures: string[] = [];
    let approved = 0;

    for (const row of selectedRows) {
      const document = row.document;
      setRunningDocumentId(document.id);
      try {
        if (tab === 'inbound') {
          const latest = await fetchInboundDetail(document.id);
          await postInbound(
            { documentId: document.id, version: latest.version ?? '' },
            postReceiptIdempotencyKey(document.id),
          );
        } else {
          const latest = await fetchOutboundDetail(document.id);
          await postOutbound(
            { documentId: document.id, version: latest.version ?? '' },
            postIssueIdempotencyKey(document.id),
          );
        }
        approved += 1;
        setDocumentsByTab(current => {
          const next = {
            ...current,
            [tab]: current[tab].filter(item => item.id !== document.id),
          };
          documentsByTabRef.current = next;
          return next;
        });
        setTotalByTab(current => ({
          ...current,
          [tab]: Math.max(0, current[tab] - 1),
        }));
        setSelectedByTab(current => ({
          ...current,
          [tab]: current[tab].filter(id => id !== document.id),
        }));
      } catch (cause) {
        failures.push(
          (document.doc_no ?? document.id) + ': ' + messageForUser(toAppError(cause)),
        );
      }
    }

    setRunningDocumentId(undefined);
    setIsApproving(false);
    approvingRef.current = false;
    if (approved > 0) {
      setApproveSuccess(
        'Đã duyệt ' + String(approved) + '/' + String(selectedRows.length) +
          ' phiếu ' + (tab === 'inbound' ? 'nhập' : 'xuất') + '.',
      );
    }
    if (failures.length > 0) {
      setApproveError(
        'Chưa duyệt được ' + String(failures.length) + ' phiếu. ' +
          failures.slice(0, 3).join(' · '),
      );
    }
  }, [
    fetchInboundDetail,
    fetchOutboundDetail,
    postInbound,
    postOutbound,
    readyRows,
    selectedIds,
    tab,
  ]);

  return (
    <Page title="Duyệt phiếu" eyebrow="Theo phiếu" scroll>
      <FilterChipRow
        chips={[
          { key: 'inbound', label: 'Phiếu nhập', count: totalByTab.inbound },
          { key: 'outbound', label: 'Phiếu xuất', count: totalByTab.outbound },
        ]}
        activeKey={tab}
        onSelect={key => {
          setTab(key as ApprovalTab);
          setFilter('ALL');
        }}
      />

      <Banner
        tone="success"
        icon={<AppIcon name="shield-check" color={theme.colors.successText} />}
        message="Tồn kho cập nhật sau Post"
      />

      <Box card padding="md" style={styles.sync}>
        <Button
          label={phase === 'loading' ? 'Đang đồng bộ…' : 'Đồng bộ WMS'}
          variant="secondary"
          loading={phase === 'loading'}
          onPress={() => {
            loadedAt.current = {};
            Promise.all([
              load('inbound', { force: true }),
              load('outbound', { force: true }),
            ]).catch(() => undefined);
          }}
        />
        <Text variant="caption" tone="muted">
          {String(totalPendingDocuments) + ' phiếu chờ duyệt'}
        </Text>
      </Box>

      {phase === 'loading' ? (
        <Box card padding="lg">
          <Text variant="caption" tone="muted">
            Đang tải phiếu chờ duyệt...
          </Text>
        </Box>
      ) : null}

      {loadError === undefined ? null : (
        <Banner tone="danger" title="Không tải được queue backend" message={messageForUser(loadError)}>
          <Button
            label="Thử lại"
            variant="secondary"
            onPress={() => {
              loadedAt.current = {};
              Promise.all([
                load('inbound', { force: true }),
                load('outbound', { force: true }),
              ]).catch(() => undefined);
            }}
          />
        </Banner>
      )}

      {approveError === undefined ? null : (
        <Banner tone="danger" title="Không thể duyệt phiếu" message={approveError} />
      )}

      {approveSuccess === undefined ? null : (
        <Banner tone="success" title="Duyệt phiếu thành công" message={approveSuccess} />
      )}

      {documents.length > 0 ? (
        <>
          <FilterChipRow
            chips={[
              { key: 'ALL', label: 'Tất cả', count: rows.length },
              { key: 'READY', label: 'Sẵn sàng', count: readyRows.length },
              { key: 'NEEDS_ATTENTION', label: 'Cần xử lý', count: attentionRows.length },
            ]}
            activeKey={filter}
            onSelect={key => setFilter(key as ApprovalFilter)}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Chọn phiếu sẵn sàng"
            accessibilityState={{ checked: isAllReadySelected, disabled: readyRows.length === 0 || isApproving }}
            disabled={readyRows.length === 0 || isApproving}
            onPress={selectAllReady}
          >
            <Box card padding="md" style={styles.selectBar}>
              <View style={[styles.selectMain, { gap: theme.spacing.sm }]}>
                <CheckVisual checked={isAllReadySelected} />
                <Text variant="body" tone="strong">Chọn phiếu sẵn sàng</Text>
              </View>
              <Text variant="caption" tone="muted">
                {String(activeSelectedCount) + ' đã chọn'}
              </Text>
            </Box>
          </Pressable>
        </>
      ) : null}

      {phase !== 'loading' && documents.length === 0 ? (
        <Box card padding="xl" gap="lg">
          <EmptyState
            title={tab === 'inbound' ? 'Chưa có phiếu nhập chờ duyệt' : 'Chưa có phiếu xuất chờ duyệt'}
            hint="Chọn folder còn lại hoặc bấm Đồng bộ để tải lại danh sách từ WMS."
          />
          {tab === 'outbound' && onCreateOutbound !== undefined ? (
            <Button label="Tạo phiếu xuất" onPress={onCreateOutbound} />
          ) : null}
        </Box>
      ) : phase !== 'loading' && visibleRows.length === 0 ? (
        <Box card padding="xl">
          <EmptyState
            title={filter === 'READY' ? 'Chưa có phiếu sẵn sàng' : 'Không có phiếu cần xử lý'}
            hint="Đổi bộ lọc để xem các phiếu còn lại trong folder này."
          />
        </Box>
      ) : (
        visibleRows.map(row => (
          <ApprovalDocumentCard
            key={row.document.id}
            document={row.document}
            kind={tab}
            ready={row.ready}
            selected={selectedIds.includes(row.document.id)}
            disabled={isApproving || !row.ready}
            running={runningDocumentId === row.document.id}
            onSelect={() => toggleDocument(row.document.id)}
            onOpen={
              onOpenDocument === undefined
                ? undefined
                : () => onOpenDocument(tab, row.document.id)
            }
          />
        ))
      )}

      {hasMoreByTab[tab] ? (
        <Button
          label="Tải thêm phiếu"
          variant="secondary"
          loading={phase === 'loading'}
          onPress={() => {
            load(tab, { append: true, force: true, page: pageByTab[tab] + 1 }).catch(() => undefined);
          }}
        />
      ) : null}

      {documents.length > 0 ? (
        <Box card padding="md" row align="center" gap="md">
          <AppIcon name="check-circle" color={theme.colors.primary} />
          <View style={styles.bottomCopy}>
            <Text variant="body" tone="strong">
              {activeSelectedCount === 1 ? '1 phiếu sẵn sàng' : String(activeSelectedCount) + ' phiếu sẵn sàng'}
            </Text>
            <Text variant="caption" tone="muted">
              {'Không gồm ' + String(attentionRows.length) + ' phiếu cần xử lý'}
            </Text>
          </View>
          <Button
            label={
              activeSelectedCount === 1
                ? 'Duyệt 1 phiếu'
                : activeSelectedCount > 1
                  ? 'Duyệt ' + String(activeSelectedCount) + ' phiếu'
                  : 'Duyệt phiếu'
            }
            loading={isApproving}
            disabled={activeSelectedCount === 0}
            onPress={() => {
              approveBatch().catch(() => undefined);
            }}
          />
        </Box>
      ) : null}
    </Page>
  );
}

function CheckVisual({ checked }: { checked: boolean }): React.ReactElement {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.check,
        {
          borderRadius: theme.radius.control / 2,
          borderColor: checked ? theme.colors.primary : theme.field.border,
          backgroundColor: checked ? theme.colors.primary : theme.colors.surface,
        },
      ]}
    >
      {checked ? <Text variant="caption" style={styles.checkMark}>✓</Text> : null}
    </View>
  );
}

function ApprovalDocumentCard({
  document,
  kind,
  ready,
  selected,
  disabled,
  running,
  onSelect,
  onOpen,
}: {
  document: AnyDocument;
  kind: ApprovalTab;
  ready: boolean;
  selected: boolean;
  disabled: boolean;
  running: boolean;
  onSelect: () => void;
  onOpen?: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const scanned = document.scanned_total_qty ?? 0;
  const expected = expectedQty(document);
  const code = document.doc_no ?? document.id;
  const missing = Math.max(0, expected - scanned);
  const statusCopy = ready
    ? 'Đã quét đủ ' + (expected > 0 ? String(scanned) + '/' + String(expected) : String(scanned))
    : missing > 0
      ? 'Thiếu ' + String(missing) + ' mã'
      : 'Cần kiểm tra lại';
  const createdAt = documentDate(document);

  return (
    <Box
      card
      padding="md"
      gap="sm"
      style={!ready ? { borderColor: theme.colors.warning } : undefined}
    >
      <View style={[styles.cardTop, { gap: theme.spacing.md }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={'Chọn ' + code + ' để duyệt hàng loạt'}
          accessibilityState={{ checked: selected, disabled }}
          disabled={disabled}
          onPress={onSelect}
        >
          <CheckVisual checked={selected} />
        </Pressable>
        <Pressable
          accessibilityRole={onOpen === undefined ? undefined : 'button'}
          accessibilityLabel={onOpen === undefined ? undefined : 'Mở chi tiết ' + code}
          disabled={onOpen === undefined}
          onPress={onOpen}
          style={styles.cardBody}
        >
          <Text variant="body" tone="strong">
            {documentTitle(kind, document)}
          </Text>
          <Text variant="caption" tone="primary" style={styles.documentCode}>
            {code}
          </Text>
          <View style={[styles.documentMeta, { gap: theme.spacing.sm }]}>
            <Text variant="caption" tone="muted">
              {warehouseName(kind, document)}
            </Text>
            {createdAt === undefined ? null : (
              <Text variant="caption" tone="muted">
                {formatApprovalDate(createdAt)}
              </Text>
            )}
          </View>
        </Pressable>
        {onOpen === undefined ? null : (
          <AppIcon name="chevron-right" color={theme.colors.textMuted} />
        )}
      </View>
      <View style={[styles.cardStatus, { gap: theme.spacing.sm }]}>
        <Badge label={ready ? 'Đủ hàng' : 'Cần xử lý'} tone={ready ? 'success' : 'warning'} />
        <Text variant="caption" tone={ready ? 'success' : 'warning'}>
          {running ? 'Đang duyệt...' : statusCopy}
        </Text>
        {!ready && onOpen !== undefined ? (
          <Text
            variant="caption"
            tone="primary"
            accessibilityRole="button"
            onPress={onOpen}
            style={styles.reconcile}
          >
            Đối soát
          </Text>
        ) : null}
      </View>
    </Box>
  );
}

function isReady(kind: ApprovalTab, document: AnyDocument): boolean {
  const expected = expectedQty(document);
  const scanned = document.scanned_total_qty ?? 0;
  // Giống `isInbound/OutboundReadyForApproval` của Mini App: không dùng status
  // canonical vì nó không biểu diễn đủ tiến độ quét.
  return expected === 0 || scanned >= expected ||
    (kind === 'inbound'
      ? (document as InboundDocument).ready_for_post === true
      : (document as OutboundDocument).ready_for_issue === true);
}

function expectedQty(document: AnyDocument): number {
  return Math.max(
    0,
    document.expected_total_qty ??
      (document as OutboundDocument).required_total_qty ??
      0,
  );
}

function documentTitle(kind: ApprovalTab, document: AnyDocument): string {
  if (kind === 'inbound') return 'Phiếu nhập kho';
  const recipient = (document as OutboundDocument).recipient_name;
  return recipient ? 'Phiếu xuất · ' + recipient : 'Phiếu xuất kho';
}

function warehouseName(kind: ApprovalTab, document: AnyDocument): string {
  const record = document as AnyDocument & Record<string, unknown>;
  const raw = kind === 'inbound'
    ? record.dst_warehouse_name ?? record.warehouse_name
    : record.src_warehouse_name ?? record.warehouse_name;
  return typeof raw === 'string' && raw.trim()
    ? raw
    : kind === 'inbound'
      ? 'Kho nhận WMS'
      : 'Kho xuất WMS';
}

function documentDate(document: AnyDocument): string | undefined {
  const record = document as AnyDocument & Record<string, unknown>;
  // `doc_date` là ngày chứng từ do người dùng nhập (không có giờ), còn
  // `updated_at` đổi mỗi lần duyệt/Post. Hàng chờ phải phản ánh đúng lúc WMS
  // nhận phiếu: ưu tiên timestamp gửi riêng, rồi timestamp tạo phía server ở
  // các backend chưa trả `submitted_at`. Không có hai giá trị này thì ẩn giờ,
  // thay vì hiển thị một thời điểm sai.
  const raw = record.submitted_at ?? record.created_at;
  return typeof raw === 'string' ? raw : undefined;
}

function formatApprovalDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dedupeDocuments(documents: readonly AnyDocument[]): readonly AnyDocument[] {
  const ids = new Set<string>();
  return documents.filter(document => {
    if (ids.has(document.id)) return false;
    ids.add(document.id);
    return true;
  });
}
