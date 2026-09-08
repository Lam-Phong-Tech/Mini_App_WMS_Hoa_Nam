/**
 * NFC WMS — luồng an toàn `resolve QR → prepare → ghi/đọc lại chip → confirm`.
 *
 * Không gọi các endpoint generic `physical-codes`: chúng bỏ qua reservation
 * token của Mini App NFC và có thể để hai nhân viên ghi chồng lên nhau.
 */

import { AppError } from '../../errors/AppError';
import { apiClient, type ApiResponse, type RequestOptions } from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { readPage } from './readOnlyClient';
import type { ApiEnvelope, Page } from './types';

export const NFC_PATHS = {
  resolveCode: '/api/v1/mini-app/nfc/resolve-code',
  resolveTag: '/api/v1/mini-app/nfc/resolve-tag',
  tags: '/api/v1/mini-app/nfc-tags',
  items: '/api/v1/mini-app/items',
} as const;

export function nfcPreparePath(itemId: string): string {
  return '/api/v1/mini-app/items/' + encodeURIComponent(itemId) + '/nfc/prepare';
}

export function nfcConfirmPath(itemId: string): string {
  return '/api/v1/mini-app/items/' + encodeURIComponent(itemId) + '/nfc';
}

export function nfcDeactivatePath(physicalCodeId: string): string {
  return '/api/v1/mini-app/nfc-tags/' + encodeURIComponent(physicalCodeId) + '/deactivate';
}

export interface NfcItemSummary {
  readonly id?: string;
  readonly item_id?: string;
  readonly item_unique?: string | null;
  readonly serial_number?: string | null;
  readonly serial?: string | null;
  readonly sku_code?: string | null;
  readonly sku_name?: string | null;
  readonly nfc_status?: string | null;
}

export interface NfcCode {
  readonly physical_code_id?: string;
  readonly id?: string;
  readonly hardware_uid?: string | null;
  readonly code_value?: string | null;
  readonly carrier_type?: string | null;
  readonly status?: string | null;
}

export interface NfcResolvedCode {
  readonly raw_code?: string;
  readonly resolved?: boolean;
  readonly assignable?: boolean;
  readonly assign_block_code?: string | null;
  readonly item?: NfcItemSummary | null;
  readonly sku?: { readonly id?: string; readonly sku_code?: string | null; readonly name?: string | null } | null;
  readonly nfc_status?: string | null;
  readonly nfc?: NfcCode | null;
  readonly nfc_payload?: string | null;
  readonly stock_effect?: string | null;
  readonly nfc_required_for_post?: boolean | null;
}

export interface NfcPreparation extends NfcResolvedCode {
  readonly reservation_token: string;
  readonly expires_at?: string | null;
  readonly ttl_seconds?: number | null;
}

export interface NfcConfirmation extends NfcResolvedCode {
  readonly replaced_physical_code_id?: string | null;
}

export interface NfcTagResolution {
  readonly resolve_code?: 'RESOLVED' | 'NFC_TAG_NOT_REGISTERED' | 'NFC_TAG_NOT_ASSIGNED' | string;
  readonly item?: NfcItemSummary | null;
  readonly sku?: { readonly sku_code?: string | null; readonly name?: string | null } | null;
  readonly nfc?: NfcCode | null;
  readonly last_issue?: Record<string, unknown> | null;
  readonly active_warranty?: Record<string, unknown> | null;
}

export interface NfcTag extends NfcCode {
  readonly item?: NfcItemSummary | null;
  readonly sku?: { readonly sku_code?: string | null; readonly name?: string | null } | null;
}

export interface WriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

export function assertApprovedNfcWrite(method: string, path: string): void {
  if (approvedWriteFor(method, path) === undefined) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message: 'Thao tác NFC ' + method + ' "' + path + '" chưa được duyệt.',
    });
  }
}

function envelopeMessage(envelope: unknown): string | undefined {
  if (typeof envelope !== 'object' || envelope === null) return undefined;
  const message = (envelope as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}

async function requestNfc<T>(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  extra: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<T> {
  assertApprovedNfcWrite(method, path);
  const response = await client.request<ApiEnvelope<T>>({ path, method, body, ...extra });
  const envelope = response.data;
  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http', status: response.status,
      message: envelopeMessage(envelope) ?? 'WMS từ chối thao tác NFC.',
    });
  }
  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({ kind: 'parse', status: response.status, message: 'Phản hồi NFC không có trường "data".' });
  }
  return envelope.data;
}

export function resolveNfcCode(
  rawCode: string,
  options: { signal?: AbortSignal } = {},
  client?: WriteClient,
): Promise<NfcResolvedCode> {
  return requestNfc('POST', NFC_PATHS.resolveCode, { raw_code: rawCode }, options, client);
}

export function prepareNfcAssignment(
  itemId: string,
  options: { signal?: AbortSignal } = {},
  client?: WriteClient,
): Promise<NfcPreparation> {
  return requestNfc('POST', nfcPreparePath(itemId), {}, options, client);
}

export interface ConfirmNfcInput {
  readonly hardwareUid: string;
  readonly writtenPayload: string;
  readonly reservationToken?: string;
  readonly idempotencyKey: string;
}

export function confirmNfcAssignment(
  itemId: string,
  input: ConfirmNfcInput,
  options: { signal?: AbortSignal } = {},
  client?: WriteClient,
): Promise<NfcConfirmation> {
  return requestNfc(
    'PATCH', nfcConfirmPath(itemId),
    {
      hardware_uid: input.hardwareUid,
      written_payload: input.writtenPayload,
      reservation_token: input.reservationToken,
    },
    { ...options, headers: { 'Idempotency-Key': input.idempotencyKey } }, client,
  );
}

export function resolveNfcTag(
  input: { hardwareUid?: string; rawCode?: string },
  options: { signal?: AbortSignal } = {},
  client?: WriteClient,
): Promise<NfcTagResolution> {
  const body = input.hardwareUid?.trim()
    ? { hardware_uid: input.hardwareUid }
    : { raw_code: input.rawCode };
  return requestNfc('POST', NFC_PATHS.resolveTag, body, options, client);
}

export function deactivateNfcTag(
  physicalCodeId: string,
  input: { status: 'INACTIVE' | 'LOST' | 'DAMAGED'; reason: string },
  options: { signal?: AbortSignal } = {},
  client?: WriteClient,
): Promise<NfcTag> {
  return requestNfc('POST', nfcDeactivatePath(physicalCodeId), input, options, client);
}

export function listNfcTags(
  query: { item_id?: string; hardware_uid?: string; status?: string; page?: number; per_page?: number } = {},
): Promise<Page<NfcTag>> {
  return readPage<NfcTag>(NFC_PATHS.tags, { query });
}

export function listNfcItems(
  query: { nfc_status?: string; search?: string; page?: number; per_page?: number } = {},
): Promise<Page<NfcItemSummary>> {
  return readPage<NfcItemSummary>(NFC_PATHS.items, { query });
}

/** Một key giữ nguyên trong lần retry của cùng lượt chạm NFC. */
export function createNfcConfirmationKey(itemId: string, hardwareUid: string): string {
  const safeItem = itemId.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'item';
  const safeUid = hardwareUid.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'tag';
  return 'nfc-' + safeItem + '-' + safeUid + '-' + Date.now().toString(36);
}
