import { parseStockDetail } from '../src/features/documents/p12/contract';
import {
  P12_TIMELINE_CONTRACT as contract,
  P12_TIMELINE_HEADER as header,
} from '../src/features/documents/p12/timelineHandoff';
import { createP12Service } from '../src/features/documents/p12/service';
import { assertP12TimelineRead } from '../src/api/p12TimelineRead';
import { createApiClient } from '../src/api/client';
import { ENVIRONMENTS } from '../src/config/env';
import { p12TimelineReadOptions } from '../src/config/p12TimelineRelease';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import {
  formatDocumentTimestamp,
  parseDocumentTimestamp,
} from '../src/services/wms/documentTimestamps';
import * as m from './fixtures/p12Protocol';

const source = 'mini_app_web_post_handoffs';
const rawTime = '2026-10-24T08:12:45.123456Z';
type StockType = 'inbound' | 'outbound';
function fixture(type: StockType = 'inbound', recorded = true) {
  const b = m.detail(
    m.stock(type, type === 'inbound' ? 10 : 11),
    type,
  ) as ReturnType<typeof m.detail> & { meta: { p12: Record<string, unknown> } };
  b.meta.p12.timeline_contract = contract;
  b.data.p12.timeline.contract = contract;
  b.data.p13 = {
    current_handoff_availability: recorded ? 'RECORDED' : 'NOT_ESTABLISHED',
    current_handoff: recorded
      ? {
          contract: 'p13-web-post-queue-v1',
          warehouse_id: m.warehouse,
          source: source + '+stock_documents.status',
          document_version_at_record: 2,
          submitted_at: rawTime,
        }
      : null,
  };
  b.data.p12.timeline.milestones.sent_to_web = {
    availability: recorded ? 'RECORDED' : 'NOT_RECORDED',
    occurred_at: recorded ? rawTime : null,
    timestamp_source: recorded ? source + '.submitted_at' : null,
    event_id: null,
    actor: null,
    actor_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    description: null,
    description_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    evidence_kind:
      'PERSISTED_SUBMISSION_INTENT_NOT_CURRENT_WAITING_OR_DELIVERY_ACK',
    ...(recorded
      ? {
          source_record: {
            table: source,
            document_id: b.data.id,
            warehouse_id: m.warehouse,
            document_version_at_record: 2,
          },
        }
      : {}),
  };
  return b;
}
const decode = (
  b: ReturnType<typeof fixture>,
  type: StockType = 'inbound',
  requested = true,
) =>
  parseStockDetail(b, type, b.data.id, m.warehouse, {
    origin: 'https://p12.invalid',
    ...(requested ? { timelineContract: contract } : {}),
  });

test.each<StockType>(['inbound', 'outbound'])(
  'TC04 %s validates persisted source and preserves exact microseconds with Vietnam display',
  type => {
    const d = decode(fixture(type), type);
    const sent = d.p12.timeline!.milestones.sent_to_web;
    expect(sent.occurred_at).toBe(rawTime);
    expect(sent.timestamp_source).toBe(source + '.submitted_at');
    expect(sent.event_id).toBeNull();
    expect(
      formatDocumentTimestamp(parseDocumentTimestamp(sent.occurred_at), {
        seconds: true,
      }),
    ).toContain('15:12:45');
    expect(d.p12.timeline!.milestones.checked.availability).toBe(
      'SOURCE_MAPPING_PENDING',
    );
    expect(d.p12.status.waiting_for_web).toBeNull();
    expect(d.source.p12).not.toHaveProperty('timeline');
  },
);

test.each(['POSTED', 'CANCELLED'])(
  'TC04 historical submission remains recorded for current %s; no waiting state is synthesized',
  status => {
    const b = fixture();
    b.data.status = status;
    b.data.p12.status.canonical = status;
    const d = decode(b);
    expect(d.p12.status.canonical).toBe(status);
    expect(d.p12.status.waiting_for_web).toBeNull();
    expect(d.p12.timeline!.milestones.sent_to_web.occurred_at).toBe(rawTime);
  },
);

test('TC04 missing handoff remains null even with successful historical receipt and readiness', () => {
  const b = fixture('inbound', false);
  b.data.p13.record_handoff = {
    state_at_record: 'SENT_WAITING_WEB',
    recorded_at: rawTime,
  };
  const sent = decode(b).p12.timeline!.milestones.sent_to_web;
  expect(sent.availability).toBe('NOT_RECORDED');
  expect(sent.occurred_at).toBeNull();
  expect(sent).not.toHaveProperty('source_record');
});

