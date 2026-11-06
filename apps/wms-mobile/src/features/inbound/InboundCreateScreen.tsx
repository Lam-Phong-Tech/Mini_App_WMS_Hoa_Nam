import {HN_UI} from '../../theme/uiKitV3';
import { P04Text as Text } from './P04Text';
import React, { useContext, useRef, useEffect, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Pressable,ScrollView,View} from 'react-native';
import { getActiveSession } from '../../auth/session';
import { P04Icon as AppIcon } from './P04Icon';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Sheet } from '../../ui/Sheet';
import {
  canContinueToScan,
  setDraftName,
  setDraftWarehouse,
  type InboundDraft,
} from './inboundDraft';
import { useWarehouses, warehouseLabel } from './useWarehouses';
import { P04Frame, P04Action, P04Heading, P04Info, p04 } from './P04Frame';
import {
  fetchP04Suppliers,
  supplierErrorMessage,
  type P04Supplier,
} from './p04Directory';
import { P04TypeSelect } from './P04TypeSelect';
import type { P04ViewState } from './p04View';
import { KeyboardViewportContext } from '../../ui/Page';
function P04NoteInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null),
    reveal = useContext(KeyboardViewportContext);
  return (
    <TextInput
      ref={input}
      accessibilityLabel="Ghi chú"
      multiline
      scrollEnabled
      maxLength={1000}
      editable={!disabled}
      value={value}
      placeholder="Nhập ghi chú (nếu có)"
      onChangeText={onChange}
      onFocus={() => reveal?.(input.current)}
      style={[
        p04.control,
        {
          height: 83,
          maxHeight: 83,
          textAlignVertical: 'top',
          paddingVertical: 10,
          fontSize: 16,
          lineHeight: 24,
          color: HN_UI.textPrimary,
          outlineWidth: 0,
        },
      ]}
    />
  );
}

