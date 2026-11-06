/** Explicit GET-only dependency smoke. Never a substitute for native UI/UAT. */
import { apiClient } from '../api/client';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { p06Catalog } from '../services/wms/p06Catalog';
import type { P06Context } from '../services/wms/p06Types';

type Row={board:string;name:string;method:'GET';path:string;status:number|null;result:string;request_id:string|null;contract:string|null;total:number|null;code:string|null;note?:string};
type RecordLike=Record<string,unknown>;
const object=(value:unknown):RecordLike=>value&&typeof value==='object'&&!Array.isArray(value)?value as RecordLike:{};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
type Candidate={item_id:string;sku_id:string;serial_number:string};
export async function runP01P24ReadSmoke(context:P06Context,candidates:readonly Candidate[],progress:(text:string)=>void) {
  const scope=captureSessionScope(),warehouse=context.active_warehouse_id;
  if(context.warehouse_context.status!=='READY'||!uuid(warehouse))throw Error('Kho chưa được xác nhận.');
  const rows:Row[]=[];
  const guard=()=>{if(!isSessionScopeCurrent(scope))throw Error('Phiên/kho đã đổi. Không dùng kết quả cũ.');};
  const skipped=(board:string,name:string,note:string)=>rows.push({board,name,method:'GET',path:'NOT_CALLED',status:null,result:'NOT_RUN',request_id:null,contract:null,total:null,code:null,note});
  async function read(board:string,name:string,path:string,query:Record<string,string|number>={},headers:Record<string,string>={},p12Read=false):Promise<RecordLike|undefined>{
    guard();progress(board+' - '+name);
    try {
      const response=await apiClient.get<unknown>(path,{query,headers,...(p12Read?{p12Read:true as const}:{})});guard();
      const body=object(response.data),meta=object(body.meta);
      rows.push({board,name,method:'GET',path,status:response.status,result:response.status===200&&body.success===true?'HTTP_OK_NOT_UI_ACCEPTANCE':'ENVELOPE_UNVERIFIED',request_id:response.header?.('X-Request-ID')??(typeof meta.request_id==='string'?meta.request_id:null),contract:typeof meta.contract==='string'?meta.contract:null,total:typeof meta.total==='number'?meta.total:null,code:typeof body.code==='string'?body.code:null});
      return body;
    }catch(error){guard();const value=error as {status?:number;code?:string;requestId?:string};rows.push({board,name,method:'GET',path,status:value.status??null,result:'READ_ERROR_OR_DENIED',request_id:value.requestId??null,contract:null,total:null,code:value.code??'READ_UNVERIFIED'});return undefined;}
  }
  await read('P01/P10/P11','Danh tính auth owner','/api/v1/auth/me');
  await read('P11','Danh sách phiên cá nhân - không revoke','/api/v1/auth/sessions',{page:1,per_page:5});
  await read('P02','KPI đúng kho','/api/v1/mini-app/dashboard/summary',{warehouse_id:warehouse});
  await read('P03/P15','Context/support owner','/api/v1/mini-app/p03/context');
  await read('P04','NCC GLOBAL','/api/v1/mini-app/inbound/suppliers',{status:'ACTIVE',page:1,per_page:5});
  const inbound=await read('P04/P12/P16','Danh sách nhập','/api/v1/mini-app/inbound-documents',{warehouse_id:warehouse,page:1,per_page:5}, {},true);
  const outbound=await read('P05/P12/P16','Danh sách xuất','/api/v1/mini-app/outbound-documents',{warehouse_id:warehouse,page:1,per_page:5},{},true);
  for(const [kind,body] of [['inbound',inbound],['outbound',outbound]] as const){
    const list=Array.isArray(body?.data)?body.data:[];
    const id=object(list[0]).id;
    if(!uuid(id)){skipped('P12',kind+' detail','Nguồn chưa trả canonical stock-document ID.');continue;}
    const base='/api/v1/mini-app/'+kind+'-documents/'+id;
    await read('P12',kind+' detail',base,{}, {},true);
    await read('P12',kind+' scan evidence',base+'/scan-entries',{page:1,per_page:5},{},true);
    await read('P12/P18',kind+' attachments',base+'/attachments',{page:1,per_page:5},{},true);
  }
  await read('P12/P13/P16','All owner, cursor=start','/api/v1/mini-app/documents',{warehouse_id:warehouse,source:'ALL',status:'ALL',sort:'created_at_desc',per_page:5,cursor:'start',timezone:'Asia/Ho_Chi_Minh'},{},true);
  for(const candidate of candidates){
    guard();progress('P06 - '+candidate.serial_number);
    try{const data=await p06Catalog.detail(context,{type:'ITEM',id:candidate.item_id});guard();rows.push({board:'P06',name:'Hiện vật '+candidate.serial_number,method:'GET',path:'/api/v1/mini-app/catalog/items/'+candidate.item_id,status:200,result:data.data.card.sku_id===candidate.sku_id&&data.data.card.serial_number===candidate.serial_number?'P06_PARSER_AND_IDENTITY_OK':'IDENTITY_MISMATCH',request_id:data.meta.request_id,contract:data.meta.contract,total:null,code:null});}
    catch(error){guard();const value=error as {status?:number;code?:string;requestId?:string};rows.push({board:'P06',name:'Hiện vật '+candidate.serial_number,method:'GET',path:'/api/v1/mini-app/catalog/items/'+candidate.item_id,status:value.status??null,result:'READ_ERROR_OR_DENIED',request_id:value.requestId??null,contract:null,total:null,code:value.code??'READ_UNVERIFIED'});}
  }
  await read('P07','Danh sách chip - chỉ đọc','/api/v1/mini-app/nfc-tags',{warehouse_id:warehouse,tab_status:'ALL',page:1,per_page:5});
  await read('P08','History records','/api/v1/mini-app/history/records',{warehouse_id:warehouse,source:'ALL',limit:5});
  await read('P08','History summary','/api/v1/mini-app/history/summary',{warehouse_id:warehouse,date_mode:'ALL'});
  const warranty=await read('P09/P16/P23','Danh sách hồ sơ','/api/v1/mini-app/warranty-cases',{warehouse_id:warehouse,page:1,per_page:5});
  const caseRows=Array.isArray(warranty?.data)?warranty.data:[],caseId=object(caseRows[0]).warranty_case_id;
  if(uuid(caseId)){
    await read('P09/P19/P20/P24','Đúng canonical case','/api/v1/mini-app/warranty-cases/'+caseId,{warehouse_id:warehouse});
    await read('P09/P23/P24','Timeline','/api/v1/mini-app/warranty-cases/'+caseId+'/events',{warehouse_id:warehouse,sort:'event_at_asc',per_page:5});
    const links=await read('P20/P24','POSTED component links','/api/v1/mini-app/warranty-cases/'+caseId+'/component-issues',{warehouse_id:warehouse,page:1,per_page:5},{'X-Component-History-Contract':'p20-component-history-v1'});
    const linkRows=Array.isArray(links?.data)?links.data:[],document=object(linkRows[0]).component_issue_document_id;
    if(uuid(document))await read('P20','POSTED detail proof','/api/v1/mini-app/warranty-component-issues/'+document,{warehouse_id:warehouse},{'X-Component-History-Contract':'p20-component-history-v1'});
    else skipped('P20','POSTED detail','Không có canonical linked POSTED document trong trang đã đọc; không tạo/Post để lấy evidence.');
  }else skipped('P09/P20/P23','Case detail/events/history','Không có warranty_case_id chuẩn trong nguồn; không thay bằng id/serial/mã phiếu.');
  await read('P13','Thông báo keyset','/api/v1/notifications',{cursor:'start',per_page:5});
  await read('P13','Unread count toàn tài khoản','/api/v1/notifications/unread-count');
  const current=await read('P01/P14','Current shift, không START/END','/api/v1/mini-app/work-shifts/current');
  const shift=object(current?.data),lifecycle=object(shift.lifecycle);
  if(uuid(shift.shift_id))await read('P14','Close-check GET','/api/v1/mini-app/work-shifts/'+shift.shift_id+'/close-check',{warehouse_id:warehouse});
  else skipped('P14','Close-check','Không có shift_id chuẩn; không tạo ca để lấy bằng chứng.');
  await read('P21','Linked checkpoint list','/api/v1/mini-app/drafts',{warehouse_id:warehouse,operation:'COMPONENT_ISSUE',page:1,per_page:5},{'X-Component-Resume-Contract':'p21-component-resume-v1'});
  const nfcHeaders={'X-NFC-History-Contract':'p22-nfc-history-v1'};
  const nfc=await read('P22','Persisted NFC events P08 owner','/api/v1/mini-app/history/records',{warehouse_id:warehouse,source:'NFC',limit:5},nfcHeaders);
  await read('P22','Persisted NFC summary','/api/v1/mini-app/history/summary',{warehouse_id:warehouse,source:'NFC',date_mode:'ALL'},nfcHeaders);
  const nfcRows=Array.isArray(nfc?.data)?nfc.data:[],event=object(nfcRows[0]);
  if(typeof event.recordId==='string'&&typeof event.activityId==='string')await read('P22','Exact parent/activity detail','/api/v1/mini-app/history/records/'+encodeURIComponent(event.recordId),{warehouse_id:warehouse,source:'NFC',activityId:event.activityId},nfcHeaders);
  else skipped('P22','Exact event detail','Chưa có cặp recordId/activityId thật trong trang đã đọc.');
  await read('P23','SCAN_SESSION collection','/api/v1/mini-app/scan-sessions',{warehouse_id:warehouse,page:1,per_page:5});
  skipped('P15/P17/P18/P19/P21/P24','Đối chiếu request UNKNOWN','Cần request/key/SHA/identity gốc được duyệt. Không dùng UUID ngẫu nhiên hoặc 404/null làm negative proof.');
  guard();
  return {tested_at:new Date().toISOString(),scope:'AUTHENTICATED_GET_ONLY_DEPENDENCIES_NOT_FULL_P01_P24_UAT',warehouse_id:warehouse,rows,shift_capability:{mode:lifecycle.mode??null,tracking_status:lifecycle.tracking_status??null,end_supported:lifecycle.end_supported??null,reason:lifecycle.end_unavailable_reason??null},business_mutation_requests:0,auth_owner_refresh_not_modified:true,privacy:'NO_AUTH_BODY_OR_CUSTOMER_PII_EXPORTED',native_ui_acceptance:false,hardware_acceptance:false};
}
