import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {P08HistoryScreen} from '../src/features/history/P08HistoryScreen';
import {P08Badge} from '../src/features/history/P08Presentation';
import {ThemeProvider} from '../src/theme/ThemeProvider';
import {context,harness} from './fixtures/p08Mock';

jest.setTimeout(30000);
let tree:Renderer.ReactTestRenderer|undefined;
const output=()=>JSON.stringify(tree!.toJSON());
const row=(label:string)=>tree!.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
async function mount(partial=false){
  const h=harness((body,url)=>{if(partial&&url.pathname.endsWith('/summary')){body.data.grandTotal=null;body.data.coverage='PARTIAL';body.meta.sources.WARRANTY.status='UNAVAILABLE';}});
  await act(async()=>{tree=Renderer.create(<ThemeProvider><P08HistoryScreen context={context()} service={h.api} initialMode="summary" onBack={()=>{}} onOpenDocument={()=>{}}/></ThemeProvider>);});
  return h;
}
afterEach(async()=>{await act(async()=>tree?.unmount());tree=undefined;});
test('TC15 operation counts use operation colors while preserving their server values',async()=>{
  await mount();
  expect(row('Xem Nhập kho').findAllByType(P08Badge)[0].props.tone).toBe('success');
  expect(row('Xem Bảo hành').findAllByType(P08Badge)[0].props.tone).toBe('warning');
  expect(row('Xem NFC').findAllByType(P08Badge)[0].props.ink).toBe('#7550a2');
  expect(output()).toContain('3 hoạt động');
  expect(output()).toContain('Σ');
});
test('TC15 partial coverage labels available total without claiming a complete total',async()=>{
  await mount(true);
  const labels=tree!.root.findAllByType(P08Badge).map(n=>n.props.label);
  expect(labels).toContain('Khả dụng 3');
  expect(labels).not.toContain('Tổng 3');
  expect(output()).toContain('Chưa khả dụng');
  expect(row('Xem Bảo hành').props.disabled).toBe(true);
});
test('TC15 keeps SCAN as scan activity rather than relabeling it as documents',async()=>{
  const h=await mount();
  expect(row('Xem Quét')).toBeDefined();
  expect(row('Xem Chứng từ')).toBeUndefined();
  await act(async()=>row('Xem Quét').props.onPress());
  const recordRead=h.calls.filter(c=>new URL(c.path,'https://test.invalid').pathname.endsWith('/records')).at(-1)!;
  expect(new URL(recordRead.path,'https://test.invalid').searchParams.get('business')).toBe('SCAN');
  expect(new URL(recordRead.path,'https://test.invalid').searchParams.get('source')).toBe('ALL');
});
