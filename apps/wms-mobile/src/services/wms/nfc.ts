/**
 * NFC WMS — luồng an toàn `resolve QR → prepare → ghi/đọc lại chip → confirm`.
 *
 * Không gọi các endpoint generic `physical-codes`: chúng bỏ qua reservation
 * token của Mini App NFC và có thể để hai nhân viên ghi chồng lên nhau.
 */

import { AppError } from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { assertP07Connected, P07_CONTRACT } from '../../config/p07Release';
import {
  NFC_RECOVERY_CONTRACT,
  nfcSha256,
  type NfcRejectedConfirmation,
  type NfcRecoveryPreparation,
} from '../../contracts/p07NfcRecovery';
import { readPage } from './readOnlyClient';
import { logger } from '../../logging/logger';
import type { ApiEnvelope, Page } from './types';

export const NFC_PATHS = {
  resolveCode: '/api/v1/mini-app/nfc/resolve-code',
  resolveTag: '/api/v1/mini-app/nfc/resolve-tag',
  tags: '/api/v1/mini-app/nfc-tags',
  items: '/api/v1/mini-app/items',
} as const;

export function nfcPreparePath(itemId: string): string {
  return (
    '/api/v1/mini-app/items/' + encodeURIComponent(itemId) + '/nfc/prepare'
  );
}

export function nfcConfirmPath(itemId: string): string {
  return '/api/v1/mini-app/items/' + encodeURIComponent(itemId) + '/nfc';
}

export function nfcConfirmationPath(itemId: string): string {
  return nfcConfirmPath(itemId) + '/confirmation';
}

export function nfcReleasePath(itemId: string): string {
  return nfcConfirmPath(itemId) + '/release';
}

export function nfcDeactivatePath(physicalCodeId: string): string {
  return (
    '/api/v1/mini-app/nfc-tags/' +
    encodeURIComponent(physicalCodeId) +
    '/deactivate'
  );
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
  readonly item_status?: string | null;
}

export interface NfcCode {
  readonly updated_at?: string | null;
  readonly physical_code_id?: string;
  readonly id?: string;
  readonly hardware_uid?: string | null;
  readonly code_value?: string | null;
  readonly carrier_type?: string | null;
  readonly status?: string | null;
  readonly item_id?: string | null;
  readonly assigned_at?: string | null;
  readonly tab_status?: 'ASSIGNED' | 'UNASSIGNED' | 'LOCKED' | null;
  readonly status_label?: string | null;
  readonly linker?: {
    readonly user_id: string;
    readonly display_name?: string | null;
  } | null;
  readonly assigned_warehouse?: {
    readonly warehouse_id: string;
    readonly name?: string | null;
  } | null;
}

export interface NfcResolvedCode {
  readonly raw_code?: string;
  readonly resolved?: boolean;
  readonly assignable?: boolean;
  readonly assign_block_code?: string | null;
  readonly item?: NfcItemSummary | null;
  readonly sku?: {
    readonly id?: string;
    readonly sku_id?: string;
    readonly sku_code?: string | null;
    readonly sku_name?: string | null;
    readonly name?: string | null;
    readonly status?: string | null;
  } | null;
  readonly nfc_status?: string | null;
  readonly nfc?: NfcCode | null;
  readonly nfc_payload?: string | null;
  readonly stock_effect?: string | null;
  readonly movement_created?: boolean;
  readonly nfc_required_for_post?: boolean | null;
}

export const P07_ASSIGNABLE_ITEM_STATUS = 'ISSUED' as const;
export type P07AssignmentBlock =
  | 'ITEM_NOT_ISSUED'
  | 'ITEM_ALREADY_HAS_NFC'
  | 'NFC_ELIGIBILITY_UNVERIFIED';

/** P07 assignment is an after-outbound action, never an in-stock labelling step. */
export function p07AssignmentBlock(
  value: Pick<NfcResolvedCode, 'item' | 'nfc_status' | 'nfc' | 'assignable'>,
  requireServerAssignable = true,
): P07AssignmentBlock | null {
  if (value.item?.item_status !== P07_ASSIGNABLE_ITEM_STATUS)
    return 'ITEM_NOT_ISSUED';
  if (value.nfc_status !== 'UNASSIGNED' || Boolean(value.nfc?.physical_code_id))
    return 'ITEM_ALREADY_HAS_NFC';
  if (requireServerAssignable && value.assignable !== true)
    return 'NFC_ELIGIBILITY_UNVERIFIED';
  return null;
}

