/** P14 closure adapter only. Live gate stays OFF; tests inject a mock client. */
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../api/client';
import { AppError, extractRequestId } from '../errors/AppError';
import { logger } from '../logging/logger';
import { p14DevEnabled } from '../config/p14Release';
import { bindOriginalP14End } from './p14RequestGuard';
import { getAppStorage } from '../storage/storage';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import {
  getShiftState,
  protocolEndSupported,
  publishShiftState,
  shiftMatchesOwner,
  currentShiftOwner,
  assertKnownShiftIdentity,
} from './shiftState';
import {
  clearPendingWorkShiftStart,
  parseWorkShift,
  validShiftTimestamp,
  UUID_PATTERN,
  fetchCurrentWorkShift,
  type WorkShift,
} from '../services/wms/workShift';

export const P14_SHIFT_GATE = Object.freeze({
  enabled: p14DevEnabled(),
  recoveryEnabled: false,
  source: '709744875a039178f432574ce1b59aaa3b42395c',
});
export interface LocalShiftEvidence {
  readonly revision: string;
  readonly state: 'CLEAN' | 'DIRTY' | 'UNKNOWN';
  readonly pendingRequestIds: readonly string[];
  readonly busy: boolean;
  readonly coverageComplete: boolean;
}
export interface CloseCheck {
  readonly shift_id: string;
  readonly actor_id: string;
  readonly auth_session_id: string;
  readonly warehouse_id: string;
  readonly can_end: boolean;
  readonly can_end_scope: 'SERVER_CHECK_ONLY';
  readonly blockers: readonly string[];
  readonly expected_version: number;
  readonly check_token: string | null;
  readonly draft_scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP';
  readonly draft_count: number;
  readonly draft_owners_unchanged: true;
  readonly client_confirmation_required: {
    local_state: 'CLEAN';
    pending_request_ids: readonly [];
  };
}
export interface EndReceipt {
  readonly shift_id: string;
  readonly actor_id?: string; // historical stored END receipts are unchanged
  readonly auth_session_id: string;
  readonly warehouse_id: string;
  readonly request_id: string;
  readonly command: 'END';
  readonly outcome: 'SUCCEEDED';
  readonly status: 'ENDED';
  readonly version: number;
  readonly ended_at: string;
  readonly summary_id: string;
  readonly login_preserved: true;
}
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const invalid = (code = 'SHIFT_RESPONSE_INVALID'): never => {
  throw new AppError({
    kind: 'parse',
    code,
    message: 'Receipt/close-check chưa khớp identity và contract P14.',
  });
};
const clean = (local: LocalShiftEvidence) =>
  local.coverageComplete &&
  local.state === 'CLEAN' &&
  !local.busy &&
  local.pendingRequestIds.length === 0;
const sameInstant = (left: unknown, right: unknown) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  Number.isFinite(Date.parse(left)) &&
  Date.parse(left) === Date.parse(right);
