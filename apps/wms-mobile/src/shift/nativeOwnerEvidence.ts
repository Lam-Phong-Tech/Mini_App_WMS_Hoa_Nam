/** Read-only inventory. Retained owner data is not a fabricated SAVE receipt. */
import { getAppStorage, type KeyValueStorage } from '../storage/storage';
import { sameP03Scope, type P03Scope } from '../services/wms/p03Drafts';
import { registerShiftLocalOwner, REQUIRED_SHIFT_OWNERS } from './localOwners';
import type { LocalShiftEvidence } from './p14ShiftService';
import { captureSessionScope } from '../auth/session';
import {
  emptyP05CreateForm,
  p05FormSnapshot,
  p05StableJSON,
} from '../features/outbound/p05CreateForm';

export const P09_CLOSE_CHECK_BASELINE_PREFIX =
  'p09-command-recovery/v1-clean-baseline/';

const p09BaselineKey = (scope: P03Scope) =>
  P09_CLOSE_CHECK_BASELINE_PREFIX +
  [scope.actorId, scope.authSessionId, scope.warehouseId].join('/');

/**
 * Migrates only the legacy "no durable P09 row" state after a verified server
 * close-check says this exact actor/session/warehouse may END. Existing P09
 * rows, malformed rows and UNKNOWN requests are never cleared or overridden.
 */
export function establishP09CloseCheckBaseline(
  canEndOnServer: boolean,
  store: KeyValueStorage = getAppStorage(),
) {
  const s = captureSessionScope();
  if (
    !canEndOnServer ||
    !s.userId ||
    !s.authSessionId ||
    !s.warehouseId
  )
    return false;
  const scope: P03Scope = {
      actorId: s.userId,
      authSessionId: s.authSessionId,
      warehouseId: s.warehouseId,
    },
    rows = owned(rawRows(store, 'p09-command-recovery/v1/'), scope);
  if (rows.length) return false;
  const key = p09BaselineKey(scope),
    value = {
      schema: 'p09-clean-baseline-v1',
      scope,
      source: 'P14_CLOSE_CHECK_CAN_END',
    } as const;
  store.setObject(key, value);
  const saved = store.getObject<typeof value>(key);
  return (
    saved?.schema === value.schema &&
    saved.source === value.source &&
    sameP03Scope(saved.scope, scope)
  );
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(key => [key, v[key]]),
        )
      : v,
  );
type Row = Record<string, any>;
const evidence = (
  owner: string,
  rows: unknown,
  state: LocalShiftEvidence['state'],
  extra: Partial<LocalShiftEvidence> = {},
): LocalShiftEvidence => ({
  revision: owner + ':' + stable(rows),
  state,
  coverageComplete: true,
  busy: false,
  pendingRequestIds: [],
  ...extra,
});
const pendingId = (r: Row) => r.pending?.key ?? r.pending?.requestId;
function rawRows(store: KeyValueStorage, prefix: string): Row[] {
  return store
    .keys()
    .filter(key => key.startsWith(prefix))
    .map(key => {
      const value = store.getObject<Row>(key);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Unresolved journal');
      return value;
    });
}
function owned(rows: Row[], scope: P03Scope) {
  if (
    rows.some(
      row =>
        !row.scope ||
        ['actorId', 'authSessionId', 'warehouseId'].some(
          key => typeof row.scope[key] !== 'string' || !row.scope[key],
        ),
    )
  )
    throw Error('Unresolved scope');
  return rows.filter(row => sameP03Scope(row.scope, scope));
}
function journalEvidence(
  owner: string,
  rows: Row[],
  dirty: (r: Row) => boolean,
) {
  const busy = rows.some(
    r => r.busy || r.scanBusy || r.pending?.outcome === 'IN_FLIGHT',
  );
  const pending = rows.filter(
    r =>
      r.unknown || r.busy || r.scanBusy ||
      (r.pending && !['FAILED', 'CONFLICT'].includes(r.pending.outcome)),
  );
  if (pending.length)
    return evidence(owner, rows, 'UNKNOWN', {
      busy,
      pendingRequestIds: pending
        .map(pendingId)
        .filter((id): id is string => typeof id === 'string' && !!id),
    });
  // A known rejection/conflict is unfinished owner work, not uncertainty.
  // Keep the journal and block END until its owner repairs it; never replay it.
  if (rows.some(r => r.pending) || rows.some(dirty))
    return evidence(owner, rows, 'DIRTY');
  // A retained row is not a blocker by itself. Each owner-specific `dirty`
  // predicate above/below proves whether its last snapshot is terminal or is
  // the exact SAVE version kept for later. Pending/UNKNOWN rows have already
  // failed closed. This permits verified drafts to survive END as required by
  // P14 without treating an unfinished mutation as CLEAN.
  return evidence(owner, rows, 'CLEAN');
}

