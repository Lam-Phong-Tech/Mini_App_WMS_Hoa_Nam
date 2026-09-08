/**
 * Chi tiết một chứng từ — phiếu nhập (`IN-04`) hoặc phiếu xuất (`OUT-04`).
 *
 * 🎨 Nguồn: ảnh **21, 22** (nhập) và **31, 32, 33** (xuất).
 *
 * ## 🔴 Màn này lẽ ra phải có từ đầu
 *
 * Người dùng chỉ ra 2026-09-06: *"bên duyệt không xem được chi tiết phiếu"*.
 * Màn Duyệt trước đây chỉ vẽ thẻ tóm tắt — người duyệt được yêu cầu quyết định
 * về một phiếu mà không mở được phiếu ấy ra xem. Đó không phải thiếu tính năng
 * phụ; đó là bỏ mất bước **đọc trước khi ký**.
 *
 * ## Một màn, hai loại chứng từ
 *
 * Ảnh 21–22 và 31–33 có cùng bố cục: đầu phiếu → tiến độ → danh sách mã →
 * banner trạng thái. Khác ở nhãn, ở nhóm người nhận (chỉ phiếu xuất), và ở chỗ
 * lấy danh sách mã. Tách hai màn sẽ nhân đôi chỗ phải sửa mỗi lần đổi bố cục.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { ProgressBar } from '../../ui/ProgressBar';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { EmptyState } from '../../ui/EmptyState';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser } from '../../errors/AppError';
import { displayPii } from '../warranty/warrantyPolicy';
import {
  entryLabel,
  useDocumentDetail,
  type DocumentKind,
} from './useDocumentDetail';
import type {
  InboundDocument,
  OutboundDocument,
  ScanEntry,
} from '../../services/wms/types';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

/** Nhãn tiếng Việt cho trạng thái WMS. Giá trị lạ thì hiện nguyên văn. */
const STATUS_LABEL: Readonly<Record<string, string>> = {
  DRAFT: 'Nháp',
  SCANNING: 'Đang quét',
  WAITING_APPROVAL: 'Chờ duyệt',
  POSTED: 'Đã post',
  CANCELLED: 'Đã huỷ',
};

function statusTone(status: string | undefined): 'success' | 'warning' | 'danger' {
  if (status === 'POSTED') {
    return 'success';
  }
  return status === 'CANCELLED' ? 'danger' : 'warning';
}

export interface DocumentDetailScreenProps {
  kind: DocumentKind;
  documentId: string;
  onBack?: () => void;
  /** Tiêm để test không cần mạng. */
  detail?: ReturnType<typeof useDocumentDetail>;
}

