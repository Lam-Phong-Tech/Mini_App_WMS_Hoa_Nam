import {HN_UI} from '../../theme/uiKitV3';
import {P04Text as Text} from './P04Text';
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {P04Icon} from './P04Icon';
import {Dialog} from '../../ui/Dialog';
import {P04Frame, P04Action, P04Info, P04Row} from './P04Frame';
import type {P04ViewState} from './p04View';
import {formatP04DateTime} from './p04Date';
import {P04ReadableText} from './P04ReadableText';

export type InboundResultOutcome = 'posted' | 'queued' | 'failed' | 'reconcile';
export interface InboundResultScreenProps {
  documentName: string;
  documentRef: string;
  /** Accepted item quantity from the saved snapshot; not the raw-code count. */
  quantity?: number | null;
  /** Accepted code count, separate from the item/BOX quantity. */
  codeCount?: number;
  outcome: InboundResultOutcome;
  reason?: string;
  warehouseName?: string;
  /** Display name from the saved supplier binding; absent/null stays unknown. */
  supplierName?: string | null;
  /** The original server draft/document creation timestamp, never sentAt/now. */
  createdAt?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  sentAt?: string;
  postedOnWeb?: boolean;
  viewState?: P04ViewState;
  onViewChange?: (patch: P04ViewState) => void;
  onHome: () => void;
  onNext: () => void;
  onDocument?: () => void;
  onHistory?: () => void;
}
const s = StyleSheet.create({
  content: {padding: 0, gap: 14},
  hero: {alignItems: 'center', paddingTop: 24, paddingBottom: 4, gap: 14},
  monitor: {width: 48, height: 48, borderRadius: 10, backgroundColor: HN_UI.successSoft, alignItems: 'center', justifyContent: 'center'},
  warningMark: {width: 56, height: 56, borderRadius: 12, backgroundColor: HN_UI.warningSoft, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 22, lineHeight: 30, textAlign: 'center', fontWeight: '700', color: HN_UI.textPrimary},
  description: {color: HN_UI.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center'},
  summary: {paddingHorizontal: 14, borderWidth: 1, borderColor: HN_UI.border, borderRadius: 10, backgroundColor: HN_UI.surface},
  summaryRow: {minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8},
  separator: {borderBottomWidth: 1, borderBottomColor: HN_UI.border},
  label: {width: '40%', flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 20, color: HN_UI.textSecondary},
  valueContainer: {flex: 1, minWidth: 0},
  value: {fontSize: 14, lineHeight: 20, textAlign: 'right', color: HN_UI.textPrimary, fontWeight: '600'},
  pills: {flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8},
  pill: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, backgroundColor: HN_UI.warningSoft, paddingHorizontal: 10, paddingVertical: 7},
  status: {fontSize: 13, lineHeight: 18, fontWeight: '600', color: HN_UI.warning},
  postedPill: {backgroundColor: HN_UI.successSoft},
  postedStatus: {color: HN_UI.success},
  action: {minHeight: 52, borderRadius: 10},
  secondaryActions: {flexDirection: 'row', gap: 8},
  secondaryAction: {flex: 1, minWidth: 0},
  notice: {padding: 14, borderRadius: 8, backgroundColor: HN_UI.selected},
  noticeText: {fontSize: 13, lineHeight: 20, color: HN_UI.textSecondary},
  errors: {gap: 4},
});
const knownText = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length > 0 ? value : 'Chưa xác minh';

