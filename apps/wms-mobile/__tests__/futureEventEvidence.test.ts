import {futureMilestones,warrantyIntakeSource} from '../src/features/documents/p12/futureEventEvidence';
import {mapNotification} from '../src/services/wms/notifications';
import type {Document} from '../src/features/documents/p12/contract';

const id=(n:number)=>'26100000-0000-4000-8000-'+String(n).padStart(12,'0');
const time='2026-10-26T04:30:12.123456Z';
const milestone=(event:string)=>({availability:'RECORDED',occurred_at:time,event_id:id(20),event_key:event,
  subject_type:'stock_document',subject_id:id(1),warehouse_id:id(2),document_version:1,
  actor:{id:id(3),name_snapshot:'TEST Operator',job_title_snapshot:'TEST title'},description:'TEST event',
  timestamp_source:'stock_document_event_evidence.occurred_at',snapshot_policy:'FUTURE_EVENT_CAPTURE_NO_HISTORICAL_BACKFILL'});
const doc=():Document=>({type:'outbound',id:id(1),warehouseId:id(2),source:{version:2},meta:{p12:{event_evidence_contract:'p12-event-evidence-v2'}},
  p12:{event_evidence:{contract:'p12-event-evidence-v2',semantics:'PERSISTED_FUTURE_EVENTS_NOT_CURRENT_STATUS',
    milestones:{created:milestone('CREATED'),checked:milestone('CHECKED'),sent:milestone('SENT')}}} as unknown as Document['p12']});

test('future milestone actor/description/version comes only from verified exact parent proof',()=>{
  expect(futureMilestones(doc())?.checked.actor?.name_snapshot).toBe('TEST Operator');
  expect(futureMilestones(doc())?.sent_to_web.occurred_at).toBe(time);
});
test.each(['subject_id','warehouse_id','event_id','timestamp_source'])('reject invalid future proof %s',(field)=>{
  const d=doc();((d.p12.event_evidence as any).milestones.checked)[field]='untrusted';
  expect(()=>futureMilestones(d)).toThrow();
});
test('absent evidence never substitutes current status or directory',()=>{
  const d=doc();delete d.p12.event_evidence;d.source.status='POSTED';expect(futureMilestones(d)).toBeNull();
});
test('warranty intake snapshot rejects wrong identity and never reads current SKU label',()=>{
  const d=doc();d.type='warranty';d.source={item_id:id(5),product_id:id(6),sku_name:'Current NOT history',product_source:{
    contract:'warranty-product-snapshot-v1',availability:'RECORDED',case_id:d.id,item_id:id(5),sku_id:id(6),
    serial_number:'TEST-SERIAL',sku_code:'TEST-SKU',sku_name:'Captured TEST name',temporary_item_code:null,
    captured_at:time,timestamp_source:'warranty_product_snapshots.captured_at',capture_policy:'AT_WARRANTY_INTAKE_NOT_CURRENT_CATALOG'}};
  expect(warrantyIntakeSource(d)?.sku_name).toBe('Captured TEST name');
  (d.source.product_source as any).item_id=id(99);expect(()=>warrantyIntakeSource(d)).toThrow();
});
test('notification title binds exact actor and timestamp, not viewer IAM role',()=>{
  const row={id:id(40),actor_id:id(3),actor_name:'TEST Operator',title:'TEST',body:'TEST',severity:null,read_at:null,created_at:time,event_key:'inbound.created',subject:null,
    source_snapshot:{contract:'notification-source-snapshot-v1',availability:'RECORDED',actor_id:id(3),captured_at:time,
      actor_job_title_status:'RECORDED',actor_job_title_snapshot:'Warehouse TEST title',warehouse_id:null,warehouse_name_snapshot:null}};
  expect(mapNotification(row).actorJobTitleSnapshot).toBe('Warehouse TEST title');
  expect(()=>mapNotification({...row,source_snapshot:{...row.source_snapshot,actor_id:id(90)}})).toThrow();
  expect(mapNotification({...row,source_snapshot:undefined}).actorJobTitleSnapshot).toBeNull();
});
