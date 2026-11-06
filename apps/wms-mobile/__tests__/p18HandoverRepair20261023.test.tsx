import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { WarrantyCaseDetail } from '../src/features/warranty/WarrantyCaseDetail';
import { Input } from '../src/ui/Input';
import { Checkbox } from '../src/ui/Checkbox';
import { P09Action } from '../src/features/warranty/P09Presentation';
import { createP09CommandOwner } from '../src/features/warranty/p09Controller';
import { p09RecoveryJournal } from '../src/features/warranty/p09RecoveryJournal';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import {
  handoverErrors,
  readHandoverSnapshot,
} from '../src/services/wms/p09Handover';
import {
  harness,
  caseRow,
  envelope,
  id,
  receipt,
  deferred,
} from './fixtures/p09Mock';
const current = () => ({ ...caseRow(), status: 'COMPLETED' as const });
const draft = () => ({
  receiver: 'TEST receiver',
  handover_date: '2026-10-20',
  handover_checked: true,
  note: 'TEST handover',
});
const snapshot = () => ({
  ...draft(),
  contract: 'p09-warranty-handover-v1',
  receiver_masked: false,
  note_redacted: false,
  returned_at: '2026-10-23T03:00:00Z',
  returned_at_source: 'warranty_case.returned_at_server_time',
});
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));

test('handover keeps structured fields separate with exact optimistic version and immutable request identity', () => {
  const h = harness();
  const c = h.service.prepareHandover(current(), draft());
  expect(c).toMatchObject({
    operation: 'UPDATE',
    method: 'PATCH',
    target: id(4),
    headers: {
      'If-Match': '"2"',
      'X-Request-ID': id(20),
      'Idempotency-Key': id(20),
    },
    body: { ...draft(), status: 'RETURNED' },
  });
  expect(Object.isFrozen(c.body)).toBe(true);
  expect(() =>
    h.service.prepareUpdate(current(), { status: 'RETURNED' as never }),
  ).toThrow();
});
test.each([
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'RETURNED',
  'CANCELLED',
] as const)('handover cannot return a %s case', status => {
  expect(() =>
    harness().service.prepareHandover({ ...current(), status }, draft()),
  ).toThrow();
});
test.each([
  { receiver: '' },
  { receiver: 'a'.repeat(201) },
  { handover_checked: false },
  { handover_date: '2026-02-30' },
  { handover_date: '2099-01-01' },
  { note: ' ' },
  { note: 'a'.repeat(2001) },
])('invalid handover cannot allocate a command: %j', values => {
  const h = harness();
  expect(
    Object.keys(handoverErrors({ ...draft(), ...values })).length,
  ).toBeGreaterThan(0);
  expect(() =>
    h.service.prepareHandover(current(), { ...draft(), ...values }),
  ).toThrow();
  expect(h.calls).toHaveLength(0);
});
test('handover requires manage and matching owner scope before command creation', () => {
  const h = harness();
  h.setContext({
    ...h.context(),
    user: { ...h.context().user!, permissions: ['warranty.view'] },
  });
  expect(() => h.service.prepareHandover(current(), draft())).toThrow();
});
test('handover timeout persists only original GET identity, never receiver/note, and cannot dispatch twice', async () => {
  const pending = deferred<unknown>();
  const h = harness(o =>
    o.method === 'PATCH'
      ? pending.promise
      : envelope({
          receipt: receipt('SUCCEEDED', {
            operation: 'UPDATE',
            status: 'RETURNED',
            version: 3,
          }),
        }),
  );
  const journal = p09RecoveryJournal(h.service);
  const owner = createP09CommandOwner(h.service, journal);
  const first = owner.confirm(() =>
    h.service.prepareHandover(current(), draft()),
  );
  await Promise.resolve();
  await owner.confirm(() => h.service.prepareHandover(current(), draft()));
  expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
  pending.reject(new AppError({ kind: 'timeout', message: 'Unknown result' }));
  await first;
  expect(owner.snapshot().phase).toBe('unknown');
  expect(JSON.stringify(journal.load())).not.toContain('TEST receiver');
  expect(JSON.stringify(journal.load())).not.toContain('TEST handover');
  await expect(
    owner.confirm(() => h.service.prepareHandover(current(), draft())),
  ).rejects.toThrow();
  const restored = createP09CommandOwner(h.service, journal);
  expect(restored.snapshot().phase).toBe('unknown');
  expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
});
test('handover does not accept a generic success status or a wrong receipt version', async () => {
  for (const extra of [
    { status: 'COMPLETED', version: 3 },
    { status: 'RETURNED', version: 2 },
  ]) {
    const h = harness(() =>
      envelope({
        receipt: receipt('SUCCEEDED', { operation: 'UPDATE', ...extra }),
      }),
    );
    await expect(
      h.service.send(h.service.prepareHandover(current(), draft())),
    ).rejects.toMatchObject({ code: 'P09_HANDOVER_RECEIPT_INVALID' });
  }
});
test('receipt alone cannot show completed handover before canonical handover readback matches', async () => {
  for (const handover of [
    undefined,
    { ...snapshot(), handover_date: '2026-10-19' },
  ]) {
    const h = harness(o =>
      o.method === 'PATCH'
        ? envelope({
            receipt: receipt('SUCCEEDED', {
              operation: 'UPDATE',
              status: 'RETURNED',
              version: 3,
            }),
          })
        : envelope({ ...current(), status: 'RETURNED', version: 3, handover }),
    );
    const owner = createP09CommandOwner(h.service);
    await owner.confirm(() => h.service.prepareHandover(current(), draft()));
    expect(owner.snapshot().phase).toBe('saved-unloaded');
  }
});
test('canonical handover readback completes the original request; redacted snapshot cannot expose receiver/note', async () => {
  const h = harness(o =>
    o.method === 'PATCH'
      ? envelope({
          receipt: receipt('SUCCEEDED', {
            operation: 'UPDATE',
            status: 'RETURNED',
            version: 3,
          }),
        })
      : envelope({
          ...current(),
          status: 'RETURNED',
          version: 3,
          handover: snapshot(),
        }),
  );
  const owner = createP09CommandOwner(h.service);
  await owner.confirm(() => h.service.prepareHandover(current(), draft()));
  expect(owner.snapshot().phase).toBe('succeeded');
  expect(() => readHandoverSnapshot(snapshot(), [])).toThrow();
  expect(
    readHandoverSnapshot(
      {
        ...snapshot(),
        receiver: 'T***',
        receiver_masked: true,
        note: null,
        note_redacted: true,
      },
      [],
    )?.note,
  ).toBeNull();
});

