import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { InboundResultScreen } from '../src/features/inbound/InboundResultScreen';
import { Button } from '../src/ui/Button';
import { P04ReadableText } from '../src/features/inbound/P04ReadableText';
import {P04Frame} from '../src/features/inbound/P04Frame';
import {P04Icon} from '../src/features/inbound/P04Icon';

test('v5 TC07 result shows persisted send time, real code count and all Note navigation callbacks', async () => {
  const onHome = jest.fn(),
    onNext = jest.fn(),
    onDocument = jest.fn(),
    onHistory = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <InboundResultScreen
          documentName="Box test"
          documentRef="PN-20261008-0005"
          warehouseName="Kho Hoa Nam"
          quantity={50}
          codeCount={1}
          createdAt="2026-10-07T17:26:35.047865Z"
          sentAt="2026-10-08T17:26:35.047865Z"
          outcome="posted"
          onHome={onHome}
          onNext={onNext}
          onDocument={onDocument}
          onHistory={onHistory}
        />
      </AppProviders>,
    );
  });
  const text = JSON.stringify(tree.toJSON());
  expect(tree.root.findByType(P04Frame).props.title).toBe('Đã gửi phiếu');
  expect(tree.root.findAllByType(P04Icon).some(n=>n.props.name==='monitor')).toBe(true);
  expect(tree.root.findAllByType(P04ReadableText).map(n=>n.props.label)).toEqual(['Mã phiếu','Kho','Đã ghi nhận','Thời gian gửi']);
  expect(tree.root.findAllByType(P04ReadableText).find(n => n.props.label === 'Đã ghi nhận')!.props.value).toBe('1 mã');
  expect(text).not.toContain('50 mã');
  expect(text).toContain('09/10/2026 00:26');
  expect(text).not.toContain('08/10/2026 00:26');
  expect(text).toContain('Chờ xử lý trên Web');
  expect(text).not.toContain('Chờ duyệt');
  const names = [
    'Xem phiếu PN-20261008-0005',
    'Nhập lượt mới',
    'Xem lịch sử',
    'Trang chủ',
  ];
  for (const name of names)
    await act(async () =>
      tree.root
        .findAllByType(Button)
        .find(button => button.props.label === name)!
        .props.onPress(),
    );
  for (const callback of [onDocument, onNext, onHistory, onHome])
    expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('UNKNOWN cannot show result success or start a replacement run', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <InboundResultScreen
          documentName="Unknown"
          documentRef="request-id"
          quantity={50}
          codeCount={1}
          outcome="reconcile"
          onHome={() => undefined}
          onNext={() => undefined}
        />
      </AppProviders>,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain('UNKNOWN — cần đối chiếu');
  expect(
    tree.root
      .findAllByType(Button)
      .some(button => button.props.label === 'Nhập lượt mới'),
  ).toBe(false);
  expect(JSON.stringify(tree.toJSON())).not.toContain(
    'Chưa ghi sổ · Chưa đổi tồn.',
  );
  await act(async () => tree.unmount());
});

test('verified Web posting is not displayed as still waiting or unchanged stock',async()=>{
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<AppProviders><InboundResultScreen documentName="TEST" documentRef="PN-WEB" codeCount={1} outcome="posted" postedOnWeb onHome={()=>undefined} onNext={()=>undefined}/></AppProviders>);});
 const text=JSON.stringify(tree.toJSON());
 expect(text).toContain('Đã ghi sổ trên Web');
 expect(text).not.toContain('Chờ xử lý trên Web');
 expect(text).not.toContain('Chưa ghi sổ · Chưa đổi tồn.');
 await act(async()=>tree.unmount());
});
