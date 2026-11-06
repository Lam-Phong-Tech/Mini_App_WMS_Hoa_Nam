// Mock owner responses only. Live evidence is captured separately on DEV/TEST.
import { apiClient, type RequestOptions } from '../src/api/client';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import { createP06CatalogService } from '../src/services/wms/p06Catalog';
import { p06MasterFields } from '../src/features/lookup/P06Presentation';
import { mockId, p06MockHarness } from '../src/web/p06ReviewFixtures';

const sku = { type: 'SKU' as const, id: mockId(100) };
const item = { type: 'ITEM' as const, id: mockId(200) };
function harness(change: (body: any, path: string) => void = () => {}) {
  const h = p06MockHarness();
  const requests: RequestOptions['headers'][] = [];
  const client: ReadClient = {
    async get<T>(
      path: string,
      options?: Omit<RequestOptions, 'path' | 'method'>,
    ) {
      requests.push(options?.headers);
      const r = await h.client.get<any>(path, options);
      r.data.meta.card_metadata_revision = 'p06-card-master-r1';
      const cards = Array.isArray(r.data.data)
        ? r.data.data.filter((v: any) => v.card_type)
        : r.data.data.card
        ? [r.data.data.card]
        : [];
      cards.forEach((card: any) =>
        Object.assign(card, {
          category_name: 'Máy khoan & vặn vít',
          brand_name: 'DongCheng',
          description: null,
          metadata_status: {
            category_name: 'CURRENT_ACTIVE_MASTER',
            brand_name: 'CURRENT_ACTIVE_MASTER',
            description: 'SOURCE_NOT_DEFINED',
          },
        }),
      );
      change(r.data, path);
      return r as { status: number; data: T };
    },
  };
  return {
    ...h,
    requests,
    service: createP06CatalogService(client, h.readSession, () => true),
  };
}

test('r2 requests negotiation and renders the exact PV description across SKU/ITEM cards', async () => {
  const description = 'Động cơ không chổi than, mô-men 90N.m.\nMô tả PV thật.';
  const h = harness(body => {
    body.meta.card_metadata_revision = 'p06-card-master-r2';
    const cards = Array.isArray(body.data) ? body.data : body.data.card ? [body.data.card] : [];
    for (const card of cards) {
      card.description = description;
      card.metadata_status.description = 'CURRENT_PV_PROFILE';
    }
  });
  const context = (await h.service.context()).data;
  for (const target of [sku, item]) {
    const detail = await h.service.detail(context, target);
    const list = await h.service.list(context, target.type);
    expect(detail.meta.card_metadata_revision).toBe('p06-card-master-r2');
    expect(p06MasterFields(detail.data.card).description).toBe(description);
    expect(list.data.every(card => card.description === description)).toBe(true);
  }
  expect(h.requests.length).toBeGreaterThan(0);
  expect(h.requests.every(headers => headers?.['X-P06-Card-Metadata-Revision'] === 'p06-card-master-r2')).toBe(true);
});

test.each(['PROFILE_NOT_FOUND', 'PROFILE_AMBIGUOUS', 'DESCRIPTION_UNAVAILABLE'])(
  'r2 preserves null with source reason %s',
  async status => {
    const h = harness(body => {
      body.meta.card_metadata_revision = 'p06-card-master-r2';
      if (body.data.card) body.data.card.metadata_status.description = status;
    });
    const card = (await h.service.detail((await h.service.context()).data, sku)).data.card;
    expect(card.metadata_status?.description).toBe(status);
    expect(p06MasterFields(card).description).toBeNull();
  },
);

