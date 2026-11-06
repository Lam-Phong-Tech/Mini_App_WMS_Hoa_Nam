import { p05ChecksPending } from './linked/p05-owner-checks';
import type { P05ResolverBinding } from './linked/p05-owner-checks';

export const P05_STEP_LABELS: readonly [string, string, string] = [
  'Thông tin',
  'Thêm sản phẩm',
  'Kiểm tra',
];

/** UI handoffs use the latest owner; they never settle or retry a command. */
export function canP05ReviewHandoff(
  state: {
    step: number;
    draftId: string | null;
    scanSessionId: string | null;
    busy: boolean;
    scanBusy: boolean;
    unknown: boolean;
    pending: unknown;
    error: unknown;
    outcome?: string | null;
    recorded?: boolean;
    ownerChecks?: P05ResolverBinding[];
    accepted: readonly { raw: string }[];
  },
  expected: { draftId: string | null; scanSessionId: string | null },
  raw?: string,
) {
  return (
    state.step === 3 &&
    !!state.draftId &&
    !!state.scanSessionId &&
    state.draftId === expected.draftId &&
    state.scanSessionId === expected.scanSessionId &&
    !state.busy &&
    !state.scanBusy &&
    !state.unknown &&
    !state.pending &&
    !state.error &&
    !state.recorded &&
    !state.outcome &&
    !p05ChecksPending(state) &&
    (raw === undefined || state.accepted.some(code => code.raw === raw))
  );
}