test.each([
  [
    'missing discovery',
    b => {
      delete b.meta.p12.timeline_contract;
    },
  ],
  [
    'wrong contract',
    b => {
      b.data.p12.timeline.contract = 'future';
    },
  ],
  [
    'wrong document',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.source_record.document_id =
        m.id(99);
    },
  ],
  [
    'wrong warehouse',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.source_record.warehouse_id =
        m.id(99);
    },
  ],
  [
    'bad version',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.source_record.document_version_at_record = 0;
    },
  ],
  [
    'P13 time mismatch',
    b => {
      b.data.p13.current_handoff.submitted_at = '2026-10-24T08:12:44Z';
    },
  ],
  [
    'wrong source',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.timestamp_source =
        'stock_documents.updated_at';
    },
  ],
  [
    'bad calendar',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.occurred_at =
        '2026-02-30T08:12:45Z';
    },
  ],
  [
    'naive time',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.occurred_at =
        '2026-10-24 08:12:45';
    },
  ],
  [
    'fabricated event',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.event_id = b.data.id;
    },
  ],
  [
    'invented actor',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.actor = {
        name: 'UNVERIFIED_PERSON',
      };
    },
  ],
  [
    'invented description',
    b => {
      b.data.p12.timeline.milestones.sent_to_web.description =
        'UNVERIFIED_NOTE';
    },
  ],
  [
    'fabricated check',
    b => {
      b.data.p12.timeline.milestones.checked.availability = 'RECORDED';
    },
  ],
  [
    'full coverage',
    b => {
      b.data.p12.timeline.coverage = 'FULL';
    },
  ],
] as Array<[string, (body: ReturnType<typeof fixture>) => void]>)(
  'TC04 %s isolates optional timeline error and keeps verified parent',
  (_name, edit) => {
    const b = fixture();
    edit(b);
    const d = decode(b);
    expect(d.id).toBe(m.business);
    expect(Array.isArray(d.source.lines) && d.source.lines.length > 0).toBe(
      true,
    );
    expect(d.p12.timeline).toBeNull();
    expect(d.p12.timelineError).toBeDefined();
    expect(JSON.stringify(d)).not.toMatch(/UNVERIFIED_PERSON|UNVERIFIED_NOTE/);
  },
);

test('TC04 legacy parser is unchanged without opt-in and never silently accepts an unsolicited extension', () => {
  const old = m.detail();
  expect(
    decode(old, 'inbound', false).p12.timeline!.milestones.sent_to_web
      .availability,
  ).toBe('SOURCE_MAPPING_PENDING');
  expect(decode(fixture(), 'inbound', false).p12.timeline).toBeNull();
  expect(decode(old).p12.timeline).toBeNull();
});

const user = () => ({
  id: m.actor,
  auth_session_id: m.session,
  active_warehouse_id: m.warehouse,
  warehouse_context: { status: 'READY' },
  available_warehouses: [{ warehouse_id: m.warehouse, status: 'ACTIVE' }],
  permissions: m.context().rights,
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'TEST_ONLY',
    userId: m.actor,
    authSessionId: m.session,
    activeWarehouseId: m.warehouse,
  });
});
afterEach(() => clearSession());

function serviceHarness(optIn = false) {
  const calls: Array<{ path: string; options: any }> = [];
  const get = jest.fn(async (path: string, options: any = {}) => {
    calls.push({ path, options });
    const detail =
      path.endsWith('/' + m.business) || path.endsWith('/' + m.outbound);
    const type = path.includes('outbound') ? 'outbound' : 'inbound';
    const data = detail
      ? optIn
        ? fixture(type)
        : m.detail(m.stock(type, type === 'inbound' ? 10 : 11), type)
      : path.includes('warranty')
      ? m.warranty()
      : m.list();
    return {
      status: 200,
      data,
      header: (name: string) =>
        ({
          'cache-control': 'private, no-store',
          'content-type': 'application/json',
          vary: 'Authorization, Origin, ' + header,
        }[name.toLowerCase()] ?? null),
    };
  });
  const service = createP12Service(() => ({ user: user() }), {
    client: { get } as never,
    origin: 'https://p12.invalid',
    ...(optIn ? { timelineContract: contract } : {}),
  });
  return { service, calls, get };
}

test('TC04 default service sends no candidate header; opt-in applies only to scoped stock detail', async () => {
  const old = serviceHarness();
  await old.service.detail('inbound', m.business);
  expect(old.calls[0].options.headers).toBeUndefined();
  const f = serviceHarness(true);
  await f.service.detail('inbound', m.business);
  await f.service.detail('outbound', m.outbound);
  await f.service.detail('warranty', m.caseId);
  await f.service.list('inbound');
  for (const c of f.calls.slice(0, 2)) {
    expect(c.options.headers).toEqual({ [header]: contract });
    expect(c.options.query).toEqual({ warehouse_id: m.warehouse });
    expect(c.options).not.toHaveProperty('body');
  }
  expect(f.calls[2].options.headers).toBeUndefined();
  expect(f.calls[3].options.headers).toBeUndefined();
});

