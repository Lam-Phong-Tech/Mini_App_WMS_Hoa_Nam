import {HN_UI} from '../../theme/uiKitV3';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { HN_HOME } from '../../ui/hnHomeTokens';
import type { WebQueuePage, WebQueueRow } from '../../services/wms/p13WebQueue';
import { availabilityText, fieldText } from '../releasedReads/ReadValue';
import {formatVietnamDate,formatVietnamClock} from '../../time/vietnamTime';
import {
  P13OperationIcon,
  P13ReadableText,
} from './P13NotificationPresentation';

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.canvas,
    borderRadius: 12,
    marginBottom: 20,
  },
  bannerHeading: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    color: HN_HOME.ink,
  },
  bannerText: { fontSize: 16, lineHeight: 24, color: HN_UI.textSecondary, marginTop: 6 },
  grow: { flex: 1, minWidth: 0 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    gap: 6,
    borderRadius: 12,
    backgroundColor: HN_UI.surfaceSunken,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  selectedTab: { backgroundColor: HN_UI.primary },
  tabText: {
    color: HN_UI.textLink,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  selectedText: { color: HN_UI.onBrand, fontWeight: '600' },
  row: {
    padding: 18,
    borderBottomWidth: 1,
    borderColor: HN_HOME.line,
    backgroundColor: HN_UI.surface,
    gap: 16,
    borderRadius:12,
    marginBottom:16,
  },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  number: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  muted: { fontSize: 16, lineHeight: 24, color: HN_HOME.muted },
  status: {
    maxWidth: 170,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: HN_UI.warningSoft,
  },
  terminal: { backgroundColor: HN_UI.canvas },
  statusText: {
    fontSize: 14,
    lineHeight: 21,
    color: HN_UI.warning,
    fontWeight: '600',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: HN_HOME.line,
  },
  metaCell:{flex:1,minWidth:0,flexDirection:'row',gap:8,alignItems:'flex-start'},
  metaDivider:{borderLeftWidth:1,borderLeftColor:HN_UI.border,paddingLeft:8},
  metaCopy:{flex:1,minWidth:0,gap:4},
  metaValue:{fontSize:14,lineHeight:22,color:HN_UI.textPrimary},
  metaHint:{fontSize:12,lineHeight:18,color:HN_UI.textSecondary},
  section: { gap: 12, marginBottom: 24 },
  title: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    color: HN_HOME.ink,
  },
  field: { fontSize: 16, lineHeight: 24, color: HN_HOME.ink },
  rule: { borderTopWidth: 1, borderColor: HN_HOME.line, paddingTop: 20 },
});
/** Legacy responses remain absent; candidate projection is strictly decoded by the read owner. */
export function P13QueueMetadata({row}:{row:WebQueueRow}){
  const day=row.created.supplied?formatVietnamDate(row.created.value):fieldText(row.created);
  const clock=row.created.supplied?formatVietnamClock(row.created.value):'Ngày tạo';
  const projection=row.projection?.available?row.projection:undefined;
  const creator=projection?.creator.name;
  const creatorLabel=creator?.supplied?creator.value:creator?.status==='REDACTED_PII_PERMISSION'?'Được bảo vệ':creator?availabilityText(creator.status):'—';
  return <View style={styles.meta} testID="P13.queue.metadata">
    <View style={styles.metaCell}><HnHomeIcon name="box" size={20} color={HN_UI.textSecondary}/><View style={styles.metaCopy}><Text style={styles.metaValue}>{projection?projection.lineCount+' dòng':'—'}</Text><Text style={styles.metaHint}>Dòng chứng từ</Text></View></View>
    <View style={[styles.metaCell,styles.metaDivider]}><HnHomeIcon name="user" size={20} color={HN_UI.textSecondary}/><View style={styles.metaCopy}><Text style={styles.metaValue}>{creatorLabel}</Text><Text style={styles.metaHint}>Người tạo</Text></View></View>
    <View style={[styles.metaCell,styles.metaDivider]}><HnHomeIcon name="calendar" size={20} color={HN_UI.textSecondary}/><View style={styles.metaCopy}><Text style={styles.metaValue}>{day}</Text><Text style={styles.metaHint}>{clock}</Text></View></View>
  </View>;
}
export const P13_HANDOFF_LABELS = {
  WAITING_WEB_POST: 'Chờ xử lý trên Web',
  POSTED: 'Đã ghi sổ',
  CANCELLED: 'Đã hủy',
  UNKNOWN: 'Chưa xác định',
};
const typeLabel = (row: WebQueueRow) =>
  row.target.kind === 'inbound'
    ? 'Phiếu nhập kho'
    : row.target.kind === 'outbound'
    ? 'Phiếu xuất kho'
    : 'Hồ sơ bảo hành';

