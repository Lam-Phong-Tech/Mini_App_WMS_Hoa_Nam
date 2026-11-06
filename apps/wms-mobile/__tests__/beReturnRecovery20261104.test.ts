import {
  parseRecoveryReceipt,
  recoveryRetryAfter,
} from '../src/services/wms/p14Recovery';
const operation = '14141414-1414-4414-8414-141414141414';
test('support intake scope never means delivery, password reset or account access', () => {
  const b = {
    success: true,
    data: {
      operation_id: operation,
      state: 'RECEIVED',
      received_at: '2026-11-04T01:00:00Z',
      expires_at: '2026-11-05T01:00:00Z',
      account_access_granted: false,
    },
    meta: { contract: 'p14-recovery-v1', receipt_scope: 'SUPPORT_INTAKE_ONLY' },
  };
  expect(parseRecoveryReceipt(b, operation)).toMatchObject({
    receiptScope: 'SUPPORT_INTAKE_ONLY',
    state: 'RECEIVED',
    accountAccessGranted: false,
  });
  b.meta.receipt_scope = 'MAIL_DELIVERED';
  expect(() => parseRecoveryReceipt(b, operation)).toThrow();
});
test.each([
  ['27', 27],
  ['1', 1],
  ['0', undefined],
  ['-1', undefined],
  ['2.5', undefined],
  ['Infinity', undefined],
  [null, undefined],
  ['date', undefined],
])(
  'remaining Retry-After %s is integer seconds or unknown, never a fabricated fresh window',
  (v, expected) =>
    expect(recoveryRetryAfter(v as string | null)).toBe(expected),
);
