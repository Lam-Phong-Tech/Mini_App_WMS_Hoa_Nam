/**
 * Bộ ba màn **tiếp nhận bảo hành** — ảnh **41, 42, 43**.
 *
 * ```
 * Nhập/quét mã (41) → Chọn bệnh lỗi (42) → Mô tả và phụ kiện (43)
 * ```
 *
 * Gom ba màn vào một tệp vì chúng dùng chung một `WarrantyIntakeDraft` và chỉ
 * khác nhau ở phần thân. Tách ba tệp sẽ kéo theo ba lần import cùng một bộ
 * hằng số và ba chỗ phải sửa mỗi lần đổi stepper.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Select } from '../../ui/Select';
import { Stepper } from '../../ui/Stepper';
import { Checkbox } from '../../ui/Checkbox';
import { EmptyState } from '../../ui/EmptyState';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { sanitisePhone } from '../outbound/outboundDraft';
import {
  MESSAGE_STEP_INVALID_BODY,
  MESSAGE_STEP_INVALID_TITLE,
  MISSING_CODE_REASONS,
  WARRANTY_INTAKE_STEPS,
  isMissingCode,
  setIntakeProvince,
  toggleDefect,
  updateIntake,
  type DefectOption,
  type WarrantyIntakeDraft,
} from './warrantyIntake';
import type { GeoState } from '../../services/geo/useGeo';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
});

interface StepProps {
  draft: WarrantyIntakeDraft;
  onChange: (draft: WarrantyIntakeDraft) => void;
  onNext: () => void;
  onBack?: () => void;
}

function StepError({ draft }: { draft: WarrantyIntakeDraft }) {
  if (!draft.showStepError) {
    return null;
  }
  return (
    <Banner
      tone="danger"
      icon={<Text>⚠</Text>}
      title={MESSAGE_STEP_INVALID_TITLE}
      message={MESSAGE_STEP_INVALID_BODY}
    />
  );
}

// ---------------------------------------------------------------------------
// Ảnh 41 — nhập/quét mã và thông tin khách
// ---------------------------------------------------------------------------

export interface WarrantyCodeStepProps extends StepProps {
  provinceState: GeoState;
  wardState: GeoState;
  /**
   * Vì sao hồ sơ chuyển sang dạng tạm, khi `resolve-code` từ chối mã hoặc gọi
   * mạng hỏng. Im lặng đổi nhánh sẽ khiến thủ kho tưởng máy tự ý bỏ qua mã họ
   * vừa quét.
   */
  resolveNote?: string;
}

