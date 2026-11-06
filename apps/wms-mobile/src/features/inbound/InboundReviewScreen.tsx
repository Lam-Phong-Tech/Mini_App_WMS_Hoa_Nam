import {HN_UI} from '../../theme/uiKitV3';
import { P04Text as Text } from './P04Text';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { P04Icon as AppIcon } from './P04Icon';
import {ProductPlaceholder} from '../../ui/ProductPlaceholder';
import { SwipeToDelete } from '../../ui/SwipeToDelete';
import {
  canRecord,
  groupBySku,
  totals,
  type InboundDraft,
} from './inboundDraft';
import {
  P04Frame,
  P04Action,
  P04Heading,
  P04Info,
  P04Row,
  p04,
} from './P04Frame';
import type { P04ViewState } from './p04View';
import { formatP04DateTime } from './p04Date';
import { P04ReadableText } from './P04ReadableText';
import {p04Asset} from './P04AssetTheme';
import {P04_INBOUND_CHOICES} from './p04Choices';
export interface InboundReviewScreenProps {
  draft: InboundDraft;
  onRemoveNewestSku?: (sku: string | undefined) => void;
  documentRef: string;
  recorded?: boolean;
  recording?: boolean;
  locked?: boolean;
  revalidationErrors?: { raw: string; message: string }[];
  canSend?: boolean;
  actorName?: string;
  viewState?: P04ViewState;
  onViewChange?: (patch: P04ViewState) => void;
  onRecord: () => void;
  onBackToScan?: () => void;
  onBackToHistory?: () => void;
}
export function InboundReviewScreen({
  draft,
  recorded = false,
  recording = false,
  locked = false,
  revalidationErrors = [],
  documentRef,
  canSend = true,
  actorName,
  onRecord,
  onBackToScan,
  onBackToHistory,
  onRemoveNewestSku,
  viewState,
  onViewChange,
}: InboundReviewScreenProps): React.ReactElement {
  const [expanded, setExpanded] = useState<string[]>(
    viewState?.expandedSkus ?? [],
  );
  useEffect(() => {
    onViewChange?.({ expandedSkus: expanded });
  }, [expanded, onViewChange]);
  const summary = totals(draft),
    groups = groupBySku(draft.codes);
  return (
    <P04Frame
      assetPack
      step={recorded ? undefined : 3}
      initialScrollY={viewState?.scroll?.[3]}
      onScrollPositionChange={y => onViewChange?.({ scroll: { 3: y } })}
      onBack={
        recording || locked
          ? undefined
          : recorded
          ? onBackToHistory
          : onBackToScan
      }
      footer={
        recorded ? (
          <P04Action
            label="Quay lại lịch sử"
            onPress={onBackToHistory ?? (() => undefined)}
            secondary
            disabled={recording || locked}
          />
        ) : (
          <View style={{flexDirection:'row',gap:10}}>
            <P04Action
              label="Quay lại quét mã"
              secondary
              compact
              style={{flex:1}}
              onPress={onBackToScan??(()=>{})}
              disabled={recording||locked||!onBackToScan}
            />
            <P04Action
              label="Gửi phiếu lên Web"
              compact
              style={{flex:1}}
              trailing={<AppIcon name="arrow" assetPack color={HN_UI.onBrand} size={20} />}
              onPress={onRecord}
              loading={recording}
              disabled={!canSend || !canRecord(draft) || recording || locked}
            />
          </View>
        )
      }
    >
      <P04Heading
        title="Thông tin phiếu nhập"
        subtitle="Kiểm tra thông tin trước khi gửi lên Web"
      />
      {revalidationErrors.length > 0 && (
        <P04Info title="Mã cần kiểm tra">
          {revalidationErrors
            .map(row => `${row.raw}\n${row.message}`)
            .join('\n\n')}
        </P04Info>
      )}
      <View testID="p04-review-totals" style={{flexDirection:'row',gap:12,padding:12,borderWidth:1,borderColor:HN_UI.border,borderRadius:9,backgroundColor:HN_UI.canvas}}>
        {[['Loại phiếu','Nhập kho'],['Số lượng',String(summary.totalScanned)],['Số SKU',String(summary.skuCount)]].map(([label,value])=>(
          <View key={label} style={{flex:1,minWidth:0,gap:3}}>
            <Text style={p04.small}>{label}</Text>
            <Text style={p04.rowValue}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <P04Row
          icon="home"
          tone="documents"
          label="Kho nhập"
          value={draft.warehouseName ?? 'Chưa xác minh'}
          trailing={<AppIcon name="lock" color={HN_UI.textSecondary} size={17} />}
        />
        <P04Row icon="warehouse" label="Mã phiếu" value={documentRef} tone="documents" />
        <P04Row icon="box" label="Loại nhập" value={P04_INBOUND_CHOICES.find(choice=>choice.id===draft.inboundCategory)?.label??'Chưa xác minh'} tone="documents" />
        <P04Row
          icon="warehouse"
          tone="documents"
          label="Nhà cung cấp"
          value={draft.supplierName ?? 'Không chọn nhà cung cấp'}
        />
        <P04Row
          icon="calendar"
          tone="documents"
          label="Ngày tạo"
          value={formatP04DateTime(draft.createdAt) ?? 'Chưa xác minh'}
        />
        <P04Row
          icon="user"
          tone="documents"
          label="Người tạo"
          value={actorName ?? 'Chưa xác minh'}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text style={[p04.h2, { fontSize: 16, flex: 1, minWidth: 0 }]}>Danh sách sản phẩm hợp lệ</Text>
        <Text style={p04.small}>Tổng: {summary.totalScanned}</Text>
      </View>
      {!recorded && onRemoveNewestSku && (
        <Text style={p04.small}>Vuốt trái để xoá mã mới nhất của SKU</Text>
      )}
      {groups.map((g, i) => {
        const key = g.sku ?? 'unknown-' + i,
          isOpen = expanded.includes(key),
          quantity = g.codes.reduce((n, c) => n + c.quantity, 0);
        return (
          <View key={key} style={{ gap: 0 }}>
            {onRemoveNewestSku && !recorded ? (
              <SwipeToDelete
                onDelete={() => onRemoveNewestSku(g.sku)}
                accessibilityLabel={g.sku ?? 'SKU chưa xác minh'}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${g.sku ?? 'Chưa xác minh SKU'} · ${
                    g.codes.length
                  } mã · số lượng ${quantity}`}
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() =>
                    setExpanded(current =>
                      isOpen
                        ? current.filter(x => x !== key)
                        : [...current, key],
                    )
                  }
                  style={[p04.row, { minHeight: 60, padding: 7, gap: 14, borderRadius: 9, borderColor: HN_UI.border }]}
                >
                  <View style={[p04.tile,p04Asset.productTile]}>
                    <ProductPlaceholder/>
                  </View>
                  <View style={p04.rowBody}>
                    <Text style={p04.rowValue}>
                      {g.sku ?? 'Chưa xác minh SKU'}
                    </Text>
                    <Text style={p04.small}>
                      {g.codes.length} mã ·{' '}
                      {isOpen ? 'Thu gọn' : 'Xem mã/serial'}
                    </Text>
                  </View>
                  <View>
                    <Text style={p04.small}>Số lượng</Text>
                    <Text style={[p04.rowValue, { textAlign: 'right' }]}>
                      {quantity}
                    </Text>
                  </View>
                  <AppIcon name={isOpen?'chevron-down':'chevron-right'} color={HN_UI.textLink} size={18}/>
                </Pressable>
              </SwipeToDelete>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${g.sku ?? 'Chưa xác minh SKU'} · ${
                  g.codes.length
                } mã · số lượng ${quantity}`}
                accessibilityState={{ expanded: isOpen }}
                onPress={() =>
                  setExpanded(current =>
                    isOpen ? current.filter(x => x !== key) : [...current, key],
                  )
                }
                style={[p04.row, { minHeight: 60, padding: 7, gap: 14, borderRadius: 9, borderColor: HN_UI.border }]}
              >
                <View style={[p04.tile,p04Asset.productTile]}>
                  <ProductPlaceholder/>
                </View>
                <View style={p04.rowBody}>
                  <Text style={p04.rowValue}>
                    {g.sku ?? 'Chưa xác minh SKU'}
                  </Text>
                  <Text style={p04.small}>
                    {g.codes.length} mã · {isOpen ? 'Thu gọn' : 'Xem mã/serial'}
                  </Text>
                </View>
                <View>
                  <Text style={p04.small}>Số lượng</Text>
                  <Text style={[p04.rowValue, { textAlign: 'right' }]}>
                    {quantity}
                  </Text>
                </View>
                <AppIcon name={isOpen?'chevron-down':'chevron-right'} color={HN_UI.textLink} size={18}/>
              </Pressable>
            )}
            {isOpen && (
              <View
                style={{
                  padding: 12,
                  gap: 8,
                  backgroundColor: HN_UI.surface,
                  borderWidth: 1,
                  borderColor: HN_UI.border,
                  borderRadius: 8,
                }}
              >
                {g.codes.map(c => (
                  <View key={c.key} style={{ flexDirection: 'row', gap: 12 }}>
                    <Text selectable style={[p04.text, { flex: 1 }]}>
                      {c.item ?? c.raw}
                    </Text>
                    <Text style={p04.small}>SL {c.quantity}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {!!draft.note && (
        <View style={{ gap: 4 }}>
          <Text style={p04.h2}>Ghi chú</Text>
          <P04ReadableText
            value={draft.note}
            label="Ghi chú"
            textStyle={p04.text}
          />
        </View>
      )}
      <P04Info title="Tồn kho chưa thay đổi">
        {
          'Gửi duyệt không làm thay đổi tồn kho.\nChỉ cập nhật sau khi ghi sổ thành công trên Web.'
        }
      </P04Info>
    </P04Frame>
  );
}

