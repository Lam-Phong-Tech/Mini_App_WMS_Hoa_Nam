/**
 * Màn tạo hồ sơ bảo hành, đồng bộ theo `src/pages/WarrantyReceivePage` của
 * Mini App đang chạy.
 *
 * Mini App đặt toàn bộ phần tiếp nhận trên một màn cuộn: kiểm tra mã, thông
 * tin khách, lỗi báo và mô tả. Không chia thành wizard vì thủ kho cần đối
 * chiếu tất cả thông tin trước khi tạo hồ sơ.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { toAppError, messageForUser } from '../../errors/AppError';
import { useProvinces, useWards } from '../../services/geo/useGeo';
import type { WarrantyCase } from '../../services/wms/types';
import {
  createWarrantyCase,
  isEligibleForWarranty,
  resolveWarrantyCode,
} from '../../services/wms/warrantyWrite';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Input } from '../../ui/Input';
import { Page } from '../../ui/Page';
import { Select } from '../../ui/Select';
import { Banner } from '../../ui/Banner';
import { Text } from '../../ui/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { isValidPhone, sanitisePhone } from '../outbound/outboundDraft';
import {
  fetchDefects,
  toDefectOptions,
} from './WarrantyIntakeFlow';
import {
  intakeIdempotencyKey,
  type DefectOption,
} from './warrantyIntake';
import { isDefectPermissionDenied } from './warrantyPolicy';

const DESCRIPTION_DEFECT_PREFIX = 'Bệnh/lỗi: ';

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  half: { flex: 1 },
  modeHead: { justifyContent: 'space-between' },
});

interface WarrantyForm {
  readonly customerName: string;
  readonly customerPhone: string;
  readonly street: string;
  readonly description: string;
  readonly accessoriesReceived: string;
  readonly receivedCondition: string;
  readonly missingCodeReason: string;
  readonly manualProductDescription: string;
}

const initialForm: WarrantyForm = {
  customerName: '',
  customerPhone: '',
  street: '',
  description: '',
  accessoriesReceived: '',
  receivedCondition: '',
  missingCodeReason: 'Mất tem/mã',
  manualProductDescription: '',
};

type FormErrors = Readonly<Record<string, string | undefined>>;

export interface WarrantyIntakeScreenProps {
  /** Mã chuyển từ camera. Nhập tay vẫn dùng cùng màn này như Mini App. */
  initialCode?: string;
  /** Lối "Mất tem/mã" từ danh sách. */
  initialTempOnly?: boolean;
  onBack: () => void;
  onScan: () => void;
  onCreated?: (warrantyCase: WarrantyCase) => void;
  /** Điểm tiêm cho test, không gọi WMS. */
  loadDefects?: typeof fetchDefects;
  submitCase?: typeof createWarrantyCase;
  resolveCode?: typeof resolveWarrantyCode;
}

/** Đồng bộ cách Mini App đưa các lỗi đã chọn vào phần mô tả. */
export function mergeDefectSuggestions(
  description: string,
  defectNames: readonly string[],
): string {
  const manualLines = description
    .split('\n')
    .filter(line => !line.trimStart().startsWith(DESCRIPTION_DEFECT_PREFIX));
  const defectLine =
    defectNames.length === 0
      ? ''
      : DESCRIPTION_DEFECT_PREFIX + defectNames.join(', ');
  return [defectLine, ...manualLines].filter(Boolean).join('\n').trimStart();
}

function normaliseSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveDescription(
  result: Awaited<ReturnType<typeof resolveWarrantyCode>>,
): string {
  const product =
    result.product_name ?? result.sku_name ?? result.sku_code ?? result.item_code;
  const eligibility = result.eligibility_code ?? 'Đã kiểm tra mã';
  const flow =
    result.recommended_flow?.toUpperCase() === 'TEMP_ONLY'
      ? 'Tạo hồ sơ tạm'
      : 'Tạo hồ sơ theo mã';
  return [eligibility, flow, product].filter(Boolean).join(' · ');
}