export interface NfcPreparation extends NfcResolvedCode {
  readonly reservation_token: string;
  readonly expires_at?: string | null;
  readonly ttl_seconds?: number | null;
  readonly warehouse_id?: string;
  readonly auth_session_id?: string;
  readonly replace_existing_allowed?: boolean;
  readonly recovery?: NfcRecoveryPreparation;
}

export interface NfcConfirmation extends NfcResolvedCode {
  readonly replaced_physical_code_id?: string | null;
  readonly confirmation?: {
    readonly state: string;
    readonly item_id: string;
    readonly physical_code_id: string;
    readonly actor_id: string;
    readonly auth_session_id: string;
    readonly warehouse_id: string;
  };
  readonly summary?: Readonly<Record<string, number>>;
  readonly summary_scope?: string;
}

export interface NfcLegacyConfirmationStatus {
  readonly state: 'SUCCEEDED' | 'PROCESSING' | 'UNKNOWN';
  readonly http_status?: number;
  readonly response?: {
    readonly success?: boolean;
    readonly data?: NfcConfirmation;
  } | null;
  readonly may_create_new_request: false;
}
export type NfcConfirmationStatus =
  | NfcLegacyConfirmationStatus
  | NfcRejectedConfirmation;
export interface NfcConfirmationOptions extends NfcRequestOptions {
  /** Opt-out only for legacy-client compatibility checks. Native P07 opts in. */
  readonly recoveryContract?: boolean;
}

