/**
 * Bảo hành — chi tiết hồ sơ.
 *
 * 🎨 Nguồn: ảnh **44, 45, 46** — một màn, cuộn qua ba phần:
 * thông tin → chuyển trạng thái + timeline → ảnh & video.
 *
 * ## Ba ràng buộc nghiệp vụ trong màn này
 *
 * 1. **Ghi chú bắt buộc** khi Hoàn tất / Trả khách / Huỷ (ảnh 45). Nút chuyển
 *    trạng thái vẫn bấm được, nhưng bấm khi thiếu ghi chú thì hiện lỗi — giống
 *    màn Đăng nhập, khác màn Tạo phiếu nhập. Bộ ảnh không cho thấy nút mờ ở đây.
 * 2. **Giới hạn tệp** (ảnh 46): ảnh ≤ 10MB, video ≤ 300MB và ≤ 5 phút, tối đa
 *    10 ảnh / 2 video. Kiểm ở client **trước khi** tải để thủ kho không phải chờ
 *    hết 300MB qua mạng 3G rồi mới bị từ chối.
 * 3. **Hồ sơ ẩn danh** ẩn thao tác liên hệ và tải tệp — tệp đã bị xoá vật lý
 *    khỏi storage, nút tải chỉ dẫn tới 404.
 *
 * 🔒 Chuyển trạng thái là **lệnh ghi** ⇒ `GATE_WMS §2d` chặn. Màn dựng đủ UI,
 * state và validation; lời gọi thật để lại cho lúc Gate mở.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Stepper } from '../../ui/Stepper';
import { Select } from '../../ui/Select';
import { Timeline, type TimelineEntry } from '../../ui/Timeline';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import type { WarrantyCase } from '../../services/wms/types';
import type { WarrantyComponentHistoryDocument } from '../../services/wms/warrantyComponentRead';
import {
  ATTACHMENT_LIMITS,
  MESSAGE_ANONYMIZED,
  actionVisibility,
  canIssueWarrantyComponents,
  displayPii,
  isCaseAnonymized,
  validateTransition,
  nextStatuses,
  requiresConfirmedDefect,
  type WarrantyStatus,
} from './warrantyPolicy';
import { useAttachments } from './useAttachments';
import { ATTACHMENT_TYPES } from '../../services/wms/warrantyWrite';

/** Nhãn nút cho từng bước chuyển. Động từ, không phải tên trạng thái. */
const STATUS_ACTION_LABEL: Readonly<Record<WarrantyStatus, string>> = {
  RECEIVED: 'Tiếp nhận',
  CHECKING: 'Kiểm tra',
  REPAIRING: 'Sửa chữa',
  COMPLETED: 'Hoàn tất',
  RETURNED: 'Trả khách',
  CANCELLED: 'Huỷ',
};

const STATUS_LABEL: Readonly<Record<WarrantyStatus, string>> = {
  RECEIVED: 'Đã tiếp nhận',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa',
  COMPLETED: 'Hoàn tất',
  RETURNED: 'Đã trả khách',
  CANCELLED: 'Đã hủy',
};

/** Bốn bước của hồ sơ bảo hành — ảnh 44. */
export const WARRANTY_DETAIL_STEPS = [
  'Tiếp nhận',
  'Kiểm tra',
  'Xử lý',
  'Trả khách',
] as const;

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  componentHistoryItem: {
    borderWidth: 1,
  },
  documentNumber: {
    fontWeight: '600',
  },
});

