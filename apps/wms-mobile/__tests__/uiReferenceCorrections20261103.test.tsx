import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {P03Surface} from '../src/features/scan/P03Dialog';
import {P04ScanPresentation} from '../src/features/inbound/P04ScanPresentation';
let tree:Renderer.ReactTestRenderer|undefined;
afterEach(async()=>{await act(()=>tree?.unmount());tree=undefined;});
async function mount(element:React.ReactElement){await act(async()=>{tree=Renderer.create(<AppProviders>{element}</AppProviders>);});}
test('stopped warehouse offers Home and contact guidance while never dispatching a business operation',async()=>{
  const home=jest.fn(),choose=jest.fn();
  await mount(<P03Surface panel="S03" onBack={home} onChoose={choose} actions={[{label:'Về Trang chủ',onPress:home,kind:'primary'}]}/>);
  const contact=tree!.root.findAll(n=>n.props.accessibilityLabel==='Liên hệ quản trị'&&typeof n.props.onPress==='function')[0];expect(contact).toBeDefined();
  await act(async()=>contact.props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('Ứng dụng chưa có số điện thoại hoặc email quản trị được cấu hình.');
  expect(choose).not.toHaveBeenCalled();expect(home).not.toHaveBeenCalled();
});
test('inbound scanner preserves document number, operation and supplier in a visible context card',async()=>{
  const details=jest.fn(),noop=()=>{};
  await mount(<P04ScanPresentation documentRef="PN-TEST-EXACT" typeLabel="Nhập sản phẩm" supplierName="NCC TEST" attempts={[]} quantity={0} codeCount={0} manual={false} filter="all" all={false} busy={false} tools={null} footer={null} onBack={noop} onFilter={noop} onAll={noop} onContext={details}/>);
  const text=JSON.stringify(tree!.toJSON());expect(text).toContain('PN-TEST-EXACT');expect(text).toContain('Nhập sản phẩm');expect(text).toContain('NCC TEST');
  await act(async()=>tree!.root.findAll(n=>n.props.accessibilityLabel==='Chi tiết phiếu đang nhập'&&typeof n.props.onPress==='function')[0].props.onPress());expect(details).toHaveBeenCalledTimes(1);
});
