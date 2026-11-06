import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
// User approved P05 S02/S03 presentation repair on 13/10/2026.
// P05 S03 review presentation shared by manual-create and source-linked flows.
// It reads owner snapshot props only; no API, storage, or record action lives here.
import React, { useMemo, useState } from 'react';
import { Image,Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { P04Icon } from '../inbound/P04Icon';
import { P04Info } from '../inbound/P04Frame';
import type { AcceptedCode, SourceLine } from './linked/types';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { P05TextMeasure } from './P05TextMeasure';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {scannerAssets} from '../../theme/scannerAssets';

type ReviewGroup = {
  id: string;
  label: string;
  code: string;
  planned?: number;
  codes: string[];
};
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.surface,
    overflow: 'hidden',
  },
  row: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: HN_UI.border,
  },
  last: { borderBottomWidth: 0 },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: HN_OPERATIONS.documents.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedBody: { flexDirection: 'column', alignItems: 'stretch' },
  stackedValue: { flex: 0, minWidth: 0 },
  metadataLabel: {
    width: 112,
    flexShrink: 1,
    color: HN_UI.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  metadataValue: { flex: 1, minWidth: 0 },
  value: { color: HN_UI.textPrimary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  quantity: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.surface,
    overflow: 'hidden',
  },
  quantityCell: { flex: 1, minWidth: 0, minHeight: 76, padding: 12, gap: 3 },
  quantityDivider: { width: 1, backgroundColor: HN_UI.surfaceSunken },
  quantityLabel: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21 },
  quantityAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 5,
  },
  quantityValue: {
    color: HN_UI.textPrimary,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  completeQuantity: { color: HN_UI.success },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: HN_UI.warningSoft,
  },
  warningBody: { flex: 1, minWidth: 0, gap: 4 },
  warningTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: HN_UI.warning,
  },
  warningText: { fontSize: 13, lineHeight: 20, color: HN_UI.warning },
  groupCard: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.surface,
    overflow: 'hidden',
  },
  groupHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: HN_UI.border,
  },
  groupBody: { flex: 1, minWidth: 0, gap: 2 },
  nfcAction: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  groupCount: { minWidth: 58, flexShrink: 1, gap: 3, alignItems: 'flex-end' },
  groupCountLabel: { color: HN_UI.textMuted, fontSize: 13, lineHeight: 19 },
  groupCode: { color: HN_UI.textMuted, fontSize: 12, lineHeight: 18 },
  codeLine: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: HN_UI.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeText: {
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    flex: 1,
  },
  expand: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  edit: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_OPERATIONS.outbound.soft,
  },
  editText: {
    color: HN_OPERATIONS.outbound.ink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  inactive: { opacity: 0.5 },
  expandText: {
    color: HN_UI.textLink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  note: {
    color: HN_UI.textMuted,
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
  },
});

function MetadataRow({
  label,
  value,
  icon,
  last,
  onRead,
}: {
  label: string;
  value: string;
  icon: string;
  last?: boolean;
  onRead?: (label: string, value: string) => void;
}) {
  const [truncated, setTruncated] = useState(false);
  const stacked = label === 'Ghi chú';
  return (
    <View style={[styles.row, last && styles.last]}>
      <View style={styles.tile}>
        <P04Icon name={icon} assetPack size={20} color={SCANNER_COLORS.metadata} />
      </View>
      <View style={[styles.rowBody, stacked && styles.stackedBody]}>
        <Text style={styles.metadataLabel}>{label}</Text>
        <View style={stacked ? styles.stackedValue : styles.metadataValue}>
          <Text selectable numberOfLines={2} style={styles.value}>
            {value || 'Chưa xác minh'}
          </Text>
          <P05TextMeasure
            value={value}
            style={styles.value}
            onTruncated={setTruncated}
          />
          {truncated && onRead && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem đầy đủ ${label}`}
              onPress={() => onRead(label, value)}
              style={styles.expand}
            >
              <Text style={styles.expandText}>Xem đầy đủ</Text>
            </Pressable>
          )}
        </View>
      </View>
      {icon === 'warehouse' && (
        <P04Icon name="lock" size={16} color={HN_UI.textSecondary} />
      )}
    </View>
  );
}

function ProductText({
  value,
  label,
  style,
  lineHeight,
  onRead,
}: {
  value: string;
  label: string;
  style: TextStyle;
  lineHeight: number;
  onRead?: (label: string, value: string) => void;
}) {
  const [truncated, setTruncated] = useState(false);
  return (
    <View>
      <Text selectable numberOfLines={2} style={style}>
        {value}
      </Text>
      <P05TextMeasure
        value={value}
        style={style}
        lineHeight={lineHeight}
        onTruncated={setTruncated}
      />
      {truncated && onRead && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem đầy đủ ${label}`}
          onPress={() => onRead(label, value)}
          style={styles.expand}
        >
          <Text style={styles.expandText}>Xem đầy đủ</Text>
        </Pressable>
      )}
    </View>
  );
}

