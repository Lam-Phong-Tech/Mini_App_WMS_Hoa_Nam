import {
  fetchHomeStockSummary,
  parseHomeStockSummary,
  aggregatePending,
  HOME_SUMMARY_PATH,
  HOME_CAPABILITIES,
} from '../src/services/wms/home';
import {
  P02_CONTRACT,
  P02_RELEASE,
  verifyP02Runtime,
} from '../src/config/p02Release';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
const wid = '11111111-1111-4111-8111-111111111111';
const meta = {
  contract: P02_CONTRACT,
  request_id: 'test-request',
  timestamp: '2026-10-12T02:00:00Z',
};
const raw = () => ({
  warehouse_id: wid,
  data_scope: 'WAREHOUSE_SCOPED',
  authorization_scope: 'GLOBAL',
  date: '2026-10-12',
  timezone: 'Asia/Ho_Chi_Minh',
  pending_approval_count: 5,
  posted_count: 3,
  inbound: { pending_approval_count: 2, posted_count: 1 },
  outbound: { pending_approval_count: 3, posted_count: 2 },
  warranty: {
    open_count: 7,
    open_statuses: ['RECEIVED', 'CHECKING', 'REPAIRING', 'COMPLETED'],
    warehouse_scope: {
      contract: 'warranty-owner-v1',
      warehouse_id: wid,
      unassigned_policy: 'EXCLUDED',
      ownership_complete: false,
    },
  },
});
const client = (data: unknown, m: unknown = meta): ReadClient =>
  ({
    get: jest.fn(async () => ({
      status: 200,
      data: { success: true, data, meta: m },
    })),
  } as unknown as ReadClient);
describe('P02 technical contract 701e9352', () => {
  it('GLOBAL authorization never widens a WAREHOUSE_SCOPED KPI, and warranty stays outside stock totals', () => {
    const result = parseHomeStockSummary(raw(), wid, meta);
    expect(result.authorizationScope).toBe('GLOBAL');
    expect(result.warehouseId).toBe(wid);
    expect(result.warranty).toEqual({ open: 7, ownershipComplete: false });
    expect(
      aggregatePending(result, {
        permissions: ['inbound.view', 'outbound.view'],
      }),
    ).toBe(5);
  });
  it('ownership_complete false does not discard the confirmed owned TEMP_ONLY count or manufacture unassigned totals', () => {
    expect(parseHomeStockSummary(raw(), wid, meta).warranty?.open).toBe(7);
  });
  it('zero and null are different for each permitted section', () => {
    const r = raw();
    r.warranty.open_count = 0;
    expect(parseHomeStockSummary(r, wid, meta).warranty?.open).toBe(0);
    expect(
      parseHomeStockSummary({ ...r, warranty: null }, wid, meta).warranty,
    ).toBeNull();
    expect(
      parseHomeStockSummary({ ...r, inbound: null }, wid, meta).inbound,
    ).toBeNull();
  });
  it.each([
    undefined,
    { contract: 'mini-app-p02-v1' },
    { contract: 'p12-documents-read-v2' },
  ])('rejects wrong/missing response contract %#', m =>
    expect(() => parseHomeStockSummary(raw(), wid, m)).toThrow(),
  );
  it.each([
    { data_scope: 'GLOBAL' },
    { warehouse_id: '22222222-2222-4222-8222-222222222222' },
    { authorization_scope: 'UNKNOWN' },
    { warranty: undefined },
    { inbound: undefined },
    { date: '2026-02-31' },
    { warranty: { ...raw().warranty, open_count: -1 } },
    {
      warranty: {
        ...raw().warranty,
        warehouse_scope: {
          ...raw().warranty.warehouse_scope,
          warehouse_id: null,
        },
      },
    },
    {
      warranty: {
        ...raw().warranty,
        warehouse_scope: {
          ...raw().warranty.warehouse_scope,
          unassigned_policy: 'INCLUDED',
        },
      },
    },
    {
      warranty: {
        ...raw().warranty,
        open_statuses: ['RECEIVED', 'CHECKING', 'REPAIRING'],
      },
    },
  ])('fails closed on schema, owner scope and missing COMPLETED %#', patch =>
    expect(() =>
      parseHomeStockSummary({ ...raw(), ...patch }, wid, meta),
    ).toThrow(),
  );
  it('date is query-only and does not alter open-count semantics; no opt-in contract header/body', async () => {
    const c = client(raw());
    const result = await fetchHomeStockSummary(
      wid,
      { query: { date: '2026-10-11' } },
      c,
    );
    expect(c.get).toHaveBeenCalledWith(HOME_SUMMARY_PATH, {
      query: { date: '2026-10-11', warehouse_id: wid },
    });
    expect(result.warranty?.open).toBe(7);
  });
  it('rejects foreign query or warehouse before sending a request', async () => {
    const c = client(raw());
    await expect(
      fetchHomeStockSummary(wid, { query: { page: 1 } }, c),
    ).rejects.toMatchObject({ kind: 'config' });
    await expect(
      fetchHomeStockSummary(wid, { query: { warehouse_id: 'other' } }, c),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(c.get).not.toHaveBeenCalled();
  });
  it('DEV reads verify the pinned runtime before summary traffic and never open production', async () => {
    expect(P02_RELEASE.devSummaryEnabled).toBe(true);
    expect(P02_RELEASE.productionEnabled).toBe(false);
    expect(HOME_CAPABILITIES.stockSummary).toBe(true);
    await expect(verifyP02Runtime()).rejects.toMatchObject({
      code: 'P02_RUNTIME_UNAVAILABLE',
    });
  });
});