export function DocumentDetailScreen({
  kind,
  documentId,
  onBack,
  detail,
}: DocumentDetailScreenProps): React.ReactElement {
  const theme = useTheme();
  // Hook gọi vô điều kiện — quy tắc hook. Bản tiêm chỉ ghi đè kết quả.
  const loaded = useDocumentDetail(kind, documentId);
  const state = detail ?? loaded;

  const document = state.document;
  const outbound =
    kind === 'outbound' ? (document as OutboundDocument | undefined) : undefined;
  const inbound =
    kind === 'inbound' ? (document as InboundDocument | undefined) : undefined;
  const status = document?.status;
  const scanned = document?.scanned_total_qty ?? 0;
  const expected = document?.expected_total_qty ?? 0;

  if (state.phase === 'loading') {
    return (
      <Page
        title="Chi tiết phiếu"
        subtitle={kind === 'inbound' ? 'IN-04' : 'OUT-04'}
        onBack={onBack}
      >
        <Box card padding="lg">
          <Text variant="caption" tone="muted">
            Đang tải phiếu…
          </Text>
        </Box>
      </Page>
    );
  }

  if (state.phase === 'error' || document === undefined) {
    return (
      <Page
        title="Chi tiết phiếu"
        subtitle={kind === 'inbound' ? 'IN-04' : 'OUT-04'}
        onBack={onBack}
      >
        <Banner
          tone="danger"
          title="Không tải được phiếu"
          message={
            state.error === undefined
              ? 'Không rõ nguyên nhân.'
              : messageForUser(state.error)
          }
        >
          <Button label="Thử lại" variant="secondary" onPress={state.reload} />
          {onBack === undefined ? null : (
            <Button label="Quay lại" variant="secondary" onPress={onBack} />
          )}
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Chi tiết phiếu"
      subtitle={kind === 'inbound' ? 'IN-04' : 'OUT-04'}
      onBack={onBack}
      scroll
    >
      {/* --- Đầu phiếu --- */}
      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="caption" tone="muted">
              {kind === 'inbound' ? 'PHIẾU NHẬP' : 'PHIẾU XUẤT'}
            </Text>
            <Text variant="cardTitle" tone="strong">
              {document.doc_no ?? document.id}
            </Text>
          </View>
          <Badge
            label={
              status === undefined
                ? 'Không rõ'
                : (STATUS_LABEL[status] ?? status)
            }
            tone={statusTone(status)}
          />
        </View>

        <ProgressBar value={scanned} target={expected} />
        <Text variant="caption" tone="muted">
          {String(scanned) + '/' + String(expected) + ' mã đã quét'}
        </Text>
      </Box>

      {/* --- Thông tin phiếu --- */}
      <Box card padding="lg" gap="sm">
        <Text variant="cardTitle" tone="strong">
          Thông tin phiếu
        </Text>
        {/* `DefinitionRow` hiện `—` khi trống — đúng ảnh 31, nơi hàng SĐT rỗng. */}
        {inbound === undefined ? null : (
          <DefinitionRow label="Ngày chứng từ" value={inbound.doc_date} />
        )}
        <DefinitionRow label="Ghi chú" value={document.note ?? undefined} />
        {outbound === undefined ? null : (
          <>
            <DefinitionRow
              label="Nhóm đối tượng"
              value={outbound.recipient_type ?? undefined}
            />
            {/* Tên trường lấy từ shape ĐÃ ĐO, không đoán: máy chủ trả
                `recipient_phone_snapshot` / `recipient_address_snapshot`,
                không phải `recipient_phone` / `recipient_address`. */}
            <DefinitionRow
              label="Người nhận"
              value={displayPii(outbound.recipient_name)}
            />
            <DefinitionRow
              label="Số điện thoại"
              value={displayPii(outbound.recipient_phone_snapshot)}
            />
            <DefinitionRow
              label="Địa chỉ"
              value={displayPii(outbound.recipient_address_snapshot)}
            />
          </>
        )}
      </Box>

      {/* --- Danh sách mã --- */}
      <View style={styles.rowBetween}>
        <Text variant="cardTitle" tone="strong">
          Mã đã quét
        </Text>
        <Text variant="caption" tone="muted">
          {String(state.entries.length) + ' mã'}
        </Text>
      </View>

      {state.entriesError !== undefined ? (
        // 🔴 KHÔNG hiện danh sách rỗng khi tải hỏng: một phiếu 8 mã mà hiện
        // "0 mã" trông y hệt phiếu chưa quét gì, và người duyệt sẽ từ chối nhầm.
        <Banner
          tone="danger"
          title="Không tải được danh sách mã"
          message={
            messageForUser(state.entriesError) +
            ' Phiếu vẫn xem được, nhưng CHƯA rõ nó chứa những mã nào — không duyệt khi chưa xem được.'
          }
        >
          <Button label="Thử lại" variant="secondary" onPress={state.reload} />
        </Banner>
      ) : state.entries.length === 0 ? (
        <Box card padding="lg">
          <EmptyState
            title="Phiếu chưa có mã nào"
            hint="Danh sách đã tải từ WMS và thực sự rỗng."
          />
        </Box>
      ) : (
        state.entries.map((entry: ScanEntry, index: number) => (
          <Box
            key={entry.id ?? entryLabel(entry) + String(index)}
            card
            padding="lg"
            gap="sm"
          >
            <View style={styles.rowBetween}>
              <Text variant="caption" tone="muted">
                {'Dòng #' + String(index + 1)}
              </Text>
              <Badge label="Đã quét" tone="success" />
            </View>
            <Text variant="body" tone="strong">
              {entryLabel(entry)}
            </Text>
            <View style={styles.rowBetween}>
              <Text variant="caption" tone="muted">
                {entry.sku_name ?? entry.sku_code ?? ''}
              </Text>
              <Text variant="caption" tone="muted">
                {entry.scanned_at ?? entry.created_at ?? ''}
              </Text>
            </View>
          </Box>
        ))
      )}

      {/* --- Banner trạng thái cuối màn (ảnh 33) --- */}
      {status === 'POSTED' ? (
        <Banner
          tone="success"
          icon={<AppIcon name="check-circle" color={theme.colors.success} />}
          title={kind === 'inbound' ? 'Phiếu đã Post Receipt' : 'Phiếu đã Post Issue'}
          message={
            kind === 'inbound'
              ? 'Tồn kho đã tăng theo phiếu này.'
              : 'Tồn kho đã giảm theo phiếu này.'
          }
        />
      ) : (
        <Banner
          tone="warning"
          icon={<AppIcon name="clock" color={theme.colors.warningText} />}
          title={
            kind === 'inbound'
              ? 'Phiếu nhập đang chờ duyệt'
              : 'Phiếu xuất đang chờ duyệt'
          }
          message={
            kind === 'inbound'
              ? 'Tồn kho chỉ tăng sau khi Post Receipt.'
              : 'Tồn kho chỉ giảm sau khi Post Issue.'
          }
        />
      )}

      {onBack === undefined ? null : (
        <Button label="Quay lại" variant="secondary" onPress={onBack} />
      )}
    </Page>
  );
}