test.each([
  ['CURRENT_PV_PROFILE', null],
  ['CURRENT_PV_PROFILE', '  '],
  ['CURRENT_PV_PROFILE', { html: 'invalid' }],
  ['PROFILE_NOT_FOUND', 'must not invent'],
  ['SOURCE_NOT_DEFINED', null],
  ['UNKNOWN_SOURCE', 'invalid'],
])('r2 rejects inconsistent description %s/%s', async (status, value) => {
  const h = harness(body => {
    body.meta.card_metadata_revision = 'p06-card-master-r2';
    if (body.data.card) {
      body.data.card.description = value;
      body.data.card.metadata_status.description = status;
    }
  });
  await expect(h.service.detail((await h.service.context()).data, sku)).rejects.toMatchObject({
    kind: 'parse', code: 'P06_METADATA_INVALID',
  });
});
test('r1 preserves owner marker/status on SKU/ITEM list and detail with the base contract unchanged', async () => {
  const h = harness(),
    context = (await h.service.context()).data;
  for (const target of [sku, item]) {
    const detail = await h.service.detail(context, target);
    const list = await h.service.list(context, target.type);
    expect(detail.meta).toMatchObject({
      contract: 'mini-app-p06-v1',
      card_metadata_revision: 'p06-card-master-r1',
    });
    expect(detail.data.card).toMatchObject({
      category_name: 'Máy khoan & vặn vít',
      brand_name: 'DongCheng',
      description: null,
      metadata_status: { description: 'SOURCE_NOT_DEFINED' },
    });
    expect(
      list.data.every(
        row => row.metadata_status?.category_name === 'CURRENT_ACTIVE_MASTER',
      ),
    ).toBe(true);
    expect(p06MasterFields(detail.data.card).description).toBeNull();
  }
});
test.each([
  'NOT_ASSIGNED',
  'REFERENCE_NOT_FOUND',
  'LABEL_UNAVAILABLE',
  'CURRENT_ACTIVE_MASTER',
  'CURRENT_INACTIVE_MASTER',
  'CURRENT_MASTER_STATUS_UNKNOWN',
])(
  'r1 retains valid reason %s without granting eligibility or inventing names',
  async status => {
    const missing = !status.startsWith('CURRENT_');
    const h = harness(body => {
      const c = body.data.card;
      if (c) {
        c.category_name = missing ? null : 'Tên nhóm hiện tại';
        c.metadata_status.category_name = status;
      }
    });
    const c = (await h.service.detail((await h.service.context()).data, sku))
      .data.card;
    expect(c.metadata_status?.category_name).toBe(status);
    expect(p06MasterFields(c).group).toBe(missing ? null : 'Tên nhóm hiện tại');
  },
);
test.each([
  'missing-status',
  'unknown-status',
  'active-with-null',
  'absent-with-label',
  'description-with-text',
  'description-status-wrong',
  'object-label',
])(
  'advertised r1 rejects inconsistent metadata %s as parser error',
  async mode => {
    const h = harness(body => {
      const c = body.data.card;
      if (!c) return;
      if (mode === 'missing-status') delete c.metadata_status;
      if (mode === 'unknown-status')
        c.metadata_status.category_name = 'SUCCESS';
      if (mode === 'active-with-null') c.category_name = null;
      if (mode === 'absent-with-label')
        c.metadata_status.category_name = 'NOT_ASSIGNED';
      if (mode === 'description-with-text')
        c.description = 'Invented description';
      if (mode === 'description-status-wrong')
        c.metadata_status.description = 'CURRENT_ACTIVE_MASTER';
      if (mode === 'object-label') c.brand_name = { name: 'not a string' };
    });
    await expect(
      h.service.detail((await h.service.context()).data, sku),
    ).rejects.toMatchObject({ kind: 'parse', code: 'P06_METADATA_INVALID' });
  },
);
test('unknown additive revision does not fall back to legacy', async () => {
  const h = harness(body => {
    body.meta.card_metadata_revision = 'p06-card-master-r999';
  });
  await expect(h.service.context()).rejects.toMatchObject({
    kind: 'parse',
    code: 'P06_METADATA_REVISION_UNSUPPORTED',
  });
});
test('legacy responses remain compatible; no fixture/name fallback from missing metadata', async () => {
  const h = harness(body => {
    delete body.meta.card_metadata_revision;
    if (body.data.card) {
      delete body.data.card.metadata_status;
      delete body.data.card.category_name;
    }
  });
  const card = (await h.service.detail((await h.service.context()).data, sku))
    .data.card;
  expect(card.metadata_status).toBeUndefined();
  expect(p06MasterFields(card).group).toBeUndefined();
});
test('missing tier still blocks before catalog and retains the health Request-ID on the error', async () => {
  const h = p06MockHarness(),
    rid = '11111111-2222-4333-8444-555555555555';
  const get = jest
    .spyOn(apiClient, 'get')
    .mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: { build: { sha: 'bb857bb16adee9d6df0837b18fda8763b602f369' } },
      },
      header: (name: string) => (name === 'X-Request-ID' ? rid : undefined),
    } as any);
  try {
    await expect(
      createP06CatalogService(apiClient, h.readSession, () => true).context(),
    ).rejects.toMatchObject({
      code: 'P06_RUNTIME_CANDIDATE_NOT_APPROVED',
      requestId: rid,
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/api/v1/health');
  } finally {
    get.mockRestore();
  }
});