export interface WarrantyDetailScreenProps {
  warrantyCase: WarrantyCase;
  timeline?: readonly TimelineEntry[];
  /**
   * Lỗi khi tải timeline. Tách khỏi "timeline rỗng" — hai thứ trông giống nhau
   * nhưng nghĩa ngược nhau: rỗng là *"chưa có xử lý nào"*, lỗi là *"chưa biết
   * có gì"*. Với hồ sơ đang Sửa chữa thì cái đầu là điều không thể đúng.
   */
  timelineError?: string;
  /** Lỗi khi chuyển trạng thái. */
  transitionError?: string;
  /** Trạng thái đang gửi — khoá nút để chống bấm hai lần. */
  transitioning?: string;
  onBack?: () => void;
  /**
   * Trạng thái tệp đính kèm. Tiêm để test không cần mạng lẫn module native.
   *
   * 🔧 2026-09-06: thay hai prop `imageCount`/`videoCount` cũ. Đếm do bên gọi
   * truyền vào là hai nguồn sự thật — màn hiện "3 ảnh" trong khi hook giữ 4 là
   * chuyện chờ xảy ra. Nay chỉ một nguồn: chính hook.
   */
  attachmentsState?: ReturnType<typeof useAttachments>;
  /** Bước hiện tại trên stepper, 0-3. */
  currentStep?: number;
  /** Hiện một lần ngay sau khi Mini App tạo thành công hồ sơ. */
  created?: boolean;
  onTransition?: (
    status: string,
    note: string,
    confirmedDefect?: string,
  ) => void;
  /** Mở luồng quét linh kiện; chỉ hiện ở CHECKING hoặc REPAIRING. */
  onIssueComponents?: () => void;
  /** Các phiếu linh kiện đã Post, được liên kết bằng warranty_case_id. */
  componentHistory?: readonly WarrantyComponentHistoryDocument[];
  componentHistoryLoading?: boolean;
  componentHistoryError?: string;
  onReloadComponentHistory?: () => void;
}

/**
 * Nhóm file — lấy từ **contract**, không phải từ ảnh.
 *
 * 🔧 Sửa 2026-09-06. Bản trước dùng `RECEIVE/INSPECT/REPAIR/RETURN` đọc theo
 * ảnh 46, còn contract khai `RECEIVE/INSPECTION/HANDOVER/OTHER`. Hai bộ giá trị
 * gần giống nhau nên rất dễ tưởng là một — và gửi `INSPECT` lên một endpoint
 * chờ `INSPECTION` thì hoặc bị từ chối, hoặc lưu sai nhóm một cách im lặng.
 *
 * Nhãn tiếng Việt giữ theo `ATTACHMENT_TYPES`, một nguồn duy nhất.
 */
const ATTACHMENT_TYPE_OPTIONS = ATTACHMENT_TYPES.map(item => ({
  value: item.value,
  label: item.label,
}));