export function decodeCloseCheck(value: unknown, shift: WorkShift): CloseCheck {
  const c = obj(value),
    cc = obj(c.client_confirmation_required);
  if (
    c.shift_id !== shift.shift_id ||
    c.actor_id !== shift.actor_id ||
    c.auth_session_id !== shift.auth_session_id ||
    c.warehouse_id !== shift.warehouse_id ||
    typeof c.can_end !== 'boolean' ||
    c.can_end_scope !== 'SERVER_CHECK_ONLY' ||
    !Array.isArray(c.blockers) ||
    c.blockers.some(x => typeof x !== 'string') ||
    !Number.isSafeInteger(c.expected_version) ||
    Number(c.expected_version) < 1 ||
    c.draft_scope !== 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP' ||
    !Number.isSafeInteger(c.draft_count) ||
    Number(c.draft_count) < 0 ||
    Number(c.draft_count) > 1000 ||
    c.draft_owners_unchanged !== true ||
    cc.local_state !== 'CLEAN' ||
    !Array.isArray(cc.pending_request_ids) ||
    cc.pending_request_ids.length !== 0 ||
    (c.can_end
      ? c.blockers.length !== 0 ||
        typeof c.check_token !== 'string' ||
        !c.check_token ||
        c.check_token.length > 8192
      : c.check_token !== null || c.blockers.length === 0)
  )
    invalid();
  return c as unknown as CloseCheck;
}
export function decodeEndReceipt(
  value: unknown,
  shift: WorkShift,
  key: string,
  version: number,
): EndReceipt {
  const r = obj(value);
  if (
    r.shift_id !== shift.shift_id ||
    (r.actor_id !== undefined && r.actor_id !== shift.actor_id) ||
    r.auth_session_id !== shift.auth_session_id ||
    r.warehouse_id !== shift.warehouse_id ||
    r.request_id !== key ||
    r.command !== 'END' ||
    r.outcome !== 'SUCCEEDED' ||
    r.status !== 'ENDED' ||
    r.version !== version + 1 ||
    r.summary_id !== shift.shift_id ||
    r.login_preserved !== true ||
    typeof r.ended_at !== 'string' ||
    !validShiftTimestamp(r.ended_at)
  )
    invalid();
  return r as unknown as EndReceipt;
}
export function createP14ShiftService(deps: {
  request?: (options: RequestOptions) => Promise<ApiResponse<unknown>>;
  readLocal: () => LocalShiftEvidence;
  now?: () => number;
}) {
  const request = deps.request ?? apiClient.request,
    now = deps.now ?? Date.now;
  let check:
    | {
        value: CloseCheck;
        at: number;
        revision: string;
        mode: string;
        scope: ReturnType<typeof captureSessionScope>;
        shift: WorkShift;
      }
    | undefined;
  let pending:
    | {
        key: string;
        shift: WorkShift;
        body: {
          warehouse_id: string;
          check_token: string;
          local_state: 'CLEAN';
          pending_request_ids: readonly [];
        };
        version: number;
        scope: ReturnType<typeof captureSessionScope>;
      }
    | undefined;
  let busy = false;
  let checkEpoch = 0;
  let receiptResult: EndReceipt | undefined;
  let summaryResult: Record<string, unknown> | undefined;
  let journalIssue: AppError | undefined;
  const lifetimeScope = captureSessionScope();
  const journalOwner = currentShiftOwner();
  const journalKey = 'shift.end.check-only:' + JSON.stringify(journalOwner);
  // Persist only receipt identity, never the opaque close-check token/body.
  // After a process restart there is no permission to re-POST; GET original
  // receipt is sufficient to reconcile and retain login.
  const saved = obj(getAppStorage().getObject(journalKey));
  const owner = currentShiftOwner();
  if (getAppStorage().has(journalKey)) {
    try {
      if (
        !owner ||
        typeof saved.key !== 'string' ||
        !UUID_PATTERN.test(saved.key) ||
        !Number.isSafeInteger(saved.version) ||
        Number(saved.version) < 1 ||
        !saved.shift ||
        !shiftMatchesOwner(saved.shift as WorkShift, owner)
      )
        invalid();
      const original = parseWorkShift(saved.shift, 'local-original-END');
      if (!protocolEndSupported(original)) invalid();
      pending = {
        key: saved.key as string,
        version: Number(saved.version),
        shift: original,
        scope: captureSessionScope(),
        body: {
          warehouse_id: owner!.warehouseId,
          check_token: '',
          local_state: 'CLEAN',
          pending_request_ids: [],
        },
      };
    } catch {
      journalIssue = new AppError({
        kind: 'unknown',
        code: 'SHIFT_END_JOURNAL_DAMAGED',
        message:
          'Journal END chưa đọc được đúng identity. Giữ nguyên; không tạo END/key thay thế.',
      });
    }
  }
  function gate(write = false) {
    if (write && !deps.request && !P14_SHIFT_GATE.enabled)
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P14_SHIFT_NOT_ENABLED',
        message: 'P14 gate OFF. Chưa gửi yêu cầu kết thúc ca.',
      });
    if (journalIssue) throw journalIssue;
    guard(lifetimeScope);
  }
  function guard(scope: ReturnType<typeof captureSessionScope>) {
    if (!isSessionScopeCurrent(scope))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Identity ca đã thay đổi.',
      });
  }
  function envelope(r: ApiResponse<unknown>) {
    const e = obj(r.data);
    if (
      r.status !== 200 ||
      e.success !== true ||
      obj(e.meta).contract !== 'p14-shift-v1' ||
      !('data' in e)
    )
      invalid('SHIFT_ENVELOPE_INVALID');
    return e.data;
  }
  function capture(end = true) {
    const s = getShiftState();
    if (
      !s.shift ||
      !s.owner ||
      !shiftMatchesOwner(s.shift, s.owner) ||
      (end && !protocolEndSupported(s.shift))
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'SHIFT_END_UNSUPPORTED',
        message:
          'Ca chưa hỗ trợ END; không nâng cấp legacy hoặc suy từ ACTIVE.',
      });
    return s.shift;
  }
  return {
    get receipt() {
      return receiptResult;
    },
    get summarySnapshot() {
      return summaryResult;
    },
    get canEnd() {
      if (!check || pending || busy || journalIssue) return false;
      const s = getShiftState(),
        local = deps.readLocal();
      return (
        (!!deps.request || P14_SHIFT_GATE.enabled) &&
        isSessionScopeCurrent(check.scope) &&
        protocolEndSupported(s.shift) &&
        s.shift?.shift_id === check.shift.shift_id &&
        s.shift.version === check.value.expected_version &&
        s.shift.lifecycle?.mode === check.mode &&
        check.value.can_end &&
        clean(local) &&
        local.revision === check.revision &&
        now() >= check.at &&
        now() - check.at < 300000
      );
    },
    get blocker() {
      return journalIssue?.message;
    },
    get pending() {
      return pending
        ? {
            key: pending.key,
            shiftId: pending.shift.shift_id,
            outcome: 'CHECK_ONLY',
          }
        : undefined;
    },
    invalidateCheck() {
      check = undefined;
      checkEpoch++;
    },
    async closeCheck() {
      gate();
      if (busy || pending)
        throw new AppError({
          kind: 'unknown',
          message: 'Đối chiếu request END cũ trước.',
        });
      busy = true;
      check = undefined;
      const ticket = ++checkEpoch;
      let responseTrace: {status:number;requestId?:string;shiftId:string;strongEtag:boolean} | undefined;
      try {
        if (!deps.request) {
          await fetchCurrentWorkShift();
          guard(lifetimeScope);
        }
        const begun = now();
        const shift = capture(false),
          scope = captureSessionScope(),
          local = deps.readLocal();
        const r = await request({
          method: 'GET',
          path: `/api/v1/mini-app/work-shifts/${shift.shift_id}/close-check`,
          query: { warehouse_id: shift.warehouse_id },
        });
        responseTrace = {status:r.status,requestId:r.header?.('x-request-id') ?? extractRequestId(r.data),shiftId:shift.shift_id,strongEtag:/^"[1-9][0-9]*"$/.test(r.header?.('etag') ?? '')};
        guard(scope);
        assertKnownShiftIdentity(shift);
        if (
          ticket !== checkEpoch ||
          deps.readLocal().revision !== local.revision
        )
          invalid();
        const value = decodeCloseCheck(envelope(r), shift);
        if (value.expected_version !== shift.version)
          invalid('SHIFT_CLOSE_VERSION_MISMATCH');
        if (!deps.request && r.header?.('etag') !== `"${value.expected_version}"`)
          invalid('SHIFT_CLOSE_ETAG_INVALID');
        check = {
          value,
          at: begun,
          revision: local.revision,
          mode: shift.lifecycle!.mode,
          scope,
          shift,
        };
        if (!deps.request && P14_SHIFT_GATE.enabled) logger.warn('P14 DEV close-check verified', {
          response: responseTrace,
          identityValidated: true,
          canEndOnServer: value.can_end,
          localState: local.state,
          localCoverageComplete: local.coverageComplete,
        });
        return value;
      } catch (error) {
        if (error instanceof AppError) logger.warn('P14 close-check blocked', {
          code: error.code,
          status: error.status,
          requestId: error.requestId,
          response: responseTrace,
        });
        throw error;
      } finally {
        busy = false;
      }
    },
    async end(key: string) {
      gate(true);
      if (busy || pending)
        throw new AppError({
          kind: 'unknown',
          message: 'END đang chờ; không replay hoặc tạo key khác.',
        });
      if (!UUID_PATTERN.test(key) || !check)
        throw new AppError({
          kind: 'config',
          message: 'Thiếu key hoặc close-check.',
        });
      const captured = check,
        shift = capture(),
        local = deps.readLocal();
      guard(captured.scope);
      if (
        !captured.value.can_end ||
        !captured.value.check_token ||
        !clean(local) ||
        local.revision !== captured.revision ||
        now() - captured.at >= 300000 ||
        shift.shift_id !== captured.shift.shift_id ||
        shift.version !== captured.value.expected_version ||
        now() < captured.at ||
        shift.lifecycle!.mode !== captured.mode
      )
        throw new AppError({
          kind: 'config',
          code: 'SHIFT_CHECK_STALE',
          message: 'Cần close-check mới và local CLEAN đã xác minh đầy đủ.',
        });
      pending = {
        key,
        shift,
        version: captured.value.expected_version,
        scope: captured.scope,
        body: {
          warehouse_id: shift.warehouse_id,
          check_token: captured.value.check_token,
          local_state: 'CLEAN',
          pending_request_ids: [],
        },
      };
      getAppStorage().setObject(journalKey, {
        key: pending.key,
        shift: pending.shift,
        version: pending.version,
      });
      busy = true;
      check = undefined;
      try {
        const capturedEnd = pending;
        const release = bindOriginalP14End(key, options => {
          guard(capturedEnd.scope);
          const current = getShiftState().shift,
            latest = deps.readLocal();
          if (
            pending !== capturedEnd ||
            !current ||
            current.shift_id !== capturedEnd.shift.shift_id ||
            current.version !== capturedEnd.version ||
            current.lifecycle?.mode !== capturedEnd.shift.lifecycle?.mode ||
            !protocolEndSupported(current) ||
            !clean(latest) ||
            latest.revision !== captured.revision ||
            now() < captured.at ||
            now() - captured.at >= 300000 ||
            JSON.stringify(options.body) !== JSON.stringify(capturedEnd.body)
          )
            invalid();
        });
        let r: ApiResponse<unknown>;
        try {
          r = await request({
            method: 'POST',
            path: `/api/v1/mini-app/work-shifts/${shift.shift_id}/end`,
            body: pending.body,
            headers: {
              'Idempotency-Key': key,
              'If-Match': `"${pending.version}"`,
            },
          });
        } finally {
          release();
        }
        guard(pending.scope);
        assertKnownShiftIdentity(shift);
        const receipt = decodeEndReceipt(
          envelope(r),
          shift,
          key,
          pending.version,
        );
        if (
          receipt.actor_id !== shift.actor_id ||
          (!deps.request && r.header?.('etag') !== `"${receipt.version}"`)
        )
          invalid();
        const s = getShiftState();
        if (!s.owner) invalid();
        publishShiftState(
          {
            ...shift,
            status: 'ENDED',
            preview_ready: false,
            ended_at: receipt.ended_at,
            version: receipt.version,
            lifecycle: {
              ...shift.lifecycle!,
              end_supported: false,
              end_unavailable_reason: 'SHIFT_ALREADY_ENDED',
            },
          },
          s.owner!,
          pending.scope.generation,
        );
        clearPendingWorkShiftStart(shift.auth_session_id);
        receiptResult = receipt;
        pending = undefined;
        getAppStorage().remove(journalKey);
        return receipt;
      } catch (e) {
        /* unknown keeps original body/token/version only in memory; no plaintext proof persistence */ throw e;
      } finally {
        busy = false;
      }
    },
    async reconcile() {
      gate();
      if (!pending || busy)
        throw new AppError({
          kind: 'config',
          message: 'Chưa có END pending hoặc đang đối chiếu.',
        });
      busy = true;
      const p = pending;
      try {
        guard(p.scope);
        assertKnownShiftIdentity(p.shift);
        const r = await request({
          method: 'GET',
          path: `/api/v1/mini-app/work-shifts/${p.shift.shift_id}/requests/${p.key}`,
          query: { warehouse_id: p.shift.warehouse_id },
        });
        guard(p.scope);
        assertKnownShiftIdentity(p.shift);
        const receipt = decodeEndReceipt(
          envelope(r),
          p.shift,
          p.key,
          p.version,
        );
        if (receipt.actor_id !== p.shift.actor_id) invalid();
        const s = getShiftState();
        if (!s.owner) invalid();
        publishShiftState(
          {
            ...p.shift,
            status: 'ENDED',
            preview_ready: false,
            ended_at: receipt.ended_at,
            version: receipt.version,
            lifecycle: {
              ...p.shift.lifecycle!,
              end_supported: false,
              end_unavailable_reason: 'SHIFT_ALREADY_ENDED',
            },
          },
          s.owner!,
          p.scope.generation,
        );
        clearPendingWorkShiftStart(p.shift.auth_session_id);
        receiptResult = receipt;
        pending = undefined;
        getAppStorage().remove(journalKey);
        return receipt;
      } finally {
        busy = false;
      }
    },
    async summary(page = 1, perPage = 20) {
      gate();
      const state = getShiftState(),
        scope = captureSessionScope();
      if (
        !state.shift ||
        !state.owner ||
        state.phase !== 'ENDED' ||
        state.shift.tracking_contract !== 'p14-shift-v1' ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(perPage) ||
        perPage < 1 ||
        perPage > 100
      )
        throw new AppError({
          kind: 'config',
          message: 'Snapshot ca chưa đủ identity hoặc phân trang không hợp lệ.',
        });
      let r:ApiResponse<unknown>;
      try{r = await request({method:'GET',path:`/api/v1/mini-app/work-shifts/${state.shift.shift_id}/summary`,query:{warehouse_id:state.shift.warehouse_id,page,per_page:perPage}});}catch(e){if(e instanceof AppError && (e.status===401||e.status===403))summaryResult=undefined;throw e;}
      guard(scope);
      const data = obj(envelope(r)),
        kpis = obj(data.kpis),
        documents = obj(kpis.recorded_documents),
        draft = obj(data.draft_snapshot);
      if (
        data.contract !== 'p14-shift-v1' ||
        data.shift_id !== state.shift.shift_id ||
        data.warehouse_id !== state.shift.warehouse_id ||
        data.immutable !== true ||
        typeof data.started_at !== 'string' ||
        !validShiftTimestamp(data.started_at) ||
        typeof data.ended_at !== 'string' ||
        !validShiftTimestamp(data.ended_at) ||
        kpis.count_unit !== 'TRACKED_OWNER_REQUEST' ||
        kpis.quantity_total !== null ||
        kpis.posted_total !== null ||
        kpis.quantity_status !== 'NOT_PROJECTED' ||
        kpis.posted_total_status !== 'NOT_PROJECTED' ||
        !Number.isSafeInteger(kpis.successful_request_count) ||
        Number(kpis.successful_request_count) < 0 ||
        kpis.recorded_documents_scope !== 'EXPLICIT_RECORD_ROUTES_ONLY' ||
        ['INBOUND', 'OUTBOUND', 'WARRANTY', 'COMPONENT_ISSUE'].some(
          k => !Number.isSafeInteger(documents[k]) || Number(documents[k]) < 0,
        ) ||
        draft.scope !== 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP' ||
        draft.owner_unchanged !== true ||
        !Array.isArray(draft.items) ||
        draft.page !== page ||
        draft.per_page !== perPage ||
        !Number.isSafeInteger(draft.total) ||
        !Number.isSafeInteger(draft.last_page) ||
        Number(draft.last_page) < 1 ||
        draft.items.length > perPage ||
        Number(draft.total) < draft.items.length
      )
        invalid();
      const total = Number(draft.total),
        rawItems = draft.items as unknown[];
      if (
        total > 1000 ||
        total < 0 ||
        draft.last_page !== Math.max(1, Math.ceil(total / perPage)) ||
        rawItems.length !==
          Math.min(perPage, Math.max(0, total - (page - 1) * perPage))
      )
        invalid();
      const ids = new Set<string>();
      for (const raw of rawItems) {
        const item = obj(raw);
        if (
          ![item.document_id, item.scan_session_id, item.last_request_id].every(
            v => typeof v === 'string' && UUID_PATTERN.test(v),
          ) ||
          item.actor_id !== state.shift.actor_id ||
          item.auth_session_id !== state.shift.auth_session_id ||
          item.warehouse_id !== state.shift.warehouse_id ||
          item.status !== 'DRAFT' ||
          !Number.isSafeInteger(item.version) ||
          Number(item.version) < 1 ||
          !['INBOUND', 'OUTBOUND', 'WARRANTY', 'COMPONENT_ISSUE'].includes(
            String(item.operation),
          ) ||
          typeof item.codes !== 'string' ||
          typeof item.form !== 'string' ||
          ids.has(String(item.document_id))
        )
          invalid();
        try {
          if (
            !Array.isArray(JSON.parse(item.codes as string)) ||
            !JSON.parse(item.form as string) ||
            Array.isArray(JSON.parse(item.form as string))
          )
            invalid();
        } catch {
          invalid();
        }
        ids.add(String(item.document_id));
      }
      if (
        !sameInstant(data.ended_at, state.shift.ended_at) ||
        !sameInstant(data.started_at, state.shift.started_at)
      )
        invalid();
      if (summaryResult) {
        const oldDraft = obj(summaryResult.draft_snapshot);
        if (
          JSON.stringify([
            summaryResult.kpis,
            oldDraft.total,
            oldDraft.scope,
          ]) !== JSON.stringify([data.kpis, draft.total, draft.scope])
        )
          invalid();
        const previous = oldDraft.items as unknown[];
        if (page === 1) {
          if (
            JSON.stringify(previous.slice(0, perPage)) !==
            JSON.stringify(rawItems)
          )
            invalid();
          return summaryResult;
        }
        if (
          page !== Number(oldDraft.page) + 1 ||
          previous.some(raw => ids.has(String(obj(raw).document_id)))
        )
          invalid();
        data.draft_snapshot = { ...draft, items: [...previous, ...rawItems] };
      }
      summaryResult = data;
      return data;
    },
  };
}
