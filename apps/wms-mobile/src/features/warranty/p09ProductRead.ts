import { apiClient } from '../../api/client';
import { getSession } from '../../auth/session';
import { p09DevReadEnabled, p09RuntimeMatches } from '../../config/p09Release';
import { createP06CatalogService } from '../../services/wms/p06Catalog';
import { p09Ensure, type P09Resolved } from '../../services/wms/p09Warranty';

export interface P09ProductPresentation {
  item_id: string;
  serial_number: string | null;
  product_name: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}
// P09 read bridge retains its own DEV approval and P06 contract/identity parser.
// A compatible BE deployment does not require a new evidence SHA; no write grant.
export const p09CatalogReadBridge = createP06CatalogService(
  apiClient,
  getSession,
  p09DevReadEnabled,
  p09RuntimeMatches,
);
export async function readP09Product(
  resolved: P09Resolved,
): Promise<P09ProductPresentation> {
  const context = await p09CatalogReadBridge.context();
  const response = await p09CatalogReadBridge.detail(context.data, {
    type: 'ITEM',
    id: resolved.item_id,
  });
  const card = response.data.card;
  p09Ensure(
    card.card_type === 'ITEM' &&
      card.item_id === resolved.item_id &&
      card.sku_id === resolved.sku_id &&
      card.serial_number === resolved.serial_number,
    'P09_PRODUCT_IDENTITY_MISMATCH',
  );
  const trace =
    '[P09_USB_READ] ' +
    JSON.stringify({
      at: new Date().toISOString(),
      path: '/api/v1/mini-app/catalog/items/{id}',
      method: 'GET',
      contract: response.meta.contract,
      requestId: response.meta.request_id,
      envelopeValidated: true,
      identityMatched: true,
      customerProvided: false,
    });
  try {
    const hook = (
      globalThis as typeof globalThis & {
        nativeLoggingHook?: (line: string, level: number) => void;
      }
    ).nativeLoggingHook;
    if (hook) hook(trace, 1);
    else console.info(trace);
  } catch {
    /* Evidence must not affect read. */
  }
  return {
    item_id: card.item_id!,
    serial_number: card.serial_number,
    product_name: card.sku_name,
  };
}