export function WarrantyDetailScreen({
  warrantyCase,
  timeline = [],
  timelineError,
  transitionError,
  transitioning,
  onBack,
  attachmentsState,
  currentStep = 0,
  created = false,
  onTransition,
  onIssueComponents,
  componentHistory = [],
  componentHistoryLoading = false,
  componentHistoryError,
  onReloadComponentHistory,
}: WarrantyDetailScreenProps): React.ReactElement {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [confirmedDefect, setConfirmedDefect] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [mediaGroup, setMediaGroup] = useState<string>(
    ATTACHMENT_TYPES[0].value,
  );

  // Hook gọi vô điều kiện — quy tắc hook. Bản tiêm chỉ ghi đè kết quả.
  // 🔴 `warranty_case_id`, KHÔNG phải `id` — bản ghi bảo hành không có trường
  // `id` (đã ghi ở `queries.ts`). Dùng nhầm sẽ gọi `/attachments` với chuỗi
  // "undefined" và luôn nhận 404.
  const loadedAttachments = useAttachments(warrantyCase.warranty_case_id);
  const attachments = attachmentsState ?? loadedAttachments;
  const counts = attachments.counts;

  const currentStatus = warrantyCase.status ?? '';
  const available = nextStatuses(currentStatus);

  const anonymized = isCaseAnonymized(warrantyCase);
  const visibility = actionVisibility(warrantyCase);

  const transition = useCallback(
    (status: string) => () => {
      const problem = validateTransition({
        current: currentStatus,
        target: status,
        note,
        confirmedDefect,
      });
      setNoteError(problem);
      if (problem !== undefined) {
        return;
      }
      const nextNote =
        note.trim() ||
        defaultStatusNote(status, warrantyCase.customer_name, currentStatus);
      onTransition?.(status, nextNote, confirmedDefect.trim() || undefined);
    },
    [confirmedDefect, currentStatus, note, onTransition, warrantyCase.customer_name],
  );

  return (
    <Page title="Hồ sơ bảo hành" subtitle="Chi tiết bảo hành" onBack={onBack} scroll>
      <Stepper steps={WARRANTY_DETAIL_STEPS} current={currentStep} />

      {created ? (
        <Banner
          tone="success"
          title="Đã tạo hồ sơ bảo hành"
          message="Hồ sơ ở trạng thái RECEIVED, chưa làm thay đổi tồn kho."
        />
      ) : null}

      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="caption" tone="muted">
              {warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id}
            </Text>
            <Text variant="cardTitle" tone="strong">
              {warrantyCase.sku_name ??
                displayPii(warrantyCase.manual_product_description) ??
                'Sản phẩm chưa xác định'}
            </Text>
          </View>
          <Badge
            label={statusLabel(warrantyCase.status)}
            tone={statusTone(warrantyCase.status)}
            uppercase
          />
        </View>

        {anonymized ? (
          <Banner tone="info" title="Đã ẩn danh" message={MESSAGE_ANONYMIZED} />
        ) : (
          <>
            <DefinitionRow
              label="Khách hàng"
              value={displayPii(warrantyCase.customer_name)}
            />
            <DefinitionRow
              label="Số điện thoại"
              value={displayPii(warrantyCase.customer_phone)}
            />
            <DefinitionRow label="Mô tả" value={warrantyCase.description} />
          </>
        )}

        <DefinitionRow
          label="Lỗi báo"
          value={warrantyCase.reported_defect}
        />
        <DefinitionRow
          label="Phụ kiện"
          value={warrantyCase.accessories_received}
          last
        />
      </Box>

      <Box card padding="lg" gap="md">
        <View style={styles.sectionHead}>
          <Text variant="cardTitle" tone="strong">
            Linh kiện bảo hành
          </Text>
          {componentHistoryLoading ? null : (
            <Badge
              label={String(componentHistory.length) + ' phiếu đã xuất'}
              tone={componentHistory.length > 0 ? 'success' : 'neutral'}
            />
          )}
        </View>
        <Text variant="caption" tone="muted">
          Danh sách linh kiện đã xuất được lưu theo hồ sơ này. Chỉ các phiếu
          đã xác nhận xuất kho mới xuất hiện tại đây.
        </Text>

        {componentHistoryLoading ? (
          <Text variant="caption" tone="muted">
            Đang tải danh sách linh kiện đã xuất…
          </Text>
        ) : componentHistoryError !== undefined ? (
          <Banner
            tone="danger"
            title="Không tải được lịch sử linh kiện"
            message={componentHistoryError}
          >
            {onReloadComponentHistory === undefined ? null : (
              <Button
                label="Tải lại danh sách"
                variant="secondary"
                onPress={onReloadComponentHistory}
              />
            )}
          </Banner>
        ) : componentHistory.length === 0 ? (
          <Text variant="caption" tone="muted">
            Chưa có linh kiện nào đã xuất cho hồ sơ này.
          </Text>
        ) : (
          componentHistory.map(document => (
            <Box
              key={document.id}
              padding="md"
              gap="sm"
              style={[
                styles.componentHistoryItem,
                {
                  borderColor: theme.colors.divider,
                  borderRadius: theme.radius.control,
                },
              ]}
            >
              <View style={styles.sectionHead}>
                <Text
                  variant="caption"
                  tone="strong"
                  style={styles.documentNumber}
                >
                  {document.documentNumber ?? document.id}
                </Text>
                <Badge label="Đã xuất" tone="success" />
              </View>
              <Text variant="caption" tone="muted">
                {formatComponentIssueTime(document.postedAt)}
              </Text>
              {document.detailUnavailable ? (
                <Text variant="caption" tone="muted">
                  Không tải được chi tiết linh kiện của phiếu này.
                </Text>
              ) : (
                document.lines.map((line, index) => (
                  <DefinitionRow
                    key={line.id}
                    label={componentLineLabel(line)}
                    value={componentLineQuantity(line)}
                    last={index === document.lines.length - 1}
                  />
                ))
              )}
            </Box>
          ))
        )}

        {canIssueWarrantyComponents(warrantyCase.status) &&
        onIssueComponents !== undefined ? (
          <Button label="Xuất linh kiện" onPress={onIssueComponents} />
        ) : null}
      </Box>

      {/* --- Chuyển trạng thái — ảnh 45 --- */}
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Chuyển trạng thái
        </Text>

        <Input
          label="Ghi chú chuyển trạng thái"
          placeholder="VD: Bắt đầu kiểm tra sản phẩm"
          value={note}
          onChangeText={text => {
            setNote(text);
            setNoteError(undefined);
          }}
          errorText={noteError}
          multiline
        />

        {/* *Kết quả kiểm tra* là trường KHÁC với ghi chú — nó trả lời "kiểm tra
            ra bệnh gì", còn ghi chú trả lời "vì sao chuyển trạng thái". Chỉ hiện
            khi có bước nào đó thật sự cần, để không làm dài form vô ích. */}
        {available.some(status =>
          requiresConfirmedDefect(currentStatus, status),
        ) ? (
          <Input
            label="Kết quả kiểm tra*"
            placeholder="Bệnh đã xác định sau khi kiểm tra"
            value={confirmedDefect}
            onChangeText={setConfirmedDefect}
            multiline
          />
        ) : null}

        <Text variant="caption" tone="muted">
          Ghi chú bắt buộc khi Hoàn tất, Trả khách hoặc Huỷ hồ sơ.
        </Text>

        {/* 🔧 2026-09-06: nút sinh từ ĐỒ THỊ trạng thái, không còn cứng
            "Kiểm tra"/"Huỷ". Bản trước hiện đúng hai nút đó ở mọi hồ sơ — kể cả
            hồ sơ đã Trả khách, nơi không còn bước nào hợp lệ. */}
        {transitionError === undefined ? null : (
          <Banner
            tone="danger"
            title="Không chuyển được trạng thái"
            message={transitionError}
          />
        )}

        {available.length === 0 ? (
          <Text variant="caption" tone="muted">
            Hồ sơ đã đóng, không còn bước chuyển trạng thái nào.
          </Text>
        ) : (
          <View style={[styles.actions, { gap: theme.spacing.md }]}>
            {available.map(status => (
              <Button
                key={status}
                label={
                  transitioning === status
                    ? 'Đang chuyển…'
                    : STATUS_ACTION_LABEL[status]
                }
                variant={status === 'CANCELLED' ? 'danger' : 'secondary'}
                loading={transitioning === status}
                // Khoá TẤT CẢ nút khi đang gửi, không chỉ nút vừa bấm: hai
                // lệnh chuyển trạng thái chồng nhau sẽ ăn 412 ở lệnh sau.
                disabled={transitioning !== undefined}
                onPress={transition(status)}
                style={styles.half}
              />
            ))}
          </View>
        )}
      </Box>

      {/* --- Timeline --- */}
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Timeline
        </Text>
        {timelineError === undefined ? (
          <Timeline entries={timeline} />
        ) : (
          // 🔴 KHÔNG hiện timeline rỗng khi tải hỏng.
          <Banner
            tone="danger"
            title="Không tải được timeline"
            message={
              timelineError +
              ' Hồ sơ vẫn xem được, nhưng CHƯA rõ đã qua những bước nào.'
            }
          />
        )}
      </Box>

      {/* --- Ảnh & video — ảnh 46 --- */}
      <Box card padding="lg" gap="md">
        <View style={styles.sectionHead}>
          <Text variant="cardTitle" tone="strong">
            Ảnh & video bảo hành
          </Text>
          <Badge
            label={
              String(counts.images) +
              '/' +
              String(ATTACHMENT_LIMITS.maxImages) +
              ' ảnh · ' +
              String(counts.videos) +
              '/' +
              String(ATTACHMENT_LIMITS.maxVideos) +
              ' video'
            }
          />
        </View>

        <Banner
          tone="info"
          icon={<AppIcon name="shield-check" color={theme.colors.infoText} />}
          title="File được gửi tới backend WMS"
          message="Backend chịu trách nhiệm lưu vào storage đã cấu hình. Ảnh JPG/PNG/WEBP tối đa 10MB; video MP4/MOV/WEBM tối đa 300MB và 5 phút."
        />

        {/* 🔴 K (xoá file) CHƯA được duyệt. Nói ra trước khi người dùng gửi,
            không phải sau — sau thì đã muộn. */}
        <Banner
          tone="warning"
          icon={<Text>⚠</Text>}
          title="Chưa gỡ được file sau khi gửi"
          message="Kiểm lại danh sách chờ trước khi bấm Tải lên: thao tác xoá file trên WMS chưa được mở cho app."
        />

        <Select
          label="Nhóm hình ảnh/video"
          value={mediaGroup}
          options={ATTACHMENT_TYPE_OPTIONS}
          onChange={setMediaGroup}
        />

        {attachments.error === undefined ? null : (
          <Banner
            tone="danger"
            title="Có lỗi với tệp đính kèm"
            message={attachments.error}
          >
            <Button
              label="Đóng"
              variant="secondary"
              onPress={attachments.dismissMessages}
            />
          </Banner>
        )}

        {attachments.notice === undefined ? null : (
          <Banner tone="info" title="Ghi nhận" message={attachments.notice}>
            <Button
              label="Đóng"
              variant="secondary"
              onPress={attachments.dismissMessages}
            />
          </Banner>
        )}

        {visibility.canDownloadAttachments ? (
          <>
            <View style={[styles.actions, { gap: theme.spacing.md }]}>
              <Button
                label="Chọn từ thư viện"
                variant="secondary"
                onPress={attachments.addFromLibrary}
                disabled={attachments.uploading}
                style={styles.half}
              />
              <Button
                label="Chụp ảnh"
                variant="secondary"
                onPress={attachments.addFromCamera}
                disabled={attachments.uploading}
                style={styles.half}
              />
            </View>

            {/* --- Hàng chờ: bỏ được, vì chưa gửi --- */}
            {attachments.pending.length === 0 ? null : (
              <>
                <Text variant="caption" tone="muted">
                  {'CHỜ TẢI LÊN — ' +
                    String(attachments.pending.length) +
                    ' tệp'}
                </Text>
                {attachments.pending.map(item => (
                  <View key={item.file.uri} style={styles.sectionHead}>
                    <Text variant="caption" tone="muted">
                      {(item.isVideo ? '🎬 ' : '🖼 ') + item.file.name}
                    </Text>
                    <Text
                      variant="caption"
                      accessibilityRole="button"
                      accessibilityLabel={'Bỏ tệp ' + item.file.name}
                      onPress={() => attachments.removePending(item.file.uri)}
                      style={{ color: theme.colors.dangerText }}
                    >
                      Bỏ
                    </Text>
                  </View>
                ))}
                <Button
                  label={
                    attachments.progress === undefined
                      ? 'Tải lên ' +
                        String(attachments.pending.length) +
                        ' tệp'
                      : 'Đang tải ' +
                        String(attachments.progress.done + 1) +
                        '/' +
                        String(attachments.progress.total) +
                        '…'
                  }
                  loading={attachments.uploading}
                  disabled={attachments.uploading}
                  onPress={() => {
                    attachments.uploadAll(mediaGroup).catch(() => undefined);
                  }}
                />
              </>
            )}

            {/* --- Đã tải lên: KHÔNG có nút bỏ, vì K chưa duyệt --- */}
            {attachments.uploaded.length === 0 ? null : (
              <>
                <Text variant="caption" tone="muted">
                  {'ĐÃ TẢI LÊN — ' +
                    String(attachments.uploaded.length) +
                    ' tệp'}
                </Text>
                {attachments.uploaded.map((item, index) => (
                  <Text
                    key={item.id ?? String(index)}
                    variant="caption"
                    tone="muted"
                  >
                    {item.file_name ?? item.id ?? '(không rõ tên)'}
                  </Text>
                ))}
              </>
            )}
          </>
        ) : (
          // Tệp đã bị xoá vật lý khỏi storage — nút tải chỉ dẫn tới 404.
          <Text variant="caption" tone="muted">
            Hồ sơ đã ẩn danh — tệp đính kèm đã được gỡ khỏi hệ thống.
          </Text>
        )}

        {attachments.loading ? (
          <Text variant="caption" tone="muted">
            Đang tải danh sách file…
          </Text>
        ) : counts.images === 0 && counts.videos === 0 ? (
          <Text variant="caption" tone="muted">
            Chưa có ảnh hoặc video trong hồ sơ.
          </Text>
        ) : null}
      </Box>

      {onBack === undefined ? null : (
        <Button label="Quay lại" variant="secondary" onPress={onBack} />
      )}
    </Page>
  );
}

