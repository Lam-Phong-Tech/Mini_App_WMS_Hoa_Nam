import {HN_UI} from '../../../theme/uiKitV3';
import type { Document, Source } from './contract';
import {STOCK_WAITING_WEB_LABEL} from '../../../ui/stockWorkflowLabels';
export function documentSnapshotCaption(doc:Document):string{
  const version=doc.source.version;
  return 'Bản chứng từ đã tải · Phiên bản '+(typeof version==='string'||typeof version==='number'?String(version):'Chưa xác minh');
}

export interface DocumentStatusPresentation {
  label: string;
  color: string;
  background: string;
}
const neutral = { color: HN_UI.textMuted, background: HN_UI.canvas };
const positive = { color: HN_UI.success, background: HN_UI.successSoft };
const active = { color: HN_UI.textLink, background: HN_UI.canvas };

/** Flat warranty owner fields are not the nested stock-document projection. */
export function warrantyOwnerPresentation(doc: Document) {
  const r = doc.source;
  const value = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
  const scoped = r.warehouse_id === doc.warehouseId;
  return {
    warehouse: (scoped && (value(r.warehouse_name) ?? value(r.warehouse_code))) || doc.warehouseId,
    creator: value(r.created_by),
    creatorLabel: 'Mã người tạo',
    creatorNote: 'Nguồn: created_by trên hồ sơ bảo hành. Response chưa cung cấp tên người tạo.',
  };
}
const stock: Record<string, string> = {
  DRAFT: 'Nháp',
  SCANNING: 'Đang quét',
  WAITING_APPROVAL: STOCK_WAITING_WEB_LABEL,
  POSTED: 'Đã ghi sổ',
  CANCELLED: 'Đã hủy',
};
const warranty: Record<string, string> = {
  RECEIVED: 'Đã tiếp nhận',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa chữa',
  COMPLETED: 'Chờ bàn giao',
  RETURNED: 'Đã trả khách',
  CANCELLED: 'Đã hủy',
};

/** Display only. Never changes canonical/readiness or establishes Web handoff. */
export function canonicalStatusPresentation(
  type: Source,
  canonical: string | null | undefined,
): DocumentStatusPresentation {
  const labels = type === 'warranty' ? warranty : stock;
  const label = labels[canonical ?? ''] ?? 'Chưa xác minh trạng thái';
  const palette =
    canonical === 'POSTED' || canonical === 'RETURNED'
      ? positive
      : canonical === 'CANCELLED' || !labels[canonical ?? '']
      ? neutral
      : active;
  return { label, ...palette };
}

export function documentOwnerStatusPresentation(
  doc: Document,
): DocumentStatusPresentation {
  if(doc.displayStatus?.availability==='STALE')return {label:'Cần đọc lại phiên bản',color:HN_UI.warning,background:HN_UI.warningSoft};
  const current = canonicalStatusPresentation(
    doc.type,
    doc.p12.status.canonical,
  );
  // Only normalized projection from the strict aggregate parser is accepted.
  // Do not trust arbitrary detail/source.display_status or reuse a list label
  // for a newer detail response with a different canonical state.
  if (doc.displayStatus?.availability === 'MAPPED')
    return {
      ...current,
      ...(['WAITING_APPROVAL', 'READY_TO_ISSUE'].includes(
        doc.displayStatus.value ?? '',
      )
        ? { color: HN_UI.warning, background: HN_UI.warningSoft }
        : {}),
      label: doc.type!=='warranty'&&['WAITING_APPROVAL','READY_TO_ISSUE'].includes(doc.displayStatus.value??'')?STOCK_WAITING_WEB_LABEL:doc.displayStatus.label!,
    };
  if (doc.displayStatus)
    return { ...neutral, label: 'Chờ xác minh trạng thái' };
  if(doc.type!=='warranty'&&!['POSTED','CANCELLED'].includes(doc.p12.status.canonical??'')&&(
    doc.p12.status.mini_app==='WAITING_APPROVAL'||doc.type==='outbound'&&doc.p12.status.mini_app==='READY_TO_ISSUE'&&doc.p12.status.readiness.ready_for_issue===true
  ))return {label:STOCK_WAITING_WEB_LABEL,color:HN_UI.warning,background:HN_UI.warningSoft};
  return current;
}
/** The visible Web label is a separate validated handoff axis, never readiness. */
export function documentStatusPresentation(doc:Document):DocumentStatusPresentation{
  const owner=documentOwnerStatusPresentation(doc);
  if(doc.displayStatus?.availability==='STALE'||doc.displayStatus?.availability==='UNAVAILABLE')return owner;
  if(doc.type!=='warranty'&&doc.webHandoff?.state==='WAITING_WEB_POST')return {label:doc.webHandoff.label,color:HN_UI.warning,background:HN_UI.warningSoft};
  return owner;
}
export function documentPartnerLabel(doc:Document):string{
  const p=doc.partnerSnapshot;
  if(p){
    if(p.role==='WITHHELD')return 'Thông tin khách trong hồ sơ';
    if(p.displayName!==null)return p.displayName;
    if(p.supplier?.status==='NOT_SELECTED')return 'Không chọn nhà cung cấp';
    if(p.supplier?.status==='SOURCE_UNAVAILABLE')return 'Nguồn nhà cung cấp chưa sẵn sàng';
    return p.role==='SUPPLIER'?'Chưa ghi nhận tên nhà cung cấp':'Chưa ghi nhận người nhận';
  }
  if(doc.type==='warranty')return 'Thông tin khách trong hồ sơ';
  const partner=doc.source.partner as {display_name?:unknown}|undefined;
  return typeof partner?.display_name==='string'?partner.display_name:'Chưa xác minh đối tác';
}
