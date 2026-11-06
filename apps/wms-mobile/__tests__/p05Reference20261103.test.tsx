import {HN_UI} from '../src/theme/uiKitV3';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Image} from 'react-native';
import {AppProviders} from '../src/app/App';
import {P04ScanPresentation} from '../src/features/inbound/P04ScanPresentation';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {scannerAssets} from '../src/theme/scannerAssets';
import {P05ReviewContent} from '../src/features/outbound/P05ReviewContent';
const noop=()=>{};let tree:Renderer.ReactTestRenderer|undefined;
afterEach(async()=>{await act(()=>tree?.unmount());tree=undefined;});
test('outbound inactive camera uses the original repo sample and all counters retain owner values',async()=>{
  await act(async()=>{tree=Renderer.create(<AppProviders><P04ScanPresentation operation="outbound" planned={10} attempts={[...Array.from({length:7},(_,i)=>({raw:'ITEM-TEST-'+i,at:i,kind:'valid' as const})),{raw:'ITEM-TEST-0',at:8,kind:'duplicate'}]} quantity={7} codeCount={7} manual={false} filter="all" all={false} cameraLabel="Camera chưa bật" tools={null} footer={null} busy={false} onBack={noop} onFilter={noop} onAll={noop} onContext={noop}/></AppProviders>);});
  expect(tree!.root.findAllByType(Image).some(i=>i.props.source===scannerAssets.outboundScanSample)).toBe(true);
  const out=JSON.stringify(tree!.toJSON());expect(out).toContain('7 / 10');expect(out).toContain('mã trùng · không tính');expect(out).toContain('Mã không hợp lệ');
  const scan=tree!.root.findAllByType(P04Icon).find(i=>i.props.name==='scan')!;expect(scan.props.assetPack).toBe(true);expect(scan.props.color).toBe(HN_UI.onBrand);
});
test('review preserves received7/planned10 guards and exact source product name reader',async()=>{
  const read=jest.fn(),accepted=Array.from({length:7},(_,i)=>({raw:'ITEM-TEST-'+i,sku:'SKU-TEST',skuId:'SKU-ID',itemId:'ITEM-ID-'+i,quantity:1 as const,source:'MANUAL' as const}));
  await act(async()=>{tree=Renderer.create(<AppProviders><P05ReviewContent documentNo="PX-TEST" warehouse="Kho TEST" recipient="TEST" phone="0000000000" address="Địa chỉ TEST" group="Nhóm TEST" planned={10} accepted={accepted} onRead={read}/></AppProviders>);});
  expect(JSON.stringify(tree!.toJSON())).toContain('Còn thiếu 3 sản phẩm');expect(tree!.root.findAllByType(Image).some(i=>i.props.source===scannerAssets.outboundProductSample)).toBe(true);
});
