import {requireValue, uuid, type Document, type Raw} from './contract';
import {parseDocumentTimestamp} from '../../../services/wms/documentTimestamps';

export interface FutureMilestone {
  availability: 'RECORDED' | 'NOT_RECORDED';
  occurred_at: string | null;
  event_id: string | null;
  actor: {id: string | null; name_snapshot: string | null; job_title_snapshot: string | null} | null;
  description: string | null;
  timestamp_source: string | null;
}
const obj = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {};
const nullableText = (v: unknown) => v === null || typeof v === 'string';

export function futureEventDescription(value: string): string {
  const labels: Record<string,string> = {
    'Document created by canonical owner': 'Đã tạo chứng từ.',
    'User explicitly confirmed document check': 'Người thực hiện đã xác nhận kiểm tra chứng từ.',
    'Document submitted to Web by canonical RECORD owner': 'Đã gửi phiếu lên Web bằng thao tác ghi nhận.',
  };
  return Object.hasOwn(labels,value) ? labels[value] : value;
}

/** An explicit persisted proof, independent of readiness, current catalog or v1 placeholders. */
export function futureMilestones(d: Document): Record<string, FutureMilestone> | null {
  const value = obj(d.p12.event_evidence);
  if(!Object.keys(value).length) return null;
  requireValue(value.contract === 'p12-event-evidence-v2' && obj(d.meta?.p12).event_evidence_contract === value.contract
    && value.semantics === 'PERSISTED_FUTURE_EVENTS_NOT_CURRENT_STATUS', 'FUTURE_EVENT_CONTRACT_MISMATCH');
  const result: Record<string, FutureMilestone> = {};
  for(const [key,event] of [['created','CREATED'],['checked','CHECKED'],['sent','SENT']]) {
    const row=obj(obj(value.milestones)[key]), actor=row.actor===null?null:obj(row.actor);
    const recorded=row.availability==='RECORDED';
    requireValue(['RECORDED','NOT_RECORDED'].includes(String(row.availability)) && row.event_key===event
      && row.subject_type==='stock_document' && row.subject_id===d.id && row.warehouse_id===d.warehouseId
      && (recorded ? uuid(row.event_id) && Number.isSafeInteger(row.document_version) && Number(row.document_version)>0
        && Number(row.document_version)<=Number(d.source.version)
        && parseDocumentTimestamp(row.occurred_at).status==='RECORDED'
        && row.timestamp_source==='stock_document_event_evidence.occurred_at'
        && actor!==null && (actor.id===null || uuid(actor.id)) && nullableText(actor.name_snapshot)
        && nullableText(actor.job_title_snapshot) && typeof row.description==='string'
        : row.event_id===null && row.occurred_at===null && row.actor===null && row.description===null)
      && row.snapshot_policy==='FUTURE_EVENT_CAPTURE_NO_HISTORICAL_BACKFILL', 'FUTURE_EVENT_IDENTITY_MISMATCH');
    result[key==='sent'?'sent_to_web':key]=row as unknown as FutureMilestone;
  }
  return result;
}

export function warrantyIntakeSource(d: Document) {
  const value=obj(d.source.product_source);
  if(!Object.keys(value).length) return null;
  requireValue(value.contract==='warranty-product-snapshot-v1' && value.case_id===d.id
    && value.capture_policy==='AT_WARRANTY_INTAKE_NOT_CURRENT_CATALOG', 'WARRANTY_SNAPSHOT_CONTRACT_MISMATCH');
  requireValue(value.availability==='RECORDED'||value.availability==='NOT_RECORDED','WARRANTY_SNAPSHOT_CONTRACT_MISMATCH');
  for(const field of ['item_id','sku_id']) requireValue(value[field]===null||uuid(value[field]),'WARRANTY_SNAPSHOT_IDENTITY_MISMATCH');
  for(const field of ['serial_number','sku_code','sku_name','temporary_item_code']) requireValue(nullableText(value[field]),'WARRANTY_SNAPSHOT_FIELD_INVALID');
  if(value.availability==='RECORDED') requireValue(parseDocumentTimestamp(value.captured_at).status==='RECORDED'
    && value.timestamp_source==='warranty_product_snapshots.captured_at'
    && value.item_id===(d.source.item_id??null) && value.sku_id===(d.source.product_id??null), 'WARRANTY_SNAPSHOT_IDENTITY_MISMATCH');
  return value;
}