function validateForm(input: {
  form: WarrantyForm;
  rawCode: string;
  tempOnly: boolean;
  resolved?: Awaited<ReturnType<typeof resolveWarrantyCode>>;
  provinceName?: string;
  wardName?: string;
}): FormErrors {
  const { form, rawCode, tempOnly, resolved, provinceName, wardName } = input;
  const errors: Record<string, string> = {};

  if (!tempOnly) {
    if (rawCode.trim() === '') {
      errors.code = 'Vui lòng nhập hoặc quét mã sản phẩm.';
    } else if (!isEligibleForWarranty(resolved ?? {})) {
      errors.code =
        'Vui lòng kiểm tra mã và bảo đảm sản phẩm đủ điều kiện bảo hành.';
    }
  }
  if (form.customerName.trim().length < 2) {
    errors.customerName = 'Tên khách hàng phải có ít nhất 2 ký tự.';
  }
  if (!isValidPhone(form.customerPhone)) {
    errors.customerPhone =
      'Số điện thoại phải gồm 10 số và dùng đầu số Việt Nam: 03, 05, 07, 08 hoặc 09.';
  }
  if (provinceName === undefined) {
    errors.province = 'Vui lòng chọn tỉnh/thành phố.';
  }
  if (wardName === undefined) {
    errors.ward = 'Vui lòng chọn phường/xã sau khi chọn tỉnh/thành.';
  }
  const address = [form.street.trim(), wardName, provinceName]
    .filter(Boolean)
    .join(', ');
  if (form.street.trim() === '') {
    errors.street = 'Vui lòng nhập số nhà, tên đường hoặc thôn/xóm.';
  } else if (address.length > 500) {
    errors.street = 'Địa chỉ đầy đủ không được vượt quá 500 ký tự.';
  }
  if (form.description.trim() === '') {
    errors.description = 'Vui lòng nhập mô tả yêu cầu hoặc chọn bệnh/lỗi gợi ý.';
  }
  if (tempOnly && form.missingCodeReason.trim() === '') {
    errors.missingCodeReason = 'Vui lòng nhập lý do không có mã sản phẩm.';
  }
  if (tempOnly && form.manualProductDescription.trim() === '') {
    errors.manualProductDescription = 'Vui lòng mô tả đầy đủ sản phẩm khi không có mã.';
  }
  return errors;
}

