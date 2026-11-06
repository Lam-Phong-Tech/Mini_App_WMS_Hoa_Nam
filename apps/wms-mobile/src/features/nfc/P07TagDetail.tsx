import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Dialog } from '../../ui/Dialog';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import { P04Icon } from '../inbound/P04Icon';
import { P07Action } from './P07Frame';
import { HN_UI } from '../../theme/uiKitV3';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import type { NfcTag } from '../../services/wms/nfc';
export const p07TagUpdatedAt=(tag:Pick<NfcTag,'updated_at'>|null|undefined):string=>tag?.updated_at?formatVietnamDateTime(tag.updated_at):'—';

/** Current read-only directory projection. Never treats assigned_at as updated_at. */
export function P07TagDetail({
  tag,
  onClose,
  onCopy,
}: {
  tag: NfcTag | null;
  onClose(): void;
  onCopy(uid: string): void;
}) {
  const scale = Math.min(1, useWindowDimensions().width / 494);
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '—');
  const rows = [
    ['Mã thẻ (UID)', text(tag?.hardware_uid)],
    ['Trạng thái', text(tag?.status_label)],
    ['Sản phẩm', text(tag?.sku_name)],
    ['SKU', text(tag?.sku_code)],
    ['Serial', text(tag?.serial_number)],
    ['Cập nhật', p07TagUpdatedAt(tag)],
  ] as const;
  return (
    <Dialog
      visible={!!tag}
      title="Thông tin thẻ"
      showHeader={false}
      animationType="none"
      panelMaxWidth={454 * scale}
      dismissOnBackdrop={false}
      onDismiss={onClose}
      footer={<P07Action label="Đóng" secondary onPress={onClose} />}
    >
      <View testID="P07.tag-detail-dialog">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12 * scale,
            paddingBottom: 14 * scale,
            borderBottomWidth: 1,
            borderBottomColor: HN_UI.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại danh sách thẻ"
            onPress={onClose}
            style={{
              width: 52 * scale,
              minHeight: 52 * scale,
              borderWidth: 1,
              borderColor: HN_UI.border,
              borderRadius: 10 * scale,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: HN_UI.canvas,
            }}
          >
            <P04Icon
              name="arrow-left"
              size={24 * scale}
              color={HN_UI.textLink}
            />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 22 * scale,
              fontWeight: '700',
              color: HN_UI.textPrimary,
            }}
          >
            Thông tin thẻ {text(tag?.code_value)}
          </Text>
        </View>
        {rows.map(([label, value], index) => (
          <View
            key={label}
            testID={'P07.tag-detail-row-' + index}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10 * scale,
              minHeight: (index === 0 ? 74 : 50) * scale,
              paddingVertical: 10 * scale,
              borderBottomWidth: index === 5 ? 0 : 1,
              borderBottomColor: HN_UI.border,
            }}
          >
            <Text
              style={{
                width: '44%',
                fontSize: 16 * scale,
                color: HN_UI.textSecondary,
              }}
            >
              {label}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                selectable
                style={{
                  fontSize: 16 * scale,
                  color: HN_UI.textPrimary,
                  ...(index === 1 && tag?.tab_status === 'ASSIGNED'
                    ? {
                        alignSelf: 'flex-start',
                        backgroundColor: HN_UI.successSoft,
                        color: HN_UI.success,
                        paddingHorizontal: 10 * scale,
                        borderRadius: 18 * scale,
                      }
                    : {}),
                }}
              >
                {value}
              </Text>
            </View>
            {index === 0 && !!tag?.hardware_uid && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sao chép UID"
                onPress={() => onCopy(tag.hardware_uid!)}
                style={{
                  minWidth: 44 * scale,
                  minHeight: 44 * scale,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <P04Icon name="copy" size={20 * scale} color={HN_UI.textLink} />
              </Pressable>
            )}
          </View>
        ))}
        <Text
          style={{
            fontSize: 14 * scale,
            lineHeight: 22 * scale,
            color: HN_UI.textSecondary,
            marginTop: 16 * scale,
          }}
        >
          Thông tin hiện tại của thẻ. Chưa có nguồn dữ liệu lịch sử thao tác.
        </Text>
      </View>
    </Dialog>
  );
}
