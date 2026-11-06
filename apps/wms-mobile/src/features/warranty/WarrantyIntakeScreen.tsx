import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as NativeText } from '../../ui/ScannerNativeText';
/**
 * P09.S02 tiếp nhận theo mẫu đã khóa: xác định sản phẩm, chọn lỗi, ghi chú.
 * Chỉ bổ sung khách hàng khi đã xác định sản phẩm cần tiếp nhận hoặc chọn
 * TEMP_ONLY; không coi trạng thái chưa tra cứu là thiếu dữ liệu khách hàng.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { toAppError, messageForUser } from '../../errors/AppError';
import { useProvinces, useWards } from '../../services/geo/useGeo';
import type { WarrantyCase } from '../../services/wms/types';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { P09Dialog as Dialog } from './P09Presentation';
import {
  P09Frame,
  P09Action,
  P09Card,
  P09Section,
  P09Value,
  p09,
} from './P09Presentation';
import { P09_SYMPTOMS, p09Fold } from './p09Symptoms';
import { P09ScanEntry } from './P09ScanEntry';
import type { P09ProductPresentation } from './p09ProductRead';
import { Input } from '../../ui/Input';
import { Checkbox } from '../../ui/Checkbox';
import { P04Icon } from '../inbound/P04Icon';

import { Select } from '../../ui/Select';
import { Banner } from '../../ui/Banner';
import { Text } from '../../ui/Text';
import { sanitisePhone } from '../outbound/outboundDraft';
import { fetchDefects } from './WarrantyIntakeFlow';

import {
  lockedP09Service,
  type P09Service,
  type P09Resolved,
} from '../../services/wms/p09Warranty';
import { useP09Command } from './useP09Command';
import { P09Recovery, P09Error } from './P09Support';
import type { AppError } from '../../errors/AppError';

const DESCRIPTION_DEFECT_PREFIX = 'Bệnh/lỗi: ';

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
  scanAvailable?: boolean;
  onLookup?: (code: string) => void;
  /** Verified owner projection only. Not an assumed resolve-code response field. */
  resolvedPresentation?: P09ProductPresentation;
  loadResolvedPresentation?: (
    resolved: P09Resolved,
  ) => Promise<P09ProductPresentation>;
  onCreated?: (warrantyCase: WarrantyCase) => void;
  onOpenExisting?: (warrantyCase: WarrantyCase) => void;
  /** Điểm tiêm cho test, không gọi WMS. */
  loadDefects?: typeof fetchDefects;
  service?: P09Service;
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

export function composeP09Description(note: string, symptom: string): string {
  return [symptom ? `${DESCRIPTION_DEFECT_PREFIX}${symptom}` : '', note]
    .filter(Boolean)
    .join('\n');
}
function resolveDescription(result: P09Resolved): string {
  const reason = result.active_warranty_exists
    ? 'Sản phẩm đang có hồ sơ bảo hành hoạt động.'
    : result.eligible_for_warranty === true
    ? 'Đã xác định đúng serial sản phẩm.'
    : 'Chưa xác minh được điều kiện bảo hành của sản phẩm.';
  return [reason, result.serial_number].filter(Boolean).join(' · ');
}

function validateForm(input: {
  form: WarrantyForm;
  rawCode: string;
  tempOnly: boolean;
  resolved?: P09Resolved;
  provinceName?: string;
  wardName?: string;
}): FormErrors {
  const { form, rawCode, tempOnly, resolved, provinceName, wardName } = input;
  const errors: Record<string, string> = {};

  if (!tempOnly) {
    if (rawCode.trim() === '') {
      errors.code = 'Vui lòng nhập hoặc quét mã sản phẩm.';
    } else if (
      !(
        resolved?.eligible_for_warranty === true &&
        resolved.active_warranty_exists === false
      )
    ) {
      errors.code =
        'Vui lòng kiểm tra mã và bảo đảm sản phẩm đủ điều kiện bảo hành.';
    }
  }
  if (!form.customerName.trim() || form.customerName.length > 200) {
    errors.customerName = 'Tên khách hàng bắt buộc, tối đa 200 ký tự.';
  }
  if (!/^0\d{9}$/.test(form.customerPhone)) {
    errors.customerPhone = 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
  }
  const address = [form.street.trim(), wardName, provinceName]
    .filter(Boolean)
    .join(', ');
  if (address.length > 500) errors.street = 'Địa chỉ tối đa 500 ký tự.';
  if (form.description.trim() === '') {
    errors.description =
      'Vui lòng nhập mô tả yêu cầu hoặc chọn bệnh/lỗi gợi ý.';
  }
  if (form.description.length > 2000)
    errors.description = 'Mô tả yêu cầu tối đa 2000 ký tự, gồm lỗi đã chọn.';
  if (tempOnly && form.missingCodeReason.trim() === '') {
    errors.missingCodeReason = 'Vui lòng nhập lý do không có mã sản phẩm.';
  }
  if (tempOnly && form.manualProductDescription.trim() === '') {
    errors.manualProductDescription =
      'Vui lòng mô tả đầy đủ sản phẩm khi không có mã.';
  }
  return errors;
}

