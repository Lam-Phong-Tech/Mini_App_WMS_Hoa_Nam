import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { AppState } from 'react-native';
import { clearSession, setSession, getSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { getCurrentEnvironment } from '../src/config/env';
import { assertBeAppRead } from '../src/config/beAppReadRelease';
import {
  createP18LocationService,
  parseComponentLocation,
  componentLocationTarget,
  canReadComponentLocation,
} from '../src/services/wms/p18ComponentLocation';
import { P18LocationScreen } from '../src/features/warehouse/P18LocationScreen';
import { P18BoxesScreen } from '../src/features/warehouse/P18BoxesScreen';
import { P06LookupScreen } from '../src/features/lookup/P06LookupScreen';
import { P06Button } from '../src/features/lookup/P06Presentation';
import {
  p06MockHarness,
  p06MockSession,
  mockId,
} from '../src/web/p06ReviewFixtures';
import { p06ScopeKey } from '../src/services/wms/p06Catalog';
import { parseBoxes, boxQuery } from '../src/services/wms/p18Boxes';
import { Button } from '../src/ui/Button';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import {
  target,
  locationBody,
  locationScope,
  locationUser,
  locationHeaders,
  id,
} from './fixtures/p18ComponentLocation20261103';
import {
  actor,
  session,
  warehouse,
  boxBody,
} from './fixtures/beReleasedReads20261024';
let tree: Renderer.ReactTestRenderer | undefined;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'unit-test-memory-only',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
});
afterEach(async () => {
  await act(() => tree?.unmount());
  tree = undefined;
  resetHardwareBackForTest();
  clearSession();
  jest.restoreAllMocks();
});
const json = () => JSON.stringify(tree?.toJSON());
const mount = async (element: React.ReactElement) => {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
    await Promise.resolve();
  });
};
const press = async (label: string) => {
  await act(async () => {
    tree!.root
      .findAll(
        n =>
          n.props.accessibilityLabel === label &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
};
function setup(body = locationBody(), headers = locationHeaders) {
  const user = locationUser(),
    get = jest.fn(async () => ({
      status: 200,
      data: body,
      header: (k: string) => (headers as Record<string, string>)[k],
    })),
    freshUser = jest.fn(async () => user);
  const service = createP18LocationService(() => ({ user }), {
    client: { get } as any,
    freshUser,
  });
  return { service, get, freshUser, user };
}
test('BOX and exact inherited ITEM retain source versions/time/proof without changing old BOX semantics', () => {
  const box = parseComponentLocation(locationBody(), locationScope(), target);
  expect(box.location).toMatchObject({
    supplied: true,
    value: {
      code: 'TRAY-TEST-UI-18',
      placementVersion: 2,
      boxVersion: 4,
      locationVersion: 3,
      effectiveAt: '2026-11-02T01:00:00.123456Z',
    },
  });
  const item = parseComponentLocation(locationBody('ITEM'), locationScope(), {
    ...target,
    kind: 'ITEM',
  });
  expect(item.location).toMatchObject({
    supplied: true,
    value: {
      membershipId: id(505),
      membershipVersion: 7,
      parentBoxId: id(510),
    },
  });
  expect(
    parseBoxes(boxBody(), locationScope(), boxQuery()).items[0].capacity,
  ).toEqual({ supplied: false, status: 'NOT_CONFIGURED' });
});
test.each(['NOT_RECORDED', 'SOURCE_INCONSISTENT', 'REDACTED_PERMISSION'])(
  'missing location stays distinct: %s',
  status => {
    const body = locationBody('BOX', status),
      scope = locationScope();
    if (status === 'REDACTED_PERMISSION')
      scope.rights = scope.rights.filter(p => p !== 'putaway.view');
    expect(parseComponentLocation(body, scope, target).location).toEqual({
      supplied: false,
      status,
    });
  },
);
test.each([
  (b: any) => (b.meta.revision = 'unknown'),
  (b: any) => (b.data.identity.container_id = id(999)),
  (b: any) => (b.data.warehouse_id = id(999)),
  (b: any) => (b.data.current_location.warehouse_id = id(999)),
  (b: any) => (b.data.current_location.location_kind = 'BIN'),
  (b: any) => (b.data.current_location.location_label = 'invented shelf'),
  (b: any) =>
    (b.data.current_location.provenance.event_source = 'location_hint'),
  (b: any) => delete b.data.current_location.provenance.receipt_id,
  (b: any) => (b.data.current_location.placement_version = 0),
  (b: any) => (b.data.current_location.effective_at = '2026-11-04T00:00:00Z'),
  (b: any) => (b.data.current_location.effective_at = '2026-11-02 08:00:00'),
  (b: any) => (b.data.current_location.observed_at = '2026-11-02T01:00:00Z'),
  (b: any) => (b.meta.snapshot.cross_request_snapshot = true),
  (b: any) => b.meta.capability.write_operations.push('MOVE'),
  (b: any) => (b.data.unit = null),
  (b: any) => delete b.data.unit,
  (b: any) => (b.data.current_location.provenance.basis = 'SHARED_SKU'),
])(
  'untrusted identity/placement/version/time/missing contract rejected %#',
  mutate => {
    const b = locationBody();
    mutate(b);
    expect(() => parseComponentLocation(b, locationScope(), target)).toThrow();
  },
);
test('ITEM proof requires exact membership and parent, actual grant is required for supplied placement', () => {
  const b = locationBody('ITEM');
  delete b.data.current_location.provenance.membership_id;
  expect(() =>
    parseComponentLocation(b, locationScope(), { ...target, kind: 'ITEM' }),
  ).toThrow();
  expect(() =>
    parseComponentLocation(
      locationBody(),
      { ...locationScope(), rights: ['sku.view', 'container.view'] },
      target,
    ),
  ).toThrow();
  expect(canReadComponentLocation(['ADMIN', 'sku.view'], 'ITEM')).toBe(false);
  expect(() =>
    componentLocationTarget({ kind: 'SKU', id: target.id }),
  ).toThrow();
  expect(() =>
    componentLocationTarget({ ...target, warehouse_id: warehouse }),
  ).toThrow();
});
test('only exact GET/header opt-in reaches a fresh owner read; no body/cache headers/quantity', async () => {
  const h = setup();
  await h.service.read(target);
  expect(h.freshUser).toHaveBeenCalledTimes(1);
  expect(h.get).toHaveBeenCalledTimes(1);
  const [path, options] = h.get.mock.calls[0] as unknown as [string, any];
  expect(path).toBe('/api/v1/containers/' + target.id);
  expect(options.query).toEqual({ warehouse_id: warehouse });
  expect(options.headers).toEqual({
    'X-Read-Fields-Contract': 'explicit-read-fields-v1',
    'X-Component-Location-Contract': 'p18-component-location-read-v1',
  });
  expect(() =>
    assertBeAppRead({ path, ...options }, getCurrentEnvironment()),
  ).not.toThrow();
  for (const extra of [
    { method: 'POST' },
    { body: {} },
    { path: '/api/v1/containers' },
    { headers: { ...options.headers, 'If-Match': '"1"' } },
    { beAppRead: undefined },
  ])
    expect(() =>
      assertBeAppRead({ path, ...options, ...extra }, getCurrentEnvironment()),
    ).toThrow();
  expect(() =>
    assertBeAppRead(
      { path, ...options },
      {
        ...getCurrentEnvironment(),
        name: 'customer-production',
        expectedTier: 'customer-production',
      },
    ),
  ).toThrow();
});
test('identity-only grants permit the redacted read; denied fresh grants stop before target GET', async () => {
  const h = setup(locationBody('BOX', 'REDACTED_PERMISSION'));
  h.user.permissions = ['sku.view', 'container.view'];
  await expect(h.service.read(target)).resolves.toMatchObject({
    location: { supplied: false, status: 'REDACTED_PERMISSION' },
  });
  const denied = setup();
  denied.freshUser.mockResolvedValue({
    ...denied.user,
    permissions: ['sku.view'],
  } as any);
  await expect(denied.service.read(target)).rejects.toMatchObject({
    code: 'P18_LOCATION_RIGHTS_CHANGED',
  });
  expect(denied.get).not.toHaveBeenCalled();
});
test('cross-session response cannot publish; abort and invalid private headers are rejected', async () => {
  const h = setup();
  h.get.mockImplementation(async () => {
    setSession({ ...getSession()!, authSessionId: id(999) });
    return {
      status: 200,
      data: locationBody(),
      header: (k: string) => (locationHeaders as any)[k],
    };
  });
  await expect(h.service.read(target)).rejects.toMatchObject({
    code: 'P18_LOCATION_SCOPE_CHANGED',
  });
  setSession({
    accessToken: 'unit-test-memory-only',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
  const broken = setup(locationBody(), {
    ...locationHeaders,
    Vary: 'Authorization, Origin, X-Read-Fields-Contract',
  });
  await expect(broken.service.read(target)).rejects.toMatchObject({
    code: 'P18_LOCATION_PRIVATE_HEADERS_INVALID',
  });
  const c = new AbortController();
  c.abort();
  const aborted = setup();
  await expect(aborted.service.read(target, c.signal)).rejects.toMatchObject({
    kind: 'cancelled',
  });
  expect(aborted.get).not.toHaveBeenCalled();
});
test('P18 source errors do not become empty success; Back aborts pending read and never republishes a late location', async () => {
  let resolve!: (value: any) => void;
  let signal: AbortSignal | undefined;
  const back = jest.fn(),
    service = {
      scopeKey: () => 'same',
      read: jest.fn((_t: any, s?: AbortSignal) => {
        signal = s;
        return new Promise<any>(r => (resolve = r));
      }),
    };
  await mount(
    <P18LocationScreen
      context={{}}
      target={target}
      service={service}
      onBack={back}
    />,
  );
  await press('Về tra cứu');
  expect(back).toHaveBeenCalledTimes(1);
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    resolve(parseComponentLocation(locationBody(), locationScope(), target)),
  );
  expect(json()).not.toContain('TRAY-TEST-UI-18');
});
test.each(['NOT_RECORDED', 'SOURCE_INCONSISTENT', 'REDACTED_PERMISSION'])(
  'P18 renders honest availability %s, no invented bins',
  async status => {
    const service = {
      scopeKey: () => 'same',
      read: jest.fn(async () =>
        parseComponentLocation(
          locationBody('BOX', status),
          locationScope(),
          target,
        ),
      ),
    };
    await mount(
      <P18LocationScreen
        context={{}}
        target={target}
        service={service}
        onBack={jest.fn()}
      />,
    );
    expect(json()).toContain(
      status === 'NOT_RECORDED'
        ? 'Chưa ghi nhận'
        : status === 'SOURCE_INCONSISTENT'
        ? 'Nguồn dữ liệu chưa nhất quán'
        : 'Không có quyền xem thông tin này',
    );
    expect(json()).not.toContain('D-02-01');
  },
);
test('P18 screen expands actual metadata, retry shows source error rather than former result', async () => {
  const service = {
    scopeKey: () => 'same',
    read: jest.fn(async () =>
      parseComponentLocation(locationBody(), locationScope(), target),
    ),
  };
  await mount(
    <P18LocationScreen
      context={{}}
      target={target}
      service={service}
      onBack={jest.fn()}
    />,
  );
  expect(json()).toContain('TRAY-TEST-UI-18');
  await press('Thông tin lưu trữ');
  expect(json()).toContain('02/11/2026 08:00:00');
  expect(json()).toContain('2 / 4 / 3');
  await act(() => tree?.unmount());
  tree = undefined;
  const unavailable = {
    scopeKey: () => 'same',
    read: jest.fn(async () => {
      throw new Error('Nguồn vị trí tạm lỗi 503');
    }),
  };
  await mount(
    <P18LocationScreen
      context={{}}
      target={target}
      service={unavailable}
      onBack={jest.fn()}
    />,
  );
  expect(json()).toContain('Nguồn vị trí tạm lỗi 503');
  expect(json()).not.toContain('TRAY-TEST-UI-18');
});
test('BOX component alone exposes location entry and retains BOX/list ownership', async () => {
  const p = parseBoxes(boxBody(), locationScope(), boxQuery()),
    service = {
      scopeKey: () => 'same',
      boxes: jest.fn(async () => p),
      box: jest.fn(async () => p.items[0]),
    };
  const locationService = {
    scopeKey: () => 'same',
    read: jest.fn(async () =>
      parseComponentLocation(locationBody(), locationScope(), target),
    ),
  };
  await mount(
    <P18BoxesScreen
      context={{}}
      service={service as any}
      locationService={locationService}
      onBack={jest.fn()}
    />,
  );
  await press('Chi tiết BOX ' + p.items[0].code);
  expect(
    tree!.root
      .findAllByType(Button)
      .some(b => b.props.label === 'Xem vị trí linh kiện'),
  ).toBe(true);
  expect(service.box).toHaveBeenCalledWith(
    p.items[0].id,
    expect.any(AbortSignal),
  );
  await act(async () =>
    tree!.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Xem vị trí linh kiện')!
      .props.onPress(),
  );
  expect(locationService.read).toHaveBeenCalledWith(
    { kind: 'BOX', id: p.items[0].id },
    expect.any(AbortSignal),
  );
  await press('Về tra cứu');
  expect(json()).toContain('Thông tin BOX');
  expect(service.boxes).toHaveBeenCalledTimes(1);
  expect(service.box).toHaveBeenCalledTimes(1);
});
test('P06 exact component ITEM opens its own identity; SKU never becomes an ITEM location target', async () => {
  setSession(p06MockSession);
  const h = p06MockHarness(),
    original = h.service.detail.bind(h.service),
    location = jest.fn(),
    boxes = jest.fn();
  h.service.detail = async (...args: Parameters<typeof original>) => {
    const r = await original(...args);
    r.data.card.sku_type = 'COMPONENT';
    return r;
  };
  await mount(
    <P06LookupScreen
      service={h.service}
      onOpenComponentLocation={location}
      onOpenBoxes={boxes}
      initialViewState={{
        scopeKey: p06ScopeKey(p06MockSession),
        query: '',
        mode: 'keyword',
        category: 'COMPONENT',
        status: 'ACTIVE',
        panel: 2,
        identity: { type: 'ITEM', id: mockId(200) },
        source: 'ALL',
        scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
      }}
    />,
  );
  await act(async () => {
    await new Promise<void>(r => setTimeout(r, 0));
  });
  const button = tree!.root
    .findAllByType(P06Button)
    .find(b => b.props.label === 'Xem vị trí linh kiện');
  expect(button).toBeDefined();
  await act(async () => button!.props.onPress());
  expect(location).toHaveBeenCalledWith({ kind: 'ITEM', id: mockId(200) });
  await act(() => tree?.unmount());
  tree = undefined;
  await mount(
    <P06LookupScreen
      service={h.service}
      onOpenComponentLocation={location}
      onOpenBoxes={boxes}
      initialViewState={{
        scopeKey: p06ScopeKey(p06MockSession),
        query: '',
        mode: 'keyword',
        category: 'COMPONENT',
        status: 'ACTIVE',
        panel: 2,
        identity: { type: 'SKU', id: mockId(100) },
        source: 'ALL',
        scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
      }}
    />,
  );
  await act(async () => {
    await new Promise<void>(r => setTimeout(r, 0));
  });
  expect(
    tree!.root
      .findAllByType(P06Button)
      .some(b => b.props.label === 'Xem vị trí linh kiện'),
  ).toBe(false);
  const boxEntry = tree!.root
    .findAllByType(P06Button)
    .find(b => b.props.label === 'Tra cứu BOX linh kiện');
  expect(boxEntry).toBeDefined();
});
test('changing target remounts the read; the former target reply is aborted and cannot replace the new one', async () => {
  const pending: {
    target: any;
    signal?: AbortSignal;
    resolve: (v: any) => void;
  }[] = [];
  const service = {
      scopeKey: () => 'same',
      read: (t: any, s?: AbortSignal) =>
        new Promise<any>(resolve =>
          pending.push({ target: t, signal: s, resolve }),
        ),
    },
    back = jest.fn();
  await mount(
    <P18LocationScreen
      context={{}}
      target={target}
      service={service}
      onBack={back}
    />,
  );
  await act(async () =>
    tree!.update(
      <AppProviders>
        <P18LocationScreen
          context={{}}
          target={{ kind: 'ITEM', id: target.id }}
          service={service}
          onBack={back}
        />
      </AppProviders>,
    ),
  );
  expect(pending[0].signal?.aborted).toBe(true);
  await act(async () =>
    pending[1].resolve(
      parseComponentLocation(locationBody('ITEM'), locationScope(), {
        ...target,
        kind: 'ITEM',
      }),
    ),
  );
  await act(async () =>
    pending[0].resolve(
      parseComponentLocation(locationBody(), locationScope(), target),
    ),
  );
  expect(json()).toContain('ITEM-TEST-UI-18');
  expect(json()).not.toContain('BOX-TEST-UI-18');
});
test('background clears private location and aborts the in-flight read; foreground performs a fresh read', async () => {
  let notify: (state: any) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      notify = listener as any;
      return { remove: jest.fn() };
    });
  const pending: { signal?: AbortSignal; resolve: (v: any) => void }[] = [];
  const service = {
    scopeKey: () => 'same',
    read: (_t: any, s?: AbortSignal) =>
      new Promise<any>(resolve => pending.push({ signal: s, resolve })),
  };
  await mount(
    <P18LocationScreen
      context={{}}
      target={target}
      service={service}
      onBack={jest.fn()}
    />,
  );
  await act(async () => notify('background'));
  expect(pending[0].signal?.aborted).toBe(true);
  await act(async () =>
    pending[0].resolve(
      parseComponentLocation(locationBody(), locationScope(), target),
    ),
  );
  expect(json()).not.toContain('TRAY-TEST-UI-18');
  await act(async () => notify('active'));
  expect(pending).toHaveLength(2);
});
