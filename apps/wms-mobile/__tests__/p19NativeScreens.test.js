import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { Input } from '../src/ui/Input';
import { P19NativeFlow } from '../src/features/warranty/p19/P19NativeFlow';
import { createP19NativeController, P19_NATIVE_RELEASE } from '../src/features/warranty/p19/p19NativeController';
import { linkedServer, scope, id } from './fixtures/p19LinkedServer';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import { p19LinkedJournal } from '../src/features/warranty/p19/p19LinkedJournal';

let tree;
afterEach(async () => { if (tree) await act(() => tree.unmount()); tree = undefined; });
function setup(options = {}) {
  const server = linkedServer();
  let seq = 20;
  const controller = createP19NativeController({ getScope: () => scope, caseId: id(4), presentation: { caseLabel: 'BH-001', productName: 'Máy in nhiệt XP-420B', warehouseName: 'Kho Hoa Nam', status: 'CHECKING' }, offlineRequest: server.request, uuid: () => id(++seq), ...options });
  return { server, controller };
}
async function render(controller, extra = {}) {
  await act(async () => { tree = Renderer.create(<AppProviders><P19NativeFlow controller={controller} scanAvailable={false} onBack={() => {}} {...extra} /></AppProviders>); await controller.initialize(); });
}
const text = () => JSON.stringify(tree.toJSON());
async function press(label) {
  await act(async () => {
    const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
    if (button) { button.props.onPress(); return; }
    const target = tree.root.findAllByProps({ accessibilityLabel: label }).find(node => typeof node.props.onPress === 'function');
    if (!target) throw Error('Button missing: ' + label);
    target.props.onPress();
  });
}
async function field(label, value) { await act(() => tree.root.findAllByType(Input).find(node => node.props.label === label).props.onChangeText(value)); }
async function filled(controller) { await act(async () => { await controller.flow.scan('ITEM1', 'CAMERA'); await controller.flow.scan('BOX1', 'MANUAL'); controller.flow.quantity(2); }); }

