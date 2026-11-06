import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, TextInput } from 'react-native';
import { AppProviders } from '../src/app/App';
import { CodeInput } from '../src/ui/CodeInput';
import { Input } from '../src/ui/Input';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { P19NativeFlow } from '../src/features/warranty/p19/P19NativeFlow';
import {
  P19Icon,
  P19ResultSummary,
} from '../src/features/warranty/p19/P19Presentation';
import { createP19NativeController } from '../src/features/warranty/p19/p19NativeController';
import { linkedServer, scope, id } from './fixtures/p19LinkedServer';
import type { P19Scope } from '../src/features/warranty/p19/p19Types';

// Native renderer initialization shares a constrained Windows test host with
// other board owners; keep assertions strict without a 5-second startup race.
jest.setTimeout(30000);

let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
});
function setup() {
  const server = linkedServer();
  let sequence = 20;
  const controller = createP19NativeController({
    getScope: () => scope as P19Scope,
    caseId: id(4),
    presentation: {
      caseLabel: 'WC-TEST',
      productName: 'TEST',
      status: 'CHECKING',
    },
    offlineRequest: server.request,
    uuid: () => id(++sequence),
  });
  return { server, controller };
}
async function mount(controller: ReturnType<typeof setup>['controller']) {
  await act(async () => {
    await controller.initialize();
    tree = Renderer.create(
      <AppProviders>
        <P19NativeFlow
          controller={controller}
          scanAvailable={false}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
}
function nativeField(label: string) {
  const field = tree!.root
    .findAllByType(TextInput)
    .find(n => n.props.accessibilityLabel === label);
  if (!field) throw Error('Missing field ' + label);
  return field;
}
async function change(label: string, value: string) {
  await act(() => nativeField(label).props.onChangeText(value));
}
async function press(label: string) {
  await act(async () => {
    const node = tree!.root
      .findAllByProps({ accessibilityLabel: label })
      .find(n => typeof n.props.onPress === 'function');
    if (!node || node.props.disabled)
      throw Error('Unavailable action ' + label);
    await node.props.onPress();
  });
}
const codeLabel = 'Mã linh kiện hoặc mã hộp';
const quantityLabel = 'Số lượng linh kiện cần xuất';

test('manual machine codes use the shared IME policy and preserve exact case/raw/source', async () => {
  const { server, controller } = setup();
  const raw = 'box-TEST-MAF.Case/001';
  server.options.resolvers = {
    [raw]: { ...server.resolve('BOX1'), raw_code: raw },
  };
  await mount(controller);
  await press('Nhập tay');
  expect(tree!.root.findAllByType(CodeInput)).toHaveLength(1);
  const code = nativeField(codeLabel);
  expect(code.props.keyboardType).toBe('visible-password');
  expect(code.props.autoCorrect).toBe(false);
  expect(code.props.spellCheck).toBe(false);
  expect(code.props.autoCapitalize).toBe('none');
  expect(code.props.blurOnSubmit).toBe(false);
  await change(codeLabel, raw);
  await press('Kiểm tra mã');
  const request = server.calls.find((r: any) =>
    r.path.endsWith('/resolve-code'),
  );
  expect(request.body.raw_code).toBe(raw);
  expect(controller.snapshot().pending?.code).toBe(raw);
  expect(nativeField(quantityLabel).props.keyboardType).toBe('number-pad');
  expect(nativeField(quantityLabel).props.selectTextOnFocus).toBe(true);
  await press('Xác nhận số lượng');
  expect(controller.snapshot().lines[0].code).toBe(raw);
  expect((controller.checkpoint() as any).rows[0].scan_source).toBe('MANUAL');
  expect(nativeField(codeLabel).props.value).toBe('');
  expect(server.writes).toBe(0);
});

test('accepted ITEM clears only the submitted input and never replaces the next code typed during resolve', async () => {
  const { server, controller } = setup();
  await mount(controller);
  await press('Nhập tay');
  await change(codeLabel, 'ITEM1');
  await press('Kiểm tra mã');
  expect(nativeField(codeLabel).props.value).toBe('');
  server.options.delay = 30;
  await change(codeLabel, 'ITEM2');
  let submitted: Promise<unknown> = Promise.resolve();
  act(() => {
    submitted = nativeField(codeLabel).props.onSubmitEditing();
  });
  await change(codeLabel, 'ITEM3-NEXT');
  await act(async () => {
    await submitted;
  });
  expect(nativeField(codeLabel).props.value).toBe('ITEM3-NEXT');
  expect(controller.snapshot().lines.map(row => row.code)).toEqual([
    'ITEM1',
    'ITEM2',
  ]);
  expect(controller.snapshot().counts.quantity).toBe(2);
  expect(
    server.calls.filter((r: any) => r.path.endsWith('/resolve-code')),
  ).toHaveLength(2);
  expect(server.writes).toBe(0);
});

test('BOX cancel keeps the entered raw and accepted ITEM, invalid quantity never mutates owner rows', async () => {
  const { server, controller } = setup();
  await controller.initialize();
  await controller.flow.scan('ITEM1');
  await mount(controller);
  await press('Nhập tay');
  await change(codeLabel, 'BOX1');
  await press('Kiểm tra mã');
  await change(quantityLabel, '0');
  expect(
    tree!.root.findAllByType(Input).find(n => n.props.label === quantityLabel)
      ?.props.errorText,
  ).toBeTruthy();
  await press('Hủy');
  expect(nativeField(codeLabel).props.value).toBe('BOX1');
  expect(controller.snapshot().counts).toEqual({ codes: 1, quantity: 1 });
  expect(server.writes).toBe(0);
});

test('quantity steppers share inline validation, recover invalid text and stop at1/verified stock', async () => {
  const { controller, server } = setup();
  await mount(controller);
  await act(async () => {
    await controller.flow.scan('BOX1');
  });
  await change(quantityLabel, '0');
  await press('Tăng');
  expect(nativeField(quantityLabel).props.value).toBe('1');
  expect(
    tree!.root.findAllByType(Input).find(n => n.props.label === quantityLabel)
      ?.props.errorText,
  ).toBe('');
  const minus = tree!.root
    .findAllByProps({ accessibilityLabel: 'Giảm' })
    .find(n => typeof n.props.onPress === 'function');
  expect(minus?.props.disabled).toBe(true);
  await change(quantityLabel, 'NaN');
  await press('Tăng');
  expect(nativeField(quantityLabel).props.value).toBe('1');
  await change(quantityLabel, '12');
  const plus = tree!.root
    .findAllByProps({ accessibilityLabel: 'Tăng' })
    .find(n => typeof n.props.onPress === 'function');
  expect(plus?.props.disabled).toBe(true);
  expect(controller.snapshot().lines).toHaveLength(0);
  expect(server.writes).toBe(0);
});

test('S04 keeps the exact verified receipt and uses an approved check glyph and aligned result values', async () => {
  const { controller, server } = setup();
  await controller.initialize();
  await controller.flow.scan('ITEM1');
  await controller.flow.scan('BOX1');
  controller.flow.quantity(2);
  await controller.flow.prepareReview();
  await controller.flow.post();
  await mount(controller);
  expect(
    tree!.root.findAllByProps({ testID: 'P19.S04' }).length,
  ).toBeGreaterThan(0);
  expect(
    tree!.root.findAllByType(P19Icon).filter(n => n.props.name === 'check'),
  ).toHaveLength(3);
  expect(
    tree!.root
      .findAllByType(P04Icon)
      .some(n => n.props.name === 'check' || n.props.name === 'barcode'),
  ).toBe(false);
  const summary = tree!.root.findByType(P19ResultSummary);
  expect(summary.props.rows.map((r: any) => r.value)).toEqual([
    controller.snapshot().receipt!.documentNo,
    'WC-TEST',
    '2',
    '3 linh kiện',
  ]);
  const value = tree!.root
    .findAllByProps({ testID: 'P19.result-value.0' })
    .find(n => n.props.selectable);
  expect(StyleSheet.flatten(value!.props.style).textAlign).toBe('right');
  expect(
    server.calls.filter((r: any) => r.path.endsWith('/record')),
  ).toHaveLength(1);
});

test('UNKNOWN remains read-only with original request IDs and no success panel', async () => {
  const { controller, server } = setup();
  await controller.initialize();
  await controller.flow.scan('ITEM1');
  await controller.flow.prepareReview();
  server.options.lose = 'RECORD';
  await controller.flow.post();
  const original = controller.checkpoint() as any;
  await mount(controller);
  expect(
    tree!.root.findAllByProps({ testID: 'P19.S03' }).length,
  ).toBeGreaterThan(0);
  expect(tree!.root.findAllByProps({ testID: 'P19.S04' })).toHaveLength(0);
  expect(tree!.root.findAllByType(CodeInput)).toHaveLength(0);
  await press('Chi tiết đối chiếu');
  expect(JSON.stringify(tree!.toJSON())).toContain(original.pending.key);
  expect((controller.checkpoint() as any).pending).toEqual(original.pending);
  expect(
    server.calls.filter((r: any) => r.path.endsWith('/record')),
  ).toHaveLength(1);
});