export function P05ReviewContent({
  documentNo,
  title: _title,
  warehouse,
  recipient,
  phone,
  address,
  group,
  planned,
  accepted,
  note,
  sourceLines,
  planComplete,
  onRead,
  onAssignNfc: _onAssignNfc,
  nfcDisabled: _nfcDisabled = false,
  onEditDelivery: _onEditDelivery,
  editDisabled: _editDisabled = false,
}: {
  documentNo?: string | null;
  title?: string;
  warehouse: string;
  recipient: string;
  phone: string;
  address: string;
  group: string;
  planned: number;
  accepted: AcceptedCode[];
  note?: string;
  onRead?: (label: string, value: string) => void;
  sourceLines?: readonly SourceLine[];
  planComplete?: boolean;
  onAssignNfc?: (rawCode: string, productLabel: string) => void;
  nfcDisabled?: boolean;
  onEditDelivery?: () => void;
  editDisabled?: boolean;
}) {
  const [showCodes, setShowCodes] = useState(false);
  const groups = useMemo<ReviewGroup[]>(() => {
    const map = new Map<string, ReviewGroup>();
    for (const line of sourceLines ?? []) {
      const current = map.get(line.sku_id);
      if (current) current.planned = (current.planned ?? 0) + line.planned_qty;
      else
        map.set(line.sku_id, {
          id: line.sku_id,
          label: line.sku_name || line.sku_code,
          code: line.sku_code,
          planned: line.planned_qty,
          codes: [],
        });
    }
    for (const code of accepted) {
      const key = code.skuId || code.sku;
      const current = map.get(key) ?? {
        id: key,
        label: code.sku || 'Sản phẩm',
        code: code.sku || 'Chưa xác minh',
        codes: [],
      };
      current.codes.push(code.raw);
      map.set(key, current);
    }
    if (!map.size && accepted.length)
      return [
        {
          id: 'all',
          label: group || 'Nhóm hàng',
          code: group || 'Chưa xác minh',
          codes: accepted.map(c => c.raw),
        },
      ];
    return [...map.values()];
  }, [accepted, group, sourceLines]);
  const complete =
    accepted.length === planned &&
    planComplete !== false &&
    (!sourceLines ||
      groups.every(
        g => g.planned !== undefined && g.codes.length === g.planned,
      ));
  const details = [
    ['Mã phiếu', documentNo || 'Chưa được cấp', 'document'],
    ['Kho xuất', warehouse, 'house'],
    ['Người nhận', recipient, 'user'],
    ['Số điện thoại', phone, 'phone'],
    ['Địa chỉ giao', address, 'pin'],
    ['Nhóm hàng', group, 'tag'],
  ].filter(Boolean) as [string, string, string][];
  return (
    <>
      <View testID="p05-review-metadata" style={styles.card}>
        {details.map((r, i) => (
          <MetadataRow
            key={r[0]}
            label={r[0]}
            value={r[1]}
            icon={r[2]}
            last={i === details.length - 1}
            onRead={onRead}
          />
        ))}
      </View>
      <View testID="p05-review-quantity" style={styles.quantity}>
        <View style={styles.quantityCell}>
          <Text style={styles.quantityLabel}>Số lượng yêu cầu</Text>
          <View style={styles.quantityAmount}>
            <Text style={styles.quantityValue}>{planned}</Text>
            <Text style={styles.quantityLabel}>sản phẩm</Text>
          </View>
        </View>
        <View style={styles.quantityDivider} />
        <View style={styles.quantityCell}>
          <Text style={styles.quantityLabel}>Số lượng đã soạn</Text>
          <View style={styles.quantityAmount}>
            <Text
              style={[
                styles.quantityValue,
                accepted.length>0&&accepted.length<=planned&&styles.completeQuantity,
              ]}
            >
              {accepted.length}
            </Text>
            <Text style={styles.quantityLabel}>sản phẩm</Text>
          </View>
        </View>
      </View>
      {complete ? (
        <P04Info title="Đã đủ số lượng">
          Kiểm tra thông tin và mã đã soạn trước khi gửi phiếu.
        </P04Info>
      ) : (
        <View testID="p05-review-incomplete" style={styles.warning}>
          <P04Icon name="alert-solid" size={27} color={HN_UI.warning} />
          <View style={styles.warningBody}>
            <Text style={styles.warningTitle}>
              {accepted.length < planned
                ? `Còn thiếu ${planned - accepted.length} sản phẩm`
                : 'Chưa khớp kế hoạch từng SKU'}
            </Text>
            <Text style={styles.warningText}>
              {sourceLines
                ? 'Số lượng từng SKU phải khớp phiếu nguồn trước khi gửi.'
                : 'Cần soạn đủ số lượng trước khi gửi duyệt.'}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>Danh sách sản phẩm đã soạn</Text>
        {!!accepted.length && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showCodes ? 'Thu gọn mã đã soạn' : 'Xem tất cả mã đã soạn'
            }
            onPress={() => setShowCodes(v => !v)}
            style={styles.expand}
          >
            <Text style={styles.expandText}>
              {showCodes ? 'Thu gọn' : 'Xem tất cả →'}
            </Text>
          </Pressable>
        )}
      </View>
      <View testID="p05-review-groups" style={styles.groupCard}>
        {groups.map(g => (
          <View key={g.id}>
            <Pressable
              testID={`p05-review-group-${g.id}`}
              style={styles.groupHeader}
              accessibilityRole="button"
              accessibilityLabel={`Thông tin sản phẩm ${g.code} · ${g.label}`}
              disabled={!onRead}
              onPress={()=>onRead?.('Thông tin sản phẩm',`${g.code}\n${g.label}`)}
            >
              <View style={[styles.tile,{backgroundColor:HN_UI.canvas,width:38,height:38}]}>
                <Image source={scannerAssets.outboundProductSample} accessible={false} resizeMode="contain" style={{width:38,height:38}}/>
              </View>
              <View style={styles.groupBody}>
                <ProductText
                  value={g.code}
                  label={`Sản phẩm ${g.code}`}
                  style={styles.value}
                  lineHeight={21}
                  onRead={onRead}
                />
                <ProductText
                  value={g.codes[0] || 'Chưa có mã đã soạn'}
                  label={`Mã sản phẩm ${g.code}`}
                  style={styles.groupCode}
                  lineHeight={18}
                  onRead={onRead}
                />
              </View>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountLabel}>Số lượng</Text>
                <Text style={styles.value}>
                  {g.planned === undefined
                    ? g.codes.length
                    : `${g.codes.length}/${g.planned}`}
                </Text>
              </View>
            </Pressable>

            {showCodes &&
              g.codes.map(raw => (
                <View key={raw} style={styles.codeLine}>
                  <P04Icon name="check" size={16} color={HN_UI.success} />
                  <View style={styles.groupBody}>
                    <ProductText
                      value={raw}
                      label={`Mã đã soạn ${g.code}`}
                      style={styles.value}
                      lineHeight={21}
                      onRead={onRead}
                    />
                  </View>
                </View>
              ))}
          </View>
        ))}
        {!groups.length && (
          <Text style={styles.note}>Chưa có mã được xác minh.</Text>
        )}
      </View>
      {note ? (
        <View style={styles.card}>
          <MetadataRow
            label="Ghi chú"
            value={note}
            icon="document"
            last
            onRead={onRead}
          />
        </View>
      ) : null}
    </>
  );
}
