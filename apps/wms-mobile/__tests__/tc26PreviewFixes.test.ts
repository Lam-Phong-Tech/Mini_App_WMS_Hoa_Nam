import {warrantyOwnerPresentation} from '../src/features/documents/p12/presentation';
import {futureEventDescription} from '../src/features/documents/p12/futureEventEvidence';
import {timelineEventTitle} from '../src/features/documents/p12/timeline';
import type {Document} from '../src/features/documents/p12/contract';
import {createP05CreateService} from '../src/services/wms/p05Create';
import type {P05Client} from '../src/services/wms/p05Outbound';
import type {Session} from '../src/auth/session';

const id=(n:number)=>'26100000-0000-4000-8000-'+String(n).padStart(12,'0');
test('warranty uses the scoped flat owner warehouse label, never the viewing user name',()=>{
  const doc:Document={type:'warranty',id:id(9),p12:{} as Document['p12'],warehouseId:id(1),source:{warehouse_id:id(1),warehouse_name:'Kho TEST',warehouse_code:'TEST',created_by:id(2)}};
  expect(warrantyOwnerPresentation(doc)).toMatchObject({warehouse:'Kho TEST',creator:id(2),creatorLabel:'Mã người tạo'});
  doc.source.warehouse_id=id(3);
  expect(warrantyOwnerPresentation(doc).warehouse).toBe(id(1));
  doc.source.created_by=null;
  expect(warrantyOwnerPresentation(doc).creator).toBeNull();
});
test('only warranty owner event types gain warranty labels',()=>{
  expect(timelineEventTitle('RECEIVE','warranty')).toBe('Tiếp nhận bảo hành');
  expect(timelineEventTitle('CHECK','warranty')).toBe('Kiểm tra bảo hành');
  expect(timelineEventTitle('CHECK','inbound')).toBe('Hoạt động khác (chưa có nhãn)');
  expect(timelineEventTitle('OTHER','warranty')).toBe('Hoạt động khác (chưa có nhãn)');
});
test('known fixed evidence descriptions are localized without rewriting unknown persisted text',()=>{
  expect(futureEventDescription('User explicitly confirmed document check')).toBe('Người thực hiện đã xác nhận kiểm tra chứng từ.');
  expect(futureEventDescription('Unknown TEST description')).toBe('Unknown TEST description');
});
test('aborting catalogue reads stops pagination even if a transport returns a late page',async()=>{
  let release!:()=>void;
  const waiting=new Promise<void>(r=>{release=r});
  const calls:any[]=[];
  const client={async request(r:any){
    calls.push(r);
    if(r.path.includes('/products'))await waiting;
    return {status:200,data:{success:true,data:r.path.includes('/products')?[{sku_id:id(7),sku_type:'PRODUCT',status:'ACTIVE',category_name:'TEST'}]:[],
      meta:{current_page:1,per_page:50,total:r.path.includes('/products')?2:0,last_page:r.path.includes('/products')?2:1}}};
  }} as P05Client;
  const session={userId:id(1),authSessionId:id(2),activeWarehouseId:id(3),accessToken:'TEST_ONLY'} as Session;
  const service=createP05CreateService(client,()=>session),controller=new AbortController();
  const result=service.catalogue(controller.signal);
  controller.abort();release();
  await expect(result).rejects.toMatchObject({code:'READ_CANCELLED',unknown:false});
  expect(calls).toHaveLength(2);
  expect(calls.every(r=>r.method==='GET'&&r.signal===controller.signal&&r.query.page===1)).toBe(true);
});
