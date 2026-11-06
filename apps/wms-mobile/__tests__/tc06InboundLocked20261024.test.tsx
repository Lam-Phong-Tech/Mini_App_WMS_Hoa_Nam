import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import {AppProviders} from '../src/app/App';
import {createP04Flow} from '../src/features/inbound/p04Flow';
import {InboundCreateScreen} from '../src/features/inbound/InboundCreateScreen';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {createStorage, createMemoryBackend} from '../src/storage/storage';
import {createP04ReviewService, P04_REVIEW_SESSION} from '../src/web/p04ReviewService';
import {AppError} from '../src/errors/AppError';

function harness(automatic = true) {
  const storage=createStorage(createMemoryBackend());
  const service=createP04ReviewService();
  const make=(auto=automatic)=>createP04Flow({service,storage,
    getSession:()=>P04_REVIEW_SESSION,autoNameFromDocumentCode:auto});
  return {storage,service,make};
}
afterEach(()=>jest.restoreAllMocks());

test('TC06 new run derives name from verified BE number without replaying its first SAVE',async()=>{
  const f=harness(),save=jest.spyOn(f.service,'save'),flow=f.make();
  await flow.begin();
  const first=flow.snapshot().run!;
  expect(first.nameMode).toBe('BE_DOCUMENT_NO');
  expect(first.ui.name).toBe(first.server!.document_no);
  expect(first.ui.name).not.toBe('');
  expect(save).toHaveBeenCalledTimes(1);
  expect(first.savedBody!.name).toBe('');
  expect((first.completed![0].request.body as {name:string}).name).toBe('');
  flow.metadata({...first.ui,name:'Must not override BE code',inboundCategory:'PRODUCT'});
  expect(flow.snapshot().run!.ui.name).toBe(first.server!.document_no);
  await flow.next();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][2].name).toBe(first.server!.document_no);
  expect(save.mock.calls[1][3]).not.toBe(save.mock.calls[0][3]);
  expect(save.mock.calls[1][4]).toBe(first.server!.version);
  expect(flow.snapshot().run!.ui.step).toBe(1);
  expect(flow.snapshot().run!.result).toBeUndefined();
  flow.dispose();
});

test('TC06 opening an old named or UNKNOWN journal never opts it in or rewrites its request',async()=>{
  const f=harness(false),old=f.make(false);
  await old.begin();
  old.metadata({...old.snapshot().run!.ui,name:'Tên nháp cũ',inboundCategory:'PRODUCT'});
  const save=jest.spyOn(f.service,'save').mockRejectedValueOnce(new AppError({kind:'timeout',message:'test lost SAVE'}));
  await old.next();
  const previous=old.snapshot().run!;
  expect(previous.pending!.outcome).toBe('UNKNOWN');
  old.dispose();
  const restored=f.make(true);
  await restored.begin();
  const after=restored.snapshot().run!;
  expect(after.nameMode).toBeUndefined();
  expect(after.ui.name).toBe('Tên nháp cũ');
  expect(after.pending).toEqual(previous.pending);
  expect(after.identity).toEqual(previous.identity);
  expect(save).toHaveBeenCalledTimes(1);
  restored.dispose();
});

test('TC06 automatic first SAVE UNKNOWN preserves empty name/body/key and does not invent a number',async()=>{
  const f=harness(),save=jest.spyOn(f.service,'save').mockRejectedValueOnce(new AppError({kind:'timeout',message:'test lost first SAVE'}));
  const flow=f.make();
  await flow.begin();
  const before=flow.snapshot().run!;
  expect(before.pending!.outcome).toBe('UNKNOWN');
  expect(before.ui.name).toBe('');
  await flow.next();
  const after=flow.snapshot().run!;
  expect(after.pending).toEqual(before.pending);
  expect(after.ui.name).toBe('');
  expect(save).toHaveBeenCalledTimes(1);
  flow.dispose();
});

test('TC06 UI hides name only for the new automatic owner, keeps code read-only and aligns the header',async()=>{
  const f=harness(),flow=f.make();
  await flow.begin();
  const run=flow.snapshot().run!;
  let tree!:Renderer.ReactTestRenderer;
  await act(async()=>{tree=Renderer.create(<AppProviders><InboundCreateScreen
    draft={run.ui} documentRef={run.server!.document_no!} hideNameField
    warehouses={{phase:'ready',warehouses:[{id:run.scope.warehouseId,name:'Kho TEST'}]} as never}
    supplierLoader={jest.fn(async()=>({items:[],total:0}))}
    onChange={jest.fn()} onContinue={jest.fn()} onBack={jest.fn()}
  /></AppProviders>);});
  expect(tree.root.findAllByProps({accessibilityLabel:'Tên phiếu'})).toHaveLength(0);
  const field=tree.root.findByProps({testID:'P04.document.number'});
  expect(field.findAllByType(P04Icon).some(icon=>icon.props.name==='x')).toBe(true);
  expect(field.findAllByType(P04Icon).some(icon=>icon.props.name==='lock')).toBe(false);
  expect(field.findAll(node=>typeof node.props.onPress==='function')).toHaveLength(0);
  const header=tree.root.findByProps({testID:'P04.header'});
  expect(StyleSheet.flatten(header.props.style)).toMatchObject({alignItems:'center',paddingTop:0,paddingBottom:14});
  await act(async()=>tree.unmount());
  flow.dispose();
});
