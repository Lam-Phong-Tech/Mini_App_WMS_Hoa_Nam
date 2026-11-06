import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {InboundReviewScreen} from '../src/features/inbound/InboundReviewScreen';
import {initialInboundDraft} from '../src/features/inbound/inboundDraft';
import {P04Action,P04Row} from '../src/features/inbound/P04Frame';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {P04Text} from '../src/features/inbound/P04Text';

test.each([false,true])('TC05 v5 review has summary, persisted PN, chevron and separate Back/send actions (swipe=%s)',async swipe=>{
 const record=jest.fn(),back=jest.fn(),remove=jest.fn();let tree!:Renderer.ReactTestRenderer;
 const draft={...initialInboundDraft,inboundCategory:'PRODUCT' as const,name:'OWNER_ONLY_NAME',codes:[
  {key:'item',raw:'UI_ITEM',sku:'SKU_UI',item:'SERIAL_UI',quantity:1,source:'MANUAL' as const,at:1},
  {key:'box',raw:'UI_BOX',sku:'SKU_UI',item:'BOX_UI',quantity:5,source:'MANUAL' as const,at:2},
 ]};
 await act(async()=>{tree=Renderer.create(<AppProviders><InboundReviewScreen draft={draft} documentRef="PN-SERVER" onRecord={record} onBackToScan={back} onRemoveNewestSku={swipe?remove:undefined}/></AppProviders>);});
 expect(tree.root.findAllByType(P04Row).find(r=>r.props.label==='Mã phiếu')!.props.value).toBe('PN-SERVER');
 expect(tree.root.findAllByType(P04Row).find(r=>r.props.label==='Loại nhập')!.props.value).toBe('Nhập sản phẩm');
 expect(tree.root.findAll(n=>n.props.testID==='p04-review-totals').length).toBeGreaterThan(0);
 expect(tree.root.findAll(n=>n.props.testID==='p04-review-totals')[0].findAllByType(P04Text).map(n=>n.props.children)).toEqual(['Loại phiếu','Nhập kho','Số lượng','6','Số SKU','1']);
 const actions=tree.root.findAllByType(P04Action);expect(actions.map(a=>a.props.label)).toEqual(['Quay lại quét mã','Gửi phiếu lên Web']);
 const group=tree.root.findAll(n=>n.props.accessibilityLabel==='SKU_UI · 2 mã · số lượng 6'&&typeof n.props.onPress==='function')[0];
 expect(group.findAllByType(P04Icon).some(i=>i.props.name==='chevron-right')).toBe(true);
 await act(async()=>group.props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('SERIAL_UI');
 expect(group.findAllByType(P04Icon).some(i=>i.props.name==='chevron-down')).toBe(true);
 await act(async()=>actions[0].props.onPress());expect(back).toHaveBeenCalledTimes(1);expect(record).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();
 await act(async()=>tree.unmount());
});
