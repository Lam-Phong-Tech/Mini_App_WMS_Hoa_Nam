import {parseStockDetail} from '../src/features/documents/p12/contract';
import {ownerProjectionPresentation} from '../src/features/documents/p12/ownerProjection';
import * as m from './fixtures/p12Protocol';
const projection=()=>({contract:'p12-owner-projection-v1',revision:'p12-owner-projection-r1',document_id:m.business,warehouse_id:m.warehouse,source:'INBOUND',
 supplier:{status:'SNAPSHOT_RECORDED',id:m.supplierId,name:'Supplier at RECORD',name_status:'SNAPSHOT_RECORDED',version:2,recorded_at:'2026-10-18T14:40:07.000000Z',source:'mini_app_inbound_record_metadata'},
 creator:{actor_id:m.id(101),source:'stock_documents.created_by',display_name:null,display_name_status:'HISTORICAL_SNAPSHOT_NOT_RECORDED',role:null,role_status:'HISTORICAL_SNAPSHOT_NOT_RECORDED',current_display_name:'Creator current label',current_display_name_status:'CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT',current_display_name_source:'app_user.display_name'}});
function read(p=projection(),marker='p12-owner-projection-v1',rights=['iam.user.view']){const b=m.detail();b.data.created_by=m.id(101);b.data.p12.owner_projection=p;if(marker)b.meta.p12.owner_projection_contract=marker;return parseStockDetail(b,'inbound',m.business,m.warehouse,{origin:'https://p12.invalid',rights});}
test('TC12 validates snapshot/identity and labels the separate current creator name, never caller/history',()=>{
 const d=read();expect(d.ownerProjection.supplier.name).toBe('Supplier at RECORD');expect(d.ownerProjection.creator.current_display_name).toBe('Creator current label');expect(d.ownerProjection.creator.display_name).toBeNull();expect(d.ownerProjection.creator.role).toBeNull();
});
test.each(['document_id','warehouse_id','source'])('TC12 mismatched %s hides only optional metadata, keeps parent/lines',key=>{
 const p=projection();p[key]=key==='source'?'OUTBOUND':m.id(999);const d=read(p);expect(d.id).toBe(m.business);expect(d.source.lines.length).toBeGreaterThan(0);expect(d.ownerProjection).toBeNull();expect(d.ownerProjectionIssue).toBe('INVALID');expect(d.source.p12.owner_projection).toBeUndefined();
});
test('TC12 absent/unsupported discovery never renders raw supplier/creator projection',()=>{
 const d=read(projection(),null);expect(d.ownerProjection).toBeNull();expect(d.ownerProjectionIssue).toBe('UNVERIFIED');expect(d.p12.owner_projection).toBeUndefined();
});
test('TC12 denied current-name permission strips optional label without inventing historical name',()=>{
 const d=read(projection(),'p12-owner-projection-v1',[]);expect(d.ownerProjection.creator.current_display_name).toBeNull();expect(d.ownerProjection.creator.current_display_name_status).toBe('REDACTED_PII_PERMISSION');expect(JSON.stringify(d)).not.toContain('Creator current label');
});
test.each(['NOT_RECORDED','SOURCE_UNAVAILABLE','NOT_SELECTED'])('TC12 preserves %s without falling back to source_name or current directory',status=>{
 const p=projection();p.supplier={status,id:null,name:null,name_status:status,version:null,recorded_at:null,source:null};const d=read(p);expect(d.ownerProjection.supplier.status).toBe(status);expect(d.ownerProjection.supplier.name).toBeNull();
});
test('TC12 incomplete snapshot name stays null and never gets reconstructed',()=>{
 const p=projection();p.supplier.name=null;p.supplier.name_status='NOT_RECORDED';expect(read(p).ownerProjection.supplier.name).toBeNull();
});
test('TC12 NOT_SELECTED retains the real RECORD timestamp even though no supplier was selected',()=>{
 const p=projection();p.supplier={...p.supplier,status:'NOT_SELECTED',id:null,name:null,name_status:'NOT_SELECTED',version:null};
 const d=read(p);expect(d.ownerProjection.supplier.recorded_at).toBe('2026-10-18T14:40:07.000000Z');expect(ownerProjectionPresentation(d).supplier).toBe('Không chọn nhà cung cấp');
});
test('TC12 current name is explicitly attributed, never described as historical role/name',()=>{
 const d=read(),v=ownerProjectionPresentation(d);expect(v.creator).toBe('Creator current label');expect(v.creatorNote).toContain('Tên hiện tại từ danh bạ');expect(v.creatorNote).toContain('app_user.display_name');expect(v.creatorNote).toContain('không phải');
});
test('TC12 invalid creator identity/source/historical name or timestamp hides only projection',()=>{
 for(const edit of [p=>{p.creator.actor_id=m.id(999);},p=>{p.creator.display_name='Not historical';},p=>{p.supplier.source=null;},p=>{p.supplier.recorded_at='not-time';}]){
   const p=projection();edit(p);const d=read(p);expect(d.ownerProjection).toBeNull();expect(d.id).toBe(m.business);expect(d.ownerProjectionIssue).toBe('INVALID');
 }
});
test('TC12 outbound does not turn supplier metadata into a partner or recipient',()=>{
 const b=m.detail(m.stock('outbound',11),'outbound'),p=projection();p.document_id=m.outbound;p.source='OUTBOUND';p.supplier={status:'NOT_APPLICABLE',id:null,name:null,name_status:'NOT_APPLICABLE',version:null,recorded_at:null,source:null};b.data.created_by=m.id(101);b.data.p12.owner_projection=p;b.meta.p12.owner_projection_contract='p12-owner-projection-v1';
 const d=parseStockDetail(b,'outbound',m.outbound,m.warehouse,{origin:'https://p12.invalid',rights:['iam.user.view']});expect(d.ownerProjection.supplier.status).toBe('NOT_APPLICABLE');expect(d.source.recipient_name).toBe('Recipient protocol test');
});
