import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {P04Frame} from '../src/features/inbound/P04Frame';
import {P04Icon} from '../src/features/inbound/P04Icon';
import {InboundReviewScreen} from '../src/features/inbound/InboundReviewScreen';
import {initialInboundDraft} from '../src/features/inbound/inboundDraft';

test.each([1,2,3] as const)('TC04 inbound step %s keeps the common progress and back callback',async step=>{
 const back=jest.fn();let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<AppProviders><P04Frame step={step} footer={null} onBack={back}>{null}</P04Frame></AppProviders>);});
 expect(tree.root.findAll(n=>n.props.accessibilityLabel===`Tiến độ nhập kho, bước ${step} trên 3`).length).toBeGreaterThan(0);
 const content=JSON.stringify(tree.toJSON());for(const label of ['Thông tin','Thêm sản phẩm','Kiểm tra'])expect(content).toContain(label);
 expect(tree.root.findAllByType(P04Icon).some(n=>n.props.name==='arrow-left')).toBe(true);
 await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='Quay lại'&&typeof n.props.onPress==='function')[0].props.onPress());
 expect(back).toHaveBeenCalledTimes(1);
 await act(async()=>tree.unmount());
});

test('TC04 review uses step 3 before RECORD and no progress after recorded; no command is sent',async()=>{
 const record=jest.fn();let tree!:Renderer.ReactTestRenderer;
 const screen=(recorded=false)=><AppProviders><InboundReviewScreen draft={initialInboundDraft} documentRef="PN-UI-ONLY" recorded={recorded} onRecord={record} canSend={false}/></AppProviders>;
 await act(async()=>{tree=Renderer.create(screen());});
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='Tiến độ nhập kho, bước 3 trên 3').length).toBeGreaterThan(0);
 await act(async()=>tree.update(screen(true)));
 expect(tree.root.findAll(n=>String(n.props.accessibilityLabel??'').startsWith('Tiến độ nhập kho'))).toHaveLength(0);
 expect(record).not.toHaveBeenCalled();
 await act(async()=>tree.unmount());
});
