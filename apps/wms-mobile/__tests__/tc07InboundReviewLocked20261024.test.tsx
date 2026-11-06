import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {InboundReviewScreen} from '../src/features/inbound/InboundReviewScreen';
import {P04Frame,P04Action,P04Row} from '../src/features/inbound/P04Frame';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {initialInboundDraft} from '../src/features/inbound/inboundDraft';

const draft={...initialInboundDraft,name:'NAME_RETAINED_IN_OWNER_NOT_SHOWN',
  warehouseId:'warehouse-local',warehouseName:'Kho TEST',
  codes:[{key:'local-1',raw:'LOCAL-QR',sku:'SKU-LOCAL',item:'ITEM-LOCAL',quantity:1,source:'MANUAL' as const,at:1}]};
let tree:Renderer.ReactTestRenderer;
async function mount(props:Partial<React.ComponentProps<typeof InboundReviewScreen>>={}) {
  await act(async()=>{tree=Renderer.create(<AppProviders><InboundReviewScreen
    draft={draft} documentRef="PN-LOCAL" onRecord={jest.fn()} onBackToScan={jest.fn()} {...props}
  /></AppProviders>);});
}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});

test.each([true,false])('v5 TC05 supersedes the old TC07 layout; keeps owner fields and expands serials without deleting (swipe=%s)',async swipe=>{
  const remove=jest.fn();
  await mount(swipe?{onRemoveNewestSku:remove}:{});
  expect(tree.root.findAllByProps({testID:'p04-review-totals'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByType(P04Row).map(row=>row.props.label)).not.toContain('Tên phiếu');
  const warehouse=tree.root.findAllByType(P04Row).find(row=>row.props.label==='Kho nhập')!;
  expect(warehouse.findAllByType(P04Icon).some(icon=>icon.props.name==='lock')).toBe(true);
  expect(tree.root.findAllByType(P04Icon).some(icon=>icon.props.name==='chevron-right')).toBe(true);
  expect(tree.root.findByType(InboundReviewScreen).props.draft.name).toBe(draft.name);
  expect(JSON.stringify(tree.toJSON())).not.toContain(draft.name);
  const group=tree.root.findAll(node=>node.props.accessibilityLabel==='SKU-LOCAL · 1 mã · số lượng 1'&&typeof node.props.onPress==='function')[0];
  await act(async()=>group.props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('ITEM-LOCAL');
  expect(remove).not.toHaveBeenCalled();
});

test('v5 TC05 has Back and Send-Web actions, retains header Back, and invokes the existing RECORD intent once',async()=>{
  const onRecord=jest.fn(),onBackToScan=jest.fn();
  await mount({onRecord,onBackToScan});
  const actions=tree.root.findAllByType(P04Action);
  expect(actions.map(a=>a.props.label)).toEqual(['Quay lại quét mã','Gửi phiếu lên Web']);
  expect(actions[1].props.disabled).toBe(false);
  expect(tree.root.findByType(P04Frame).props.onBack).toBe(onBackToScan);
  await act(async()=>actions[1].props.onPress());
  expect(onRecord).toHaveBeenCalledTimes(1);
  expect(onBackToScan).not.toHaveBeenCalled();
});

test.each([{canSend:false},{locked:true},{recording:true},{draft:{...draft,codes:[]}}])(
  'TC07 submit still respects every existing owner guard %j',async props=>{
    await mount(props);
    expect(tree.root.findAllByType(P04Action).find(a=>a.props.label==='Gửi phiếu lên Web')!.props.disabled).toBe(true);
  },
);