export function WarrantyIntakeScreen({
  initialCode,
  initialTempOnly,
  onBack,
  onLookup,
  scanAvailable = true,
  resolvedPresentation,
  loadResolvedPresentation,
  onCreated,
  onOpenExisting,
  loadDefects: _loadDefects = fetchDefects,
  service = lockedP09Service,
}: WarrantyIntakeScreenProps): React.ReactElement {
  const command = useP09Command(service);
  const mounted = useRef(true),
    resolveEpoch = useRef(0),
    initialChecked = useRef<string | undefined>(undefined);
  const [apiError, setApiError] = useState<AppError>();
  useEffect(() => {
    mounted.current = true;
    const epoch = resolveEpoch;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);

  const retained = useMemo(() => intakeDraft(service), [service]);
  const restoredCode = useRef(retained.tempOnly ? undefined : retained.rawCode);
  const autoCustomer = useRef(retained.autoCustomer);
  const [rawCode, setRawCode] = useState(initialCode || retained.rawCode || '');
  const [tempOnly, setTempOnly] = useState(
    initialCode ? false : initialTempOnly ?? retained.tempOnly ?? false,
  );
  const [resolved, setResolved] = useState<P09Resolved | undefined>();
  const [resolving, setResolving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const lastResolved = useRef<
    | {
        resolved: P09Resolved;
        rawCode: string;
        presentation?: P09ProductPresentation;
        existingCase?: WarrantyCase;
        context: string;
      }
    | undefined
  >(undefined);
  const [existingCase, setExistingCase] = useState<WarrantyCase>();
  const [productPresentation, setProductPresentation] =
    useState<P09ProductPresentation>();
  const [productReadError, setProductReadError] = useState<string>();
  const projection = productPresentation ?? resolvedPresentation;
  const matchedPresentation =
    !tempOnly &&
    resolved &&
    resolved.item_id === projection?.item_id &&
    resolved.serial_number === projection.serial_number
      ? projection
      : undefined;
  const selectedPresentation: P09ProductPresentation | undefined =
    resolved &&
    !tempOnly &&
    (loadResolvedPresentation || matchedPresentation || existingCase)
      ? matchedPresentation ?? {
          item_id: resolved.item_id,
          serial_number: resolved.serial_number ?? null,
          product_name: null,
        }
      : undefined;

  const [submitError, setSubmitError] = useState<string | undefined>();
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<WarrantyForm>(retained.form ?? initialForm);
  const showCustomerEntry =
    (tempOnly ||
      (!editingProduct &&
        !resolving &&
        resolved?.eligible_for_warranty === true &&
        !resolved.active_warranty_exists)) &&
    (!matchedPresentation?.customer_name ||
      !matchedPresentation.customer_phone ||
      form.customerName !== matchedPresentation.customer_name ||
      form.customerPhone !==
        sanitisePhone(matchedPresentation.customer_phone) ||
      !/^0\d{9}$/.test(form.customerPhone));
  const formRef = useRef(form);
  formRef.current = form;
  const [symptoms, setSymptoms] = useState<readonly string[]>(
      retained.symptoms ?? (retained.symptom ? [retained.symptom] : []),
    ),
    [other, setOther] = useState(retained.other ?? ''),
    [symptomPicker, setSymptomPicker] = useState(false),
    [symptomSearch, setSymptomSearch] = useState('');
  const [confirmIntake, setConfirmIntake] = useState(false);
  const [showIntakeExtras, setShowIntakeExtras] = useState(false);
  const [acknowledgedCreate, setAcknowledgedCreate] = useState<string>();
  const verifiedCreate =
    command.phase === 'succeeded' &&
    command.command?.operation === 'CREATE' &&
    command.receipt?.warranty_case_id === command.detail?.warranty_case_id &&
    command.receipt?.version === command.detail?.version &&
    command.receipt?.status === command.detail?.status;
  const showCreated =
    verifiedCreate && command.command?.requestId !== acknowledgedCreate;
  const selectedDefectIds = useMemo<readonly string[]>(() => [], []);
  const selectedSymptoms = P09_SYMPTOMS.filter(([key]) =>
    symptoms.includes(key),
  );
  const hasOther = symptoms.includes('other');
  const faultText = selectedSymptoms
    .map(([key, name]) => (key === 'other' ? other.trim() : name))
    .filter(Boolean)
    .join(', ');
  useEffect(() => {
    const name = matchedPresentation?.customer_name,
      phone = matchedPresentation?.customer_phone;
    if (name && phone)
      setForm(current => {
        const customerName = current.customerName || name,
          customerPhone = current.customerPhone || sanitisePhone(phone);
        return customerName === current.customerName &&
          customerPhone === current.customerPhone
          ? current
          : { ...current, customerName, customerPhone };
      });
    if (
      name &&
      phone &&
      matchedPresentation &&
      (!formRef.current.customerName || !formRef.current.customerPhone)
    ) {
      autoCustomer.current = {
        item_id: matchedPresentation.item_id,
        name: formRef.current.customerName ? '' : name,
        phone: formRef.current.customerPhone ? '' : sanitisePhone(phone),
      };
      retained.autoCustomer = autoCustomer.current;
    }
  }, [matchedPresentation, retained]);
  const provinceState = useProvinces();
  const [province, setProvince] = useState(retained.province ?? '');
  const [ward, setWard] = useState(retained.ward ?? '');
  const wardState = useWards(province);
  useEffect(() => {
    Object.assign(retained, {
      form,
      rawCode,
      tempOnly,
      province,
      ward,
      symptoms,
      other,
    });
  }, [retained, form, rawCode, tempOnly, province, ward, symptoms, other]);

  const provinceOptions = useMemo(
    () =>
      provinceState.items.map(item => ({ value: item.code, label: item.name })),
    [provinceState.items],
  );
  const wardOptions = useMemo(
    () => wardState.items.map(item => ({ value: item.code, label: item.name })),
    [wardState.items],
  );
  const provinceName = provinceOptions.find(
    item => item.value === province,
  )?.label;
  const wardName = wardOptions.find(item => item.value === ward)?.label;
  const updateField = useCallback(
    <Key extends keyof WarrantyForm>(key: Key, value: WarrantyForm[Key]) => {
      if (autoCustomer.current) {
        if (key === 'customerName') autoCustomer.current.name = '';
        if (key === 'customerPhone') autoCustomer.current.phone = '';
      }
      setForm(current => ({ ...current, [key]: value }));
      setErrors(current => ({ ...current, [key]: undefined }));
    },
    [],
  );

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
      setProductPresentation(undefined);
      setProductReadError(undefined);
      setExistingCase(undefined);
      setSubmitError(undefined);
      setErrors(current => ({ ...current, code: undefined }));
      const epoch = ++resolveEpoch.current;
      const context = service.contextKey();
      try {
        const result = await service.resolve({ raw_code: code });
        if (
          !mounted.current ||
          epoch !== resolveEpoch.current ||
          context !== service.contextKey()
        )
          return;
        setResolved(result);
        const oldCustomer = autoCustomer.current;
        if (oldCustomer) {
          setForm(current => ({
            ...current,
            customerName:
              current.customerName === oldCustomer.name
                ? ''
                : current.customerName,
            customerPhone:
              current.customerPhone === oldCustomer.phone
                ? ''
                : current.customerPhone,
          }));
          autoCustomer.current = undefined;
          retained.autoCustomer = undefined;
        }
        let presentation: P09ProductPresentation | undefined;
        if (loadResolvedPresentation) {
          try {
            presentation = await loadResolvedPresentation(result);
          } catch {
            if (
              mounted.current &&
              epoch === resolveEpoch.current &&
              context === service.contextKey()
            )
              setProductReadError(
                'Chưa đọc được tên sản phẩm. Bạn có thể thử tra cứu lại.',
              );
          }
          if (
            !mounted.current ||
            epoch !== resolveEpoch.current ||
            context !== service.contextKey()
          )
            return;
          if (
            presentation &&
            presentation.item_id === result.item_id &&
            presentation.serial_number === result.serial_number
          )
            setProductPresentation(presentation);
        }
        lastResolved.current = {
          resolved: result,
          rawCode: code,
          presentation,
          context,
        };
        setExistingCase(undefined);
        setEditingProduct(false);
        if (result.active_warranty_exists && result.serial_number) {
          const page = await service.list({
            search: result.serial_number,
            status: 'ALL',
            per_page: 100,
          });
          if (
            mounted.current &&
            epoch === resolveEpoch.current &&
            context === service.contextKey() &&
            !page.meta.hasMore
          ) {
            const matches = page.items.filter(
              row =>
                row.serial_number === result.serial_number &&
                !['RETURNED', 'CANCELLED'].includes(row.status),
            );
            if (matches.length === 1) {
              const detail = await service.detail(matches[0]!.warranty_case_id);
              if (
                !mounted.current ||
                epoch !== resolveEpoch.current ||
                context !== service.contextKey()
              )
                return;
              if (
                detail.item_id !== result.item_id ||
                detail.serial_number !== result.serial_number
              )
                return;
              setExistingCase(detail);
              const pii =
                service.scope().permissions.includes('warranty.pii.view') &&
                !detail.pii_masked;
              const casePresentation = {
                item_id: result.item_id,
                serial_number: result.serial_number ?? null,
                product_name:
                  detail.sku_name ?? presentation?.product_name ?? null,
                customer_name: pii ? detail.customer_name : null,
                customer_phone: pii ? detail.customer_phone : null,
              };
              setProductPresentation(casePresentation);
              if (casePresentation.product_name) setProductReadError(undefined);
              lastResolved.current = {
                resolved: result,
                rawCode: code,
                presentation: casePresentation,
                existingCase: detail,
                context,
              };
            }
          }
        }
      } catch (cause) {
        if (
          !mounted.current ||
          epoch !== resolveEpoch.current ||
          context !== service.contextKey()
        )
          return;
        setApiError(toAppError(cause));
        setResolved(undefined);
        setSubmitError(messageForUser(toAppError(cause)));
      } finally {
        if (
          mounted.current &&
          epoch === resolveEpoch.current &&
          context === service.contextKey()
        )
          setResolving(false);
      }
    },
    [rawCode, service, loadResolvedPresentation, retained],
  );

  // A retained form must re-resolve the original identity before permitting a write.
  useEffect(() => {
    const candidate = initialCode || restoredCode.current;
    if (
      (candidate ?? '').trim() !== '' &&
      !['sending', 'unknown', 'saved-unloaded'].includes(command.phase) &&
      initialChecked.current !== candidate
    ) {
      initialChecked.current = candidate;
      runResolve(candidate).catch(() => undefined);
    }
  }, [initialCode, runResolve, command.phase]);

  const submit = useCallback(async () => {
    if (submitting) return;
    const nextErrors = validateForm({
      form: {
        ...form,
        description: composeP09Description(form.description, faultText),
      },
      rawCode,
      tempOnly,
      resolved,
      provinceName,
      wardName,
    });
    if (symptoms.length === 0)
      (nextErrors as Record<string, string>).symptom =
        'Vui lòng chọn ít nhất một lỗi tiếp nhận.';
    if (hasOther && !other.trim())
      (nextErrors as Record<string, string>).other =
        'Vui lòng mô tả tình trạng khác.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setSubmitError(
        'Vui lòng kiểm tra lại các trường bắt buộc trước khi tạo hồ sơ.',
      );
      return;
    }

    const customerAddress = [form.street.trim(), wardName, provinceName]
      .filter(Boolean)
      .join(', ');
    setSubmitting(true);
    setSubmitError(undefined);
    const context = service.contextKey();
    try {
      await command.owner.confirm(() =>
        service.prepareCreate(
          tempOnly
            ? {
                mode: 'TEMP_ONLY',
                missing_code_reason: form.missingCodeReason,
                manual_product_description: form.manualProductDescription,
              }
            : { mode: 'IDENTIFIED', resolved: resolved! },
          {
            customer_name: form.customerName,
            customer_phone: form.customerPhone,
            description: composeP09Description(form.description, faultText),
            ...(customerAddress ? { customer_address: customerAddress } : {}),
            accessories_received: form.accessoriesReceived,
            received_condition: form.receivedCondition,
            defect_ids: selectedDefectIds,
          },
        ),
      );
    } catch (cause) {
      if (mounted.current && context === service.contextKey()) {
        setApiError(toAppError(cause));
        setSubmitError(messageForUser(toAppError(cause)));
      }
    } finally {
      if (mounted.current && context === service.contextKey())
        setSubmitting(false);
    }
  }, [
    form,
    provinceName,
    rawCode,
    resolved,
    selectedDefectIds,
    faultText,
    symptoms,
    hasOther,
    other,
    submitting,
    tempOnly,
    wardName,
    command.owner,
    service,
  ]);

  const canManage = service.scope().permissions.includes('warranty.manage');
  const intakeLocked =
    command.busy ||
    submitting ||
    ['unknown', 'saved-unloaded'].includes(command.phase);
  const validIntake =
    !Object.keys(
      validateForm({
        form: {
          ...form,
          description: composeP09Description(form.description, faultText),
        },
        rawCode,
        tempOnly,
        resolved,
        provinceName,
        wardName,
      }),
    ).length &&
    symptoms.length > 0 &&
    (!hasOther || !!other.trim());
  const intakeDisabled =
    !validIntake ||
    !service.canWrite() ||
    !canManage ||
    submitting ||
    resolving ||
    command.busy ||
    !(
      ['idle'].includes(command.phase) ||
      (command.phase === 'failed' &&
        command.receipt?.may_create_new_request === true)
    );
  return (
    <P09Frame
      panel={2}
      onBack={onBack}
      footer={
        <View>
          {!tempOnly && !selectedPresentation && (
            <NativeText style={[p09.small, { textAlign: 'center', marginBottom: 6 }]}>
              Cần xác định đúng serial sản phẩm.
            </NativeText>
          )}
          <P09Action
            label={submitting ? 'Đang tiếp nhận…' : 'Tiếp nhận bảo hành'}
            trailing={
              <NativeText style={{ color: HN_UI.onBrand, fontSize: 18 }}>→</NativeText>
            }
            disabled={intakeDisabled}
            style={
              intakeDisabled
                ? { opacity: 1, backgroundColor: HN_UI.surfaceSunken }
                : undefined
            }
            onPress={() => setConfirmIntake(true)}
          />
        </View>
      }
    >
      {!verifiedCreate && (
        <P09Recovery service={service} onOpen={onCreated} onBack={onBack} />
      )}
      {command.phase === 'succeeded' ? (
        <Button
          label="Tiếp nhận hồ sơ khác"
          onPress={() => {
            command.owner.newOperation();
            setForm(initialForm);
            setRawCode('');
            setResolved(undefined);
            setProductPresentation(undefined);
            setProductReadError(undefined);
            setSymptoms([]);
            setOther('');
            setProvince('');
            setWard('');
            setApiError(undefined);
          }}
        />
      ) : null}
      {apiError ? <P09Error error={apiError} onBack={onBack} /> : null}
      {!tempOnly && (
        <P09ScanEntry
          value={rawCode}
          identified={!!selectedPresentation && !editingProduct}
          locked={
            intakeLocked ||
            symptomPicker ||
            confirmIntake ||
            showCreated ||
            (!!selectedPresentation && !editingProduct)
          }
          resolving={resolving}
          error={errors.code}
          cameraAvailable={scanAvailable}
          onChange={value => {
            resolveEpoch.current++;
            setResolving(false);
            setRawCode(value);
            setResolved(undefined);
            setProductPresentation(undefined);
            setProductReadError(undefined);
            setApiError(undefined);
            setErrors(current => ({ ...current, code: undefined }));
          }}
          onCheck={() => {
            if (!resolving && !intakeLocked)
              runResolve().catch(() => undefined);
          }}
          onRead={value => {
            setRawCode(value);
            setResolved(undefined);
            setApiError(undefined);
            runResolve(value).catch(() => undefined);
          }}
          onLookup={onLookup ? () => onLookup(rawCode.trim()) : undefined}
        />
      )}
      {selectedPresentation && !editingProduct ? (
        <P09Section title="Thông tin sản phẩm">
          <View style={p09.card}>
            <P09Value
              table
              inline
              compact
              long
              icon="box"
              label="Sản phẩm"
              value={selectedPresentation.product_name}
            />
            <P09Value
              table
              inline
              compact
              icon="scan"
              label="Serial"
              value={selectedPresentation.serial_number}
            />
            <P09Value
              table
              inline
              compact
              long
              icon="user"
              label="Khách hàng"
              value={selectedPresentation.customer_name}
            />
            <P09Value
              table
              inline
              compact
              icon="phone"
              label="Liên hệ"
              value={selectedPresentation.customer_phone}
            />
            {productReadError && (
              <NativeText style={p09.small}>{productReadError}</NativeText>
            )}
            <P09Action
              label="Đổi sản phẩm"
              variant="secondary"
              disabled={intakeLocked}
              onPress={() => {
                resolveEpoch.current++;
                setResolving(false);
                setEditingProduct(true);
              }}
            />
          </View>
        </P09Section>
      ) : (
        <>
          {tempOnly ? (
            <P09Card
              title="Thông tin sản phẩm"
              icon="box"
              subtitle="Không có mã / mất tem"
            >
              <P09Action
                label="Nhập/quét mã"
                variant="secondary"
                disabled={intakeLocked}
                onPress={() => {
                  resolveEpoch.current++;
                  setResolved(undefined);
                  setResolving(false);
                  setTempOnly(false);
                  setSubmitError(undefined);
                  setErrors(current => ({ ...current, code: undefined }));
                }}
              />
            </P09Card>
          ) : null}
        </>
      )}
      {resolved && (
        <Banner
          tone={
            resolved.eligible_for_warranty === true &&
            !resolved.active_warranty_exists
              ? 'success'
              : 'warning'
          }
          title={
            resolved.eligible_for_warranty === true &&
            !resolved.active_warranty_exists
              ? 'Mã đủ điều kiện bảo hành'
              : 'Mã chưa đủ điều kiện'
          }
          message={resolveDescription(resolved)}
        />
      )}
      {showCustomerEntry && (
        <Box card padding="lg" gap="md">
          <Text variant="cardTitle" tone="strong">
            Thông tin khách hàng
          </Text>
          <Input
            editable={!intakeLocked}
            label="Tên khách hàng*"
            placeholder="Nhập tên khách hàng"
            value={form.customerName}
            maxLength={200}
            errorText={errors.customerName}
            onChangeText={value => updateField('customerName', value)}
          />
          <Input
            editable={!intakeLocked}
            label="Số điện thoại*"
            placeholder="Nhập số điện thoại"
            keyboardType="phone-pad"
            maxLength={10}
            value={form.customerPhone}
            errorText={errors.customerPhone}
            onChangeText={value =>
              updateField('customerPhone', sanitisePhone(value))
            }
          />
          <Select
            label="Tỉnh/Thành phố (tùy chọn)"
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
              setErrors(current => ({
                ...current,
                province: undefined,
                ward: undefined,
              }));
            }}
            sheetTitle="Chọn tỉnh/thành phố"
          />
          <Select
            label="Phường/Xã (tùy chọn)"
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
            editable={!intakeLocked}
            label="Số nhà, tên đường (tùy chọn)"
            placeholder="Số nhà, tên đường, thôn/xóm…"
            value={form.street}
            maxLength={350}
            errorText={errors.street}
            onChangeText={value => updateField('street', value)}
          />
        </Box>
      )}
      {editingProduct && lastResolved.current && (
        <P09Action
          label="Giữ sản phẩm hiện tại"
          variant="secondary"
          disabled={intakeLocked}
          onPress={() => {
            if (lastResolved.current!.context !== service.contextKey()) return;
            resolveEpoch.current++;
            setResolving(false);
            setResolved(lastResolved.current!.resolved);
            setRawCode(lastResolved.current!.rawCode);
            setProductPresentation(lastResolved.current!.presentation);
            setExistingCase(lastResolved.current!.existingCase);
            setEditingProduct(false);
            setApiError(undefined);
            setSubmitError(undefined);
            setErrors(current => ({ ...current, code: undefined }));
          }}
        />
      )}
      {existingCase && (
        <P09Action
          label={`Mở hồ sơ ${
            existingCase.warranty_case_code ?? existingCase.warranty_case_id
          }`}
          variant="secondary"
          disabled={!onOpenExisting || intakeLocked}
          onPress={() => onOpenExisting?.(existingCase)}
        />
      )}
      <P09Card title="2. Chọn lỗi tiếp nhận" icon="tool" subtitle="Chọn lỗi chính để chuyển thông tin kiểm tra">
        <View style={{ gap: 8 }}>
          <NativeText style={[p09.small, { fontSize: 13, lineHeight: 20 }]}>
            Lỗi tiếp nhận *
          </NativeText>
          <P09Action
            label={
              symptoms.length > 1
                ? `Đã chọn ${symptoms.length} lỗi`
                : selectedSymptoms[0]?.[1] ?? 'Chọn tình trạng của thiết bị'
            }
            variant="secondary"
            accessibilityLabel="Lỗi tiếp nhận"
            disabled={intakeLocked}
            style={{
              minHeight: 52,
              justifyContent: 'space-between',
              backgroundColor: HN_UI.surface,
              borderColor: HN_UI.border,
              paddingHorizontal: 12,
            }}
            labelStyle={{
              fontSize: 16,
              lineHeight: 22,
              fontWeight: '600',
              color: symptoms.length ? HN_UI.textSecondary : HN_UI.textMuted,
              textAlign: 'center',
              flex: 1,
            }}
            trailing={<P04Icon name="chevron-down" size={18} color={HN_UI.textSecondary} />}
            onPress={() => {
              setSymptomSearch('');
              setSymptomPicker(true);
            }}
          />
          {errors.symptom && (
            <NativeText accessibilityRole="alert" style={{ color: HN_UI.danger }}>
              {errors.symptom}
            </NativeText>
          )}
          {symptoms.length > 1 && (
            <P09Value
              table
              label="Các lỗi đã chọn"
              value={selectedSymptoms.map(([, name]) => name).join('\n')}
              long
            />
          )}
          {hasOther && (
            <Input
              editable={!intakeLocked}
              label="Mô tả tình trạng khác*"
              fieldHeight={88}
              helperText={`${other.length}/200`}
              placeholder="Nhập biểu hiện lỗi hoặc tình trạng thiết bị"
              value={other}
              maxLength={200}
              multiline
              errorText={errors.other}
              onChangeText={value => {
                setOther(value);
                setErrors(e => ({ ...e, other: undefined }));
              }}
            />
          )}
        </View>

      </P09Card>
      <P09Card title="3. Thông tin bổ sung" icon="document" subtitle="Không bắt buộc · Ghi nhận đủ thông tin">
        <View style={{ gap: 14 }}>
          <Input
            editable={!intakeLocked}
            label="Ghi chú"
            accessibilityLabel="Ghi chú"
            inputStyle={{
              textAlignVertical: 'top',
              paddingVertical: 12,
              fontSize: 14,
            }}
            fieldHeight={88}
            placeholder="Nhập ghi chú (nếu có)…"
            value={form.description}
            helperText={`${form.description.length}/2000`}
            maxLength={2000}
            multiline
            errorText={errors.description}
            onChangeText={value => updateField('description', value)}
          />
          {tempOnly ? (
            <>
              <Input
                editable={!intakeLocked}
                label="Lý do thiếu mã*"
                placeholder="Mất tem/mã"
                value={form.missingCodeReason}
                maxLength={500}
                errorText={errors.missingCodeReason}
                onChangeText={value => updateField('missingCodeReason', value)}
              />
              <Input
                editable={!intakeLocked}
                label="Mô tả sản phẩm thủ công*"
                placeholder="Tên/loại máy, nhãn hiệu, màu sắc, đặc điểm nhận dạng…"
                value={form.manualProductDescription}
                maxLength={2000}
                multiline
                errorText={errors.manualProductDescription}
                onChangeText={value =>
                  updateField('manualProductDescription', value)
                }
              />
            </>
          ) : null}
          <Input
            editable={!intakeLocked}
            label="Phụ kiện kèm theo"
            helperText={`${form.accessoriesReceived.length}/1000`}
            multiline
            fieldHeight={56}
            placeholder="Nhập phụ kiện kèm theo (nếu có)…"
            value={form.accessoriesReceived}
            maxLength={1000}
            onChangeText={value => updateField('accessoriesReceived', value)}
          />
          <P09Action
            label={
              showIntakeExtras
                ? 'Thu gọn thông tin tiếp nhận'
                : 'Thông tin tiếp nhận khác'
            }
            variant="secondary"
            onPress={() => setShowIntakeExtras(current => !current)}
          />
          {showIntakeExtras && (
            <Input
              editable={!intakeLocked}
              label="Tình trạng khi nhận"
              placeholder="Trầy xước nhẹ, còn nguyên tem…"
              value={form.receivedCondition}
              maxLength={500}
              onChangeText={value => updateField('receivedCondition', value)}
            />
          )}
          {submitError === undefined ? null : (
            <Banner
              tone="danger"
              title="Không thể tạo hồ sơ bảo hành"
              message={submitError}
            />
          )}
        </View>
      </P09Card>
      {symptomPicker && (
        <Dialog
          visible
          title="Chọn lỗi tiếp nhận"
          dismissOnBackdrop={false}
          onDismiss={() => setSymptomPicker(false)}
          footer={
            <P09Action
              label="Đóng"
              variant="secondary"
              onPress={() => setSymptomPicker(false)}
            />
          }
        >
          <Input
            editable={!intakeLocked}
            label="Tìm lỗi tiếp nhận"
            value={symptomSearch}
            onChangeText={setSymptomSearch}
          />
          <NativeText style={p09.small}>
            Đã chọn {symptoms.length} lỗi
          </NativeText>
          <View style={{ gap: 8 }}>
            {P09_SYMPTOMS.filter(([, name]) =>
              p09Fold(name).includes(p09Fold(symptomSearch)),
            ).map(([key, name]) => (
              <Checkbox
                key={key}
                label={name}
                checked={symptoms.includes(key)}
                disabled={intakeLocked}
                onToggle={() => {
                  if (intakeLocked) return;
                  setSymptoms(current =>
                    current.includes(key)
                      ? current.filter(value => value !== key)
                      : [...current, key],
                  );
                  setErrors(e => ({
                    ...e,
                    symptom: undefined,
                    other: undefined,
                  }));
                }}
                style={[
                  p09.card,
                  { padding: 12 },
                  symptoms.includes(key) && { backgroundColor: HN_UI.canvas },
                ]}
              />
            ))}
          </View>
        </Dialog>
      )}
      {showCreated && (
        <Dialog
          visible
          title="Đã tiếp nhận bảo hành"
          message={
            command.detail?.warranty_case_code ??
            command.detail?.warranty_case_id
          }
          onDismiss={() => setAcknowledgedCreate(command.command?.requestId)}
          footer={
            <P09Action
              label="Mở hồ sơ đã lưu"
              disabled={!onCreated}
              onPress={() => {
                setAcknowledgedCreate(command.command?.requestId);
                if (command.detail) onCreated?.(command.detail);
              }}
            />
          }
        >
          <NativeText style={p09.text}>
            Hồ sơ đã được xác nhận. Tồn kho chưa thay đổi.
          </NativeText>
        </Dialog>
      )}
      {verifiedCreate && !showCreated && command.detail && (
        <P09Action
          label="Mở hồ sơ đã lưu"
          variant="secondary"
          disabled={!onCreated}
          onPress={() => onCreated?.(command.detail!)}
        />
      )}
      {confirmIntake && (
        <Dialog
          visible
          title="Xác nhận tiếp nhận · Bước 2/2"
          message={
            tempOnly
              ? 'Tạo hồ sơ tạm cho sản phẩm chưa có mã.'
              : `Tiếp nhận sản phẩm ${rawCode}.`
          }
          dismissOnBackdrop={false}
          onDismiss={() => setConfirmIntake(false)}
          footer={
            <View style={p09.row}>
              <P09Action
                label="Hủy"
                variant="secondary"
                onPress={() => setConfirmIntake(false)}
                style={p09.fill}
              />
              <P09Action
                label="Tạo hồ sơ bảo hành"
                disabled={!service.canWrite() || !canManage || command.busy}
                onPress={() => {
                  setConfirmIntake(false);
                  submit().catch(() => undefined);
                }}
                style={p09.fill}
              />
            </View>
          }
        >
          <NativeText style={p09.text}>
            {form.customerName} · {form.customerPhone}
          </NativeText>
          <NativeText style={p09.text}>
            {faultText || form.description}
          </NativeText>
        </Dialog>
      )}
    </P09Frame>
  );
}

interface IntakeDraft {
  autoCustomer?: { item_id: string; name: string; phone: string };
  symptom?: string;
  symptoms?: readonly string[];
  other?: string;
  scope: string;
  form?: WarrantyForm;
  rawCode?: string;
  tempOnly?: boolean;
  province?: string;
  ward?: string;
}
const drafts = new WeakMap<P09Service, IntakeDraft>();
function intakeDraft(service: P09Service) {
  let draft = drafts.get(service);
  if (!draft || draft.scope !== service.contextKey()) {
    draft = { scope: service.contextKey() };
    drafts.set(service, draft);
  }
  return draft;
}