export function WarrantyIntakeScreen({
  initialCode,
  initialTempOnly = false,
  onBack,
  onScan,
  onCreated,
  loadDefects = fetchDefects,
  submitCase = createWarrantyCase,
  resolveCode = resolveWarrantyCode,
}: WarrantyIntakeScreenProps): React.ReactElement {
  const theme = useTheme();
  const [rawCode, setRawCode] = useState(initialCode ?? '');
  const [tempOnly, setTempOnly] = useState(initialTempOnly);
  const [resolved, setResolved] = useState<
    Awaited<ReturnType<typeof resolveWarrantyCode>> | undefined
  >();
  const [resolving, setResolving] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<WarrantyForm>(initialForm);
  const [defects, setDefects] = useState<readonly DefectOption[]>([]);
  const [defectsLoading, setDefectsLoading] = useState(true);
  const [defectsError, setDefectsError] = useState<string | undefined>();
  const [defectsForbidden, setDefectsForbidden] = useState(false);
  const [selectedDefectIds, setSelectedDefectIds] = useState<readonly string[]>(
    [],
  );
  const [defectSearch, setDefectSearch] = useState('');
  const provinceState = useProvinces();
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const wardState = useWards(province);

  const provinceOptions = useMemo(
    () => provinceState.items.map(item => ({ value: item.code, label: item.name })),
    [provinceState.items],
  );
  const wardOptions = useMemo(
    () => wardState.items.map(item => ({ value: item.code, label: item.name })),
    [wardState.items],
  );
  const provinceName = provinceOptions.find(item => item.value === province)?.label;
  const wardName = wardOptions.find(item => item.value === ward)?.label;
  const visibleDefects = useMemo(() => {
    const keyword = normaliseSearch(defectSearch);
    if (keyword === '') return defects;
    return defects.filter(item =>
      normaliseSearch([item.code, item.name].filter(Boolean).join(' ')).includes(
        keyword,
      ),
    );
  }, [defectSearch, defects]);

  const updateField = useCallback(
    <Key extends keyof WarrantyForm>(key: Key, value: WarrantyForm[Key]) => {
      setForm(current => ({ ...current, [key]: value }));
      setErrors(current => ({ ...current, [key]: undefined }));
    },
    [],
  );

  const loadDefectList = useCallback(() => {
    setDefectsLoading(true);
    setDefectsError(undefined);
    setDefectsForbidden(false);
    loadDefects()
      .then(page => setDefects(toDefectOptions(page.items)))
      .catch(cause => {
        if (isDefectPermissionDenied(cause)) {
          setDefectsForbidden(true);
          return;
        }
        setDefectsError(messageForUser(toAppError(cause)));
      })
      .finally(() => setDefectsLoading(false));
  }, [loadDefects]);

  useEffect(loadDefectList, [loadDefectList]);

  const runResolve = useCallback(
    async (candidate = rawCode) => {
      const code = candidate.trim();
      if (code === '') {
        setErrors(current => ({
          ...current,
          code: 'Vui lòng nhập hoặc quét mã sản phẩm.',
        }));
        return;
      }
      setResolving(true);
      setSubmitError(undefined);
      setErrors(current => ({ ...current, code: undefined }));
      try {
        const result = await resolveCode(code);
        setResolved(result);
        setRawCode(result.item_code ?? result.serial_number ?? code);
        setTempOnly(result.recommended_flow?.toUpperCase() === 'TEMP_ONLY');
      } catch (cause) {
        setResolved(undefined);
        setSubmitError(messageForUser(toAppError(cause)));
      } finally {
        setResolving(false);
      }
    },
    [rawCode, resolveCode],
  );

  // Mã từ camera của Mini App được kiểm tra ngay khi vào trang tiếp nhận.
  useEffect(() => {
    if ((initialCode ?? '').trim() !== '') {
      runResolve(initialCode).catch(() => undefined);
    }
  }, [initialCode, runResolve]);

  const toggleDefect = useCallback(
    (id: string) => {
      setSelectedDefectIds(current => {
        const next = current.includes(id)
          ? current.filter(value => value !== id)
          : [...current, id];
        const names = defects
          .filter(item => next.includes(item.id))
          .map(item => item.name);
        setForm(formCurrent => ({
          ...formCurrent,
          description: mergeDefectSuggestions(formCurrent.description, names),
        }));
        setErrors(errorCurrent => ({ ...errorCurrent, description: undefined }));
        return next;
      });
    },
    [defects],
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    const nextErrors = validateForm({
      form,
      rawCode,
      tempOnly,
      resolved,
      provinceName,
      wardName,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Vui lòng kiểm tra lại các trường bắt buộc trước khi tạo hồ sơ.');
      return;
    }

    const customerAddress = [form.street.trim(), wardName, provinceName]
      .filter(Boolean)
      .join(', ');
    const payload = {
      ...(tempOnly
        ? {
            missingCodeReason: form.missingCodeReason,
            manualProductDescription: form.manualProductDescription,
          }
        : { itemCode: rawCode }),
      customerName: form.customerName,
      customerPhone: sanitisePhone(form.customerPhone),
      customerAddress,
      description: form.description,
      defectIds: selectedDefectIds,
      accessoriesReceived: form.accessoriesReceived,
      receivedCondition: form.receivedCondition,
    };

    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const created = await submitCase(payload, intakeIdempotencyKey(payload));
      onCreated?.(created);
    } catch (cause) {
      setSubmitError(messageForUser(toAppError(cause)));
    } finally {
      setSubmitting(false);
    }
  }, [
    form,
    onCreated,
    provinceName,
    rawCode,
    resolved,
    selectedDefectIds,
    submitCase,
    submitting,
    tempOnly,
    wardName,
  ]);

  return (
    <Page title="Tạo hồ sơ bảo hành" subtitle="Bảo hành" onBack={onBack} scroll>
      <Box card padding="lg" gap="md">
        <View style={[styles.row, styles.modeHead, { gap: theme.spacing.md }]}>
          <View style={styles.half}>
            <Text variant="caption" tone="muted">
              {tempOnly ? 'Không có mã' : 'Có mã định danh'}
            </Text>
            <Text variant="cardTitle" tone="strong">
              {tempOnly ? 'Không có mã / mất tem' : 'Quét hoặc nhập mã sản phẩm'}
            </Text>
          </View>
          <Button
            label={tempOnly ? 'Nhập/quét mã' : 'Mất mã'}
            variant="secondary"
            onPress={() => {
              setTempOnly(current => !current);
              setSubmitError(undefined);
              setErrors(current => ({ ...current, code: undefined }));
            }}
          />
        </View>

        {tempOnly ? null : (
          <>
            <Input
              label="Mã sản phẩm / serial*"
              placeholder="SER-000123 hoặc QR/Barcode"
              value={rawCode}
              maxLength={512}
              errorText={errors.code}
              onChangeText={value => {
                setRawCode(value);
                setResolved(undefined);
                setErrors(current => ({ ...current, code: undefined }));
              }}
            />
            <View style={[styles.row, { gap: theme.spacing.md }]}>
              <Button
                label="Quét camera"
                variant="secondary"
                onPress={onScan}
                style={styles.half}
              />
              <Button
                label={resolving ? 'Đang kiểm tra…' : 'Kiểm tra mã'}
                loading={resolving}
                disabled={resolving}
                onPress={() => {
                  runResolve().catch(() => undefined);
                }}
                style={styles.half}
              />
            </View>
          </>
        )}

        {resolved === undefined ? null : (
          <Banner
            tone={isEligibleForWarranty(resolved) ? 'success' : 'warning'}
            title={
              isEligibleForWarranty(resolved)
                ? 'Mã đủ điều kiện bảo hành'
                : 'Mã chưa đủ điều kiện'
            }
            message={resolveDescription(resolved)}
          />
        )}
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Thông tin khách hàng
        </Text>
        <Input
          label="Tên khách hàng*"
          placeholder="Nguyễn Văn A"
          value={form.customerName}
          maxLength={200}
          errorText={errors.customerName}
          onChangeText={value => updateField('customerName', value)}
        />
        <Input
          label="Số điện thoại*"
          placeholder="0901234567"
          keyboardType="phone-pad"
          maxLength={10}
          value={form.customerPhone}
          errorText={errors.customerPhone}
          onChangeText={value => updateField('customerPhone', sanitisePhone(value))}
        />
        <Select
          label="Tỉnh/Thành phố*"
          placeholder="Chọn tỉnh/thành phố"
          disabledPlaceholder={
            provinceState.phase === 'loading'
              ? 'Đang tải tỉnh/thành…'
              : 'Không tải được tỉnh/thành'
          }
          disabled={provinceState.phase !== 'ready'}
          value={province}
          options={provinceOptions}
          errorText={errors.province ?? provinceState.error?.message}
          onChange={value => {
            setProvince(value);
            setWard('');
            setErrors(current => ({ ...current, province: undefined, ward: undefined }));
          }}
          sheetTitle="Chọn tỉnh/thành phố"
        />
        <Select
          label="Phường/Xã*"
          placeholder="Chọn phường/xã"
          disabledPlaceholder={
            province === ''
              ? 'Chọn tỉnh/thành trước'
              : wardState.phase === 'loading'
                ? 'Đang tải phường/xã…'
                : 'Không tải được phường/xã'
          }
          disabled={province === '' || wardState.phase !== 'ready'}
          value={ward}
          options={wardOptions}
          errorText={errors.ward ?? wardState.error?.message}
          onChange={value => {
            setWard(value);
            setErrors(current => ({ ...current, ward: undefined }));
          }}
          sheetTitle="Chọn phường/xã"
        />
        <Input
          label="Số nhà, tên đường*"
          placeholder="Số nhà, tên đường, thôn/xóm…"
          value={form.street}
          maxLength={350}
          errorText={errors.street}
          onChangeText={value => updateField('street', value)}
        />
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Bệnh/lỗi khách báo
        </Text>
        <Text variant="caption" tone="muted">
          Có thể chọn nhiều lỗi. App sẽ tự điền các lỗi đã chọn vào ô mô tả.
        </Text>
        {defectsForbidden ? (
          <Banner
            tone="warning"
            title="Tài khoản chưa có quyền xem danh mục bệnh/lỗi"
            message="Bạn vẫn có thể nhập mô tả thủ công, hoặc nhờ quản lý chọn giúp."
          />
        ) : null}
        {defectsError === undefined ? null : (
          <Banner
            tone="warning"
            title="Không tải được danh mục bệnh/lỗi"
            message={defectsError + ' Bạn vẫn có thể nhập mô tả thủ công.'}
          >
            <Button label="Thử lại" variant="secondary" onPress={loadDefectList} />
          </Banner>
        )}
        <Input
          label="Tìm bệnh/lỗi"
          placeholder={defectsLoading ? 'Đang tải bệnh/lỗi…' : 'Nhập tên hoặc mã lỗi'}
          value={defectSearch}
          editable={!defectsLoading && defects.length > 0}
          onChangeText={setDefectSearch}
        />
        {visibleDefects.map(item => (
          <Checkbox
            key={item.id}
            checked={selectedDefectIds.includes(item.id)}
            onToggle={() => toggleDefect(item.id)}
            label={item.name}
            description={[item.code].filter(Boolean).join(' · ') || undefined}
          />
        ))}
        {!defectsLoading && defects.length === 0 && defectsError === undefined && !defectsForbidden ? (
          <Text variant="caption" tone="muted">
            Chưa có bệnh/lỗi trong danh mục. Bạn vẫn có thể nhập mô tả thủ công.
          </Text>
        ) : null}

        <Input
          label="Mô tả yêu cầu*"
          placeholder="Khách báo lỗi / nhu cầu kiểm tra…"
          value={form.description}
          maxLength={2000}
          multiline
          errorText={errors.description}
          onChangeText={value => updateField('description', value)}
        />
        {tempOnly ? (
          <>
            <Input
              label="Lý do thiếu mã*"
              placeholder="Mất tem/mã"
              value={form.missingCodeReason}
              maxLength={500}
              errorText={errors.missingCodeReason}
              onChangeText={value => updateField('missingCodeReason', value)}
            />
            <Input
              label="Mô tả sản phẩm thủ công*"
              placeholder="Tên/loại máy, nhãn hiệu, màu sắc, đặc điểm nhận dạng…"
              value={form.manualProductDescription}
              maxLength={2000}
              multiline
              errorText={errors.manualProductDescription}
              onChangeText={value => updateField('manualProductDescription', value)}
            />
          </>
        ) : null}
        <Input
          label="Phụ kiện nhận kèm"
          placeholder="Pin, sạc, hộp…"
          value={form.accessoriesReceived}
          maxLength={1000}
          onChangeText={value => updateField('accessoriesReceived', value)}
        />
        <Input
          label="Tình trạng khi nhận"
          placeholder="Trầy xước nhẹ, còn nguyên tem…"
          value={form.receivedCondition}
          maxLength={500}
          onChangeText={value => updateField('receivedCondition', value)}
        />
        {submitError === undefined ? null : (
          <Banner tone="danger" title="Không thể tạo hồ sơ bảo hành" message={submitError} />
        )}
        <Button
          label={submitting ? 'Đang tạo hồ sơ…' : 'Tạo hồ sơ bảo hành'}
          loading={submitting}
          disabled={submitting}
          onPress={() => {
            submit().catch(() => undefined);
          }}
        />
      </Box>
    </Page>
  );
}
