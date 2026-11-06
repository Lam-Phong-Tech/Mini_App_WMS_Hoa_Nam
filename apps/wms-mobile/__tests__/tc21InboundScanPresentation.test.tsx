/** TC21 local Note assertions; no camera or backend evidence. */
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {P04ScanPresentation} from '../src/features/inbound/P04ScanPresentation';
const noop=()=>undefined;
let tree:Renderer.ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
async function mount(operation:'inbound'|'outbound'='inbound',invalid=false){
  await act(async()=>{tree=Renderer.create(<AppProviders><P04ScanPresentation operation={operation} documentRef="PN-LOCAL-NOT-LIVE" supplierName="Local supplier" typeLabel="Nhập sản phẩm"
    attempts={invalid?[{raw:'RAW-local-error',at:1790000000000,kind:'invalid',reason:'Owner reason retained'}]:[]} codeCount={0} quantity={0} manual={false} filter="all" all={false}
    tools={null} footer={null} busy={false} onBack={noop} onFilter={noop} onAll={noop} onContext={noop}/></AppProviders>);});
}
test('latest03/11 reference restores inbound document context while preserving scan copy/list heading',async()=>{
  await mount();const out=JSON.stringify(tree.toJSON());
  expect(out).toContain('Hướng camera vào mã QR/Serial/SKU');
  expect(out).toContain('Danh sách mã đã quét');
  expect(out).toContain('Mã trùng không tính vào phiếu');
  expect(out).toContain('PN-LOCAL-NOT-LIVE');
  expect(out).toContain('Local supplier');
});
test('TC21 does not suppress real invalid evidence or manufacture successful rows to resemble Note',async()=>{
  await mount('inbound',true);const out=JSON.stringify(tree.toJSON());
  expect(out).toContain('RAW-local-error');expect(out).toContain('Owner reason retained');
  expect(out).toContain('Lỗi');expect(out).not.toContain('HN12346');
});
test('TC21 does not change the outbound context or copy',async()=>{
  await mount('outbound');const out=JSON.stringify(tree.toJSON());
  expect(out).toContain('PN-LOCAL-NOT-LIVE');expect(out).toContain('Local supplier');
  expect(out).toContain('Quét hàng xuất kho');
});
