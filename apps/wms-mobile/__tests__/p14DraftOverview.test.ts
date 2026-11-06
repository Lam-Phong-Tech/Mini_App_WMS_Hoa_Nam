import { loadP14DraftOverview } from '../src/shift/p14DraftOverview';

const id = '11111111-1111-4111-8111-111111111111';
test('P14 draft overview sums only verified current-session pages and reports partial reads', async () => {
  const list = jest.fn(async (_scope, operation: string) => {
    if (operation === 'WARRANTY') throw Error('denied');
    return {
      data: [
        {
          document_id: operation + '-draft',
          operation,
          title: operation,
        },
      ],
      meta: { total: operation === 'INBOUND' ? 2 : 1 },
    };
  });
  const result = await loadP14DraftOverview(
    {
      context: async () => ({
        permissions: {
          INBOUND: { read: true },
          OUTBOUND: { read: true },
          WARRANTY: { read: true },
          COMPONENT_ISSUE: { read: false },
        },
      }),
      list,
    } as any,
    () => ({ actorId: id, authSessionId: id, warehouseId: id }),
  );
  expect(list.mock.calls.map(call => call[1])).toEqual([
    'INBOUND',
    'OUTBOUND',
    'WARRANTY',
  ]);
  expect(result).toMatchObject({ total: 3, complete: false });
  expect(result.items.map(item => item.operation)).toEqual([
    'INBOUND',
    'OUTBOUND',
  ]);
});