export interface InboundCreateScreenProps {
  draft: InboundDraft;
  onChange: (draft: InboundDraft) => void;
  onContinue: () => void;
  onBack?: () => void;
  warehouses?: ReturnType<typeof useWarehouses>;
  busy?: boolean;
  locked?: boolean;
  typeLabel?: string;
  documentRef?: string;
  /** TC06: only a newly stamped owner run may use the verified BE code as its name. */
  hideNameField?: boolean;
  viewState?: P04ViewState;
  onViewChange?: (patch: P04ViewState) => void;
  supplierLoader?: typeof fetchP04Suppliers;
  /** Explicit recovery of a retained, unnumbered draft; never a local number. */
  onRequestDocumentNumber?: () => void;
}
export function InboundCreateScreen({
  draft,
  onChange,
  onContinue,
  onBack,
  warehouses,
  busy = false,
  locked = false,
  typeLabel,
  documentRef,
  hideNameField = false,
  viewState,
  onViewChange,
  supplierLoader = fetchP04Suppliers,
  onRequestDocumentNumber,
}: InboundCreateScreenProps): React.ReactElement {
  const requestNumber = hideNameField && !documentRef && !!onRequestDocumentNumber;
  const loaded = useWarehouses({ enabled: !draft.warehouseId && !warehouses }),
    source = warehouses ?? loaded;
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [items, setItems] = useState<P04Supplier[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  useEffect(() => {
    const active = getActiveSession()?.activeWarehouseId;
    const warehouse = warehouses
      ? source.warehouses[0]
      : source.warehouses.find(w => w.id === active);
    if (draft.warehouseId === undefined && warehouse)
      onChange(
        setDraftWarehouse(draft, warehouse.id, warehouseLabel(warehouse)),
      );
  }, [draft, onChange, source.warehouses, warehouses]);
  useEffect(() => {
    if (!open || !draft.warehouseId) return;
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError(undefined);
    const timer = setTimeout(() => {
      supplierLoader(draft.warehouseId!, query, page, controller.signal)
        .then(r => {
          if (current) {
            setItems(prev =>
              page === 1
                ? r.items
                : [
                    ...prev,
                    ...r.items.filter(s => !prev.some(p => p.id === s.id)),
                  ],
            );
            setTotal(r.total);
          }
        })
        .catch(e => {
          if (current) setError(supplierErrorMessage(e));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, draft.warehouseId, query, page, retry, supplierLoader]);
  function field(
    label: string,
    value: string,
    icon: 'home' | 'document' | 'box',
  ) {
    return (
      <View
        testID={label === 'Mã phiếu nhập' ? 'P04.document.number' : undefined}
        style={[p04.field, { gap: 0, marginHorizontal: 3 }]}
      >
        <Text style={p04.label}>
          {label} <Text style={p04.required}>*</Text>
        </Text>
        <View style={[p04.control, p04.locked]}>
          <AppIcon name={icon} color={HN_UI.textLink} size={23} />
          <Text selectable style={p04.value}>
            {value}
          </Text>
          <AppIcon
            name={hideNameField && label === 'Mã phiếu nhập' ? 'x' : 'lock'}
            color={HN_UI.textSecondary}
            size={17}
          />
        </View>
      </View>
    );
  }
  return (
    <P04Frame
      step={1}
      initialScrollY={viewState?.scroll?.[1]}
      onScrollPositionChange={y => onViewChange?.({ scroll: { 1: y } })}
      onBack={onBack}
      footer={
        <P04Action
          label={requestNumber ? 'Lấy mã phiếu nhập' : 'Tiếp tục quét mã'}
          trailing={<AppIcon name="arrow" color={HN_UI.onBrand} size={24} />}
          onPress={requestNumber ? onRequestDocumentNumber! : onContinue}
          loading={busy}
          disabled={
            busy ||
            locked ||
            (requestNumber ? !draft.warehouseId : (
              !draft.inboundCategory ||
              !draft.supplierId ||
              !canContinueToScan(draft)
            ))
          }
        />
      }
    >
      <P04Heading
        title="Thông tin phiếu nhập"
        subtitle="Vui lòng nhập đầy đủ thông tin trước khi quét mã"
      />
      {field(
        'Kho nhập',
        draft.warehouseName ??
          (source.phase === 'loading'
            ? 'Đang xác minh kho…'
            : 'Chưa xác nhận kho'),
        'home',
      )}
      {source.phase === 'error' && (
        <P04Info title="Chưa xác minh được kho">
          {source.error?.message ?? 'Không thể tải kho nhận.'}
        </P04Info>
      )}
      <View style={[p04.field, { gap: 0, marginHorizontal: 3 }]}>
        <Text style={p04.label}>
          Loại nhập <Text style={p04.required}>*</Text>
        </Text>
        <P04TypeSelect
          value={draft.inboundCategory}
          operationLabel={typeLabel ? 'Nhập hàng' : undefined}
          disabled={
            busy ||
            locked ||
            !!draft.codes.length ||
            !!draft.scanAttempts?.length
          }
          onChange={inboundCategory => onChange({ ...draft, inboundCategory })}
        />
      </View>
      {field(
        'Mã phiếu nhập',
        documentRef ?? 'Đang xác nhận số phiếu…',
        'document',
      )}
      {!hideNameField ? (
      <View style={[p04.field, { gap: 0, marginHorizontal: 3 }]}>
        <Text style={p04.label}>
          Tên phiếu <Text style={p04.required}>*</Text>
        </Text>
        <Input
          accessibilityLabel="Tên phiếu"
          fieldHeight={48}
          quietFocus
          inputStyle={{ fontSize: 14, fontWeight: '600', color: HN_UI.textPrimary, outlineWidth: 0 }}
          editable={!busy && !locked}
          maxLength={200}
          value={draft.name}
          placeholder="Nhập tên phiếu"
          onChangeText={v => onChange(setDraftName(draft, v))}
          errorText={draft.nameError}
          returnKeyType="next"
          leftAdornment={<AppIcon name="document" color={HN_UI.textLink} size={23} />}
        />
      </View>
      ) : null}
      <View style={[p04.field, { gap: 0, marginHorizontal: 3 }]}>
        <Text testID="p04-supplier-label" style={p04.label}>Nhà cung cấp <Text style={p04.required}>*</Text></Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Nhà cung cấp: ${
            draft.supplierName ?? 'Chưa chọn'
          }`}
          disabled={busy || locked || !draft.warehouseId}
          style={p04.control}
          onPress={() => {
            setQuery('');
            setPage(1);
            setItems([]);
            setOpen(true);
          }}
        >
          <AppIcon name="warehouse" color={HN_UI.textLink} size={23} />
          <Text style={p04.value} numberOfLines={2}>
            {draft.supplierName ?? 'Chọn nhà cung cấp'}
          </Text>
          <AppIcon name="chevron-right" color={HN_UI.textSecondary} size={18} />
        </Pressable>
      </View>
      <View style={[p04.field, { gap: 0, marginHorizontal: 3 }]}>
        <Text style={p04.label}>Ghi chú</Text>
        <P04NoteInput
          disabled={busy || locked}
          value={draft.note ?? ''}
          onChange={note => onChange({ ...draft, note })}
        />
        <Text style={[p04.small, { textAlign: 'right', fontSize: 12 }]}>{Array.from(draft.note ?? '').length}/1000</Text>
      </View>
      <P04Info title="Lưu ý">
        {
          '• Kiểm tra thông tin trước khi quét mã\n• Scan không làm thay đổi tồn kho\n• Phiếu sẽ được gửi lên Web sau khi kiểm tra'
        }
      </P04Info>
      <Sheet
        visible={open}
        keyboardLayout="viewport"
        onDismiss={() => setOpen(false)}
        title="Chọn nhà cung cấp"
        message="Tìm theo tên trong danh mục nhà cung cấp của hệ thống"
      >
        <Input
          accessibilityLabel="Tìm nhà cung cấp"
          placeholder="Tìm nhà cung cấp"
          maxLength={200}
          value={query}
          onChangeText={q => {
            setQuery(q);
            setPage(1);
            setItems([]);
            setError(undefined);
            setLoading(true);
          }}
        />
        {draft.supplierId ? <Button
          label="Xóa nhà cung cấp đã chọn"
          variant="secondary"
          onPress={() => {
            onChange({
              ...draft,
              supplierId: undefined,
              supplierName: undefined,
            });
            setOpen(false);
          }}
        /> : null}
        {loading && (
          <Text accessibilityLiveRegion="polite" style={p04.text}>
            Đang tải nhà cung cấp…
          </Text>
        )}
        {error && (
          <>
            <Text accessibilityLiveRegion="polite" style={{ color: HN_UI.danger }}>{error}</Text>
            <Button label="Tải lại nhà cung cấp" variant="secondary" onPress={() => setRetry(current => current + 1)} />
          </>
        )}
        {!loading && !error && items.length === 0 && (
          <Text style={p04.text}>Không có nhà cung cấp phù hợp.</Text>
        )}
        {!loading && !error && (
          <Text style={p04.small}>
            Đã tải {items.length}/{total} nhà cung cấp
          </Text>
        )}
        <ScrollView
          style={{ maxHeight: 280 }}
          keyboardShouldPersistTaps="handled"
        >
          {items.map(s => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Chọn ${s.name}`}
              disabled={loading || !!error || busy || locked}
              onPress={() => {
                onChange({ ...draft, supplierId: s.id, supplierName: s.name });
                setOpen(false);
              }}
              style={[p04.row, { marginBottom: 6 }]}
            >
              <Text style={p04.value}>{s.name}</Text>
              {s.id === draft.supplierId && <Text>✓</Text>}
            </Pressable>
          ))}
        </ScrollView>
        {!loading && !error && items.length < total && (
          <Button
            label="Xem thêm nhà cung cấp"
            variant="secondary"
            onPress={() => setPage(p => p + 1)}
          />
        )}
        <Button
          label="Đóng"
          variant="secondary"
          onPress={() => setOpen(false)}
        />
      </Sheet>
    </P04Frame>
  );
}


