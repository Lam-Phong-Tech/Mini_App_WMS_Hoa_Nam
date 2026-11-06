import { HN_UI } from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import React, { useEffect, useRef, useState } from 'react';
import { ScannerTextInput as TextInput } from '../../ui/ScannerTextInput';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { KeyboardViewportContext } from '../../ui/Page';
import { geoUnitMatches } from '../../services/geo/search';
import { p05CanNumber } from '../../services/wms/p05Numbering';
import { useHardwareBack } from '../../app/useHardwareBack';
import {
  P04Action,
  P04Frame,
  P04Heading,
  P04Info,
  p04,
} from '../inbound/P04Frame';
import { P04Icon } from '../inbound/P04Icon';
import {
  BusinessScanScreen,
  type ScanFeedback,
} from '../scan/BusinessScanScreen';
import { Dialog } from '../../ui/Dialog';
import { P03Dialog } from '../scan/P03Dialog';
import { BottomNav } from '../../ui/BottomNav';
import {
  createP05CreateOwner,
  type P05CreateOwner,
  type P05CreateState,
} from './p05CreateOwner';
import { P05FormChoice } from './P05FormChoice';
import { P05ResultContent, useP05ResultActions } from './P05ResultContent';
import { P05ReviewContent } from './P05ReviewContent';
import { P05SourceField } from './P05Information';
import {
  p05DeliveryAddress,
  p05SelectedGroups,
  sanitiseP05Phone,
  type P05CreateForm,
  type P05CreateTextField,
} from './p05CreateForm';
import { p05ChecksPending } from './linked/p05-owner-checks';
import { P05Exceptions, p05ExceptionView } from './P05Exceptions';
const styles = StyleSheet.create({
  content: { gap: 0 },
  field: { marginBottom: 14, marginHorizontal: 3 },
  input: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 6,
  },
  multiline: { minHeight: 60, maxHeight: 84, textAlignVertical: 'top' },
  noteControl: { alignItems: 'flex-start', minHeight: 78, paddingTop: 8 },
  noteCounter: { textAlign: 'left' },
  unit: {
    borderRadius: 8,
    backgroundColor: HN_UI.canvas,
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
  unitText: { color: HN_UI.textSecondary, fontSize: 13, lineHeight: 20 },
  error: { color: HN_UI.danger, fontSize: 12, lineHeight: 18, marginTop: 4 },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: HN_UI.textMuted,
    marginBottom: 12,
  },
  status: { textAlign: 'center', fontSize: 12, color: HN_UI.textMuted },
  row: { flexDirection: 'row', gap: 8 },
  dialogActions: { gap: 8 },
  half: { flex: 1, minWidth: 0 },
  clearPhone: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressOption: { marginBottom: 8 },
});
function P05KeyboardInput({
  inputRef,
  ...props
}: TextInputProps & {
  invalid?: boolean;
  inputRef: (v: React.ComponentRef<typeof TextInput> | null) => void;
}) {
  const ref = useRef<React.ComponentRef<typeof TextInput> | null>(null),
    reveal = React.useContext(KeyboardViewportContext);
  return (
    <TextInput
      {...props}
      ref={v => {
        ref.current = v;
        inputRef(v);
      }}
      onFocus={e => {
        reveal?.(ref.current);
        props.onFocus?.(e);
      }}
    />
  );
}
export interface P05CreateNativeProps {
  onExit: () => void;
  onViewDocument?: (id: string) => void;
  onHistory?: (id: string) => void;
  returnDocumentId?: string;
  resumeDraftId?: string;
  owner?: P05CreateOwner;
  onSelectTab?: (key: string) => void;
  footerActiveKey?: string;
  onAssignNfc?: (rawCode: string, productLabel: string) => void;
}
export function P05CreateNativeFlow({
  onExit,
  onViewDocument,
  onHistory,
  returnDocumentId,
  resumeDraftId,
  owner: provided,
  onSelectTab,
  footerActiveKey,
}: P05CreateNativeProps) {
  const [s, setState] = useState<P05CreateState>(),
    ref = useRef<P05CreateOwner | null>(null);
  if (!ref.current)
    ref.current = provided ?? createP05CreateOwner({ onChange: setState });
  const flow = ref.current,
    state = s ?? flow.snapshot(),
    f = state.form,
    locked = state.busy || state.scanBusy || state.unknown || !!state.pending,
    warehouseStopped = state.errorCode === 'WAREHOUSE_INACTIVE';
  const resultActionsReady = useP05ResultActions(state.step, state.documentId);
  const exceptionActive = !!p05ExceptionView(state);
  const [touched, setTouched] = useState(false),
    [info, setInfo] = useState(''),
    [exit, setExit] = useState(false),
    [discard, setDiscard] = useState(false),
    [replace, setReplace] = useState<string>(),
    [addressOpen, setAddressOpen] = useState(false),
    [addressPanel, setAddressPanel] = useState<'province' | 'ward'>('province'),
    [addressQuery, setAddressQuery] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(true);
  const numberRequested = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      state.context &&
      p05CanNumber(state.context) &&
      state.version === 0 &&
      !state.documentNo &&
      !state.busy &&
      !state.unknown &&
      !state.pending &&
      numberRequested.current !== state.draftId
    ) {
      numberRequested.current = state.draftId;
      flow
        .requestDocumentNumber()
        .then(() => {
          if (provided) setState(flow.snapshot());
        })
        .catch(() => undefined);
    }
  }, [
    flow,
    provided,
    state.context,
    state.draftId,
    state.version,
    state.documentNo,
    state.busy,
    state.unknown,
    state.pending,
  ]);
  const fields = useRef<
    Partial<Record<keyof P05CreateForm, React.ComponentRef<typeof TextInput>>>
  >({});
  useEffect(() => {
    let live = true;
    flow
      .initialize(returnDocumentId, !resumeDraftId, resumeDraftId)
      .then(() => {
        if (provided && live) setState(flow.snapshot());
      });
    return () => {
      live = false;
      flow.leave();
      if (!provided) flow.dispose();
    };
  }, [flow, provided, returnDocumentId, resumeDraftId]);
  const refresh = () => {
    if (provided) setState(flow.snapshot());
  };
  const run = async (action: () => Promise<boolean>) => {
    await action();
    refresh();
  };
  const home = () => {
    if (state.busy || state.scanBusy) return;
    flow.leave();
    onExit();
  };
  const back = () => {
    if (addressOpen) {
      if (!locked) {
        setAddressOpen(false);
      }
      return;
    }
    if (info) {
      setInfo('');
      return;
    }
    if (discard) {
      if (!state.busy && !state.scanBusy) setDiscard(false);
      return;
    }
    if (exit || replace) {
      if (!locked) {
        setExit(false);
        setDiscard(false);
        setReplace(undefined);
      }
      return;
    }
    if (locked) return;
    if (state.step === 4 || state.outcome) {
      home();
      return;
    }
    if (state.step > 1) {
      flow.back();
      refresh();
    } else if (flow.hasWork()) setExit(true);
    else home();
  };
  useHardwareBack(() => {
    if (exceptionActive) return false;
    back();
    return true;
  });
  const [focusRequest, setFocusRequest] = useState<{
    key: string;
    token: number;
  }>({ key: '', token: 0 });
  const errors = touched ? flow.errors() : {};
  async function begin() {
    setTouched(true);
    const e = flow.errors();
    if (Object.keys(e).length) {
      setFocusRequest(v => ({ key: Object.keys(e)[0], token: v.token + 1 }));
      const first = Object.keys(e)[0];
      if (['province', 'ward', 'address'].includes(first)) {
        setAddressExpanded(true);
        fields.current.address?.focus();
      } else fields.current[first as keyof P05CreateForm]?.focus();
      return;
    }
    await run(flow.begin);
  }
  function input(
    key: P05CreateTextField,
    label: string,
    icon: string,
    options: {
      disabled?: boolean;
      multiline?: boolean;
      numeric?: boolean;
    } = {},
  ) {
    const disabled = locked || !!options.disabled;
    return (
      <View key={key} style={styles.field}>
        <Text style={p04.label}>
          {label.replace(' *', '')}
          {label.endsWith(' *') && <Text style={p04.required}> *</Text>}
        </Text>
        <View
          style={[
            p04.control,
            options.multiline && styles.noteControl,
            disabled && p04.locked,
          ]}
        >
          <P04Icon name={icon} size={24} color={HN_UI.textLink} />
          <P05KeyboardInput
            inputRef={v => {
              if (v) fields.current[key] = v;
            }}
            accessibilityLabel={label.replace(' *', '')}
            invalid={!!errors[key]}
            value={f[key]}
            onChangeText={v => {
              flow.field(key, key === 'phone' ? sanitiseP05Phone(v) : v);
              refresh();
            }}
            editable={!disabled}
            multiline={options.multiline}
            maxLength={key === 'note' ? 200 : undefined}
            keyboardType={
              options.numeric || key === 'phone' ? 'number-pad' : 'default'
            }
            autoCapitalize={key === 'phone' ? 'none' : 'sentences'}
            underlineColorAndroid="transparent"
            style={[styles.input, options.multiline && styles.multiline]}
            placeholderTextColor={HN_UI.textMuted}
            placeholder={label.replace(' *', '')}
          />
          {key === 'plannedInput' && (
            <View style={styles.unit}>
              <Text style={styles.unitText}>Sản phẩm</Text>
            </View>
          )}
          {key === 'phone' && !!f.phone && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa số điện thoại"
              accessibilityState={{ disabled }}
              disabled={disabled}
              style={styles.clearPhone}
              onPress={() => {
                if (disabled) return;
                flow.field('phone', '');
                refresh();
                fields.current.phone?.focus();
              }}
            >
              <P04Icon name="x" size={18} color={HN_UI.textMuted} />
            </Pressable>
          )}
          {disabled && (
            <P04Icon name="lock" size={17} color={HN_UI.textSecondary} />
          )}
        </View>
        {errors[key] && <Text style={styles.error}>{errors[key]}</Text>}
        {key === 'note' && (
          <Text style={[styles.hint, styles.noteCounter]}>
            {f.note.length}/200
          </Text>
        )}
      </View>
    );
  }
  const choose = (
    kind: 'province' | 'ward' | 'recipient' | 'group',
    id: string,
  ) => {
    if (
      kind === 'recipient' &&
      id !== f.recipientId &&
      (f.recipient || f.phone || f.address)
    ) {
      setReplace(id);
      return;
    }
    flow.choose(kind, id);
    refresh();
  };
  async function readAndOpen(history = false) {
    const id = state.documentId;
    if (!id) return;
    if (await flow.readCurrent()) {
      if (history && onHistory) onHistory(id);
      else if (onViewDocument) onViewDocument(id);
      else
        setInfo(
          `Phiếu ${state.documentNo}\n${
            flow.snapshot().current?.status ?? 'Chưa xác minh'
          }`,
        );
    } else
      setInfo(
        flow.snapshot().currentError || 'Chưa đọc được trạng thái hiện tại.',
      );
  }
  const documentNumber = state.documentNo;
  const catalogueNotice = state.catalogueBusy
    ? 'Đang tải danh mục người nhận và nhóm hàng…'
    : state.catalogueError;
  const notices = (
    <>
      {state.context?.numbering && !p05CanNumber(state.context) && (
        <P04Info title="Chưa thể cấp mã phiếu">
          Máy chủ chưa cho phép cấp mã PX cho quyền và kho hiện tại. Dữ liệu
          nhập được giữ; kiểm tra lại quyền hoặc nguồn cấp số trước khi soạn
          hàng.
        </P04Info>
      )}
      {state.step > 1 && !locked && !state.error && flow.isDirty() && (
        <P04Info
          title="Có thông tin hoặc mã chưa lưu"
          actions={
            <P04Action
              label="Lưu nháp"
              disabled={state.busy}
              onPress={() => run(flow.save)}
            />
          }
        >
          Lưu nháp để tiếp tục gửi phiếu.
        </P04Info>
      )}
      {state.unknown || state.pending ? (
        <P04Info
          title="Kết quả chưa xác định"
          actions={
            <>
              <P04Action
                label="Kiểm tra kết quả"
                disabled={state.busy}
                onPress={() => run(flow.check)}
              />
              {state.retry === 'SAME_REQUEST_ONLY' && (
                <P04Action
                  label="Thử lại cùng yêu cầu"
                  disabled={state.busy}
                  secondary
                  onPress={() => run(flow.retrySame)}
                />
              )}
              <P04Action
                label="Về Trang chủ — giữ phiếu"
                secondary
                disabled={state.busy}
                onPress={home}
              />
            </>
          }
        >
          Giữ nguyên thông tin, mã quét và yêu cầu. Kiểm tra kết quả trước thao
          tác mới.
        </P04Info>
      ) : state.error ? (
        <P04Info
          title="Chưa thể tiếp tục"
          actions={
            p05ChecksPending(state) ? (
              <P04Action
                label="Đối chiếu lượt kiểm mã gốc"
                secondary
                disabled={state.busy}
                onPress={() => run(flow.reconcileResolverCheck)}
              />
            ) : (
              <P04Action
                label="Đọc lại phiên và nháp"
                secondary
                disabled={state.busy}
                onPress={() =>
                  run(() =>
                    flow.initialize(returnDocumentId, false, resumeDraftId),
                  )
                }
              />
            )
          }
        >
          {state.error}
        </P04Info>
      ) : null}
    </>
  );
  async function scan(
    raw: string,
    source: import('../../scanner/scanPayload').ScanSource,
  ): Promise<ScanFeedback> {
    const kind = await flow.scan(raw, source),
      next = flow.snapshot();
    refresh();
    const retained = kind === 'valid';
    return {
      accepted: retained && !next.pending && !next.unknown && !next.error,
      retained,
      message:
        next.message ||
        next.error ||
        (!kind
          ? 'Chưa xác minh mã.'
          : kind === 'duplicate'
          ? 'Mã đã được quét; không cộng số lượng.'
          : ''),
    };
  }
  let screen;
  if (state.step === 2) {
    screen = (
      <BusinessScanScreen
        title="Xuất kho"
        documentName={f.name || 'Phiếu xuất mới'}
        stepLabel="Bước 2/3"
        sessionLabel="Phiếu xuất đang quét"
        scannedCount={state.accepted.length}
        progressLabel={`${state.accepted.length}/${f.plannedInput}`}
        layout="board"
        scanPaused={locked || !!state.error || exit || discard || !!replace}
        onBack={back}
        onDone={() => {
          flow.review();
          refresh();
        }}
        onScan={scan}
        p05Context={{
          documentRef: f.name || 'Phiếu xuất mới',
          documentNumber: state.documentNo,
          warehouseName:
            state.context?.available_warehouses.find(
              w => w.warehouse_id === state.context?.active_warehouse_id,
            )?.name || 'Chưa xác minh',
          supplierName: f.recipient,
          typeLabel: 'Xuất kho',
          planned: Number(f.plannedInput),
          snapshotSaved: !flow.isDirty() && !state.pending && !state.error,
          processing: state.busy || state.scanBusy,
          ownerNotice: !!info,
          viewState: state.view,
          onViewChange: v => {
            flow.setView(v);
            refresh();
          },
          codes: state.accepted.map(c => ({
            raw: c.raw,
            sku: c.sku,
            quantity: 1,
            at: 0,
          })),
          attempts: state.attempts.map(a => ({
            raw: a.raw,
            at: 0,
            kind: a.kind,
            reason: a.reason,
            timeLabel: a.time,
          })),
          notices,
        }}
      />
    );
  } else if (state.step === 4 && state.documentId) {
    screen = (
      <P04Frame
        assetPack
        title="Xuất kho"
        appearance="outbound-result"
        onBack={home}
        initialScrollY={state.view.scroll?.[4] ?? 0}
        onScrollPositionChange={y => flow.setView({ scroll: { 4: y } })}
        footer={
          <>
            <P04Action
              label="Xem chứng từ"
              disabled={!resultActionsReady || state.busy}
              leading={
                <P04Icon
                  name="document"
                  assetPack
                  size={20}
                  color={HN_UI.onBrand}
                />
              }
              trailing={
                <P04Icon name="arrow" size={20} color={HN_UI.onBrand} />
              }
              onPress={() => readAndOpen()}
            />
            <P04Action
              label="Về Trang chủ"
              disabled={!resultActionsReady || state.busy}
              secondary
              leading={<P04Icon name="house" assetPack size={20} />}
              onPress={home}
            />
          </>
        }
      >
        <P05ResultContent
          documentNo={state.documentNo}
          warehouseName={
            state.context?.available_warehouses.find(
              w => w.warehouse_id === state.context?.active_warehouse_id,
            )?.name
          }
          recipient={state.form.recipient}
          count={state.accepted.length}
          planned={Number(f.plannedInput)}
          sentAt={state.committedAt}
          current={state.current}
          currentError={state.currentError}
          onRead={(label, value) => setInfo(label + '\n' + value)}
        />
      </P04Frame>
    );
  } else {
    screen = (
      <P04Frame
        assetPack
        title="Xuất kho"
        step={state.step===1?1:undefined}
        stepLabels={undefined}
        headerRight={<Text style={p04.step}>{`Bước ${state.step}/3`}</Text>}
        revealWithinScroll
        onBack={back}
        initialScrollY={state.view.scroll?.[state.step] ?? 0}
        onScrollPositionChange={y =>
          flow.setView({ scroll: { [state.step]: y } })
        }
        contentStyle={state.step === 3 ? undefined : styles.content}
        footer={
          <>
            {state.step === 3 ? (
              <View style={styles.row}>
                <P04Action
                  label="Quay lại soạn hàng"
                  compact
                  secondary
                  style={styles.half}
                  disabled={locked}
                  onPress={() => {
                    flow.back();
                    refresh();
                  }}
                />
                <P04Action
                  label="Gửi duyệt"
                  compact
                  style={styles.half}
                  disabled={locked || !flow.canRecord()}
                  loading={state.busy}
                  trailing={
                    <P04Icon name="send" size={20} color={HN_UI.onBrand} />
                  }
                  onPress={() => run(flow.send)}
                />
              </View>
            ) : (
              <P04Action
                label="Bắt đầu soạn hàng"
                disabled={
                  locked ||
                  !state.context?.permissions.record ||
                  (!!state.context.numbering && !p05CanNumber(state.context))
                }
                loading={state.busy && !!state.context}
                trailing={
                  <P04Icon name="arrow" size={20} color={HN_UI.onBrand} />
                }
                onPress={begin}
              />
            )}
          </>
        }
      >
        <P04Heading
          title={
            state.step === 3 ? 'Kiểm tra phiếu xuất' : 'Thông tin phiếu xuất'
          }
          subtitle={
            state.step === 3
              ? 'Xem lại thông tin, số lượng và danh sách sản phẩm trước khi gửi duyệt.'
              : 'Kiểm tra và nhập thông tin giao hàng trước khi soạn'
          }
        />
        {state.step === 1 ? (
          <>
            <P05SourceField
              onRead={(label, value) => setInfo(label + '\n' + value)}
              label="Kho xuất"
              value={
                state.context?.available_warehouses.find(
                  w => w.warehouse_id === state.context?.active_warehouse_id,
                )?.name || 'Chưa xác minh'
              }
              icon="house"
            />

            <P05SourceField
              label="Mã phiếu"
              icon="document"
              value={documentNumber || 'Chưa được cấp'}
              empty={!documentNumber}
              onRead={(label, value) => setInfo(label + '\n' + value)}
            />
            {!documentNumber &&
              state.version > 0 &&
              p05CanNumber(state.context) &&
              !locked && (
                <P04Action
                  label="Cấp mã phiếu"
                  compact
                  secondary
                  onPress={() => run(() => flow.requestDocumentNumber(true))}
                />
              )}

            <P05FormChoice
              onRead={(label, value) => setInfo(label + '\n' + value)}
              presentation="dialog"
              label="Người nhận *"
              focusRequest={
                focusRequest.key === 'recipient' ? focusRequest.token : 0
              }
              icon="user"
              value={f.recipientId}
              options={[
                ...(state.catalogue?.recipients ?? []).map(r => ({
                  id: r.id,
                  name: r.name,
                })),
                { id: 'walk-in', name: 'Khách vãng lai / khách mới' },
              ]}
              onChange={id => choose('recipient', id)}
              disabled={locked || state.catalogueBusy}
              placeholder="Chọn người nhận"
              error={errors.recipient}
            />
            {f.recipientId === 'walk-in'
              ? input('recipient', 'Tên người nhận *', 'user')
              : null}
            {!!state.catalogue?.recipientError && (
              <Text style={styles.error}>
                Chưa tải được danh mục đại lý/người nhận.{' '}
                {state.catalogue.recipientError}
              </Text>
            )}
            {input('phone', 'Số điện thoại *', 'phone')}
            <View
              testID="P05.inline-delivery-address"
              style={{ marginHorizontal: 3, marginBottom: 12 }}
            >
              <Text style={[p04.label, { fontWeight: '700', marginBottom: 8 }]}>
                Địa chỉ giao hàng
              </Text>
              {addressExpanded && (
                <>
                  <P05SourceField
                    label="Tỉnh / Thành phố"
                    icon="pin"
                    required
                    trailingIcon="chevron-down"
                    accessibilityLabel="Tỉnh/Thành phố"
                    value={f.provinceName || 'Chọn Tỉnh / Thành phố'}
                    empty={!f.province}
                    disabled={locked || !state.geo.provinces.length}
                    onPress={() => {
                      if (!locked && state.geo.provinces.length) {
                        setAddressQuery('');
                        setAddressPanel('province');
                        setAddressOpen(true);
                      }
                    }}
                  />
                  {!!errors.province && (
                    <Text style={styles.error}>{errors.province}</Text>
                  )}
                  <P05SourceField
                    label="Phường / Xã"
                    icon="pin"
                    required
                    trailingIcon="chevron-down"
                    accessibilityLabel="Phường/Xã"
                    value={
                      f.wardName ||
                      (f.province
                        ? 'Chọn Phường / Xã'
                        : 'Chọn tỉnh/thành trước')
                    }
                    empty={!f.ward}
                    disabled={
                      locked ||
                      !f.province ||
                      state.geo.busy ||
                      state.geo.wardsProvince !== f.province
                    }
                    onPress={() => {
                      if (
                        !locked &&
                        f.province &&
                        !state.geo.busy &&
                        state.geo.wardsProvince === f.province
                      ) {
                        setAddressQuery('');
                        setAddressPanel('ward');
                        setAddressOpen(true);
                      }
                    }}
                  />
                  {!!errors.ward && (
                    <Text style={styles.error}>{errors.ward}</Text>
                  )}
                  {input('address', 'Địa chỉ chi tiết *', 'pin', {
                    disabled: !f.province || !f.ward,
                  })}
                  {!!state.geo.error && (
                    <Text style={styles.error}>{state.geo.error}</Text>
                  )}
                  {!!state.geo.error && (
                    <P04Action
                      label="Tải lại địa chỉ"
                      compact
                      secondary
                      onPress={() =>
                        run(() => flow.loadGeo(f.province || undefined))
                      }
                    />
                  )}
                  {state.geo.stale && (
                    <Text style={styles.hint}>
                      Kiểm tra lại tỉnh/thành và phường/xã trong danh mục đã
                      lưu.
                    </Text>
                  )}
                </>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  addressExpanded
                    ? 'Thu gọn thông tin giao hàng'
                    : 'Mở thông tin giao hàng'
                }
                disabled={locked}
                onPress={() => setAddressExpanded(v => !v)}
                style={{
                  minHeight: 44,
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12, color: HN_UI.textLink }}>
                  {addressExpanded
                    ? 'Thu gọn thông tin giao hàng'
                    : 'Mở thông tin giao hàng'}
                </Text>
              </Pressable>
            </View>
            {input('plannedInput', 'Số lượng cần soạn *', 'box', {
              numeric: true,
              disabled: !!state.accepted.length,
            })}
            <P05FormChoice
              onRead={(label, value) => setInfo(label + '\n' + value)}
              presentation="dialog"
              label="Nhóm hàng *"
              focusRequest={
                focusRequest.key === 'group' ? focusRequest.token : 0
              }
              icon="tag"
              value={f.group}
              multiple
              values={p05SelectedGroups(f)}
              onChangeMultiple={groups => {
                flow.chooseGroups(groups);
                refresh();
              }}
              options={(state.catalogue?.groups ?? []).map(v => ({
                id: v,
                name: v,
              }))}
              onChange={id => choose('group', id)}
              disabled={
                locked ||
                !!state.accepted.length ||
                state.catalogueBusy ||
                !!state.catalogue?.groupError
              }
              placeholder="Chọn một hoặc nhiều nhóm hàng"
              error={errors.group}
            />
            {input('note', 'Ghi chú', 'document', { multiline: true })}
            {catalogueNotice && (
              <Text style={styles.hint}>{catalogueNotice}</Text>
            )}
            {state.catalogueError && (
              <P04Action
                label="Tải lại danh mục"
                secondary
                compact
                onPress={() => run(flow.loadCatalogue)}
              />
            )}
          </>
        ) : (
          <P05ReviewContent
            documentNo={documentNumber}
            warehouse={
              state.context?.available_warehouses.find(
                w => w.warehouse_id === state.context?.active_warehouse_id,
              )?.name || 'Chưa xác minh'
            }
            recipient={f.recipient}
            phone={f.phone}
            address={p05DeliveryAddress(f)}
            group={p05SelectedGroups(f).join(', ')}
            planned={Number(f.plannedInput)}
            accepted={state.accepted}
            note={f.note}
            onRead={(label, value) => setInfo(label + '\n' + value)}
          />
        )}
        {notices}
      </P04Frame>
    );
  }
  if (exceptionActive)
    return (
      <P05Exceptions
        state={state}
        owner={flow}
        refresh={refresh}
        onHome={home}
        onViewDocument={onViewDocument}
      />
    );
  return (
    <>
      {screen}
      {state.step === 4 && state.documentId && onSelectTab ? (
        <BottomNav
          activeKey={footerActiveKey ?? 'scan'}
          onSelect={key => {
            if (resultActionsReady && !locked) onSelectTab(key);
          }}
          disabled={!resultActionsReady || locked}
        />
      ) : null}
      <Dialog
        visible={
          addressOpen &&
          !warehouseStopped &&
          !exit &&
          !discard &&
          !replace &&
          !info
        }
        title={
          addressPanel === 'province'
            ? 'Tỉnh/Thành phố'
            : addressPanel === 'ward'
            ? 'Phường/Xã'
            : 'Địa chỉ giao'
        }
        onDismiss={() => {
          if (!locked) {
            setAddressOpen(false);
          }
        }}
        dismissOnBackdrop={false}
        footer={
          <P04Action
            label="Quay lại"
            disabled={locked}
            onPress={() => {
              setAddressOpen(false);
            }}
          />
        }
      >
        {addressOpen && (
          <View>
            <TextInput
              accessibilityLabel="Tìm địa chỉ"
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder="Tìm nhanh…"
              style={[styles.input, p04.control]}
            />
            {(addressPanel === 'province'
              ? state.geo.provinces
              : state.geo.wards
            )
              .filter(unit => geoUnitMatches(unit, addressQuery))
              .map(unit => (
                <Pressable
                  key={unit.code}
                  accessibilityRole="radio"
                  accessibilityLabel={unit.name}
                  accessibilityState={{
                    checked:
                      (addressPanel === 'province' ? f.province : f.ward) ===
                      unit.code,
                    disabled: locked,
                  }}
                  disabled={locked}
                  style={[p04.control, styles.addressOption]}
                  onPress={() => {
                    if (locked) return;
                    flow.choose(
                      addressPanel === 'province' ? 'province' : 'ward',
                      unit.code,
                    );
                    refresh();
                    setAddressOpen(false);
                  }}
                >
                  <Text style={styles.input}>{unit.name}</Text>
                  {(addressPanel === 'province' ? f.province : f.ward) ===
                    unit.code && <P04Icon name="check" size={18} />}
                </Pressable>
              ))}
          </View>
        )}
      </Dialog>
      <Dialog
        visible={!!info}
        title="Thông tin phiếu xuất"
        message={info}
        onDismiss={() => setInfo('')}
      >
        <P04Action label="Đóng" onPress={() => setInfo('')} />
      </Dialog>
      <P03Dialog
        activeKey={footerActiveKey}
        visible={warehouseStopped || exit || discard}
        panel={warehouseStopped ? 'S03' : discard ? 'S04' : 'S02'}
        busy={state.busy || state.scanBusy}
        serverLinked={state.version > 0}
        message={state.error || state.message || undefined}
        onBack={() => {
          if (discard) setDiscard(false);
          else setExit(false);
        }}
        onSelectTab={key => {
          if (onSelectTab) {
            flow.leave();
            onSelectTab(key);
          } else if (key === 'home') home();
        }}
        actions={
          warehouseStopped
            ? [{ label: 'Về Trang chủ', kind: 'primary', onPress: home }]
            : discard
            ? [
                { label: 'Quay lại', onPress: () => setDiscard(false) },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger',
                  disabled: locked,
                  onPress: () => {
                    run(async () => {
                      const ok = await flow.discard();
                      if (ok) {
                        setDiscard(false);
                        setExit(false);
                        home();
                      }
                      return ok;
                    }).catch(() => undefined);
                  },
                },
              ]
            : [
                {
                  label: 'Tiếp tục phiếu',
                  kind: 'primary',
                  disabled: locked,
                  onPress: () => setExit(false),
                },
                {
                  label: 'Lưu nháp và thoát',
                  disabled: locked,
                  onPress: () => {
                    run(async () => {
                      const ok = await flow.save();
                      if (ok) {
                        setExit(false);
                        home();
                      }
                      return ok;
                    }).catch(() => undefined);
                  },
                },
                {
                  label: 'Bỏ phiếu',
                  kind: 'danger-outline',
                  disabled: locked,
                  onPress: () => setDiscard(true),
                },
                { label: 'Hủy', kind: 'text', onPress: () => setExit(false) },
              ]
        }
      />
      <Dialog
        visible={!!replace}
        title="Đổi người nhận"
        message={`Thông tin giao hàng đang nhập sẽ được thay bằng người nhận mới.\nHiện tại: ${
          f.recipient || 'Chưa chọn'
        }\nMới: ${
          replace === 'walk-in'
            ? 'Khách vãng lai / khách mới'
            : state.catalogue?.recipients.find(r => r.id === replace)?.name ??
              ''
        }`}
        onDismiss={() => setReplace(undefined)}
      >
        <View style={styles.dialogActions}>
          <P04Action
            label="Hủy"
            secondary
            onPress={() => setReplace(undefined)}
          />
          <P04Action
            label="Đổi người nhận"
            disabled={locked}
            onPress={() => {
              if (replace) flow.choose('recipient', replace);
              setReplace(undefined);
              refresh();
            }}
          />
        </View>
      </Dialog>
    </>
  );
}
