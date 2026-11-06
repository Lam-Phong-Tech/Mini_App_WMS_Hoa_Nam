/** Optional, detail-only additive projection. Invalid metadata never empties the parent. */
import {validSupplierRecordedAt} from './partnerSnapshot';
const CONTRACT='p12-owner-projection-v1', REVISION='p12-owner-projection-r1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const id=v=>v===null||uuid(v);
const text=(v,max)=>v===null||(typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max);
const statuses=['SNAPSHOT_RECORDED','NOT_SELECTED','NOT_RECORDED','SOURCE_UNAVAILABLE','NOT_APPLICABLE'];
const creatorStatuses=['ACTOR_NOT_RECORDED','REDACTED_PII_PERMISSION','SOURCE_UNAVAILABLE','NOT_RECORDED','CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT'];
export function parseOwnerProjection(value,marker,parent,rights=[]){
  if(value===undefined&&marker===undefined)return{ownerProjection:null,ownerProjectionIssue:'NOT_PROVIDED'};
  if(marker!==CONTRACT)return{ownerProjection:null,ownerProjectionIssue:'UNVERIFIED'};
  const s=value?.supplier,c=value?.creator;
  const valid=object(value)&&value.contract===CONTRACT&&value.revision===REVISION&&
    value.document_id===parent.id&&value.warehouse_id===parent.warehouseId&&value.source===parent.type.toUpperCase()&&
    object(s)&&statuses.includes(s.status)&&statuses.includes(s.name_status)&&id(s.id)&&text(s.name,200)&&
    (s.version===null||Number.isSafeInteger(s.version)&&s.version>=0)&&
    (s.recorded_at===null||validSupplierRecordedAt(s.recorded_at))&&
    [null,'mini_app_inbound_record_metadata'].includes(s.source)&&
    (s.status!=='SNAPSHOT_RECORDED'||s.source==='mini_app_inbound_record_metadata')&&
    (s.name===null?s.name_status!=='SNAPSHOT_RECORDED':s.name_status==='SNAPSHOT_RECORDED'&&s.status==='SNAPSHOT_RECORDED')&&
    (s.status==='SNAPSHOT_RECORDED'||s.status==='NOT_SELECTED'?
      s.status!=='NOT_SELECTED'||s.id===null&&s.name===null&&s.name_status==='NOT_SELECTED':
      [s.id,s.name,s.version,s.recorded_at].every(v=>v===null))&&
    (parent.type!=='outbound'||s.status==='NOT_APPLICABLE')&&
    object(c)&&id(c.actor_id)&&[null,'stock_documents.created_by'].includes(c.source)&&
    (c.actor_id===null?c.source===null:c.source==='stock_documents.created_by')&&
    (!Object.hasOwn(parent.source,'created_by')||parent.source.created_by===c.actor_id)&&
    c.display_name===null&&c.display_name_status==='HISTORICAL_SNAPSHOT_NOT_RECORDED'&&
    c.role===null&&c.role_status==='HISTORICAL_SNAPSHOT_NOT_RECORDED'&&text(c.current_display_name,255)&&
    creatorStatuses.includes(c.current_display_name_status)&&[null,'app_user.display_name'].includes(c.current_display_name_source)&&
    (c.current_display_name===null?c.current_display_name_status!=='CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT':
      uuid(c.actor_id)&&c.current_display_name_status==='CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT'&&c.current_display_name_source==='app_user.display_name');
  if(!valid)return{ownerProjection:null,ownerProjectionIssue:'INVALID'};
  // Allowlist fields; do not retain unknown audit/PII keys from optional JSON.
  const supplier=Object.fromEntries(['status','id','name','name_status','version','recorded_at','source'].map(k=>[k,s[k]]));
  const creator=Object.fromEntries(['actor_id','source','display_name','display_name_status','role','role_status','current_display_name','current_display_name_status','current_display_name_source'].map(k=>[k,c[k]]));
  if(!rights.includes('iam.user.view')){
    creator.current_display_name=null;creator.current_display_name_source=null;
    creator.current_display_name_status=creator.actor_id===null?'ACTOR_NOT_RECORDED':'REDACTED_PII_PERMISSION';
  }
  return{ownerProjection:{contract:CONTRACT,revision:REVISION,document_id:value.document_id,warehouse_id:value.warehouse_id,source:value.source,supplier,creator},ownerProjectionIssue:null};
}

export function ownerProjectionPresentation(d){
  const p=d.ownerProjection;
  if(!p)return{supplier:null,supplierNote:d.ownerProjectionIssue==='INVALID'?'Thông tin bổ sung chưa được xác minh.':null,creator:d.source.created_by??null,creatorNote:null};
  const s=p.supplier,c=p.creator;
  const supplier=s.status==='NOT_SELECTED'?'Không chọn nhà cung cấp':s.name_status==='SNAPSHOT_RECORDED'?s.name:null;
  const supplierNote=s.status==='SOURCE_UNAVAILABLE'?'Nguồn nhà cung cấp tạm thời không khả dụng.':s.status==='NOT_RECORDED'||s.name_status==='NOT_RECORDED'?'Chưa lưu tên nhà cung cấp tại thời điểm ghi nhận.':null;
  const current=c.current_display_name_status==='CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT'&&c.current_display_name_source==='app_user.display_name';
  return{supplier,supplierNote,creator:current?c.current_display_name:c.actor_id,
    creatorNote:current?'Tên hiện tại từ danh bạ · app_user.display_name; không phải tên/vai trò tại thời điểm tạo.':c.current_display_name_status==='REDACTED_PII_PERMISSION'?'Tên người tạo được bảo vệ theo quyền.':c.current_display_name_status==='SOURCE_UNAVAILABLE'?'Nguồn tên người tạo tạm thời không khả dụng.':null};
}
