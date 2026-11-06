import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { AppProviders } from '../src/app/App';
import { CodeInput } from '../src/ui/CodeInput';
import { P09CameraSurface } from '../src/features/warranty/P09ScanEntry';
import { P09Dialog } from '../src/features/warranty/P09Presentation';
import {
  P24RejectedCodePresentation,
  P24QuantityPresentation,
} from '../src/features/scan/P24StatePresentation';
import {
  P19NativeFlow,
  type P19NativeFlowProps,
} from '../src/features/warranty/p19/P19NativeFlow';
import { P19EntryScreen } from '../src/features/warranty/p19/P19EntryScreen';
import { retainP19Owner } from '../src/features/warranty/p19/p19OwnerRegistry';
import { createP19NativeController } from '../src/features/warranty/p19/p19NativeController';
import { linkedServer, scope, id } from './fixtures/p19LinkedServer';
import type { P19Scope } from '../src/features/warranty/p19/p19Types';
import type { P09Service } from '../src/services/wms/p09Warranty';
import type { WarrantyCase } from '../src/services/wms/types';

jest.setTimeout(30000);
jest.mock('../src/features/warranty/P09NativeCamera', () => ({
  P09NativeCamera: () => null,
}));
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
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
  return { controller, server };
}
async function mount(
  controller: ReturnType<typeof setup>['controller'],
  props: Partial<P19NativeFlowProps> = {},
) {
  await act(async () => {
    await controller.initialize();
    tree = Renderer.create(
      <AppProviders>
        <P19NativeFlow
          controller={controller}
          scanAvailable={false}
          onBack={() => {}}
          {...props}
        />
      </AppProviders>,
    );
  });
}
async function press(label: string) {
  await act(async () => {
    const button = tree!.root
      .findAllByProps({ accessibilityLabel: label })
      .find(n => typeof n.props.onPress === 'function');
    if (!button || button.props.disabled) throw Error('Unavailable ' + label);
    await button.props.onPress();
  });
}
async function inputCode(raw: string) {
  await press('Nhập tay');
  await act(() => {
    tree!.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'Mã linh kiện hoặc mã hộp')!
      .props.onChangeText(raw);
  });
  await press('Kiểm tra mã');
}
async function posted() {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  await h.controller.flow.prepareReview();
  await h.controller.flow.post();
  return h;
}

test('rejection replaces the scan surface, uses UNKNOWN kind even for BOX prefix and retains the original owner', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  await mount(h.controller);
  const checkpoint = h.controller.checkpoint();
  const raw = 'BOX-ASCII-UNVERIFIED';
  h.server.options.resolvers = {
    [raw]: {
      resolved: false,
      eligible_for_issue: false,
      eligibility_code: 'TEST_DENIED',
      eligibility_message: 'Lý do TEST nguyên bản',
    },
  };
  await inputCode(raw);
  const rejected = tree!.root.findByType(P24RejectedCodePresentation);
  expect(rejected.props.itemKind).toBe('UNKNOWN');
  expect(rejected.props.rawCode).toBe(raw);
  expect(rejected.props.reason).toBe('Lý do TEST nguyên bản');
  expect(rejected.props.warehouseName).toBe(null);
  expect(rejected.props.acceptedCodeCount).toBe(1);
  expect(rejected.props.draftLabel).toBe((checkpoint as any).draftId);
  expect(tree!.root.findAllByType(P09CameraSurface)).toHaveLength(0);
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: 'Kiểm tra linh kiện →' }),
  ).toHaveLength(0);
  expect(tree!.root.findAllByProps({ testID: 'P19.S01' })).toHaveLength(0);
  expect(h.controller.checkpoint()).toEqual(checkpoint);
  expect(h.server.writes).toBe(0);
});

test.each(['Sửa mã vừa nhập', 'Quét mã khác'])(
  '%s changes local rejection view only, no auto-scan or accepted/request/version mutation',
  async label => {
    const h = setup();
    await h.controller.initialize();
    await h.controller.flow.scan('ITEM1');
    await mount(h.controller);
    const checkpoint = h.controller.checkpoint();
    const raw = 'MAF-MixedCase/TEST';
    await inputCode(raw);
    const count = h.server.calls.length;
    await press(label);
    expect(tree!.root.findAllByType(P24RejectedCodePresentation)).toHaveLength(
      0,
    );
    expect(tree!.root.findByType(CodeInput).props.value).toBe(
      label === 'Sửa mã vừa nhập' ? raw : '',
    );
    expect(h.controller.checkpoint()).toEqual(checkpoint);
    expect(h.server.calls).toHaveLength(count);
    expect(h.server.writes).toBe(0);
  },
);

