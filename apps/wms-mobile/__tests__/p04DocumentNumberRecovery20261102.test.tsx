import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {createP04Flow, p04Body, type P04Run} from '../src/features/inbound/p04Flow';
import {initialInboundDraft} from '../src/features/inbound/inboundDraft';
import {InboundCreateScreen} from '../src/features/inbound/InboundCreateScreen';
import {P04Action} from '../src/features/inbound/P04Frame';
import {createMemoryBackend, createStorage} from '../src/storage/storage';
import {createP04ReviewService, P04_REVIEW_SESSION} from '../src/web/p04ReviewService';
import {AppError} from '../src/errors/AppError';

const makeRun = (): P04Run => ({
  id:'11111111-1111-4111-8111-111111111111',
  identity:{documentId:'11111111-1111-4111-8111-111111111111',scanSessionId:'22222222-2222-4222-8222-222222222222'},
  scope:{actorId:P04_REVIEW_SESSION.userId!,authSessionId:P04_REVIEW_SESSION.authSessionId!,warehouseId:P04_REVIEW_SESSION.activeWarehouseId!},
  nameMode:'BE_DOCUMENT_NO',
  ui:{...initialInboundDraft,warehouseId:P04_REVIEW_SESSION.activeWarehouseId!,inboundCategory:'COMPONENT',
    supplierId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',supplierName:'TEST ONLY',note:'Ghi chú\nđầy đủ đ'},
  items:[],rows:[],closed:false,updatedAt:1,
});
const fixture = () => {
  const service=createP04ReviewService(),storage=createStorage(createMemoryBackend());
  const make=()=>createP04Flow({service,storage,getSession:()=>P04_REVIEW_SESSION,autoNameFromDocumentCode:true});
  return {service,storage,make};
};
afterEach(()=>jest.restoreAllMocks());

test('retained pre-fix local draft gets its number only on explicit recovery, preserving identity and metadata',async()=>{
  const f=fixture(),original=makeRun();f.storage.setObject('p04.runs.v1/'+original.id,original);
  const save=jest.spyOn(f.service,'save'),flow=f.make();
  await flow.begin();expect(save).not.toHaveBeenCalled();
  expect(await flow.requestDocumentNumber()).toBe(true);
  const r=flow.snapshot().run!;
  expect(r.identity).toEqual(original.identity);expect(r.ui.note).toBe(original.ui.note);
  expect(r.ui.supplierId).toBe(original.ui.supplierId);expect(r.ui.inboundCategory).toBe('COMPONENT');
  expect(r.server!.document_no).toBeTruthy();expect(r.ui.name).toBe(r.server!.document_no);
  expect(r.ui.step).toBe(0);expect(save).toHaveBeenCalledTimes(1);
  await flow.next();expect(flow.snapshot().run!.ui.step).toBe(1);
  expect(flow.snapshot().run!.server!.document_no).toBe(r.server!.document_no);
  flow.dispose();
});

test('resume derives an empty display name from verified existing server number without writing again',async()=>{
  const f=fixture(),first=f.make();await first.begin();const r=first.snapshot().run!;first.dispose();
  r.ui={...r.ui,name:''};f.storage.setObject('p04.runs.v1/'+r.id,r);
  const save=jest.spyOn(f.service,'save'),restored=f.make();await restored.begin();
  expect(restored.snapshot().run!.ui.name).toBe(r.server!.document_no);
  expect(save).not.toHaveBeenCalled();restored.dispose();
});

test('lost initial SAVE returns to S01 only after exact receipt check, without sending SAVE again',async()=>{
  const f=fixture(),originalSave=f.service.save.bind(f.service);
  const save=jest.spyOn(f.service,'save').mockImplementationOnce(async(...args)=>{
    await originalSave(...args);throw new AppError({kind:'timeout',message:'Lost first committed SAVE response'});
  });
  const flow=f.make();await flow.begin();const original=flow.snapshot().run!;
  expect(flow.snapshot().phase).toBe('error');expect(original.pending!.outcome).toBe('UNKNOWN');
  const check=jest.spyOn(f.service,'reconcile');expect(await flow.check()).toBe(true);
  const after=flow.snapshot();expect(after.phase).toBe('ready');expect(after.run!.ui.step).toBe(0);
  expect(after.run!.identity).toEqual(original.identity);expect(after.run!.pending).toBeUndefined();
  expect(after.run!.ui.name).toBe(after.run!.server!.document_no);expect(after.run!.result).toBeUndefined();
  expect(check).toHaveBeenCalledWith(original.scope,original.identity,original.pending!.key,'SAVE');
  expect(save).toHaveBeenCalledTimes(1);flow.dispose();
});

test('explicit number recovery cannot alter or replay an UNKNOWN request',async()=>{
  const f=fixture(),r=makeRun();r.pending={command:'SAVE',key:'33333333-3333-4333-8333-333333333333',
    requestId:'44444444-4444-4444-8444-444444444444',shiftId:'55555555-5555-4555-8555-555555555555',
    version:0,body:p04Body(r),outcome:'UNKNOWN'};
  f.storage.setObject('p04.runs.v1/'+r.id,r);const save=jest.spyOn(f.service,'save'),flow=f.make();await flow.begin();
  expect(await flow.requestDocumentNumber()).toBe(false);
  expect(flow.snapshot().run!.pending).toEqual(r.pending);expect(flow.snapshot().run!.identity).toEqual(r.identity);
  expect(save).not.toHaveBeenCalled();flow.dispose();
});

test('incompatible ON_RECORD capability is an explicit contract error instead of endless S01 loading',async()=>{
  const f=fixture(),read=f.service.context.bind(f.service);
  jest.spyOn(f.service,'context').mockImplementation(async scope=>({...await read(scope),document_number_assignment:'ON_RECORD'}));
  const save=jest.spyOn(f.service,'save'),flow=f.make();await flow.begin();
  expect(flow.snapshot().phase).toBe('error');expect(flow.snapshot().messageCode).toBe('P04_NUMBERING_CONTRACT_REQUIRED');
  expect(save).not.toHaveBeenCalled();flow.dispose();
});

test('explicit fresh run after confirmed rejection obtains its own verified number',async()=>{
  const service=createP04ReviewService({scenario:'record-reject'}),storage=createStorage(createMemoryBackend());
  const flow=createP04Flow({service,storage,getSession:()=>P04_REVIEW_SESSION,autoNameFromDocumentCode:true});
  await flow.begin();flow.metadata({...flow.snapshot().run!.ui,inboundCategory:'PRODUCT'});await flow.next();
  await flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-NUMBER-REPRO','MANUAL');await flow.next();await flow.record();
  const previous=flow.snapshot().run!;expect(previous.pending!.outcome).toBe('FAILED');
  expect(await flow.recoverRejected(true)).toBe(true);const fresh=flow.snapshot().run!;
  expect(fresh.id).not.toBe(previous.id);expect(fresh.server!.document_no).toBeTruthy();
  expect(fresh.ui.name).toBe(fresh.server!.document_no);expect(fresh.result).toBeUndefined();flow.dispose();
});

test('S01 recovery reuses the footer with an explicit request action before name/category/supplier exist',async()=>{
  const request=jest.fn(),draft={...initialInboundDraft,warehouseId:P04_REVIEW_SESSION.activeWarehouseId!};let tree!:Renderer.ReactTestRenderer;
  await act(async()=>{tree=Renderer.create(<AppProviders><InboundCreateScreen draft={draft} hideNameField
    onRequestDocumentNumber={request} onChange={jest.fn()} onContinue={jest.fn()}
    warehouses={{phase:'ready',warehouses:[]} as never}/></AppProviders>);});
  const button=tree.root.findAllByType(P04Action).find(a=>a.props.label==='Lấy mã phiếu nhập');
  expect(button).toBeDefined();expect(button!.props.disabled).toBe(false);
  await act(async()=>button!.props.onPress());expect(request).toHaveBeenCalledTimes(1);
  await act(async()=>tree.unmount());
});