export function InboundResultScreen({
  documentName, documentRef, codeCount, outcome, reason, warehouseName,
  sentAt, postedOnWeb = false,
  viewState, onViewChange, onHome, onNext, onDocument, onHistory,
}: InboundResultScreenProps): React.ReactElement {
  const [dependency, setDependency] = useState(false);
  // "posted" is the existing owner outcome for a confirmed RECORD receipt. It
  // does not mean Post Receipt; only postedOnWeb can confirm that later state.
  const success = outcome === 'posted';
  const presentation = {
    posted: {
      title: postedOnWeb ? 'Phiếu nhập đã ghi sổ' : 'Đã gửi phiếu nhập',
      body: postedOnWeb
        ? 'Phiếu nhập kho đã được ghi sổ trên Web.'
        : 'Phiếu nhập kho đã được tạo và gửi duyệt thành công. Phiếu đang chờ xử lý trên Web.',
      status: postedOnWeb ? 'Đã ghi sổ trên Web' : 'Chờ xử lý trên Web',
    },
    queued: {title: 'Phiếu chưa được gửi', body: 'Dữ liệu vẫn được giữ trên thiết bị. Chưa xác nhận Web đã nhận.', status: 'Chờ gửi — chưa xác nhận'},
    failed: {title: 'Web từ chối phiếu nhập', body: 'Dữ liệu được giữ nguyên để kiểm tra.', status: 'Bị từ chối — chưa tạo phiếu'},
    reconcile: {title: 'Cần kiểm tra kết quả gửi', body: 'Chưa xác định Web đã ghi nhận hay chưa. Giữ nguyên phiếu và yêu cầu để đối chiếu.', status: 'UNKNOWN — cần đối chiếu'},
  }[outcome];
  const rows = [
    {key: 'number', label: 'Mã phiếu', value: knownText(documentRef)},
    {key: 'warehouse', label: 'Kho', value: knownText(warehouseName)},
    {key: 'recorded', label: 'Đã ghi nhận', value: typeof codeCount === 'number' && Number.isSafeInteger(codeCount) && codeCount >= 0 ? `${codeCount} mã` : 'Chưa xác minh'},
    {key: 'sent', label: 'Thời gian gửi', value: formatP04DateTime(sentAt) ?? 'Chưa xác minh'},
  ];
  return (
    <P04Frame
      assetPack
      title={success ? 'Đã gửi phiếu' : 'Nhập kho'}
      onBack={onHome}
      initialScrollY={viewState?.scroll?.[4]}
      onScrollPositionChange={y => onViewChange?.({scroll: {4: y}})}
      contentStyle={success ? s.content : undefined}
      footer={success ? (
        <>
          <P04Action label={`Xem phiếu ${documentRef}`} accessibilityLabel={`Xem phiếu ${documentRef}`}
            onPress={onDocument ?? (() => setDependency(true))}
            style={s.action}/>
          <View style={s.secondaryActions}>
            <P04Action label="Nhập lượt mới" onPress={onNext} secondary compact style={s.secondaryAction}/>
            <P04Action label="Xem lịch sử" onPress={onHistory ?? (()=>setDependency(true))} secondary compact style={s.secondaryAction}/>
            <P04Action label="Trang chủ" onPress={onHome} secondary compact style={s.secondaryAction}/>
          </View>
        </>
      ) : (
        <>
          {outcome === 'failed' && <P04Action label="Nhập lượt mới" onPress={onNext} secondary/>}
          <P04Action label="Trang chủ" onPress={onHome} secondary/>
        </>
      )}
    >
      <View style={s.hero}>
        {success ? (
          <View style={s.monitor} testID="p04-result-success-monitor">
            <P04Icon name="monitor" color={HN_UI.success} size={26}/>
          </View>
        ) : <View style={s.warningMark}><P04Icon name="alert" color={HN_UI.warning} size={34}/></View>}
        <Text style={s.title}>{presentation.title}</Text>
        {success ? <>
          <View style={s.pills}>
            <View style={[s.pill,s.postedPill]}><P04Icon name="check" color={HN_UI.success} size={15}/><Text style={[s.status,s.postedStatus]}>Đã gửi phiếu</Text></View>
            <View style={[s.pill,postedOnWeb && s.postedPill]}><P04Icon name="clock" color={postedOnWeb?HN_UI.success:HN_UI.warning} size={15}/><Text style={[s.status,postedOnWeb && s.postedStatus]}>{presentation.status}</Text></View>
          </View>
          <Text style={s.description}>{postedOnWeb ? 'Đã ghi sổ trên Web.' : 'Chưa ghi sổ · Chưa đổi tồn.'}</Text>
        </> : <Text style={s.description}>{presentation.body}</Text>}
      </View>
      {success ? (
        <View style={s.summary} testID="p04-result-summary">
          {rows.map(row => (
            <View key={row.key} testID={`p04-result-row-${row.key}`} style={[s.summaryRow, row.key !== 'sent' && s.separator]}>
              <Text style={s.label}>{row.label}</Text>
              <View style={s.valueContainer}>
                <P04ReadableText value={row.value} label={row.label} textStyle={s.value}/>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={s.errors}>
          <P04Row label="Yêu cầu đang giữ" value={documentRef}/>
          <P04Row icon="home" label="Kho" value={warehouseName ?? 'Chưa xác minh'}/>
          <P04Row icon="box" label="Đã ghi nhận" value="Chưa xác nhận"/>
          <P04Row icon="clock" label="Thời gian gửi" value={formatP04DateTime(sentAt) ?? 'Chưa xác minh'}/>
          <P04Row label="Tên phiếu" value={documentName}/>
          <P04Row label="Trạng thái" value={presentation.status}/>
        </View>
      )}
      {success && <View style={s.notice}><Text style={s.noticeText}>{postedOnWeb ? 'Phiếu đã được ghi sổ thành công trên Web.' : 'Tồn kho chỉ cập nhật sau khi phiếu được ghi sổ thành công trên Web.'}</Text></View>}
      {!!reason && !success && <P04Info title="Thông tin đối chiếu">{reason}</P04Info>}
      <Dialog visible={dependency} title="Chưa kết nối chức năng"
        message={`Chưa có đích xem chứng từ cho phiếu ${documentRef}. Thông tin phiếu vẫn được giữ.`}
        onDismiss={() => setDependency(false)}>
        <P04Action label="Đóng" onPress={() => setDependency(false)}/>
      </Dialog>
    </P04Frame>
  );
}