function statusLabel(status?: string): string {
  const normalized = (status ?? 'RECEIVED').toUpperCase() as WarrantyStatus;
  return STATUS_LABEL[normalized] ?? status ?? 'Đã tiếp nhận';
}

function componentLineLabel(line: WarrantyComponentHistoryDocument['lines'][number]): string {
  const sku = line.skuCode ?? 'SKU chưa xác định';
  return line.skuName === undefined || line.skuName.trim() === ''
    ? sku
    : sku + ' · ' + line.skuName;
}

function componentLineQuantity(
  line: WarrantyComponentHistoryDocument['lines'][number],
): string {
  const codeCount = line.scannedCodeCount;
  return (
    String(line.quantity) +
    ' linh kiện' +
    (codeCount > 0 ? ' · ' + String(codeCount) + ' mã/hộp' : '')
  );
}

function formatComponentIssueTime(value?: string): string {
  if (value === undefined || value.trim() === '') return 'Đã xác nhận xuất kho.';
  // WMS đang trả cả ISO và `YYYY-MM-DD HH:mm:ss+00`; thay khoảng trắng để
  // máy web/Android parse thống nhất. Nếu dữ liệu cũ không parse được thì giữ
  // nguyên, không tự bịa thời điểm lịch sử.
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return 'Đã xuất ' + value;
  return (
    'Đã xuất ' +
    date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function statusTone(
  status?: string,
): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = (status ?? 'RECEIVED').toUpperCase();
  if (normalized === 'CANCELLED') return 'danger';
  if (normalized === 'COMPLETED' || normalized === 'RETURNED') return 'success';
  if (normalized === 'REPAIRING') return 'primary';
  return 'warning';
}

function defaultStatusNote(
  status: string,
  customerName?: string | null,
  currentStatus?: string,
): string {
  const labels: Readonly<Record<string, string>> = {
    CHECKING: 'Bắt đầu kiểm tra sản phẩm',
    REPAIRING: 'Chuyển sang bước sửa chữa',
    COMPLETED:
      currentStatus?.toUpperCase() === 'CHECKING'
        ? 'Đã kiểm tra, vệ sinh và bàn giao được'
        : 'Đã thay linh kiện, test OK',
    RETURNED: ('Đã bàn giao cho khách ' + (customerName ?? '')).trim(),
    CANCELLED: 'Hủy hồ sơ bảo hành',
  };
  return labels[status.toUpperCase()] ?? 'Cập nhật trạng thái bảo hành';
}
