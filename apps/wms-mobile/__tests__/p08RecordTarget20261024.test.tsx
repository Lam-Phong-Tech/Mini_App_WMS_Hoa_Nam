import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { parseP08RecordTarget } from '../src/services/wms/p08RecordTarget';
import { p08Scope } from '../src/services/wms/p08History';
import { context, harness, id } from './fixtures/p08Mock';
import { P08HistoryScreen } from '../src/features/history/P08HistoryScreen';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
const capability = (path?: string) => ({
  available: Boolean(path),
  read_target: path
    ? { method: 'GET', path, query: { warehouse_id: id(3) } }
    : null,
});
const wire = (source = 'DOCUMENT', kind = 'inbound') => {
  const path =
    source === 'DOCUMENT'
      ? '/api/v1/mini-app/' + kind + '-documents/' + id(9)
      : source === 'WARRANTY'
      ? '/api/v1/mini-app/warranty-cases/' + id(9)
      : undefined;
  return {
    contract: 'p08-record-target-v1',
    identity: {
      record_id: source + ':' + id(9),
      source,
      owner_id: id(9),
      warehouse_id: id(3),
      resource_type: (
        {
          DOCUMENT: 'STOCK_DOCUMENT',
          WARRANTY: 'WARRANTY_CASE',
          NFC: 'PHYSICAL_CODE',
          SCAN: 'SCAN_BATCH',
        } as Record<string, string>
      )[source],
    },
    detail: capability(path),
    attachments: capability(path && path + '/attachments'),
    scan_session: capability(
      source === 'SCAN'
        ? '/api/v1/mini-app/history/scan-sessions/' + id(9)
        : undefined,
    ),
    nfc_history: capability(
      source === 'NFC'
        ? '/api/v1/mini-app/nfc-tags/' + id(9) + '/events'
        : undefined,
    ),
    owner_permission_rechecked_on_open: true,
    selection_policy: 'NO_ACTIVITY_SELECTED_WITHOUT_EXPLICIT_ACTIVITY_ID',
    is_confirmation_receipt: false,
    write_operations: [],
  };
};
test.each(['inbound', 'outbound'])(
  'record target resolves canonical %s independently of selected activity',
  kind => {
    expect(
      parseP08RecordTarget(
        wire('DOCUMENT', kind),
        'DOCUMENT:' + id(9),
        p08Scope(context()),
      ),
    ).toMatchObject({
      detail: { kind, id: id(9), warehouseId: id(3) },
      attachments: true,
    });
  },
);
test.each(['WARRANTY', 'NFC', 'SCAN'])(
  'record target keeps %s namespaces distinct',
  source => {
    const parsed = parseP08RecordTarget(
      wire(source),
      source + ':' + id(9),
      p08Scope(context()),
    );
    expect(parsed.source).toBe(source);
    expect(parsed.nfcHistory).toBe(source === 'NFC');
    expect(parsed.scanSession).toBe(source === 'SCAN');
  },
);
test.each([
  (r: any) => {
    r.identity.owner_id = id(90);
  },
  (r: any) => {
    r.identity.warehouse_id = id(90);
  },
  (r: any) => {
    r.identity.source = 'WARRANTY';
  },
  (r: any) => {
    r.detail.read_target.method = 'POST';
  },
  (r: any) => {
    r.detail.read_target.path = 'https://invalid.example/';
  },
  (r: any) => {
    r.detail.read_target.query.extra = 'x';
  },
  (r: any) => {
    r.attachments.read_target.path =
      '/api/v1/mini-app/inbound-documents/' + id(99) + '/attachments';
  },
  (r: any) => {
    r.is_confirmation_receipt = true;
  },
  (r: any) => {
    r.write_operations.push('POST');
  },
  (r: any) => {
    r.selection_policy = 'FIRST_EVENT';
  },
])(
  'invalid parent capability cannot navigate or synthesize an activity %#',
  change => {
    const raw = wire();
    change(raw);
    expect(() =>
      parseP08RecordTarget(raw, 'DOCUMENT:' + id(9), p08Scope(context())),
    ).toThrow();
  },
);
test('documents.read is still required for a DOCUMENT parent, but absent capabilities do not invent a link', () => {
  const scope = p08Scope(context());
  scope.permissions = scope.permissions.filter(p => p !== 'documents.read');
  expect(() =>
    parseP08RecordTarget(wire(), 'DOCUMENT:' + id(9), scope),
  ).toThrow();
  const raw = wire();
  raw.detail = capability();
  raw.attachments = capability();
  expect(
    parseP08RecordTarget(raw, 'DOCUMENT:' + id(9), scope).detail,
  ).toBeUndefined();
});
test('actual P08 decoder and UI can open a zero-event parent without first-event fallback', async () => {
  const h = harness(body => {
    if (body.data?.recordId) {
      body.data.selectedActivity = null;
      body.data.events = [];
      body.meta.total = 0;
      body.data.record_target = wire();
      body.meta.record_target_contract = 'p08-record-target-v1';
    }
  });
  const detail = await h.api.detail('DOCUMENT:' + id(9));
  expect(detail.data.selectedActivity).toBeNull();
  expect(detail.data.events).toHaveLength(0);
  expect(detail.data.recordTarget?.detail?.kind).toBe('inbound');
  let tree!: Renderer.ReactTestRenderer;
  const open = jest.fn();
  try {
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialRecordId={'DOCUMENT:' + id(9)}
            onBack={() => {}}
            onOpenDocument={open}
          />
        </AppProviders>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const button = tree.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Xem chứng từ')!;
    expect(button).toBeDefined();
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Chứng từ');
    expect(rendered).toContain('Chưa chọn hoạt động');
    expect(rendered).not.toContain('Hoạt động gần nhất');
    await act(async () => button.props.onPress());
    expect(open).toHaveBeenCalledWith('inbound', id(9));
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
