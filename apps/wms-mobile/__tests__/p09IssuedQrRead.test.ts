import { Linking } from 'react-native';
import { resolved, id } from './fixtures/p09Mock';
const mockBridge = { context: jest.fn(), list: jest.fn(), detail: jest.fn() };
jest.mock('../src/features/warranty/p09ProductRead', () => ({
  get p09CatalogReadBridge() {
    return mockBridge;
  },
}));
jest.mock('../src/config/p09Release', () => ({
  p09DevReadEnabled: () => true,
}));
import { subscribeP09IssuedQrRead } from '../src/features/warranty/p09IssuedQrRead';
let eventHandler: any, stop: () => void;
beforeEach(() => {
  jest
    .spyOn(Linking, 'addEventListener')
    .mockImplementation((_event, handler: any) => {
      eventHandler = handler;
      return { remove: jest.fn() };
    });
  jest.spyOn(console, 'info').mockImplementation(() => {});
  mockBridge.context
    .mockReset()
    .mockResolvedValue({ data: { active_warehouse_id: id(3) } });
  const card = {
    card_type: 'ITEM',
    item_id: resolved.item_id,
    sku_id: resolved.sku_id,
    sku_code: 'SKU',
    sku_name: 'Model',
    serial_number: resolved.serial_number,
    item_status: 'ISSUED',
  };
  mockBridge.list
    .mockReset()
    .mockResolvedValue({ data: [card], meta: { request_id: 'list-read' } });
  mockBridge.detail
    .mockReset()
    .mockResolvedValue({
      data: { card },
      meta: { contract: 'mini-app-p06-v1', request_id: 'detail-read' },
    });
  stop = subscribeP09IssuedQrRead();
});
afterEach(() => {
  stop();
  jest.restoreAllMocks();
});
async function send(url = 'wmshoanam://p09/issued-qr') {
  eventHandler({ url });
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
it('runs only the explicit DEV trigger and chooses a revalidated issued item', async () => {
  await send('wmshoanam://else');
  expect(mockBridge.list).not.toHaveBeenCalled();
  await send();
  expect(mockBridge.list).toHaveBeenCalledWith(
    { active_warehouse_id: id(3) },
    'ITEM',
    { item_status: 'ISSUED', sku_type: 'PRODUCT', per_page: 20 },
  );
  const line = jest
    .mocked(console.info)
    .mock.calls.find(c => String(c[0]).startsWith('[P09_QR_SOURCE]'))![0];
  const value = JSON.parse(String(line).split('[P09_QR_SOURCE] ')[1]);
  expect(value.qr_payload).toBe(resolved.serial_number);
  expect(value.item_status).toBe('ISSUED');
  expect(value.read_only).toBe(true);
  expect(value.customer_name).toBeUndefined();
});
it('does not output a QR when the item has changed after list read', async () => {
  const value = await mockBridge.detail();
  value.data.card = { ...value.data.card, item_status: 'IN_STOCK' };
  mockBridge.detail.mockResolvedValue(value);
  await send();
  expect(
    jest
      .mocked(console.info)
      .mock.calls.some(c => String(c[0]).startsWith('[P09_QR_SOURCE]')),
  ).toBe(false);
});