test.each([422, 503])(
  'TC04 HTTP %s is propagated without legacy fallback or retry',
  async status => {
    const f = serviceHarness(true);
    f.get.mockRejectedValue(
      new AppError({
        kind: 'http',
        status,
        message: 'Owner source unavailable',
      }),
    );
    await expect(f.service.detail('inbound', m.business)).rejects.toMatchObject(
      { status },
    );
    expect(f.get).toHaveBeenCalledTimes(1);
  },
);

test('TC04 no rights blocks before network and a late response cannot enter another login', async () => {
  const noRights = createP12Service(() => ({
    user: { ...user(), permissions: [] },
  }));
  expect(() => noRights.detail('inbound', m.business)).toThrow();
  const f = serviceHarness(true);
  let finish!: (value: any) => void;
  f.get.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = f.service.detail('inbound', m.business);
  setSession({
    accessToken: 'NEW_TEST_ONLY',
    userId: m.actor,
    authSessionId: m.id(98),
    activeWarehouseId: m.warehouse,
  });
  finish({ status: 200, data: fixture(), header: () => null });
  await expect(pending).rejects.toBeDefined();
});

const allowedRequest = () => ({
  method: 'GET' as const,
  path: '/api/v1/mini-app/inbound-documents/' + m.business,
  query: { warehouse_id: m.warehouse },
  p12Read: true as const,
  headers: { [header]: contract },
});
test('TC04 API guard permits only opt-in owner detail in DEV/TEST', () => {
  expect(() =>
    assertP12TimelineRead(allowedRequest(), ENVIRONMENTS['dev-test']),
  ).not.toThrow();
  expect(() =>
    assertP12TimelineRead(
      allowedRequest(),
      ENVIRONMENTS['customer-production'],
    ),
  ).toThrow();
  for (const path of [
    '/api/v1/mini-app/documents',
    '/api/v1/mini-app/inbound-documents',
    '/api/v1/mini-app/warranty-cases/' + m.caseId,
    '/api/v1/mini-app/warranty-requests/' + m.id(100),
    allowedRequest().path + '/scan-entries',
    allowedRequest().path + '/attachments',
    '/api/v1/mini-app/document-attachments/' + m.fileId + '/download',
  ])
    expect(() =>
      assertP12TimelineRead(
        { ...allowedRequest(), path },
        ENVIRONMENTS['dev-test'],
      ),
    ).toThrow();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const)
    expect(() =>
      assertP12TimelineRead(
        { ...allowedRequest(), method },
        ENVIRONMENTS['dev-test'],
      ),
    ).toThrow();
  expect(() =>
    assertP12TimelineRead(
      { ...allowedRequest(), body: {} },
      ENVIRONMENTS['dev-test'],
    ),
  ).toThrow();
  expect(() =>
    assertP12TimelineRead(
      { ...allowedRequest(), query: {} },
      ENVIRONMENTS['dev-test'],
    ),
  ).toThrow();
});

test('TC04 API client rejects a misplaced candidate header before health or owner HTTP', async () => {
  const fetchImpl = jest.fn();
  const client = createApiClient({
    environment: ENVIRONMENTS['dev-test'],
    fetchImpl,
  });
  await expect(
    client.get('/api/v1/mini-app/documents', {
      p12Read: true,
      headers: { [header]: contract },
      query: { warehouse_id: m.warehouse },
    }),
  ).rejects.toMatchObject({ code: 'P12_TIMELINE_GET_ONLY' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('TC04 deployed read is enabled only for verified DEV/TEST; production and other origins stay closed', () => {
  expect(p12TimelineReadOptions(ENVIRONMENTS['dev-test'], 'dev-test')).toEqual({
    timelineContract: contract,
  });
  expect(
    p12TimelineReadOptions(
      ENVIRONMENTS['customer-production'],
      'customer-production',
    ),
  ).toEqual({});
  expect(
    p12TimelineReadOptions(ENVIRONMENTS['dev-test'], 'customer-production'),
  ).toEqual({});
  expect(
    p12TimelineReadOptions(
      { ...ENVIRONMENTS['dev-test'], apiBaseUrl: 'https://other.invalid' },
      'dev-test',
    ),
  ).toEqual({});
  expect(
    p12TimelineReadOptions(
      { ...ENVIRONMENTS['dev-test'], environmentClassVerified: false },
      'dev-test',
    ),
  ).toEqual({});
});
