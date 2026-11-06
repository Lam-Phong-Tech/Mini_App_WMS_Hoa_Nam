import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {P08HistoryScreen} from '../src/features/history/P08HistoryScreen';
import {ThemeProvider} from '../src/theme/ThemeProvider';
import {Button} from '../src/ui/Button';
import {FilterChipRow} from '../src/ui/FilterChipRow';
import {context,harness,event,id} from './fixtures/p08Mock';

jest.setTimeout(30000);
let tree:Renderer.ReactTestRenderer|undefined;
const output=()=>JSON.stringify(tree!.toJSON());
const subtreeText=(v:any):string=>typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(subtreeText).join(''):subtreeText(v?.props?.children??v?.children??'');
async function press(label:string){
  await act(async()=>{
    const target=tree!.root.findAllByType(Button).find(n=>n.props.label===label)??
      tree!.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
    target!.props.onPress();
  });
}
async function mount(scan=false){
  const h=harness((body,url)=>{if(scan&&url.pathname.endsWith('/records'))body.data=[event(10,'SCAN',9)];});
  const c=context(),open=jest.fn();
  c.user={...c.user!,display_name:'VIEWER_NOT_EVENT_ACTOR'};
  h.setContext(c);
  await act(async()=>{tree=Renderer.create(<ThemeProvider><P08HistoryScreen context={c} service={h.api} onBack={()=>{}} onOpenDocument={open}/></ThemeProvider>);});
  await press('Xem chi tiết');
  return {h,open};
}
afterEach(async()=>{await act(async()=>tree?.unmount());tree=undefined;});

test('TC14 separates the operation/document from the three recording rows without duplicating the chosen activity',async()=>{
  const {open}=await mount();
  expect(output()).toContain('Thông tin ghi nhận');
  expect(output()).not.toContain('Thông tin chung');
  expect(output()).not.toContain('Loại giao dịch');
  expect(output()).not.toContain('Hoạt động được chọn');
  expect(output()).not.toContain('Người thao tác: — · Serial / UID: —');
  const info=tree!.root.findAll(n=>n.props.testID==='P08.detail.info')[0];
  expect(info).toBeDefined();
  expect(subtreeText(info.props.children)).toContain('Người thao tác');
  const owner=tree!.root.findAllByType(Button).find(n=>n.props.label==='Xem chứng từ')!;
  expect(owner.props.leading).toBeDefined();
  expect(owner.props.trailing).toBeDefined();
  const serialized=output();
  expect(serialized.indexOf('Xem chứng từ')).toBeLessThan(serialized.indexOf('Dòng thời gian'));
  await act(async()=>owner.props.onPress());
  expect(open).toHaveBeenCalledWith('inbound',id(9));
});
test('TC14 does not invent a business number, actor, note or latest event from the viewer or paged activity',async()=>{
  await mount();
  expect(output()).not.toContain('VIEWER_NOT_EVENT_ACTOR');
  expect(output()).toContain('Ghi chú');
  const copy=tree!.root.findAll(n=>n.props.accessibilityLabel==='Sao chép mã chứng từ')[0];
  expect(copy).toBeDefined();
  expect(copy.props.disabled).toBe(true);
  const latest=tree!.root.findAll(n=>n.props.testID==='P08.detail.latest')[0];
  expect(latest).toBeDefined();
  expect(subtreeText(latest.props.children)).not.toContain('mock hoạt động');
  expect(output()).not.toContain('PN-0005');
});
test('TC14 keeps the explicit scan-session route and attachment owner route after rearranging the detail',async()=>{
  const {h}=await mount(true);
  const scan=tree!.root.findAllByType(Button).find(n=>n.props.label==='Xem phiên quét')!;
  expect(scan.props.leading).toBeDefined();
  expect(scan.props.trailing).toBeDefined();
  await act(async()=>scan.props.onPress());
  expect(h.calls.some(c=>new URL(c.path,'https://test.invalid').pathname.endsWith('/scan-sessions/'+id(9)))).toBe(true);
  expect(h.calls.some(c=>new URL(c.path,'https://test.invalid').pathname.endsWith('/scan-sessions/'+id(10)))).toBe(false);
});
test('TC14 attachment tab keeps owner authorization rather than manufacturing an attachment count',async()=>{
  const {open}=await mount();
  await act(async()=>tree!.root.findAllByType(FilterChipRow).find(n=>n.props.chips[0]?.key==='info')!.props.onSelect('attachments'));
  await press('Mở tệp tại chứng từ');
  expect(open).toHaveBeenLastCalledWith('inbound',id(9),'files');
  expect(output()).not.toContain('Đính kèm (2)');
});
