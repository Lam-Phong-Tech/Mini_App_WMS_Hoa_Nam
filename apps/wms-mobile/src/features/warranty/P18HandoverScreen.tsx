import {HN_UI} from '../../theme/uiKitV3';
import React, { useRef, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Pressable,StyleSheet,View} from 'react-native';
import { P04Frame } from '../inbound/P04Frame';
import { P09Action, P09Card, p09, p09Status } from './P09Presentation';
import { Input } from '../../ui/Input';
import { Checkbox } from '../../ui/Checkbox';
import { Text } from '../../ui/Text';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {
  handoverErrors,
  type P09Handover,
} from '../../services/wms/p09Handover';
import type { P09Case } from '../../services/wms/p09Warranty';
import type { AppError } from '../../errors/AppError';
import { useHardwareBack } from '../../app/useHardwareBack';
import { p09Date } from './p09Date';
import { P18ReadableText, P18Value } from './P18ReadableText';

const styles = StyleSheet.create({
  content: { gap: 14, minWidth: 0 },
  card: { borderRadius: 12, borderColor: HN_UI.border, padding: 16, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: HN_OPERATIONS.warranty.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    color: HN_UI.warning,
    backgroundColor: HN_UI.warningSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  heading: {
    color: HN_UI.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  label: { color: HN_UI.textPrimary, fontSize: 16, lineHeight: 24 },
  hint: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21 },
  counter: {
    color: HN_UI.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'right',
  },
  footer: { gap: 10 },
});

export function P18HandoverScreen({
  current,
  draft,
  onChange,
  onBack,
  onConfirm,
  blocked,
  busy,
  recovery,
  error,
}: {
  current: P09Case;
  draft: P09Handover;
  onChange: React.Dispatch<React.SetStateAction<P09Handover>>;
  onBack(): void;
  onConfirm(): void;
  blocked: boolean;
  busy: boolean;
  recovery: React.ReactNode;
  error?: AppError;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const receiver = useRef<React.ComponentRef<typeof TextInput>>(null),
    day = useRef<React.ComponentRef<typeof TextInput>>(null),
    note = useRef<React.ComponentRef<typeof TextInput>>(null);
  const errors = handoverErrors(draft);
  const locked = blocked || busy;
  const status = p09Status(current.status);
  const back = () => {
    if (!busy) onBack();
  };
  const confirm = () => {
    if (locked) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      if (!errors.handover_checked) {
        if (errors.receiver) receiver.current?.focus();
        else if (errors.handover_date) day.current?.focus();
        else if (errors.note) note.current?.focus();
      }
      return;
    }
    onConfirm();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const helper = busy
    ? 'Đang xác minh kết quả bàn giao…'
    : blocked
    ? 'Chưa thể bàn giao. Kiểm tra trạng thái hồ sơ và quyền hiện tại.'
    : 'Thông tin đang nhập được giữ khi trở về hồ sơ trong phiên này.';
  return (
    <P04Frame
      appearance="attachment"
      title="Bàn giao bảo hành"
      onBack={busy ? undefined : back}
      footer={
        <View style={styles.footer}>
          <Text style={styles.hint} accessibilityLiveRegion="polite">
            {helper}
          </Text>
          <View style={p09.row}>
            <P09Action
              label="Về hồ sơ"
              variant="secondary"
              style={p09.fill}
              disabled={busy}
              onPress={back}
            />
            <P09Action
              label="Xác nhận bàn giao"
              style={p09.fill}
              disabled={locked}
              onPress={confirm}
            />
          </View>
        </View>
      }
    >
      <View testID="P18.S03" style={styles.content}>
        <P09Card style={styles.card}>
          <View style={styles.top}>
            <View style={styles.tile}>
              <HnHomeIcon
                name="tool"
                size={26}
                color={HN_OPERATIONS.warranty.ink}
              />
            </View>
            <View style={styles.grow}>
              <P18ReadableText
                label="Số phiếu"
                value={current.warranty_case_code ?? current.warranty_case_id}
                style={styles.heading}
              />
            </View>
            <Text style={styles.badge}>{status}</Text>
          </View>
          <P18ReadableText
            label="Sản phẩm"
            value={
              current.sku_name ??
              current.manual_product_description ??
              'Chưa xác minh'
            }
            style={{ fontWeight: '600' }}
          />
          <P18ReadableText
            label="Serial"
            value={'Serial: ' + (current.serial_number ?? 'Chưa xác minh')}
            style={styles.hint}
          />
        </P09Card>
        <P09Card style={styles.card}>
          <Checkbox
            label="Đã kiểm tra hoạt động của thiết bị"
            description="Thiết bị hoạt động bình thường sau sửa chữa"
            checked={draft.handover_checked}
            disabled={locked}
            onToggle={() => {
              if (!locked)
                onChange(previous => ({
                  ...previous,
                  handover_checked: !previous.handover_checked,
                }));
            }}
            style={{ paddingVertical: 4 }}
          />
          {submitted && errors.handover_checked ? (
            <Text tone="danger" accessibilityLiveRegion="polite">
              {errors.handover_checked}
            </Text>
          ) : null}
        </P09Card>
        <P09Card title="Thông tin bàn giao" style={styles.card}>
          <Input
            label="Người nhận*"
            accessibilityLabel="Người nhận bàn giao"
            inputRef={receiver}
            labelStyle={styles.label}
            fieldHeight={48}
            value={draft.receiver}
            maxLength={200}
            editable={!locked}
            placeholder="Nhập tên người nhận"
            onChangeText={value => {
              if (!locked)
                onChange(previous => ({ ...previous, receiver: value }));
            }}
            errorText={submitted ? errors.receiver : undefined}
          />
          <Input
            label="Ngày bàn giao (YYYY-MM-DD)*"
            accessibilityLabel="Ngày bàn giao"
            inputRef={day}
            labelStyle={styles.label}
            fieldHeight={48}
            value={draft.handover_date}
            maxLength={10}
            editable={!locked}
            placeholder="YYYY-MM-DD"
            onChangeText={value => {
              if (!locked)
                onChange(previous => ({ ...previous, handover_date: value }));
            }}
            errorText={submitted ? errors.handover_date : undefined}
          />
          <Input
            label="Ghi chú bàn giao*"
            accessibilityLabel="Ghi chú bàn giao"
            inputRef={note}
            labelStyle={styles.label}
            fieldHeight={104}
            inputStyle={{
              textAlignVertical: 'top',
              paddingVertical: 10,
              lineHeight: 24,
            }}
            value={draft.note}
            multiline
            maxLength={2000}
            editable={!locked}
            placeholder="Nhập ghi chú bàn giao…"
            onChangeText={value => {
              if (!locked) onChange(previous => ({ ...previous, note: value }));
            }}
            errorText={submitted ? errors.note : undefined}
          />
          <Text style={styles.counter}>{draft.note.length}/2.000 ký tự</Text>
        </P09Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin bảo hành và kỹ thuật"
          accessibilityState={{expanded: detailsExpanded}}
          onPress={() => setDetailsExpanded(value => !value)}
          style={[styles.card, styles.top, {minHeight:48,backgroundColor:HN_UI.surface,borderWidth:1}]}
        >
          <Text style={[styles.heading,styles.grow]}>Thông tin bảo hành và kỹ thuật</Text>
          <Text>{detailsExpanded ? '−' : '+'}</Text>
        </Pressable>
        {detailsExpanded && <P09Card title="Thông tin bảo hành" style={styles.card}>
          <P18Value inline label="Số phiếu" value={current.warranty_case_code ?? current.warranty_case_id}/>
          <P18Value inline label="Ngày tiếp nhận" value={current.received_at ? p09Date(current.received_at) : null}/>
          <P18Value inline label="Sản phẩm" value={current.sku_name ?? current.manual_product_description}/>
          <P18Value inline label="Số serial" value={current.serial_number}/>
          <P18Value inline label="Tình trạng" value={status}/>
          <P18Value inline label="Kỹ thuật xử lý" value={current.free_text_redacted ? 'Nội dung được ẩn theo quyền' : current.confirmed_defect} lines={3}/>
          <P18Value inline label="Khách hàng" value={current.customer_name}/>
          <P18Value inline label="Phiên bản hồ sơ" value={String(current.version)}/>
        </P09Card>}
        {error ? (
          <Text
            tone="danger"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {error.message}
          </Text>
        ) : null}
        {recovery}
      </View>
    </P04Frame>
  );
}
