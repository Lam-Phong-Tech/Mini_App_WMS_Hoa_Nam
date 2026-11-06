import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { AppError } from '../../errors/AppError';
import { assertP07Connected, P07_CONTRACT } from '../../config/p07Release';
import { UUID_PATTERN } from './workShift';
import { NFC_PATHS, type NfcTag } from './nfc';

export const NFC_TABS = ['ALL', 'ASSIGNED', 'UNASSIGNED'] as const;
export type NfcTab = (typeof NFC_TABS)[number];
export type NfcTotals = Readonly<
  Record<'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'LOCKED' | 'UNKNOWN', number>
>;
export type NfcItem = {
  item_id: string;
  serial_number?: string | null;
  item_status?: string | null;
  nfc_status?: string | null;
  nfc_details_available?: boolean;
  sku?: {
    sku_id?: string;
    sku_code?: string | null;
    sku_name?: string | null;
    unit?: string | null;
  } | null;
};
export type NfcCatalogPage<T> = {
  items: readonly T[];
  totals: NfcTotals | null;
  page: number;
  lastPage: number;
  total: number;
  requestId?: string;
};
export type Client = {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
};
const fail = (): never => {
  throw new AppError({
    kind: 'parse',
    code: 'P07_RESPONSE_INVALID',
    message:
      'Nguồn NFC chưa trả đúng dữ liệu và phạm vi kho. Vui lòng kiểm tra lại.',
  });
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function p07CatalogPage<T>(
  envelope: unknown,
  warehouseId: string,
  unit: 'NFC_TAG' | 'ITEM',
): NfcCatalogPage<T> {
  if (
    !record(envelope) ||
    envelope.success !== true ||
    !Array.isArray(envelope.data) ||
    !record(envelope.meta)
  )
    return fail();
  const meta = envelope.meta;
  if (
    meta.warehouse_id !== warehouseId ||
    meta.count_unit !== unit ||
    (unit === 'NFC_TAG' && meta.contract !== P07_CONTRACT) ||
    !number(meta.total) ||
    !number(meta.current_page) ||
    meta.current_page < 1 ||
    !number(meta.last_page) ||
    meta.last_page < 1
  )
    return fail();
  const ids = new Set<string>();
  for (const item of envelope.data) {
    if (!record(item)) return fail();
    const id = item[unit === 'NFC_TAG' ? 'physical_code_id' : 'item_id'];
    if (typeof id !== 'string' || !UUID_PATTERN.test(id) || ids.has(id))
      return fail();
    ids.add(id);
  }
  let totals: NfcTotals | null = null;
  if (unit === 'NFC_TAG') {
    if (
      !record(meta.tab_totals) ||
      !['ALL', 'ASSIGNED', 'UNASSIGNED', 'LOCKED', 'UNKNOWN'].every(k =>
        number((meta.tab_totals as Record<string, unknown>)[k]),
      )
    )
      return fail();
    totals = meta.tab_totals as NfcTotals;
  }
  return {
    items: envelope.data as T[],
    totals,
    page: meta.current_page,
    lastPage: meta.last_page,
    total: meta.total,
    requestId:
      typeof meta.request_id === 'string' ? meta.request_id : undefined,
  };
}
export async function readP07Tags(
  warehouseId: string,
  query: { keyword: string; tab_status: NfcTab; page: number; status?: string },
  signal?: AbortSignal,
  client: Client = apiClient,
): Promise<NfcCatalogPage<NfcTag>> {
  if (client === apiClient) assertP07Connected();
  const response = await client.request<unknown>({
    method: 'GET',
    path: NFC_PATHS.tags,
    query: { warehouse_id: warehouseId, ...query, per_page: 20 },
    signal,
  });
  return p07CatalogPage<NfcTag>(response.data, warehouseId, 'NFC_TAG');
}
export async function readP07Items(
  warehouseId: string,
  keyword: string,
  page = 1,
  signal?: AbortSignal,
  client: Client = apiClient,
): Promise<NfcCatalogPage<NfcItem>> {
  if (client === apiClient) assertP07Connected();
  const response = await client.request<unknown>({
    method: 'GET',
    path: NFC_PATHS.items,
    query: {
      warehouse_id: warehouseId,
      keyword,
      item_status: 'ISSUED',
      nfc_status: 'UNASSIGNED',
      page,
      per_page: 20,
    },
    signal,
  });
  const result = p07CatalogPage<NfcItem>(response.data, warehouseId, 'ITEM');
  if (
    result.items.some(
      item =>
        item.item_status !== 'ISSUED' || item.nfc_status !== 'UNASSIGNED',
    )
  )
    return fail();
  return result;
}
export async function readP07Tag(
  warehouseId: string,
  id: string,
  signal?: AbortSignal,
  client: Client = apiClient,
): Promise<NfcTag> {
  if (client === apiClient) assertP07Connected();
  const response = await client.request<unknown>({
    method: 'GET',
    path: NFC_PATHS.tags + '/' + encodeURIComponent(id),
    query: { warehouse_id: warehouseId },
    signal,
  });
  const body = response.data;
  if (
    !record(body) ||
    body.success !== true ||
    !record(body.meta) ||
    body.meta.contract !== P07_CONTRACT ||
    body.meta.warehouse_id !== warehouseId ||
    !record(body.data) ||
    body.data.physical_code_id !== id
  )
    return fail();
  return body.data as NfcTag;
}
