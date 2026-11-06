/** Owners must register their own evidence; an unregistered owner is UNKNOWN.
 * A registered owner may prove CLEAN from an empty inventory or a terminal /
 * exact-SAVE journal. No shadow draft, clearing, ownership transfer or replay. */
import type { LocalShiftEvidence } from './p14ShiftService';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
export const REQUIRED_SHIFT_OWNERS = [
  'P03',
  'P04',
  'P05',
  'P07',
  'P09',
  'P19',
] as const;
type Owner = (typeof REQUIRED_SHIFT_OWNERS)[number];
const readers = new Map<Owner, () => LocalShiftEvidence>();
export function registerShiftLocalOwner(
  owner: Owner,
  read: () => LocalShiftEvidence,
): () => void {
  const scope = captureSessionScope();
  const ownedRead = () => {
    if (!isSessionScopeCurrent(scope)) throw Error('Old owner');
    const value = read();
    if (!isSessionScopeCurrent(scope)) throw Error('Stale owner');
    return value;
  };
  readers.set(owner, ownedRead);
  return () => {
    if (readers.get(owner) === ownedRead) readers.delete(owner);
  };
}
export function readShiftLocalOwnerStatus() {
  return REQUIRED_SHIFT_OWNERS.map(owner => {
    try {
      const value = readers.get(owner)?.();
      return {
        owner,
        registered: !!value,
        state: value?.state ?? 'UNKNOWN',
        coverageComplete: value?.coverageComplete === true,
        pendingCount: value?.pendingRequestIds.length ?? null,
      };
    } catch {
      return {
        owner,
        registered: false,
        state: 'UNKNOWN',
        coverageComplete: false,
        pendingCount: null,
      };
    }
  });
}
export function readShiftLocalOwners(): LocalShiftEvidence {
  const results = REQUIRED_SHIFT_OWNERS.map(owner => {
    try {
      return readers.get(owner)?.();
    } catch {
      return undefined;
    }
  });
  return {
    revision: JSON.stringify(results.map(x => x?.revision ?? 'UNREGISTERED')),
    coverageComplete: results.every(x => x?.coverageComplete),
    busy: results.some(x => x?.busy),
    pendingRequestIds: results.flatMap(x => x?.pendingRequestIds ?? []),
    state: results.some(x => !x || x.state === 'UNKNOWN')
      ? 'UNKNOWN'
      : results.some(x => x?.state === 'DIRTY')
      ? 'DIRTY'
      : 'CLEAN',
  };
}