function p03Saved(row: Row, scope: P03Scope) {
  const identity = row.identity,
    server = row.server,
    receipt = row.receipt,
    body = row.body;
  return (
    identity &&
    server &&
    receipt &&
    body &&
    row.id === identity.documentId &&
    server.document_id === identity.documentId &&
    server.scan_session_id === identity.scanSessionId &&
    server.auth_session_id === scope.authSessionId &&
    server.warehouse_id === scope.warehouseId &&
    server.status === 'DRAFT' &&
    receipt.outcome === 'SUCCEEDED' &&
    receipt.command === 'SAVE' &&
    receipt.document_id === server.document_id &&
    receipt.scan_session_id === server.scan_session_id &&
    receipt.warehouse_id === server.warehouse_id &&
    receipt.operation === server.operation &&
    receipt.version === server.version &&
    body.warehouse_id === scope.warehouseId &&
    body.scan_session_id === identity.scanSessionId &&
    body.operation === server.operation &&
    stable(body.codes ?? []) === stable(server.codes ?? []) &&
    stable(body.form ?? {}) === stable(server.form ?? {}) &&
    (body.title ?? null) === (server.title ?? null)
  );
}

function p05Dirty(row: Row) {
  if (row.dirty === true) return true;
  if (row.outcome === 'recorded' || row.result || row.receipt) return false;
  if ('form' in row || 'accepted' in row || 'version' in row) {
    const accepted = Array.isArray(row.accepted) ? row.accepted : [],
      form = {
        ...emptyP05CreateForm(),
        ...(row.form && typeof row.form === 'object' ? row.form : {}),
      },
      hasWork =
        Number(row.version) > 0 ||
        accepted.length > 0 ||
        p05StableJSON(form) !== p05StableJSON(emptyP05CreateForm());
    if (!hasWork) return false;
    const expected = p05StableJSON({
      form: p05FormSnapshot(form),
      codes: accepted.map((code: Row) => ({
        raw_code: code.raw,
        scan_source: code.source,
      })),
    });
    return (
      Number(row.version) < 1 ||
      typeof row.savedSignature !== 'string' ||
      row.savedSignature !== expected ||
      row.serverDraft?.status !== 'DRAFT' ||
      row.serverDraft?.version !== row.version
    );
  }
  return row.dirty !== false;
}
function readOwner(
  owner: (typeof REQUIRED_SHIFT_OWNERS)[number],
  store: KeyValueStorage,
  scope: P03Scope,
): LocalShiftEvidence {
  if (owner === 'P03')
    return journalEvidence(
      owner,
      owned(rawRows(store, 'p03.drafts.v1/'), scope),
      r => !p03Saved(r, scope),
    );
  if (owner === 'P04') {
    const rows = owned(rawRows(store, 'p04.runs.v1/'), scope);
    const checks = rows.flatMap(r =>
      Array.isArray(r.ownerChecks) ? r.ownerChecks : [],
    );
    const unresolved = checks.filter(
      c => !['SUCCEEDED', 'FAILED'].includes(c?.outcome),
    );
    if (unresolved.length)
      return evidence(owner, rows, 'UNKNOWN', {
        coverageComplete: false,
        busy: unresolved.some(c => c.outcome === 'IN_FLIGHT'),
        pendingRequestIds: unresolved
          .map(c => c.requestId)
          .filter((id): id is string => typeof id === 'string' && !!id),
      });
    return journalEvidence(
      owner,
      rows,
      r =>
        !r.closed &&
        !r.result &&
        (!r.server ||
          !r.saveReceipt ||
          r.saveReceipt.command !== 'SAVE' ||
          r.saveReceipt.version !== r.server.version ||
          stable(r.savedBody) !==
            stable({
              warehouse_id: scope.warehouseId,
              scan_session_id: r.identity?.scanSessionId,
              inbound_type: 'receipt',
              ...(r.ui?.inboundCategory
                ? { inbound_category: r.ui.inboundCategory }
                : {}),
              supplier_id: r.ui?.supplierId ?? null,
              ...(r.ui?.docDate ? { doc_date: r.ui.docDate } : {}),
              name:
                r.nameMode === 'BE_DOCUMENT_NO' &&
                r.ui?.name === r.server?.document_no
                  ? r.savedBody?.name
                  : r.ui?.name,
              note: r.ui?.note ?? '',
              items: r.items,
            })),
    );
  }
  if (owner === 'P05') {
    const wrappers = owned(
      [
        ...rawRows(store, 'hn-p05-create-v1:'),
        ...rawRows(store, 'hn-p05-linked-v1:'),
      ],
      scope,
    );
    if (wrappers.some(r => !r.state || typeof r.state !== 'object'))
      throw Error('Unresolved P05 journal');
    const checks = wrappers
      .flatMap(r =>
        Array.isArray(r.state.ownerChecks) ? r.state.ownerChecks : [],
      )
      .filter(c => !['SUCCEEDED', 'FAILED'].includes(c?.outcome));
    if (checks.length)
      return evidence(owner, wrappers, 'UNKNOWN', {
        coverageComplete: false,
        busy: checks.some(c => c.outcome === 'IN_FLIGHT'),
        pendingRequestIds: checks
          .map(c => c.requestId)
          .filter((v): v is string => typeof v === 'string' && !!v),
      });
    return journalEvidence(
      owner,
      wrappers.map(r => r.state),
      p05Dirty,
    );
  }
  if (owner === 'P07') {
    const key =
      'p07.nfc.' +
      scope.actorId +
      '.' +
      scope.authSessionId +
      '.' +
      scope.warehouseId;
    if (!store.has(key)) return evidence(owner, [], 'CLEAN');
    const row = store.getObject<Row>(key);
    if (!row?.context || !sameP03Scope(row.context, scope))
      throw Error('Unresolved NFC scope');
    const confirmed =
        row.stage === 'CONFIRMED' &&
        row.result?.confirmation?.state === 'SUCCEEDED' &&
        row.result.confirmation.item_id === row.itemId &&
        row.result.confirmation.actor_id === scope.actorId &&
        row.result.confirmation.auth_session_id === scope.authSessionId &&
        row.result.confirmation.warehouse_id === scope.warehouseId,
      rejected =
        row.stage === 'REJECTED' &&
        row.rejection?.state === 'REJECTED' &&
        !!row.rejection?.receipt;
    if (confirmed || rejected)
      return evidence(owner, row, 'CLEAN');
    return evidence(owner, row, 'UNKNOWN', {
      coverageComplete: false,
      busy: [
        'PREPARING',
        'WRITING',
        'CONFIRMING',
        'RECOVERY_PREPARING',
      ].includes(String(row.stage)),
      pendingRequestIds: typeof row.key === 'string' ? [row.key] : [],
    });
  }
  if (owner === 'P09') {
    const rows = owned(rawRows(store, 'p09-command-recovery/v1/'), scope);
    // Existing installations predate durable P09 identities. An absent record
    // cannot prove that their previous in-memory command finished.
    if (!rows.length) {
      const baseline = store.getObject<Row>(p09BaselineKey(scope));
      if (
        baseline?.schema === 'p09-clean-baseline-v1' &&
        baseline.source === 'P14_CLOSE_CHECK_CAN_END' &&
        baseline.scope &&
        sameP03Scope(baseline.scope as P03Scope, scope)
      )
        return evidence(owner, baseline, 'CLEAN');
      return evidence(owner, [], 'UNKNOWN', { coverageComplete: false });
    }
    if (
      rows.some(
        row =>
          row.schema !== 'p09-command-recovery-v1' ||
          !row.command ||
          row.command.requestId !== row.command.idempotencyKey ||
          !sameP03Scope(row.command.scope, scope),
      )
    )
      throw Error('Unresolved P09 journal');
    const unresolved = rows.filter(
      row =>
        !['succeeded', 'failed'].includes(row.phase) ||
        row.receipt?.request_id !== row.command.requestId ||
        (row.phase === 'succeeded' && row.receipt?.state !== 'SUCCEEDED') ||
        (row.phase === 'failed' && row.receipt?.state !== 'FAILED'),
    );
    return unresolved.length
      ? evidence(owner, rows, 'UNKNOWN', {
          busy: rows.some(row => row.phase === 'sending'),
          pendingRequestIds: unresolved.map(row => row.command.requestId),
        })
      : evidence(owner, rows, 'CLEAN');
  }
  const rows = owned(rawRows(store, 'p19-linked-private/v1/'), scope);
  if (rows.some(r => r.schema !== 'p19-linked-private-v1'))
    throw Error('Unresolved P19 journal');
  return journalEvidence(owner, rows, r => r.dirty === true);
}
export function registerNativeP14Owners(
  store: KeyValueStorage = getAppStorage(),
) {
  const releases = REQUIRED_SHIFT_OWNERS.map(owner =>
    registerShiftLocalOwner(owner, () => {
      const s = captureSessionScope();
      if (!s.userId || !s.authSessionId || !s.warehouseId)
        return evidence(owner, 'AUTH', 'UNKNOWN', { coverageComplete: false });
      try {
        return readOwner(owner, store, {
          actorId: s.userId,
          authSessionId: s.authSessionId,
          warehouseId: s.warehouseId,
        });
      } catch {
        return evidence(owner, 'UNRESOLVED_JOURNAL', 'UNKNOWN', {
          coverageComplete: false,
        });
      }
    }),
  );
  return () => releases.forEach(release => release());
}