test('native handover form preserves draft after Back and double confirm shares the P09 latch', async () => {
  const pending = deferred<unknown>();
  const h = harness(o =>
    o.method === 'PATCH'
      ? pending.promise
      : o.path.endsWith('/events') ||
        o.path.endsWith('/attachments') ||
        o.path.endsWith('/component-issues')
      ? envelope([], {
          total: 0,
          hasMore: false,
          nextCursor: null,
          nextPage: null,
          pagination: 'KEYSET',
        })
      : envelope(current()),
  );
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <WarrantyCaseDetail
          warrantyCase={current()}
          service={h.service}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  const press = async (label: string) =>
    act(async () =>
      tree.root
        .findAllByType(P09Action)
        .find(node => node.props.label === label)!
        .props.onPress(),
    );
  try {
    await press('Bàn giao khách hàng');
    expect(tree.root.findByProps({ testID: 'P18.S03' })).toBeDefined();
    await act(async () => {
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Người nhận*')!
        .props.onChangeText('TEST receiver');
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Ghi chú bàn giao*')!
        .props.onChangeText('TEST handover');
      tree.root.findByType(Checkbox).props.onToggle();
    });
    await press('Về hồ sơ');
    await press('Bàn giao khách hàng');
    expect(
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Người nhận*')!.props.value,
    ).toBe('TEST receiver');
    const confirm = tree.root
      .findAllByType(P09Action)
      .find(node => node.props.label === 'Xác nhận bàn giao')!.props.onPress;
    await act(async () => {
      confirm();
      confirm();
    });
    expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
    pending.reject(
      new AppError({ kind: 'timeout', message: 'Unknown handover' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      tree.root
        .findAllByType(P09Action)
        .find(node => node.props.label === 'Xác nhận bàn giao')!.props.disabled,
    ).toBe(true);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('native STALE_VERSION keeps fields, blocks the old version and offers explicit canonical reload', async () => {
  let version = 2;
  const h = harness(o => {
    if (o.method === 'PATCH') {
      version = 3;
      return envelope({
        receipt: receipt('FAILED', {
          operation: 'UPDATE',
          status: 'COMPLETED',
          version: 3,
          error_code: 'STALE_VERSION',
          may_create_new_request: true,
        }),
      });
    }
    if (
      o.path.endsWith('/events') ||
      o.path.endsWith('/attachments') ||
      o.path.endsWith('/component-issues')
    )
      return envelope([], {
        total: 0,
        hasMore: false,
        nextCursor: null,
        nextPage: null,
        pagination: 'KEYSET',
      });
    return envelope({ ...current(), version });
  });
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <WarrantyCaseDetail
          warrantyCase={current()}
          service={h.service}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  const press = async (label: string) =>
    act(async () =>
      tree.root
        .findAllByType(P09Action)
        .find(node => node.props.label === label)!
        .props.onPress(),
    );
  try {
    await press('Bàn giao khách hàng');
    await act(async () => {
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Người nhận*')!
        .props.onChangeText('TEST retained receiver');
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Ghi chú bàn giao*')!
        .props.onChangeText('TEST retained note');
      tree.root.findByType(Checkbox).props.onToggle();
    });
    await press('Xác nhận bàn giao');
    expect(
      tree.root
        .findAllByType(P09Action)
        .find(node => node.props.label === 'Xác nhận bàn giao')!.props.disabled,
    ).toBe(true);
    expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
    await press('Đọc lại phiên bản hồ sơ');
    await press('Bàn giao khách hàng');
    expect(
      tree.root
        .findAllByType(Input)
        .find(node => node.props.label === 'Người nhận*')!.props.value,
    ).toBe('TEST retained receiver');
    expect(
      tree.root
        .findAllByType(P09Action)
        .find(node => node.props.label === 'Xác nhận bàn giao')!.props.disabled,
    ).toBe(false);
    expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
  } finally {
    await act(async () => tree.unmount());
  }
});
