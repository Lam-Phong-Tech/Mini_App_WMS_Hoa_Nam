import { Linking } from 'react-native';
import { p09DevReadEnabled } from '../../config/p09Release';
import { p09Ensure } from '../../services/wms/p09Warranty';
import { p09CatalogReadBridge } from './p09ProductRead';
// Explicit DEV audit trigger used only to fulfil the user's issued-item QR
// request. No screen/CTA, auth extraction, automatic startup request or write.
export function subscribeP09IssuedQrRead() {
  let reading = false;
  const sub = Linking.addEventListener('url', event => {
    if (
      event.url !== 'wmshoanam://p09/issued-qr' ||
      reading ||
      !p09DevReadEnabled()
    )
      return;
    reading = true;
    (async () => {
      const context = await p09CatalogReadBridge.context();
      const page = await p09CatalogReadBridge.list(context.data, 'ITEM', {
        item_status: 'ISSUED',
        sku_type: 'PRODUCT',
        per_page: 20,
      });
      const row = page.data.find(
        r =>
          r.item_status === 'ISSUED' &&
          typeof r.serial_number === 'string' &&
          !!r.serial_number.trim(),
      );
      p09Ensure(row, 'P09_ISSUED_QR_NOT_FOUND', 'config');
      const detail = await p09CatalogReadBridge.detail(context.data, {
        type: 'ITEM',
        id: row.item_id!,
      });
      const card = detail.data.card;
      p09Ensure(
        card.item_id === row.item_id &&
          card.sku_id === row.sku_id &&
          card.serial_number === row.serial_number &&
          card.item_status === 'ISSUED',
        'P09_ISSUED_QR_CHANGED',
      );
      const result = {
        at: new Date().toISOString(),
        warehouse_id: context.data.active_warehouse_id,
        item_id: card.item_id,
        sku_id: card.sku_id,
        sku_code: card.sku_code,
        product_name: card.sku_name,
        serial_number: card.serial_number,
        item_status: card.item_status,
        qr_payload: card.serial_number,
        contract: detail.meta.contract,
        list_request_id: page.meta.request_id,
        detail_request_id: detail.meta.request_id,
        read_only: true,
      };
      const hook = (
        globalThis as typeof globalThis & {
          nativeLoggingHook?: (line: string, level: number) => void;
        }
      ).nativeLoggingHook;
      if (hook) hook('[P09_QR_SOURCE] ' + JSON.stringify(result), 1);
      else console.info('[P09_QR_SOURCE] ' + JSON.stringify(result));
    })()
      .catch(error => {
        const hook = (
          globalThis as typeof globalThis & {
            nativeLoggingHook?: (line: string, level: number) => void;
          }
        ).nativeLoggingHook;
        const line =
          '[P09_QR_SOURCE_ERROR] ' +
          JSON.stringify({
            at: new Date().toISOString(),
            code: error?.code ?? 'P09_QR_READ_FAILED',
            requestId: error?.requestId ?? null,
          });
        if (hook) hook(line, 1);
        else console.info(line);
      })
      .finally(() => {
        reading = false;
      });
  });
  return () => sub.remove();
}
