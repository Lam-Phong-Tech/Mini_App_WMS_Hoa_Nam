import { P05ApiError, UUID } from './p05-contract';

const copy = value => JSON.parse(JSON.stringify(value));
const stable = value =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, v[k]]),
        )
      : v,
  );
const uncertain = e =>
  e?.unknown === true ||
  e?.status >= 500 ||
  [
    'network',
    'timeout',
    'cancelled',
    'parse',
    'unknown',
    'blocked_by_edge',
  ].includes(e?.kind);
export const p05ChecksPending = state =>
  (state.ownerChecks ?? []).some(
    c => !['SUCCEEDED', 'FAILED'].includes(c?.outcome),
  );

/** Additive read-intents only. Never alters an old SAVE/RECORD/CANCEL request. */
export function restoreP05Checks(state, context) {
  if (state.ownerChecks === undefined) return;
  if (!Array.isArray(state.ownerChecks))
    throw new P05ApiError('JOURNAL_INVALID', 'Định danh kiểm mã chưa hợp lệ.');
  const ids = new Set();
  for (const c of state.ownerChecks) {
    if (
      !c ||
      c.contract !== 'p05-resolver-owner-v1' ||
      !UUID.test(c.requestId || '') ||
      ids.has(c.requestId) ||
      (c.shiftId !== undefined && !UUID.test(c.shiftId)) ||
      stable(c.scope) !== stable(context.scope) ||
      !UUID.test(c.draftId || '') ||
      !UUID.test(c.scanSessionId || '') ||
      !Number.isSafeInteger(c.version) ||
      c.version < 1 ||
      (c.sourceId !== undefined &&
        (!UUID.test(c.sourceId) ||
          !Number.isSafeInteger(c.sourceVersion) ||
          c.sourceVersion < 1)) ||
      c.body?.warehouse_id !== context.scope.warehouseId ||
      typeof c.body?.raw_code !== 'string' ||
      !c.body.raw_code.trim() ||
      c.body.raw_code.length > 512 ||
      !['SCAN', 'REVALIDATE'].includes(c.purpose) ||
      !['IN_FLIGHT', 'UNKNOWN', 'SUCCEEDED', 'FAILED'].includes(c.outcome) ||
      (['IN_FLIGHT', 'UNKNOWN'].includes(c.outcome) &&
        (c.draftId !== context.draftId ||
          c.scanSessionId !== context.scanSessionId ||
          c.version !== context.version ||
          c.sourceId !== context.sourceId ||
          c.sourceVersion !== context.sourceVersion))
    )
      throw new P05ApiError(
        'JOURNAL_INVALID',
        'Giữ nguyên lượt kiểm mã cũ; không chuyển định danh sang phiếu/phiên khác.',
      );
    ids.add(c.requestId);
    if (c.outcome === 'IN_FLIGHT') c.outcome = 'UNKNOWN';
  }
}