export interface NfcRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly warehouseId?: string;
  /** Explicit owner-produced headers; not generated by the transport. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface NfcTagResolution {
  readonly resolve_code?:
    | 'RESOLVED'
    | 'NFC_TAG_NOT_REGISTERED'
    | 'NFC_TAG_NOT_ASSIGNED'
    | string;
  readonly item?: NfcItemSummary | null;
  readonly sku?: {
    readonly sku_code?: string | null;
    readonly name?: string | null;
  } | null;
  readonly nfc?: NfcCode | null;
  readonly last_issue?: Record<string, unknown> | null;
  readonly active_warranty?: Record<string, unknown> | null;
}

export interface NfcTag extends NfcCode {
  readonly serial_number?: string | null;
  readonly sku_id?: string | null;
  readonly sku_code?: string | null;
  readonly sku_name?: string | null;
  readonly item?: NfcItemSummary | null;
  readonly sku?: {
    readonly sku_code?: string | null;
    readonly name?: string | null;
  } | null;
}

export function getNfcTag(
  physicalCodeId: string,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<NfcTag> {
  return requestNfc(
    'GET',
    NFC_PATHS.tags + '/' + encodeURIComponent(physicalCodeId),
    undefined,
    options,
    client,
  );
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
  return typeof message === 'string' && message.trim() !== ''
    ? message
    : undefined;
}

async function requestNfc<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body: unknown,
  extra: NfcRequestOptions & { headers?: Record<string, string> } = {},
  client: WriteClient = apiClient,
): Promise<T> {
  // Explicitly injected test clients do not activate the runtime connection.
  if (client === apiClient) assertP07Connected();
  if (method !== 'GET') assertApprovedNfcWrite(method, path);
  const { warehouseId, ...options } = extra;
  const response = await client.request<ApiEnvelope<T>>({
    path,
    method,
    ...(body === undefined ? {} : { body }),
    ...options,
    ...(warehouseId === undefined
      ? {}
      : { query: { warehouse_id: warehouseId } }),
  });
  const envelope = response.data;
  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      message: envelopeMessage(envelope) ?? 'WMS từ chối thao tác NFC.',
    });
  }
  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      message: 'Phản hồi NFC không có trường "data".',
    });
  }
  if (
    path.endsWith('/nfc/confirmation') &&
    (envelope.data as { state?: string })?.state === 'REJECTED'
  ) {
    const meta = envelope.meta as
      | { contract?: string; recovery_contract?: string }
      | undefined;
    if (
      envelope.success !== true ||
      meta?.contract !== P07_CONTRACT ||
      meta?.recovery_contract !== NFC_RECOVERY_CONTRACT
    )
      throw new AppError({
        kind: 'parse',
        code: 'NFC_REJECTION_INVALID',
        message: 'Biên nhận chưa có contract phục hồi NFC đã chốt.',
      });
  }
  return envelope.data;
}

export async function resolveNfcCode(
  rawCode: string,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<NfcResolvedCode> {
  const result = await requestNfc<NfcResolvedCode>(
    'POST',
    NFC_PATHS.resolveCode,
    { raw_code: rawCode },
    options,
    client,
  );
  logger.debug('P07 product current status', {
    resolved: result?.resolved,
    skuStatus: result?.sku?.status,
    assignable: result?.assignable,
    assignBlockCode: result?.assign_block_code,
    nfcStatus: result?.nfc_status,
  });
  return result;
}

export function prepareNfcAssignment(
  itemId: string,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<NfcPreparation> {
  return requestNfc('POST', nfcPreparePath(itemId), {}, options, client);
}
export function prepareNfcRecovery(
  itemId: string,
  rejectedKey: string,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<NfcPreparation> {
  return requestNfc(
    'POST',
    nfcPreparePath(itemId),
    {},
    {
      ...options,
      headers: {
        'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT,
        'X-NFC-Recovery-Key': rejectedKey,
      },
    },
    client,
  );
}

export interface ConfirmNfcInput {
  readonly hardwareUid: string;
  readonly writtenPayload: string;
  readonly reservationToken: string;
  readonly idempotencyKey: string;
}

export function confirmNfcAssignment(
  itemId: string,
  input: ConfirmNfcInput,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<NfcConfirmation> {
  return requestNfc(
    'PATCH',
    nfcConfirmPath(itemId),
    {
      hardware_uid: input.hardwareUid,
      written_payload: input.writtenPayload,
      reservation_token: input.reservationToken,
    },
    {
      ...options,
      headers: { ...options.headers, 'Idempotency-Key': input.idempotencyKey },
    },
    client,
  );
}

export async function getNfcConfirmation(
  itemId: string,
  idempotencyKey: string,
  options: NfcConfirmationOptions = {},
  client?: WriteClient,
): Promise<NfcConfirmationStatus> {
  const { recoveryContract = true, ...requestOptions } = options;
  const result = await requestNfc<NfcConfirmationStatus>(
    'GET',
    nfcConfirmationPath(itemId),
    undefined,
    {
      ...requestOptions,
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...(recoveryContract
          ? { 'X-NFC-Recovery-Contract': NFC_RECOVERY_CONTRACT }
          : {}),
      },
    },
    client,
  );
  // Diagnostic metadata only: no key, token, payload, actor, or reservation.
  logger.debug('P07 confirmation result', {
    itemId,
    requestKeySha256: nfcSha256(idempotencyKey.trim()),
    state: result?.state,
    savedHttpStatus: result?.http_status,
    hasSavedResponse: !!result?.response,
    savedSuccess: result?.response?.success,
    receiptState: result?.response?.data?.confirmation?.state,
    mayCreateNewRequest: result?.may_create_new_request,
    ...(result?.state === 'REJECTED'
      ? {
          prepareAllowed: result.recovery?.prepare_allowed,
          permitConsumed: result.recovery?.permit_consumed,
          confirmDispatched: result.recovery?.confirm_dispatched,
          completed: result.recovery?.completed,
        }
      : {}),
  });
  return result;
}

export function releaseNfcReservation(
  itemId: string,
  reservationToken: string,
  options: NfcRequestOptions = {},
  client?: WriteClient,
): Promise<{
  released: boolean;
  stock_effect: string;
  mapping_removed?: boolean;
  reservation_state?: string;
}> {
  return requestNfc(
    'POST',
    nfcReleasePath(itemId),
    { reservation_token: reservationToken },
    options,
    client,
  );
}

export function resolveNfcTag(
  input: { hardwareUid?: string; rawCode?: string },
  options: NfcRequestOptions = {},
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
  return requestNfc(
    'POST',
    nfcDeactivatePath(physicalCodeId),
    input,
    options,
    client,
  );
}

export function listNfcTags(
  query: {
    warehouse_id?: string;
    keyword?: string;
    tab_status?: 'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'LOCKED';
    item_id?: string;
    hardware_uid?: string;
    status?: string;
    page?: number;
    per_page?: number;
  } = {},
): Promise<Page<NfcTag>> {
  assertP07Connected();
  return readPage<NfcTag>(NFC_PATHS.tags, { query });
}

export function listNfcItems(
  query: {
    warehouse_id?: string;
    nfc_status?: string;
    item_status?: string;
    keyword?: string;
    page?: number;
    per_page?: number;
  } = {},
): Promise<Page<NfcItemSummary>> {
  assertP07Connected();
  return readPage<NfcItemSummary>(NFC_PATHS.items, { query });
}

/** Một key giữ nguyên trong lần retry của cùng lượt chạm NFC. */
export function createNfcConfirmationKey(
  itemId: string,
  hardwareUid: string,
): string {
  const safeItem = itemId.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'item';
  const safeUid =
    hardwareUid.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'tag';
  return 'nfc-' + safeItem + '-' + safeUid + '-' + Date.now().toString(36);
}
