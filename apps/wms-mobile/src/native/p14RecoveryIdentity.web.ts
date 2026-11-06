export interface RecoveryIdentity {
  operationId: string;
  proof: string;
}
export async function createRecoveryIdentity(): Promise<RecoveryIdentity> {
  if (!globalThis.crypto?.getRandomValues)
    throw new Error('Trình duyệt chưa có nguồn mã bảo vệ an toàn.');
  const id = crypto.getRandomValues(new Uint8Array(16)),
    proofBytes = crypto.getRandomValues(new Uint8Array(32));
  id[6] = (id[6] & 15) | 64;
  id[8] = (id[8] & 63) | 128;
  const h = Array.from(id, b => b.toString(16).padStart(2, '0')).join('');
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let proof = '',
    bits = 0,
    value = 0;
  for (const byte of proofBytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      proof += alphabet[(value >>> bits) & 63];
    }
  }
  if (bits) proof += alphabet[(value << (6 - bits)) & 63];
  return {
    operationId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(
      12,
      16,
    )}-${h.slice(16, 20)}-${h.slice(20)}`,
    proof,
  };
}
