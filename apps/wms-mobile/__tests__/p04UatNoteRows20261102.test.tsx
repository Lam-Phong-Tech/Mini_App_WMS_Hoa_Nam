import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {InboundReviewScreen} from '../src/features/inbound/InboundReviewScreen';
import {InboundResultScreen} from '../src/features/inbound/InboundResultScreen';
import {P04NativeFlow} from '../src/features/inbound/P04NativeFlow';
import {InboundCreateScreen} from '../src/features/inbound/InboundCreateScreen';
import {BusinessScanScreen} from '../src/features/scan/BusinessScanScreen';
import {P04Action, P04Frame, P04Row} from '../src/features/inbound/P04Frame';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {P04ReadableText} from '../src/features/inbound/P04ReadableText';
import {Button} from '../src/ui/Button';
import {initialInboundDraft} from '../src/features/inbound/inboundDraft';
import * as session from '../src/auth/session';
import {createMemoryBackend, createStorage} from '../src/storage/storage';
import {createP04ReviewService, P04_REVIEW_SESSION} from '../src/web/p04ReviewService';
import {setTierCheckForTesting, resetTierCheckForTesting} from '../src/services/wms/tierCheck';

let tree:Renderer.ReactTestRenderer|undefined;
const draft={...initialInboundDraft,name:'OWNER_NAME_NOT_A_VISIBLE_NOTE_ROW',warehouseId:'local-warehouse',
  warehouseName:'Kho nguồn',supplierName:'NCC nguồn',createdAt:'2026-11-02T01:32:00Z',
  codes:[{key:'local-item',raw:'LOCAL-ONLY-ITEM',sku:'LOCAL-SKU',item:'LOCAL-SERIAL',quantity:1,source:'MANUAL' as const,at:1}]};
async function mount(element:React.ReactElement){await act(async()=>{tree=Renderer.create(<AppProviders>{element}</AppProviders>);});}
const result=(props:Partial<React.ComponentProps<typeof InboundResultScreen>>={})=><InboundResultScreen
  documentName="OWNER_NAME" documentRef="PN-LOCAL-NOTE" quantity={50} codeCount={1} outcome="posted"
  onHome={jest.fn()} onNext={jest.fn()} {...props}/>;
const value=(label:string)=>tree!.root.findAllByType(P04ReadableText).find(n=>n.props.label===label)?.props.value;
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;jest.restoreAllMocks();resetTierCheckForTesting();});

test('v5 TC05 replaces old Note: verified metadata/type, warehouse lock, chevron and separate Back/send',async()=>{
  const onRecord=jest.fn(),onBack=jest.fn();
  await mount(<InboundReviewScreen draft={draft} documentRef="PN-LOCAL-NOTE" onRecord={onRecord} onBackToScan={onBack}/>);
  const rows=tree!.root.findAllByType(P04Row);
  expect(rows.map(r=>r.props.label)).toEqual(['Kho nhập','Mã phiếu','Loại nhập','Nhà cung cấp','Ngày tạo','Người tạo']);
  expect(rows[0].findAllByType(P04Icon).some(i=>i.props.name==='lock')).toBe(true);
  expect(tree!.root.findAllByType(P04Icon).some(i=>i.props.name==='chevron-right')).toBe(true);
  const actions=tree!.root.findAllByType(P04Action);expect(actions.map(a=>a.props.label)).toEqual(['Quay lại quét mã','Gửi phiếu lên Web']);
  expect(JSON.stringify(tree!.toJSON())).not.toContain(draft.name);
  await act(async()=>actions[1].props.onPress());expect(onRecord).toHaveBeenCalledTimes(1);expect(onBack).not.toHaveBeenCalled();
});

test('TC07 missing creator never falls back to the currently signed-in actor',async()=>{
  jest.spyOn(session,'getActiveSession').mockReturnValue({...P04_REVIEW_SESSION,userName:'CURRENT_ACTOR_MUST_NOT_BE_INVENTED'});
  await mount(<InboundReviewScreen draft={draft} documentRef="PN-LOCAL-NOTE" onRecord={jest.fn()}/>);
  expect(tree!.root.findAllByType(P04Row).find(r=>r.props.label==='Người tạo')!.props.value).toBe('Chưa xác minh');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('CURRENT_ACTOR_MUST_NOT_BE_INVENTED');
});