export function P13WebBanner() {
  return (
    <View style={styles.banner}>
      <HnHomeIcon name="document" size={24} color={HN_HOME.ink} />
      <View style={styles.grow}>
        <Text style={styles.bannerHeading}>Xử lý chứng từ trên Web</Text>
        <Text style={styles.bannerText}>
          Các phiếu đã gửi từ App, chờ xử lý trên Web.
        </Text>
      </View>
    </View>
  );
}
export function P13QueueSourceTabs({
  source,
  page,
  busy,
  onSelect,
}: {
  source: string;
  page?: WebQueuePage;
  busy: boolean;
  onSelect(source: string): void;
}) {
  return (
    <View style={styles.tabs}>
      {[
        ['ALL', 'Tất cả'],
        ['INBOUND', 'Phiếu nhập'],
        ['OUTBOUND', 'Phiếu xuất'],
      ].map(([value, label]) => {
        const facet = page?.facets[value];
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: source === value, disabled: busy }}
            disabled={busy}
            onPress={() => onSelect(value)}
            style={[styles.tab, source === value && styles.selectedTab]}
          >
            <Text
              style={[styles.tabText, source === value && styles.selectedText]}
            >
              {label} ({facet?.supplied ? facet.value : '—'})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function P13HandoffBadge({ row }: { row: WebQueueRow }) {
  const state = row.handoff.supplied ? row.handoff.value.state : null;
  const ink=state==='POSTED'?HN_UI.success:state==='WAITING_WEB_POST'||state==='UNKNOWN'?HN_UI.warning:HN_UI.textSecondary;
  const soft=state==='POSTED'?HN_UI.successSoft:state==='WAITING_WEB_POST'||state==='UNKNOWN'?HN_UI.warningSoft:HN_UI.surfaceSunken;
  return (
    <View
      style={[styles.status,{backgroundColor:soft}]}
    >
      <Text style={[styles.statusText,{color:ink}]}>
        {state
          ? (row.handoff.supplied?row.handoff.value.current?.label:undefined)??P13_HANDOFF_LABELS[state]
          : row.handoff.supplied
          ? 'Chưa xác định'
          : availabilityText(row.handoff.status)}
      </Text>
    </View>
  );
}
export function P13WebQueueRow({
  row,
  busy,
  onPress,
}: {
  row: WebQueueRow;
  busy: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Bàn giao ' + fieldText(row.number)}
      disabled={busy}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.summary}>
        <P13OperationIcon kind={row.target.kind} />
        <View style={styles.grow}>
          <Text numberOfLines={2} style={styles.number}>
            {fieldText(row.number)}
          </Text>
          <Text style={styles.muted}>{typeLabel(row)}</Text>
        </View>
        <P13HandoffBadge row={row} />
        <HnHomeIcon name="chevron" size={20} color={HN_HOME.ink} />
      </View>
      <P13QueueMetadata row={row}/>
    </Pressable>
  );
}
export function P13WebQueueDetail({
  row,
  warehouseName,
  onOpenProducts,
}: {
  row: WebQueueRow;
  warehouseName?: string;
  statusLabel: string;
  onOpenProducts?:()=>void;
}) {
  return (
    <>
      <View style={styles.section}>
        <View style={styles.summary}>
          <P13OperationIcon kind={row.target.kind} />
          <View style={styles.grow}>
            <P13ReadableText
              text={fieldText(row.number)}
              label="Mã chứng từ"
              lines={2}
              style={styles.number}
            />
            <Text style={styles.muted}>{typeLabel(row)}</Text>
          </View>
          <P13HandoffBadge row={row} />
        </View>
        <P13QueueMetadata row={row}/>
      </View>
      <View style={styles.section}>
        <View style={styles.summary}>
          <P13OperationIcon kind="documents" />
          <View style={styles.grow}>
            <Text style={styles.muted}>Kho</Text>
            <P13ReadableText
              text={warehouseName ?? 'Chưa có tên kho được xác minh'}
              label="Kho chứng từ"
              lines={2}
              style={styles.title}
            />
          </View>
        </View>
      </View>
      <View style={styles.banner}>
        <View style={styles.grow}>
          <Text style={styles.bannerHeading}>
            {row.handoff.supplied
              ? row.handoff.value.current?.label??P13_HANDOFF_LABELS[row.handoff.value.state]
              : availabilityText(row.handoff.status)}
          </Text>
          <Text style={styles.bannerText}>
            {row.handoff.supplied &&
            row.handoff.value.state === 'WAITING_WEB_POST'
              ? 'Phiếu đã gửi, chưa ghi sổ. Tồn kho chỉ cập nhật sau khi ghi sổ thành công trên Web.'
              : 'Mở chứng từ để đối chiếu trạng thái hiện tại. App không thực hiện duyệt hoặc ghi sổ phiếu nhập/xuất.'}
          </Text>
          {row.handoff.supplied && row.handoff.value.current?.versionMatch === false ? (
            <Text style={styles.bannerText}>Phiên bản hiện tại chưa được xác nhận đã gửi. Đối chiếu chứng từ gốc trước khi tiếp tục.</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.section}>
        <Pressable accessibilityRole="button" accessibilityLabel="Xem đầy đủ sản phẩm trong chứng từ gốc" disabled={!onOpenProducts} onPress={onOpenProducts} style={[styles.summary,{minHeight:48,alignItems:'center'}]}><Text style={[styles.title,{flex:1}]}>Danh sách hàng hóa</Text><HnHomeIcon name="chevron" size={20}/></Pressable>
        <Text style={styles.muted}>
          {row.projection?.available?row.projection.lineCount+' dòng hàng theo chứng từ.':'Chưa có dữ liệu hàng hóa tại nguồn bàn giao.'}
        </Text>
        {row.projection?.available&&<View style={{gap:8}}>{row.projection.quantities.map((group,index)=><Text key={JSON.stringify([group.unit,group.skuId])} style={styles.field}>{group.unit??'Nhóm chưa có đơn vị '+(index+1)} · Kế hoạch: {group.planned===null?'Chưa ghi nhận':String(group.planned)} · Đã quét: {group.scanned===null?'Chưa ghi nhận':String(group.scanned)}</Text>)}<Text style={styles.muted}>Số lượng được tách theo đơn vị SKU hiện tại; không cộng chéo đơn vị.</Text></View>}
      </View>
      <View style={styles.section}>
        <Text style={styles.title}>Ghi chú</Text>
        <P13ReadableText text="—" label="Ghi chú" testID="P13.queue.note" style={styles.field} />
      </View>
    </>
  );
}
