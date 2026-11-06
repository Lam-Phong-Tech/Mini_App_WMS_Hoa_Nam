// LOCAL LOCKED VISUAL ONLY. Assets/data from the existing user-approved P06 demo.
// AppShell/API singleton does not import this module or consume these fields.
import {
  p06MockHarness,
  p06MockCard,
  p06MockEvents,
  mockId,
} from './p06ReviewFixtures';
import type { P06ReviewPresentation } from '../features/lookup/P06Presentation';
export function p06LockedVisualFixture() {
  const h = p06MockHarness();
  h.cards.splice(5);
  h.items.splice(5);
  h.events.splice(7);
  h.context.available_warehouses[0].name = 'Kho Hoa Nam';
  h.context.permissions.label_print_permission = false;
  h.cards[4].sku_type = 'PRODUCT';
  const stockRows = [
    [12, 10, 1, 1],
    [8, 8, 0, 0],
    [150, 145, 3, 2],
    [25, 25, 0, 0],
    [0, 0, 0, 0],
  ];
  const asset = (name: string) => ({ uri: `/p06-assets/${name}.png` });
  const labels = [
    'Máy in nhiệt XP-420B',
    'Máy in nhiệt XP-420B (Đen)',
    'Giấy in nhiệt 80mm',
    'Cáp nguồn XP-420B',
    'Bộ vệ sinh đầu in',
  ];
  const names = [
    'printer-white',
    'printer-black',
    'paper-roll',
    'power-cable',
    'cleaning-kit',
  ];
  for (let n = 0; n < 5; n++) h.cards[n].sku_name = labels[n];
  const component = p06MockCard(4);
  component.sku_id = mockId(199);
  component.sku_code = 'LK-XP420B';
  component.sku_name = 'Trục lăn máy in XP-420B';
  component.sku_type = 'COMPONENT';
  h.cards.push(component);
  const baseGet = h.client.get.bind(h.client);
  h.client.get = async <T>(
    path: string,
    options?: Parameters<typeof baseGet>[1],
  ) => {
    const r = await baseGet<unknown>(path, options),
      b = r.data as any;
    const update = (stock: any) => {
      const i = h.cards.findIndex(c => c.sku_id === stock?.sku_id);
      if (!stock || i < 0) return;
      const values = stockRows[i] || [24, 20, 3, 1];
      const [total, available, reserved, unavailable] = values;
      Object.assign(stock, {
        total_qty: total,
        available_qty: available,
        reserved_qty: reserved,
        unavailable_qty: unavailable,
        ledger_total: total,
        status: total === 0 ? 'EMPTY' : 'CONFIRMED',
      });
    };
    if (Array.isArray(b.data)) b.data.forEach((c: any) => update(c.stock));
    else {
      update(b.data?.stock);
      if (b.data?.quantity_source) update(b.data);
    }
    if (
      /\/catalog\/skus$/.test(path) &&
      !options?.query?.keyword &&
      !options?.query?.serial &&
      !options?.query?.item_code
    ) {
      // Authored B06 mock metadata, not count of the five visible cards or live inventory.
      const category = options?.query?.sku_type || 'ALL';
      b.meta.tab_totals = { ALL: 164, PRODUCT: 128, COMPONENT: 36 };
      b.meta.total =
        category === 'PRODUCT' ? 128 : category === 'COMPONENT' ? 36 : 164;
      b.meta.last_page = Math.max(1, Math.ceil(b.meta.total / b.meta.per_page));
    }
    return r as { status: number; data: T };
  };
  const dates = [
    '2026-09-09T01:15:00Z',
    '2026-09-08T09:20:00Z',
    '2026-09-07T07:10:00Z',
    '2026-09-05T03:30:00Z',
    '2026-09-03T04:25:00Z',
    '2026-09-02T08:40:00Z',
    '2026-09-01T02:05:00Z',
  ];
  const kinds = [
    'RECEIPT',
    'ISSUE',
    'RECEIVED',
    'RECEIPT',
    'ISSUE',
    'RETURNED',
    'RECEIPT',
  ];
  const descriptions = [
    'Từ NCC Thiên Phát',
    'Bán cho KH Minh Phát',
    'Tiếp nhận bảo hành',
    'Từ NCC An Khang',
    'Bán cho KH Hồng Hà',
    'Trả bảo hành (xuất)',
    'Từ NCC Thiên Phát',
  ];
  const quantities = [20, -5, null, 10, -2, null, 15];
  h.events.splice(
    0,
    h.events.length,
    ...p06MockEvents()
      .slice(0, 7)
      .map((e, i) => ({
        ...e,
        occurred_at: dates[i],
        source: (i === 2 || i === 5 ? 'WARRANTY' : 'LEDGER') as
          | 'WARRANTY'
          | 'LEDGER',
        event_type: kinds[i],
        signed_quantity: quantities[i],
        quantity_applicability: (i === 2 || i === 5
          ? 'NOT_APPLICABLE'
          : 'STOCK_DELTA') as 'NOT_APPLICABLE' | 'STOCK_DELTA',
        event_id: `${i === 2 || i === 5 ? 'WARRANTY' : 'LEDGER'}:${
          e.source_event_id
        }`,
        document: null,
        from_status: null,
        to_status: null,
      })),
  );
  const review: P06ReviewPresentation = {
    kind: 'LOCAL_LOCKED_VISUAL_ONLY',
    dateRangeLabel: 'Tất cả ngày',
    cards: Object.fromEntries(
      h.cards.map((c, i) => [
        c.sku_id,
        {
          code: i < 5 ? `HN${12345 + i}` : 'LK0001-HN001',
          location:
            ['A-01-03', 'B-02-01', 'C-01-02', 'A-02-01', 'D-01-01'][i] ||
            'D-02-01',
          group: i === 0 ? 'Thiết bị văn phòng' : 'Vật tư',
          brand: i === 0 ? 'Xprinter' : 'Hoa Nam',
          description:
            i === 0
              ? 'Máy in nhiệt XP-420B, tốc độ cao, phù hợp in tem mã vạch.'
              : 'Thông tin demo đã duyệt trong bộ P06.',
          photos:
            i < 5 ? [asset(names[i]), asset('box')] : [asset('component')],
          locations:
            i === 0
              ? [
                  {
                    id: 'A-01-03',
                    total: 6,
                    available: 6,
                    held: 0,
                    unavailable: 0,
                  },
                  {
                    id: 'B-02-01',
                    total: 3,
                    available: 3,
                    held: 0,
                    unavailable: 0,
                  },
                  {
                    id: 'C-01-02',
                    total: 2,
                    available: 1,
                    held: 1,
                    unavailable: 0,
                  },
                  {
                    id: 'D-01-01',
                    total: 1,
                    available: 0,
                    held: 0,
                    unavailable: 1,
                  },
                ]
              : [],
        },
      ]),
    ),
    events: Object.fromEntries(
      h.events.map((e, i) => [
        e.event_id,
        {
          title:
            i === 2 || i === 5
              ? 'Bảo hành'
              : quantities[i]! < 0
              ? 'Xuất kho'
              : 'Nhập kho',
          description: descriptions[i],
          status: 'Thành công',
        },
      ]),
    ),
  };
  return { harness: h, review };
}