it('P09 entry default has no live transport, no writer and no simulated success', async () => {
  const { controller } = setup({ offlineRequest: undefined });
  await render(controller);
  expect(P19_NATIVE_RELEASE.activation).toBe(true);
  expect(P19_NATIVE_RELEASE.production).toBe(false);
  expect(text()).toContain('Chưa thể xuất linh kiện lúc này');
  expect(text()).not.toContain('thành công');
  expect(tree.root.findAllByType(Button).find(node => node.props.label === 'Kiểm tra linh kiện →').props.disabled).toBe(true);
  expect(controller.snapshot().counts.codes).toBe(0);
});
it('S01->S02 invalid quantity and Back retain accepted ITEM; camera and manual sources remain distinct', async () => {
  const { controller, server } = setup();
  await render(controller);
  await act(async () => controller.flow.scan('ITEM1', 'CAMERA'));
  await press('Nhập tay');
  await field('Mã linh kiện hoặc mã hộp', 'BOX1');
  await press('Kiểm tra mã');
  expect(text()).toContain('P19.S02');
  await field('Số lượng linh kiện cần xuất', '0');
  expect(tree.root.findAllByType(Button).find(node => node.props.label === 'Xác nhận số lượng').props.disabled).toBe(true);
  await press('Quay lại hồ sơ');
  expect(controller.snapshot().counts.codes).toBe(1);
  expect(controller.snapshot().pending).toBe(null);
  await act(async () => controller.flow.scan('BOX1', 'MANUAL'));
  await field('Số lượng linh kiện cần xuất', '2');
  await press('Xác nhận số lượng');
  expect(controller.snapshot().counts).toEqual({ codes: 2, quantity: 3 });
  expect(server.writes).toBe(0);
  await press('Kiểm tra linh kiện →');
  const saved = server.calls.find(call => call.method === 'PUT');
  expect(saved.body.codes.map(row => row.scan_source)).toEqual(['CAMERA', 'MANUAL']);
});
it('S03 saves exact batch, Cancel preserves it, explicit confirmation creates verified S04 once', async () => {
  const { controller, server } = setup(), onBack = jest.fn();
  await render(controller, { onBack });
  await filled(controller);
  await press('Kiểm tra linh kiện →');
  expect(text()).toContain('P19.S03');
  expect(server.writes).toBe(1);
  await press('Xác nhận xuất linh kiện →');
  await press('Hủy');
  expect(server.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(0);
  await press('Xác nhận xuất linh kiện →');
  await press('Xác nhận giảm tồn');
  expect(text()).toContain('P19.S04');
  expect(text()).toContain('thành công');
  expect(controller.snapshot().receipt.quantity).toBe(3);
  expect(controller.snapshot().receipt.version).toBe(9);
  expect(controller.snapshot().document.version).toBe(2);
  expect(server.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(1);
  await press('Xem hồ sơ bảo hành →');
  expect(onBack).toHaveBeenCalledTimes(1);
});
it('dirty S03 uses SAVE only and requires another user confirmation before RECORD', async () => {
  const { controller, server } = setup();
  await render(controller);
  await filled(controller);
  await press('Kiểm tra linh kiện →');
  await act(() => { controller.flow.editQuantity('BOX1'); controller.flow.quantity(4); });
  expect(text()).toContain('Lưu thay đổi');
  await press('Lưu thay đổi');
  expect(server.calls.filter(call => call.method === 'PUT')).toHaveLength(2);
  expect(server.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(0);
  expect(text()).toContain('Xác nhận xuất linh kiện →');
});
it.each(['SAVE', 'RECORD'])('UNKNOWN %s shows no result and reconciles original request without replay', async command => {
  const { controller, server } = setup();
  await render(controller);
  await filled(controller);
  server.options.lose = command;
  await press('Kiểm tra linh kiện →');
  if (command === 'RECORD') { await press('Xác nhận xuất linh kiện →'); await press('Xác nhận giảm tồn'); }
  const request = controller.owner.checkpoint().pending;
  expect(text()).not.toContain('thành công');
  expect(text()).toContain(command === 'SAVE' ? 'Chưa xác định đã lưu nháp' : 'Chưa xác định đã xuất');
  await press(command === 'SAVE' ? 'Đối chiếu kết quả lưu nháp' : 'Đối chiếu kết quả xuất');
  const check = server.calls.find(call => call.path.endsWith('/requests/' + request.key));
  expect(check.method).toBe('GET');
  expect(server.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(command === 'RECORD' ? 1 : 0);
});
it('private journal retains IDs/request across owner restart and isolates another auth session', async () => {
  const storage = createStorage(createMemoryBackend()), journal = p19LinkedJournal(scope, id(4), storage);
  const first = setup({ journal });
  await first.controller.initialize();
  await first.controller.flow.scan('ITEM1');
  await first.controller.flow.prepareReview();
  first.server.options.lose = 'RECORD';
  await first.controller.flow.post();
  const saved = journal.load().checkpoint;
  const next = setup({ journal, checkpoint: saved, offlineRequest: first.server.request });
  await next.controller.initialize();
  expect(next.controller.snapshot().unknown).toBe(true);
  expect(next.controller.snapshot().request.id).toBe(saved.pending.key);
  await next.controller.flow.reconcile();
  expect(next.controller.snapshot().receipt).not.toBe(null);
  expect(first.server.calls.filter(call => call.path.endsWith('/record'))).toHaveLength(1);
  expect(p19LinkedJournal({ ...scope, authSessionId: id(99) }, id(4), storage).load().checkpoint).toBeUndefined();
  expect(storage.keys()).toHaveLength(1);
});
it('journal failure blocks mutation before the transport is called', async () => {
  const { controller, server } = setup({ journal: { write() { throw Error('disk'); } } });
  await controller.initialize();
  await controller.flow.scan('ITEM1');
  await controller.flow.prepareReview();
  expect(server.calls.filter(call => call.method === 'PUT' || call.path.endsWith('/record'))).toHaveLength(0);
  expect(controller.snapshot().canPost).toBe(false);
  expect(controller.snapshot().receipt).toBe(null);
});