export function createP05OwnerChecks({ state, capture, persist, admit, uuid }) {
  return async function resolve(adapter, raw, purpose) {
    const original = copy(capture()),
      fingerprint = stable(original);
    const current = () => {
      try {
        return stable(capture()) === fingerprint;
      } catch {
        return false;
      }
    };
    if (p05ChecksPending(state()) || state().pending || state().unknown)
      throw new P05ApiError(
        'P05_CHECK_OUTCOME_UNKNOWN',
        'Lượt kiểm mã cũ chưa rõ kết quả. Giữ nguyên, không tự gửi lại.',
      );
    if (
      ![original.draftId, original.scanSessionId].every(v =>
        UUID.test(v || ''),
      ) ||
      !Number.isSafeInteger(original.version) ||
      original.version < 1
    )
      throw new P05ApiError(
        'P05_CHECK_IDENTITY_REQUIRED',
        'Cần snapshot SAVE hợp lệ trước khi kiểm mã.',
      );
    const bound = await admit(original.scope, original.version);
    if (!current())
      throw new P05ApiError(
        'OWNER_CHANGED',
        'Phiên/kho hoặc màn kiểm mã đã thay đổi.',
      );
    const requestId = uuid();
    if (
      !UUID.test(requestId || '') ||
      (bound.shiftId !== undefined && !UUID.test(bound.shiftId)) ||
      requestId === state().saveReceiptKey ||
      requestId === state().receipt?.request_id ||
      (state().ownerChecks ?? []).some(c => c.requestId === requestId)
    )
      throw new P05ApiError(
        'P05_CHECK_IDENTITY_REQUIRED',
        'Không tái sử dụng trace của lượt kiểm mã cũ.',
      );
    const context = copy(original);
    delete context.runtime;
    const intent = {
      ...context,
      contract: 'p05-resolver-owner-v1',
      requestId,
      ...(bound.shiftId ? { shiftId: bound.shiftId } : {}),
      purpose,
      body: { warehouse_id: original.scope.warehouseId, raw_code: raw },
      outcome: 'IN_FLIGHT',
    };
    state().ownerChecks = [...(state().ownerChecks ?? []), intent];
    if (!persist())
      throw new P05ApiError(
        'JOURNAL_UNAVAILABLE',
        'Không lưu được định danh kiểm mã. Chưa gửi request.',
      );
    try {
      const response = await adapter.resolve(raw, copy(intent));
      if (!current())
        throw new P05ApiError(
          'OWNER_CHANGED',
          'Không áp kết quả kiểm mã của caller/phiên cũ.',
          { unknown: true },
        );
      intent.outcome = 'SUCCEEDED';
      if (!persist())
        throw new P05ApiError(
          'JOURNAL_UNAVAILABLE',
          'Không lưu được kết quả kiểm mã; giữ lượt cũ để đối chiếu.',
          { unknown: true },
        );
      return response;
    } catch (e) {
      if (current()) {
        intent.outcome = uncertain(e) ? 'UNKNOWN' : 'FAILED';
        persist();
      }
      throw e;
    }
  };
}

/** Resolver is read-only. Reconcile exactly one UNKNOWN check with its original
 * request/shift/body; a successful read unlocks a deliberate fresh scan. */
export async function reconcileP05OwnerCheck(
  { state, capture, persist },
  adapter,
) {
  const pending = (state().ownerChecks ?? []).filter(
    c => !['SUCCEEDED', 'FAILED'].includes(c?.outcome),
  );
  if (pending.length !== 1)
    throw new P05ApiError(
      'P05_CHECK_RECONCILE_REQUIRED',
      'Cần đúng một lượt kiểm mã chưa rõ kết quả.',
    );
  const intent = pending[0],
    current = copy(capture()),
    fingerprint = stable(current);
  const stillCurrent = () => {
    try {
      return stable(capture()) === fingerprint;
    } catch {
      return false;
    }
  };
  if (
    stable(intent.scope) !== stable(current.scope) ||
    intent.draftId !== current.draftId ||
    intent.scanSessionId !== current.scanSessionId ||
    intent.version !== current.version ||
    intent.sourceId !== current.sourceId ||
    intent.sourceVersion !== current.sourceVersion
  )
    throw new P05ApiError(
      'OWNER_CHANGED',
      'Phiếu/phiên/version không còn khớp lượt kiểm mã gốc.',
    );
  try {
    await adapter.resolve(intent.body.raw_code, {
      ...copy(intent),
      outcome: 'IN_FLIGHT',
    });
    if (!stillCurrent())
      throw new P05ApiError('OWNER_CHANGED', 'Đã rời lượt đối chiếu cũ.', {
        unknown: true,
      });
    intent.outcome = 'SUCCEEDED';
    if (!persist())
      throw new P05ApiError(
        'JOURNAL_UNAVAILABLE',
        'Không lưu được kết quả đối chiếu lượt kiểm mã.',
        { unknown: true },
      );
    return true;
  } catch (e) {
    if (stillCurrent()) {
      intent.outcome = uncertain(e) ? 'UNKNOWN' : 'FAILED';
      persist();
    }
    throw e;
  }
}