test('v5 TC07 supersedes old Note: monitor, four rows, sent receipt time and accepted code count',async()=>{
  await mount(result({warehouseName:'Kho nguồn',supplierName:'NCC API',createdAt:'2026-11-02T01:32:00Z',sentAt:'2026-11-02T08:59:00Z',actorName:'Người tạo từ nguồn',actorRole:'Vai trò từ nguồn'}));
  expect(tree!.root.findByType(P04Frame).props.title).toBe('Đã gửi phiếu');
  expect(tree!.root.findAllByType(P04Icon).some(i=>i.props.name==='check')).toBe(true);
  expect(tree!.root.findAllByType(P04Icon).some(i=>i.props.name==='monitor')).toBe(true);
  expect(tree!.root.findAllByType(P04ReadableText).map(r=>r.props.label)).toEqual(['Mã phiếu','Kho','Đã ghi nhận','Thời gian gửi']);
  expect(value('Kho')).toBe('Kho nguồn');expect(value('Thời gian gửi')).toBe('02/11/2026 15:59');
  expect(value('Đã ghi nhận')).toBe('1 mã');
  const text=JSON.stringify(tree!.toJSON());expect(text).toContain('Chờ xử lý trên Web');expect(text).not.toContain('Chờ duyệt');expect(text).not.toContain('Vai trò từ nguồn');expect(text).not.toContain('50 mã');expect(text).not.toContain('08:32');
});

test('v5 TC07 confirmed success exposes the four Note navigation actions with existing callbacks',async()=>{
  const home=jest.fn(),document=jest.fn(),next=jest.fn(),history=jest.fn();
  await mount(result({onHome:home,onDocument:document,onNext:next,onHistory:history}));
  const actions=tree!.root.findAllByType(Button);expect(actions.map(a=>a.props.label)).toEqual(['Xem phiếu PN-LOCAL-NOTE','Nhập lượt mới','Xem lịch sử','Trang chủ']);
  for(const action of actions)await act(async()=>action.props.onPress());
  for(const callback of [document,home,next,history])expect(callback).toHaveBeenCalledTimes(1);
});

test('v5 TC07 missing count/send time stays unknown, without using quantity, creation time or current actor',async()=>{
  jest.spyOn(session,'getActiveSession').mockReturnValue({...P04_REVIEW_SESSION,userName:'CURRENT_ACTOR_MUST_NOT_BE_INVENTED'});
  await mount(result({createdAt:'2026-11-02T08:59:00Z',supplierName:null,actorName:undefined,quantity:50,codeCount:undefined,sentAt:undefined}));
  for(const label of ['Kho','Đã ghi nhận','Thời gian gửi'])expect(value(label)).toBe('Chưa xác minh');
  const text=JSON.stringify(tree!.toJSON());expect(text).not.toContain('15:59');expect(text).not.toContain('CURRENT_ACTOR_MUST_NOT_BE_INVENTED');
});

test.each(['queued','failed','reconcile'] as const)('TC08 %s is not a confirmed green success or replacement intent',async outcome=>{
  await mount(result({outcome}));
  expect(tree!.root.findAllByType(P04Icon).some(i=>i.props.name==='check')).toBe(false);
  expect(tree!.root.findAllByType(Button).some(b=>String(b.props.label).startsWith('Xem phiếu '))).toBe(false);
  if(outcome==='reconcile')expect(tree!.root.findAllByType(Button).some(b=>b.props.label==='Nhập lượt mới')).toBe(false);
});

test('TC07/08 native owner binds saved supplier and server creation time; it does not turn the current session actor into a historical creator',async()=>{
  setTierCheckForTesting({status:'matched',expected:'dev-test'});
  const service=createP04ReviewService(),record=jest.spyOn(service,'record');
  await mount(<P04NativeFlow onExit={jest.fn()} service={service} storage={createStorage(createMemoryBackend())}
    getSession={()=>({...P04_REVIEW_SESSION,userName:'CURRENT_SESSION_NOT_DOCUMENT_CREATOR'})}/>);
  const create=tree!.root.findByType(InboundCreateScreen);
  await act(async()=>create.props.onChange({...create.props.draft,inboundCategory:'PRODUCT',supplierId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',supplierName:'NCC từ adapter thử nghiệm'}));
  await act(async()=>tree!.root.findByType(InboundCreateScreen).props.onContinue());
  await act(async()=>tree!.root.findByType(BusinessScanScreen).props.onScan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-NOTE-ONLY-01','MANUAL'));
  await act(async()=>tree!.root.findByType(BusinessScanScreen).props.onDone());
  const review=tree!.root.findByType(InboundReviewScreen);const createdAt=review.props.draft.createdAt;
  expect(createdAt).toBeTruthy();expect(review.props.actorName).toBeUndefined();
  await act(async()=>review.props.onRecord());
  const props=tree!.root.findByType(InboundResultScreen).props;
  expect(record).toHaveBeenCalledTimes(1);expect(props.createdAt).toBe(createdAt);expect(props.supplierName).toBe('NCC từ adapter thử nghiệm');
  expect(props.quantity).toBe(1);expect(props.actorName).toBeUndefined();
});