export function WarrantyCodeStep({
  draft,
  onChange,
  onNext,
  onBack,
  provinceState,
  wardState,
  resolveNote,
}: WarrantyCodeStepProps): React.ReactElement {
  const theme = useTheme();
  const missing = isMissingCode(draft);

  const provinceOptions = useMemo(
    () => provinceState.items.map(u => ({ value: u.code, label: u.name })),
    [provinceState.items],
  );
  const wardOptions = useMemo(
    () => wardState.items.map(u => ({ value: u.code, label: u.name })),
    [wardState.items],
  );

  return (
    <Page title="Tiếp nhận bảo hành" subtitle="Nhập/quét mã" scroll>
      <Stepper steps={WARRANTY_INTAKE_STEPS} current={0} />
      <StepError draft={draft} />

      {resolveNote === undefined ? null : (
        <Banner
          tone="warning"
          icon={<Text>⚠</Text>}
          title="Mã không dùng được cho hồ sơ thường"
          message={resolveNote}
        />
      )}

      <Box card padding="lg" gap="md">
        <View style={styles.head}>
          <Text variant="cardTitle" tone="strong">
            Sản phẩm bảo hành
          </Text>
          <Badge
            label={missing ? 'Mất tem/mã' : 'Đã có mã'}
            tone={missing ? 'warning' : 'success'}
          />
        </View>

        {missing ? (
          <>
            {/* Ảnh 43 cho thấy ô này readonly — nhánh mất mã được chọn từ
                trước ở màn danh sách, không phải gõ vào lúc này. Nhưng vẫn cho
                đổi lý do, vì "mất tem" khác "tem mờ" khác "không đủ điều kiện". */}
            <Select
              label="Lý do thiếu mã*"
              placeholder="Chọn lý do"
              value={draft.missingCodeReason}
              options={MISSING_CODE_REASONS.map(item => ({
                value: item.value,
                label: item.label,
              }))}
              errorText={draft.errors.missingCodeReason}
              onChange={value =>
                onChange(updateIntake(draft, { missingCodeReason: value }))
              }
              sheetTitle="Lý do thiếu mã"
            />
            <Input
              label="Mô tả sản phẩm*"
              placeholder="VD: Máy khoan cầm tay, vỏ xanh"
              value={draft.manualProductDescription}
              onChangeText={text =>
                onChange(
                  updateIntake(draft, { manualProductDescription: text }),
                )
              }
              errorText={draft.errors.manualProductDescription}
              multiline
            />
          </>
        ) : (
          <>
            <Text variant="body" tone="strong">
              {draft.resolvedProductName ?? draft.itemCode}
            </Text>
            <Text variant="caption" tone="muted">
              {draft.itemCode}
            </Text>
          </>
        )}
      </Box>

      <Box card padding="lg" gap="lg">
        <Text variant="cardTitle" tone="strong">
          Thông tin khách hàng
        </Text>

        <Input
          label="Tên khách hàng*"
          placeholder="VD: Nguyễn Văn A"
          value={draft.customerName}
          onChangeText={text =>
            onChange(updateIntake(draft, { customerName: text }))
          }
          errorText={draft.errors.customerName}
        />

        <Input
          label="Số điện thoại*"
          placeholder="VD: 0901234567"
          value={draft.customerPhone}
          // Lọc ký tự lạ ngay lúc gõ — cùng quy tắc màn xuất kho.
          onChangeText={text =>
            onChange(
              updateIntake(draft, { customerPhone: sanitisePhone(text) }),
            )
          }
          errorText={draft.errors.customerPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />

        <Select
          label="Tỉnh/Thành phố*"
          placeholder="Chọn tỉnh/thành phố"
          disabledPlaceholder={
            provinceState.phase === 'loading'
              ? 'Đang tải danh mục…'
              : 'Không tải được danh mục tỉnh/thành'
          }
          disabled={provinceState.phase !== 'ready'}
          value={draft.province}
          options={provinceOptions}
          errorText={draft.errors.province ?? provinceState.error?.message}
          onChange={value =>
            onChange(
              setIntakeProvince(
                draft,
                value,
                provinceOptions.find(o => o.value === value)?.label,
              ),
            )
          }
          sheetTitle="Chọn tỉnh/thành phố"
        />

        <Select
          label="Phường/Xã*"
          placeholder="Chọn phường/xã"
          disabledPlaceholder={
            draft.province === ''
              ? 'Chọn tỉnh/thành trước'
              : wardState.phase === 'loading'
                ? 'Đang tải phường/xã…'
                : 'Không tải được phường/xã'
          }
          disabled={draft.province === '' || wardState.phase !== 'ready'}
          value={draft.ward}
          options={wardOptions}
          errorText={draft.errors.ward ?? wardState.error?.message}
          onChange={value =>
            onChange(
              updateIntake(draft, {
                ward: value,
                wardName: wardOptions.find(o => o.value === value)?.label ?? '',
              }),
            )
          }
          sheetTitle="Chọn phường/xã"
        />

        <Input
          label="Số nhà / tên đường"
          placeholder="VD: Số 5, ngõ 12"
          value={draft.street}
          onChangeText={text => onChange(updateIntake(draft, { street: text }))}
        />
      </Box>

      <View style={[styles.actions, { gap: theme.spacing.md }]}>
        {onBack === undefined ? null : (
          <Button
            label="Quay lại"
            variant="secondary"
            onPress={onBack}
            style={styles.half}
          />
        )}
        <Button label="Tiếp tục" onPress={onNext} style={styles.half} />
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Ảnh 42 — chọn bệnh lỗi
// ---------------------------------------------------------------------------

export interface WarrantyDefectStepProps extends StepProps {
  defects: readonly DefectOption[];
  loading?: boolean;
  /** 🔴 403 với vai Thủ kho là trạng thái HỢP LỆ, không phải sự cố. */
  forbidden?: boolean;
  error?: string;
  onRetry?: () => void;
}

export function WarrantyDefectStep({
  draft,
  onChange,
  onNext,
  onBack,
  defects,
  loading = false,
  forbidden = false,
  error,
  onRetry,
}: WarrantyDefectStepProps): React.ReactElement {
  const theme = useTheme();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (needle === '') {
      return defects;
    }
    return defects.filter(
      defect =>
        defect.name.toLowerCase().includes(needle) ||
        (defect.code ?? '').toLowerCase().includes(needle),
    );
  }, [defects, keyword]);

  return (
    <Page title="Chọn bệnh lỗi" subtitle="Tiếp nhận bảo hành" scroll>
      <Stepper steps={WARRANTY_INTAKE_STEPS} current={1} />
      <StepError draft={draft} />

      {forbidden ? (
        // Nói RÕ đây là vấn đề QUYỀN, không phải "không có lỗi nào". Thủ kho
        // không tự cấp quyền được — câu chữ phải chỉ họ tới người làm được.
        <Banner
          tone="danger"
          icon={<AppIcon name="shield-check" color={theme.colors.dangerText} />}
          title="Tài khoản chưa có quyền xem danh mục lỗi"
          message="WMS từ chối truy cập danh mục bệnh lỗi với vai hiện tại. Báo quản trị cấp quyền, hoặc để người có quyền tiếp nhận hồ sơ này."
        />
      ) : error !== undefined ? (
        <Banner tone="danger" title="Không tải được danh mục lỗi" message={error}>
          {onRetry === undefined ? null : (
            <Button label="Thử lại" variant="secondary" onPress={onRetry} />
          )}
        </Banner>
      ) : null}

      <Input
        label="Tìm bệnh lỗi"
        placeholder="Nhập mã hoặc tên lỗi"
        value={keyword}
        onChangeText={setKeyword}
      />

      {draft.errors.defectIds === undefined ? null : (
        <Text variant="caption" style={{ color: theme.colors.dangerText }}>
          {draft.errors.defectIds}
        </Text>
      )}

      <View style={styles.head}>
        <Text variant="cardTitle" tone="strong">
          Danh mục lỗi
        </Text>
        <Text variant="caption" tone="muted">
          {'Đã chọn ' + String(draft.defectIds.length)}
        </Text>
      </View>

      {loading ? (
        <Box card padding="lg">
          <Text variant="caption" tone="muted">
            Đang tải danh mục lỗi…
          </Text>
        </Box>
      ) : filtered.length === 0 ? (
        <Box card padding="lg">
          <EmptyState
            title={
              keyword.trim() === ''
                ? 'Chưa có danh mục lỗi'
                : 'Không tìm thấy lỗi phù hợp'
            }
            hint={
              keyword.trim() === ''
                ? 'WMS chưa khai báo bệnh lỗi nào. Bấm "Tiếp tục" và mô tả lỗi bằng lời ở bước sau — bước này không bắt buộc.'
                : 'Thử từ khoá khác, hoặc xoá ô tìm để xem toàn bộ.'
            }
          />
        </Box>
      ) : (
        <Box card padding="lg" gap="sm">
          {filtered.map(defect => (
            <Checkbox
              key={defect.id}
              checked={draft.defectIds.includes(defect.id)}
              onToggle={() => onChange(toggleDefect(draft, defect.id))}
              label={defect.name}
              description={defect.code}
            />
          ))}
        </Box>
      )}

      <View style={[styles.actions, { gap: theme.spacing.md }]}>
        {onBack === undefined ? null : (
          <Button
            label="Quay lại"
            variant="secondary"
            onPress={onBack}
            style={styles.half}
          />
        )}
        <Button label="Tiếp tục" onPress={onNext} style={styles.half} />
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Ảnh 43 — mô tả, phụ kiện, tình trạng
// ---------------------------------------------------------------------------

export interface WarrantyDescriptionStepProps extends StepProps {
  submitting?: boolean;
  /** Nhãn nút cuối. Ảnh 43: *Tạo hồ sơ bảo hành*. */
  submitLabel?: string;
  selectedDefects?: readonly DefectOption[];
}

export function WarrantyDescriptionStep({
  draft,
  onChange,
  onNext,
  onBack,
  submitting = false,
  submitLabel = 'Tạo hồ sơ bảo hành',
  selectedDefects = [],
}: WarrantyDescriptionStepProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Page title="Mô tả yêu cầu" subtitle="Tiếp nhận bảo hành" scroll>
      <Stepper steps={WARRANTY_INTAKE_STEPS} current={2} />
      <StepError draft={draft} />

      {isMissingCode(draft) ? (
        <Box card padding="lg" gap="sm">
          <Text variant="caption" tone="muted">
            LÝ DO THIẾU MÃ
          </Text>
          {/* Ảnh 43: ô này **readonly** ở bước cuối — đã chốt ở bước 1. */}
          <Text variant="body" tone="strong">
            {MISSING_CODE_REASONS.find(
              item => item.value === draft.missingCodeReason,
            )?.label ?? draft.missingCodeReason}
          </Text>
        </Box>
      ) : null}

      {selectedDefects.length === 0 ? null : (
        <Box card padding="lg" gap="sm">
          <Text variant="caption" tone="muted">
            BỆNH LỖI ĐÃ CHỌN
          </Text>
          {selectedDefects.map(defect => (
            <Text key={defect.id} variant="body">
              {(defect.code === undefined ? '' : defect.code + ' · ') +
                defect.name}
            </Text>
          ))}
        </Box>
      )}

      <Box card padding="lg" gap="lg">
        <Input
          label="Mô tả yêu cầu*"
          placeholder="Khách mô tả hiện tượng, yêu cầu xử lý"
          value={draft.description}
          onChangeText={text =>
            onChange(updateIntake(draft, { description: text }))
          }
          errorText={draft.errors.description}
          multiline
        />

        <Input
          label="Phụ kiện nhận kèm"
          placeholder="VD: Sạc, hộp, phiếu bảo hành"
          value={draft.accessoriesReceived}
          onChangeText={text =>
            onChange(updateIntake(draft, { accessoriesReceived: text }))
          }
          multiline
        />

        <Input
          label="Tình trạng khi nhận"
          placeholder="VD: Xước vỏ, thiếu nắp pin"
          value={draft.receivedCondition}
          onChangeText={text =>
            onChange(updateIntake(draft, { receivedCondition: text }))
          }
          multiline
        />
      </Box>

      <Banner
        tone="info"
        icon={<AppIcon name="shield-check" color={theme.colors.infoText} />}
        title="Hồ sơ vào trạng thái Tiếp nhận"
        message="Sau khi tạo, hồ sơ ở trạng thái RECEIVED. Các bước kiểm tra và sửa chữa thực hiện ở màn chi tiết hồ sơ."
      />

      <View style={[styles.actions, { gap: theme.spacing.md }]}>
        {onBack === undefined ? null : (
          <Button
            label="Quay lại"
            variant="secondary"
            onPress={onBack}
            style={styles.half}
            disabled={submitting}
          />
        )}
        <Button
          label={submitLabel}
          onPress={onNext}
          loading={submitting}
          disabled={submitting}
          style={styles.half}
        />
      </View>
    </Page>
  );
}
