import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {P13WebQueueDetail} from '../src/features/notifications/P13WebQueuePresentation';
import {parseWebQueue,webQueueQuery} from '../src/services/wms/p13WebQueue';
import {queueBody,scope} from './fixtures/beReleasedReads20261024';

let tree:Renderer.ReactTestRenderer;
afterEach(async()=>{if(tree)await act(()=>tree.unmount());});
it('uses the Note sections, preserves a version-mismatch warning and never invents a missing note',async()=>{
  const row=parseWebQueue(queueBody(),scope(),webQueueQuery()).items[0];
  if(!row.handoff.supplied)throw Error('Missing fixture handoff');
  row.handoff.value.current={state:'WAITING_WEB_POST',documentId:row.target.id,warehouseId:row.target.warehouseId,canonical:'SCANNING',currentVersion:4,submittedVersion:3,versionMatch:false,submittedAt:'2026-10-23T03:00:00Z',postedAt:null,label:'Chờ xử lý trên Web',semantics:'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK'};
  const open=jest.fn();
  await act(()=>{tree=Renderer.create(<AppProviders><P13WebQueueDetail row={row} statusLabel="Đang xử lý" onOpenProducts={open}/></AppProviders>);});
  const text=JSON.stringify(tree.toJSON());
  expect(text.includes('Quá trình bàn giao')).toBe(false);
  expect(text.includes('Phiên bản hiện tại chưa được xác nhận đã gửi')).toBe(true);
  expect(tree.root.findAllByProps({testID:'P13.queue.note'}).length).toBeGreaterThan(0);
  const note=tree.root.findAllByProps({testID:'P13.queue.note'}).find(n=>n.props.text!==undefined)!;
  expect(note.props.text).toBe('—');
  await act(()=>tree.root.findAllByProps({accessibilityLabel:'Xem đầy đủ sản phẩm trong chứng từ gốc'}).find(n=>typeof n.props.onPress==='function')!.props.onPress());
  expect(open).toHaveBeenCalledTimes(1);
});
