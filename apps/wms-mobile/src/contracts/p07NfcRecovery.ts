import { AppError } from '../errors/AppError';

export const NFC_RECOVERY_CONTRACT = 'nfc-confirm-recovery-v1';
export const NFC_RECOVERY_BE_COMMIT =
  '048d0df67d6df21e556aea0484c1419d9f092f5c';

export interface NfcRejectionReceipt {
  receipt_id: string;
  state: 'REJECTED';
  operation: 'CONFIRM';
  actor_id: string;
  auth_session_id: string;
  warehouse_id: string;
  item_id: string;
  sku_id: string;
  hardware_uid: string;
  request_key_sha256: string;
  original_request_id: string | null;
  payload_sha256: string;
  reason_code: 'SKU_INACTIVE';
  evidence_type: 'SERVER_PREWRITE_SKU_CHECK';
  rejected_at: string;
  mapping_created_by_request: false;
  stock_effect: 'NONE';
}
export interface NfcRecoveryEligibility {
  prepare_allowed: boolean;
  next_action: 'BLOCKED' | 'PREPARE_WITH_RECOVERY_KEY';
  blank_new_tag_required: true;
  old_tag_reuse_allowed: false;
  same_key_retry_allowed: false;
  chip_write_rolled_back: false;
  reservation_released_by_check: false;
  completed: boolean;
  permit_consumed: boolean;
  confirm_dispatched: boolean;
}
export interface NfcRejectedConfirmation {
  state: 'REJECTED';
  http_status: 422;
  response: {
    success: false;
    data: { confirmation: NfcRejectionReceipt };
  };
  receipt: NfcRejectionReceipt;
  recovery: NfcRecoveryEligibility;
  may_create_new_request: boolean;
  retry_policy: 'NEW_PREPARE_ONLY';
}
export interface NfcRecoveryPreparation {
  receipt_id: string;
  blank_new_tag_required: true;
  old_tag_reuse_allowed: false;
  new_confirm_key_required: true;
}

// SHA-256 is used only to compare BE receipt fingerprints with the retained
// request. No new runtime dependency or secret is introduced. UTF-8 bytes are
// hashed exactly; payload is never trimmed/normalized. Tests use NIST/Node vectors.
export function nfcSha256(value: string): string {
  const bytes: number[] = [];
  for (const char of value) {
    let cp = char.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000)
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000),
    low = bitLength >>> 0;
  for (const word of [high, low])
    for (let i = 3; i >= 0; i--) bytes.push((word >>> (i * 8)) & 255);
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const rotr = (n: number, s: number) => (n >>> s) | (n << (32 - s));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = Array<number>(64).fill(0);
    for (let i = 0; i < 16; i++)
      w[i] =
        (bytes[offset + i * 4] << 24) |
        (bytes[offset + i * 4 + 1] << 16) |
        (bytes[offset + i * 4 + 2] << 8) |
        bytes[offset + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15],
        y = w[i - 2];
      w[i] =
        (w[i - 16] +
          (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) +
          w[i - 7] +
          (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) |
        0;
    }
    let [a, b, c, d, e, f, g, z] = h;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (z +
          (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
          ((e & f) ^ (~e & g)) +
          k[i] +
          w[i]) |
        0;
      const t2 =
        ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0;
      z = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const block = [a, b, c, d, e, f, g, z];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + block[i]) | 0;
  }
  return h.map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

export function verifyNfcRejection(
  value: NfcRejectedConfirmation,
  expected: {
    context: { actorId: string; authSessionId: string; warehouseId: string };
    itemId: string;
    key: string;
    hardwareUid: string;
    writtenPayload?: string;
    skuId?: string;
  },
): void {
  const r = value?.receipt,
    recovery = value?.recovery,
    echoed = value?.response?.data?.confirmation;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fields: (keyof NfcRejectionReceipt)[] = [
    'receipt_id',
    'state',
    'operation',
    'actor_id',
    'auth_session_id',
    'warehouse_id',
    'item_id',
    'sku_id',
    'hardware_uid',
    'request_key_sha256',
    'original_request_id',
    'payload_sha256',
    'reason_code',
    'evidence_type',
    'rejected_at',
    'mapping_created_by_request',
    'stock_effect',
  ];
  if (
    !r ||
    !echoed ||
    !recovery ||
    value.state !== 'REJECTED' ||
    value.http_status !== 422 ||
    value.response.success !== false ||
    value.retry_policy !== 'NEW_PREPARE_ONLY' ||
    typeof value.may_create_new_request !== 'boolean' ||
    !uuid.test(r.receipt_id) ||
    !uuid.test(r.sku_id) ||
    r.state !== 'REJECTED' ||
    r.operation !== 'CONFIRM' ||
    r.reason_code !== 'SKU_INACTIVE' ||
    r.evidence_type !== 'SERVER_PREWRITE_SKU_CHECK' ||
    r.mapping_created_by_request !== false ||
    r.stock_effect !== 'NONE' ||
    r.actor_id !== expected.context.actorId ||
    r.auth_session_id !== expected.context.authSessionId ||
    r.warehouse_id !== expected.context.warehouseId ||
    r.item_id !== expected.itemId ||
    r.hardware_uid !== expected.hardwareUid.trim().toUpperCase() ||
    (expected.skuId && r.sku_id !== expected.skuId) ||
    typeof expected.writtenPayload !== 'string' ||
    !expected.writtenPayload ||
    r.request_key_sha256 !== nfcSha256(expected.key.trim()) ||
    r.payload_sha256 !== nfcSha256(expected.writtenPayload) ||
    (r.original_request_id !== null && !uuid.test(r.original_request_id)) ||
    !r.rejected_at ||
    !Number.isFinite(Date.parse(r.rejected_at)) ||
    fields.some(field => r[field] !== echoed[field]) ||
    [
      'prepare_allowed',
      'permit_consumed',
      'confirm_dispatched',
      'completed',
    ].some(
      field =>
        typeof recovery[field as keyof NfcRecoveryEligibility] !== 'boolean',
    ) ||
    !['BLOCKED', 'PREPARE_WITH_RECOVERY_KEY'].includes(recovery.next_action) ||
    recovery.prepare_allowed !==
      (recovery.next_action === 'PREPARE_WITH_RECOVERY_KEY') ||
    (recovery.prepare_allowed &&
      (recovery.confirm_dispatched || recovery.completed)) ||
    recovery.blank_new_tag_required !== true ||
    recovery.old_tag_reuse_allowed !== false ||
    recovery.same_key_retry_allowed !== false ||
    recovery.chip_write_rolled_back !== false ||
    recovery.reservation_released_by_check !== false ||
    value.may_create_new_request !==
      (recovery.prepare_allowed && !recovery.permit_consumed) ||
    (value.may_create_new_request &&
      (recovery.confirm_dispatched ||
        recovery.completed ||
        recovery.next_action !== 'PREPARE_WITH_RECOVERY_KEY'))
  ) {
    throw new AppError({
      kind: 'parse',
      code: 'NFC_REJECTION_INVALID',
      message:
        'Biên nhận từ chối NFC chưa khớp yêu cầu. Giữ nguyên lượt để đối chiếu.',
    });
  }
}