test('rejection reader keeps full original text in one app dialog; Back closes reader before returning caller', async () => {
  const h = setup();
  const onBack = jest.fn();
  await mount(h.controller, { onBack });
  await inputCode('RAW-INVALID');
  const checkpoint = h.controller.checkpoint();
  const raw = 'Nguyên bản\n' + 'TEST🌸'.repeat(100);
  await act(() =>
    tree!.root
      .findByType(P24RejectedCodePresentation)
      .props.onReadFull('Lý do', raw),
  );
  expect(tree!.root.findAllByType(P09Dialog)).toHaveLength(1);
  expect(JSON.stringify(tree!.toJSON())).toContain(raw.replace(/\n/g, '\\n'));
  await act(() =>
    tree!.root.findByType(P24RejectedCodePresentation).props.onBack(),
  );
  expect(tree!.root.findAllByType(P09Dialog)).toHaveLength(0);
  expect(onBack).not.toHaveBeenCalled();
  await act(() =>
    tree!.root.findByType(P24RejectedCodePresentation).props.onBack(),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(h.controller.checkpoint()).toEqual(checkpoint);
  expect(h.server.writes).toBe(0);
});

test('quantity uses the parent bottom dialog and existing owner validator/cancel, no second quantity presenter', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  await mount(h.controller);
  const checkpoint = h.controller.checkpoint();
  await inputCode('BOX1');
  const dialog = tree!.root.findByType(P09Dialog);
  expect(dialog.props.placement).toBe('bottom');
  expect(dialog.props.dismissOnBackdrop).toBe(false);
  expect(tree!.root.findAllByType(P24QuantityPresentation)).toHaveLength(0);
  const validator = jest.spyOn(h.controller.flow, 'quantityError');
  await act(() =>
    tree!.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'Số lượng linh kiện cần xuất')!
      .props.onChangeText('13'),
  );
  expect(validator).toHaveBeenCalledWith('13');
  await press('Hủy');
  expect(h.controller.checkpoint()).toEqual(checkpoint);
  expect(h.server.writes).toBe(0);
});

test.each(['Xem hồ sơ bảo hành →', 'Quay lại hồ sơ'])(
  'verified result via %s emits exact IDs once without another Post',
  async action => {
    const h = await posted();
    const onVerifiedResult = jest.fn(),
      onBack = jest.fn();
    await mount(h.controller, { onVerifiedResult, onBack });
    const receipt = h.controller.snapshot().receipt!;
    await press(action);
    await press(action);
    expect(onVerifiedResult).toHaveBeenCalledTimes(1);
    expect(onVerifiedResult).toHaveBeenCalledWith({
      caseId: receipt.caseId,
      businessDocumentId: receipt.id,
      requestId: receipt.requestId,
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(
      h.server.calls.filter((r: any) => r.path.endsWith('/record')),
    ).toHaveLength(1);
  },
);

test('EntryScreen forwards optional result callback with exact case/context, keeping legacy onBack fallback', async () => {
  const h = await posted();
  const onVerifiedResult = jest.fn();
  const service = {
    contextKey: () => 'P19-TEST-CONTEXT',
    scope: () => scope,
  } as unknown as P09Service;
  retainP19Owner(service, id(4), h.controller);
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P19EntryScreen
          service={service}
          warrantyCase={
            {
              warranty_case_id: id(4),
              status: 'CHECKING',
              version: 1,
            } as WarrantyCase
          }
          onBack={() => {}}
          onVerifiedResult={onVerifiedResult}
        />
      </AppProviders>,
    );
  });
  await press('Xem hồ sơ bảo hành →');
  expect(onVerifiedResult).toHaveBeenCalledWith({
    caseId: id(4),
    businessDocumentId: h.controller.snapshot().receipt!.id,
    requestId: h.controller.snapshot().receipt!.requestId,
  });
});

test.each(['scope', 'receipt'])(
  'stale %s at action time cannot dispatch a verified-result navigation',
  async changed => {
    const h = await posted();
    const onVerifiedResult = jest.fn(),
      onBack = jest.fn();
    await mount(h.controller, { onVerifiedResult, onBack });
    if (changed === 'scope')
      jest.spyOn(h.controller, 'currentScope').mockReturnValue(false);
    else {
      const previous = h.controller.snapshot();
      jest
        .spyOn(h.controller, 'snapshot')
        .mockReturnValue({
          ...previous,
          receipt: { ...previous.receipt!, id: id(999) },
        });
    }
    await press('Xem hồ sơ bảo hành →');
    expect(onVerifiedResult).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(
      h.server.calls.filter((r: any) => r.path.endsWith('/record')),
    ).toHaveLength(1);
  },
);

test('UNKNOWN Back retains original frozen request and never calls result callback', async () => {
  const h = setup();
  await h.controller.initialize();
  await h.controller.flow.scan('ITEM1');
  await h.controller.flow.prepareReview();
  h.server.options.lose = 'RECORD';
  await h.controller.flow.post();
  const pending = (h.controller.checkpoint() as any).pending;
  const onVerifiedResult = jest.fn(),
    onBack = jest.fn();
  await mount(h.controller, { onVerifiedResult, onBack });
  await press('Quay lại hồ sơ');
  expect(onVerifiedResult).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect((h.controller.checkpoint() as any).pending).toEqual(pending);
  expect(
    h.server.calls.filter((r: any) => r.path.endsWith('/record')),
  ).toHaveLength(1);
});
