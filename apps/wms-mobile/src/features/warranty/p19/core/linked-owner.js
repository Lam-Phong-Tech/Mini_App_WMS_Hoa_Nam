// Native port of approved P19 pure JSON owner. See CORE_PROVENANCE.json.
import {
  P19_LINKED_GATE,
  P19_LINKED_MODE,
  P19_LINKED_CONTRACT,
  LINKED_UUID,
  LinkedIssueError,
  linkedScope,
  linkedObject,
  linkedContext,
  linkedCase,
  linkedResolve,
  linkedDraft,
  linkedSave,
  linkedPostResult,
  linkedCurrent,
  linkedCodes,
  linkedMetadata,
  linkedWriteGuard,
  snapshotEqual,
  positive,
  clone,
} from './linked-contract.js';

// Private snapshot owner; no storage singleton, polling, hardware or request on mount.
export function createLinkedIssueOwner({
  adapter,
  getScope,
  uuid = () => {
    throw new LinkedIssueError('P19_UUID_PROVIDER_REQUIRED');
  },
  checkpoint = null,
  onChange = () => {},
}) {
  let scope = null,
    disposed = false,
    epoch = 0,
    navEpoch = 0;
  let s = {
    resumeBlocked: false,
    mode: P19_LINKED_MODE,
    phase: 'EMPTY',
    recordRequest: null,
    recordEnvelope: null,
    currentDraft: null,
    context: null,
    caseRow: null,
    draftId: null,
    scanSessionId: null,
    draftVersion: 0,
    rows: [],
    pendingQuantity: null,
    form: null,
    dirty: false,
    savedSnapshot: null,
    lastSaveKey: null,
    receipt: null,
    pending: null,
    unknown: false,
    busy: false,
    resolving: false,
    result: null,
    current: null,
    error: null,
  };
  const originalKeys = new Set();
  const sameScope = () =>
    !!scope &&
    !disposed &&
    JSON.stringify(getScope()) === JSON.stringify(scope);
  const snapshot = () =>
    clone({
      ...s,
      scope,
      gate: P19_LINKED_GATE,
      counts: {
        codes: s.rows.length,
        quantity: s.rows.reduce((n, r) => n + r.quantity, 0),
      },
    });
  const emit = () => {
    if (sameScope()) onChange(snapshot());
  };
  const fail = (code, message = code) => {
    throw new LinkedIssueError(code, message);
  };
  const key = () => {
    const id = uuid();
    if (
      !LINKED_UUID.test(id || '') ||
      originalKeys.has(id) ||
      [s.draftId, s.scanSessionId].includes(id)
    )
      fail('P19_ID_REUSE');
    originalKeys.add(id);
    return id;
  };
  const mutable = () => {
    if (
      !sameScope() ||
      s.busy ||
      s.resolving ||
      s.unknown ||
      s.pending ||
      s.phase !== 'DRAFT' ||
      s.resumeBlocked
    )
      fail('P19_WRITE_LOCKED');
    linkedWriteGuard(scope, s.context, s.caseRow);
  };
  const batch = () =>
    s.rows.map(r => ({
      raw_code: r.raw_code,
      quantity: r.quantity,
      scan_source: r.scan_source,
    }));
  const body = () => ({
    warehouse_id: scope.warehouseId,
    operation: 'COMPONENT_ISSUE',
    scan_session_id: s.scanSessionId,
    codes: linkedCodes(batch()),
    form: clone(s.form),
  });
  const problem = e => {
    s.error = {
      code: e.code || 'P19_UNKNOWN',
      message: e.message || 'Chưa xác minh kết quả.',
    };
    emit();
  };
  function makeRequest(command, confirmed = false) {
    const request = {
      mode: P19_LINKED_MODE,
      command,
      key: key(),
      caseId: s.caseRow.warranty_case_id,
      scope: clone(scope),
      draftId: s.draftId,
      scanSessionId: s.scanSessionId,
      draftVersion: s.draftVersion,
      method: command === 'SAVE' ? 'PUT' : 'POST',
      path:
        command === 'SAVE'
          ? '/api/v1/mini-app/drafts/' + s.draftId
          : '/api/v1/mini-app/warranty-component-issues/record',
      lifecycle: 'NEW_NOT_SENT',
    };
    request.headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': request.key,
    };
    if (command === 'SAVE') {
      request.body = body();
      request.headers['If-Match'] = `"${s.draftVersion}"`;
    } else {
      request.savedSnapshot = clone(s.savedSnapshot);
      request.lastSaveKey = s.lastSaveKey;
      request.confirmed = confirmed;
      const m = s.form.p19;
      request.body = {
        warehouse_id: scope.warehouseId,
        warranty_case_id: s.caseRow.warranty_case_id,
        post_immediately: true,
        items: linkedCodes(batch(), { empty: false }),
        ...(m.document_date !== undefined
          ? { document_date: m.document_date }
          : {}),
        ...(m.note !== undefined ? { note: m.note } : {}),
      };
      Object.assign(request.headers, {
        'X-Component-Issue-Contract': P19_LINKED_CONTRACT,
        'X-Draft-ID': s.draftId,
        'X-Draft-Scan-Session-ID': s.scanSessionId,
        'X-Draft-Version': String(s.draftVersion),
      });
      request.skuTotals = Object.fromEntries(
        s.rows.map(r => [
          r.resolved.sku_id,
          s.rows
            .filter(x => x.resolved.sku_id === r.resolved.sku_id)
            .reduce((n, r) => n + r.quantity, 0),
        ]),
      );
    }
    return request;
  }
  function accept(b, r) {
    if (r.command === 'SAVE') {
      const data = linkedSave(b, r);
      s.draftVersion = data.draft.version;
      s.receipt = data.receipt;
      s.lastSaveKey = r.key;
      s.savedSnapshot = clone(r.body);
      s.dirty = false;
    } else {
      const data = linkedPostResult(b, r);
      if (
        data.result.lines.length !== Object.keys(r.skuTotals).length ||
        data.result.lines.some(l => r.skuTotals[l.sku_id] !== l.required_qty)
      )
        fail('P19_RESULT_SKU_MISMATCH');
      s.result = data.result;
      s.recordRequest = clone(r);
      s.recordEnvelope = {
        data: {
          component_issue_document_id: data.result.business_document_id,
          p19_result: clone(data.result),
        },
        meta: {
          p03_draft: {
            document: clone(data.draft),
            receipt: clone(data.receipt),
          },
        },
      };
      s.receipt = data.receipt;
      s.draftVersion = data.draft.version;
      s.phase = 'RECORDED';
    }
    s.pending = null;
    s.unknown = false;
    s.error = null;
  }
  async function execute(r) {
    s.pending = clone(r);
    s.busy = true;
    s.error = null;
    const ticket = epoch,
      nav = navEpoch;
    emit();
    try {
      const response = await adapter.execute(r);
      if (!sameScope() || ticket !== epoch || nav !== navEpoch) {
        s.busy = false;
        s.unknown = true;
        return false;
      }
      if (
        response.etag != null &&
        r.command === 'SAVE' &&
        !new RegExp(`^(?:W/)?"${r.draftVersion + 1}"$`).test(response.etag)
      )
        fail('P19_SAVE_ETAG_MISMATCH');
      accept(response.body, r);
      s.busy = false;
      emit();
      return true;
    } catch (e) {
      s.busy = false;
      if (sameScope() && ticket === epoch) {
        s.unknown = true;
        problem(e);
      }
      return false;
    }
  }

  return {
    snapshot,
    gate: P19_LINKED_GATE,
    writeGuard() {
      try {
        if (!sameScope())
          fail('P19_SCOPE_CHANGED', 'Phiên hoặc kho không còn khớp.');
        linkedWriteGuard(scope, s.context, s.caseRow);
        if (s.resumeBlocked)
          fail(
            'P19_RESUME_PRIVATE_BATCH_MISMATCH',
            'Bản nháp chưa khớp dữ liệu đang giữ.',
          );
        return '';
      } catch (e) {
        return e.message;
      }
    },
    async initialize(caseId) {
      if (disposed || scope || s.busy) return false;
      try {
        scope = linkedScope(getScope());
        if (!LINKED_UUID.test(caseId || '')) fail('P19_CASE_UUID_REQUIRED');
        s.busy = true;
        const ticket = epoch;
        const ctx = linkedContext(await adapter.context(), scope),
          row = linkedCase(await adapter.case(scope, caseId), scope, caseId);
        if (!sameScope() || ticket !== epoch) return false;
        s.context = ctx;
        s.caseRow = row;
        if (checkpoint) {
          this.restoreCheckpoint(checkpoint);
          s.context = ctx;
          s.caseRow = row;
          s.busy = false;
          return true;
        }
        linkedWriteGuard(scope, ctx, row);
        s.draftId = key();
        s.scanSessionId = key();
        s.form = {
          p19: { contract: P19_LINKED_CONTRACT, warranty_case_id: caseId },
        };
        s.phase = 'DRAFT';
        s.dirty = true;
        s.busy = false;
        emit();
        return true;
      } catch (e) {
        s.busy = false;
        problem(e);
        return false;
      }
    },
    async resolve(raw, scanSource = 'MANUAL') {
      let started = false;
      try {
        mutable();
        if (s.pendingQuantity) fail('P19_QUANTITY_PENDING');
        linkedCodes([{ raw_code: raw, quantity: 1, scan_source: scanSource }]);
        s.resolving = true;
        started = true;
        emit();
        const ticket = epoch,
          nav = navEpoch;
        const d = linkedResolve(
          await adapter.resolve(scope, s.caseRow.warranty_case_id, raw),
          scope,
          s.caseRow.warranty_case_id,
          raw,
        );
        s.resolving = false;
        if (!sameScope() || ticket !== epoch || nav !== navEpoch)
          return { kind: 'stale' };
        s.caseRow.status = d.warranty_case_status;
        const existing = s.rows.find(r => r.raw_code === raw);
        if (d.item_type === 'ITEM') {
          if (s.rows.some(r => r.resolved.item_id === d.item_id))
            return { kind: 'duplicate' };
          if (existing) fail('P19_RESOLVE_IDENTITY_CHANGED');
          if (s.rows.length >= 1000) fail('P19_BATCH_LIMIT');
          s.rows.push({
            raw_code: raw,
            quantity: 1,
            scan_source: scanSource,
            resolved: d,
          });
          s.dirty = true;
          emit();
          return { kind: 'accepted' };
        }
        if (
          existing &&
          (existing.resolved.item_type !== 'BOX' ||
            existing.resolved.container_id !== d.container_id)
        )
          fail('P19_RESOLVE_IDENTITY_CHANGED');
        if (
          s.rows
            .filter(r => r.resolved.container_id === d.container_id)
            .reduce((n, r) => n + r.quantity, 0) >= d.available_qty
        )
          fail('COMPONENT_BOX_INSUFFICIENT');
        s.pendingQuantity = {
          raw_code: raw,
          scan_source: existing?.scan_source || scanSource,
          resolved: d,
        };
        emit();
        return { kind: 'quantity' };
      } catch (e) {
        if (started) s.resolving = false;
        if (started || !s.resolving) problem(e);
        return { kind: 'invalid', error: e.message };
      } finally {
        if (started) {
          s.resolving = false;
          emit();
        }
      }
    },
    quantity(value, { replace = false } = {}) {
      try {
        mutable();
        const p = s.pendingQuantity;
        if (!p) fail('P19_QUANTITY_PENDING');
        const n = Number(value);
        if (!/^\d+$/.test(String(value)) || !positive(n) || n > 100000)
          fail('P19_QUANTITY_INVALID');
        const index = s.rows.findIndex(r => r.raw_code === p.raw_code),
          old = index >= 0 ? s.rows[index] : null,
          total = (replace ? 0 : old?.quantity || 0) + n;
        const containerTotal =
          s.rows
            .filter(
              r =>
                r.raw_code !== p.raw_code &&
                r.resolved.container_id === p.resolved.container_id,
            )
            .reduce((q, r) => q + r.quantity, 0) + total;
        if (total > 100000 || containerTotal > p.resolved.available_qty)
          fail('COMPONENT_BOX_INSUFFICIENT');
        const row = {
          raw_code: p.raw_code,
          scan_source: p.scan_source,
          quantity: total,
          resolved: p.resolved,
        };
        if (index < 0) {
          if (s.rows.length >= 1000) fail('P19_BATCH_LIMIT');
          s.rows.push(row);
        } else s.rows[index] = row;
        s.pendingQuantity = null;
        if (!old || old.quantity !== total) s.dirty = true;
        emit();
        return { kind: 'accepted' };
      } catch (e) {
        problem(e);
        return { kind: 'invalid', error: e.message };
      }
    },
    cancelQuantity() {
      if (!sameScope() || s.unknown || s.busy) return false;
      s.pendingQuantity = null;
      emit();
      return true;
    },
    editQuantity(raw) {
      try {
        mutable();
        const row = s.rows.find(r => r.raw_code === raw);
        if (!row || row.resolved.item_type !== 'BOX' || s.pendingQuantity)
          fail('P19_QUANTITY_NOT_EDITABLE');
        s.pendingQuantity = {
          raw_code: row.raw_code,
          scan_source: row.scan_source,
          resolved: clone(row.resolved),
        };
        emit();
        return true;
      } catch (e) {
        problem(e);
        return false;
      }
    },
    remove(raw) {
      try {
        mutable();
        if (s.pendingQuantity) fail('P19_QUANTITY_PENDING');
        const i = s.rows.findIndex(r => r.raw_code === raw);
        if (i < 0) return false;
        s.rows.splice(i, 1);
        s.dirty = true;
        emit();
        return true;
      } catch (e) {
        problem(e);
        return false;
      }
    },
    metadata(patch) {
      try {
        mutable();
        const m = linkedMetadata(
          { ...s.form.p19, ...patch },
          s.caseRow.warranty_case_id,
        );
        if (m.contract !== s.form.p19.contract) fail('P19_FORM_INVALID');
        s.form = { p19: m };
        s.dirty = true;
        emit();
        return true;
      } catch (e) {
        problem(e);
        return false;
      }
    },
    async save() {
      try {
        mutable();
        if (s.pendingQuantity) fail('P19_QUANTITY_PENDING');
        if (!s.dirty && s.draftVersion > 0) return true;
        return execute(makeRequest('SAVE'));
      } catch (e) {
        problem(e);
        return false;
      }
    },
    async record({ confirmedStockDecrease = false } = {}) {
      try {
        mutable();
        if (
          !confirmedStockDecrease ||
          s.dirty ||
          s.pendingQuantity ||
          !s.savedSnapshot ||
          !snapshotEqual(body(), s.savedSnapshot) ||
          s.draftVersion < 1 ||
          !s.rows.length
        )
          fail('P19_SAVE_CONFIRMATION_REQUIRED');
        if (s.rows.length > P19_LINKED_GATE.maxRecordRows)
          fail('P19_RECORD_LIMIT_PENDING_BE');
        return execute(makeRequest('RECORD', true));
      } catch (e) {
        problem(e);
        return false;
      }
    },
    async check() {
      if (
        !sameScope() ||
        s.busy ||
        !s.pending ||
        !s.unknown ||
        !s.context?.permissions.COMPONENT_ISSUE.read
      )
        return false;
      const r = clone(s.pending),
        ticket = epoch,
        nav = navEpoch;
      s.busy = true;
      emit();
      try {
        const b = await adapter.check(r);
        if (!sameScope() || ticket !== epoch || nav !== navEpoch) return false;
        const d = b.data;
        if (
          !linkedObject(d) ||
          d.request_id !== r.key ||
          d.document_id !== r.draftId ||
          d.scan_session_id !== r.scanSessionId ||
          d.warehouse_id !== scope.warehouseId ||
          d.operation !== 'COMPONENT_ISSUE' ||
          d.command !== r.command ||
          d.new_document_allowed !== false ||
          !['SUCCEEDED', 'UNKNOWN'].includes(d.outcome)
        )
          fail('P19_CHECK_IDENTITY');
        if (d.outcome === 'UNKNOWN') return false;
        if (
          d.receipt?.request_id !== r.key ||
          d.receipt?.command !== r.command ||
          JSON.stringify(d.receipt) !==
            JSON.stringify(
              r.command === 'RECORD'
                ? d.response?.meta?.p03_draft?.receipt
                : d.response?.data?.receipt,
            )
        )
          fail('P19_CHECK_RECEIPT');
        const current = d.document
          ? linkedDraft(d.document, scope, r.draftId, r.scanSessionId, r.caseId)
          : null;
        if (current && current.version < r.draftVersion + 1)
          fail('P19_CURRENT_VERSION_MISMATCH');
        if (
          r.command === 'RECORD' &&
          current &&
          (current.status !== 'RECORDED' ||
            current.business_document_id !==
              d.response?.data?.p19_result?.business_document_id)
        )
          fail('P19_CURRENT_BUSINESS_MISMATCH');
        accept(d.response, r);
        if (current) {
          s.currentDraft = current;
          s.draftVersion = current.version;
          if (current.status === 'RECORDED') {
            s.phase = 'RECORDED';
            s.dirty = false;
          } else if (r.command === 'SAVE' && !snapshotEqual(current, r.body)) {
            s.unknown = true;
            s.pending = clone(r);
            s.dirty = true;
            fail('P19_CURRENT_SNAPSHOT_CONFLICT');
          }
        }
        emit();
        return true;
      } catch (e) {
        problem(e);
        return false;
      } finally {
        s.busy = false;
        emit();
      }
    },
    async revalidate() {
      if (!sameScope() || s.busy || s.resolving || !s.caseRow) return false;
      s.busy = true;
      s.context = null;
      emit();
      const ticket = epoch,
        nav = navEpoch;
      try {
        const ctx = linkedContext(await adapter.context(), scope),
          row = linkedCase(
            await adapter.case(scope, s.caseRow.warranty_case_id),
            scope,
            s.caseRow.warranty_case_id,
          );
        if (!sameScope() || ticket !== epoch || nav !== navEpoch) return false;
        s.context = ctx;
        s.caseRow = row;
        return true;
      } catch (e) {
        problem(e);
        return false;
      } finally {
        s.busy = false;
        emit();
      }
    },
    async resume() {
      if (
        !sameScope() ||
        s.busy ||
        s.pending ||
        s.unknown ||
        !s.context?.permissions.COMPONENT_ISSUE.read
      )
        return false;
      s.busy = true;
      const ticket = epoch,
        nav = navEpoch;
      try {
        const caseRow = linkedCase(
            await adapter.case(scope, s.caseRow.warranty_case_id),
            scope,
            s.caseRow.warranty_case_id,
          ),
          b = await adapter.draft(scope, s.draftId, s.scanSessionId);
        if (!sameScope() || ticket !== epoch || nav !== navEpoch) return false;
        const d = linkedDraft(
          b.data,
          scope,
          s.draftId,
          s.scanSessionId,
          s.caseRow.warranty_case_id,
        );
        s.caseRow = caseRow;
        s.draftVersion = d.version;
        s.form = clone(d.form);
        s.savedSnapshot = {
          warehouse_id: d.warehouse_id,
          operation: d.operation,
          scan_session_id: d.scan_session_id,
          codes: clone(d.codes),
          form: clone(d.form),
        };
        s.dirty = false;
        s.phase = d.status;
        s.resumeBlocked = false;
        if (d.status === 'RECORDED') {
          const current = linkedCurrent(
            await adapter.current(scope, d.business_document_id),
            scope,
            s.caseRow.warranty_case_id,
            d.business_document_id,
          );
          if (!sameScope() || ticket !== epoch || nav !== navEpoch)
            return false;
          s.current = current;
        } else if (d.status === 'DRAFT') {
          linkedWriteGuard(scope, s.context, s.caseRow);
          if (
            JSON.stringify(linkedCodes(batch())) !==
            JSON.stringify(linkedCodes(d.codes))
          ) {
            s.resumeBlocked = true;
            fail('P19_RESUME_PRIVATE_BATCH_MISMATCH');
          }
        }
        return true;
      } catch (e) {
        problem(e);
        return false;
      } finally {
        s.busy = false;
        emit();
      }
    },
    async readCurrent() {
      if (
        !sameScope() ||
        s.busy ||
        s.phase !== 'RECORDED' ||
        !s.result ||
        !s.context?.permissions.COMPONENT_ISSUE.read
      )
        return false;
      const ticket = epoch,
        nav = navEpoch;
      try {
        const current = linkedCurrent(
          await adapter.current(scope, s.result.business_document_id),
          scope,
          s.caseRow.warranty_case_id,
          s.result.business_document_id,
        );
        if (!sameScope() || ticket !== epoch || nav !== navEpoch) return false;
        s.current = current;
        emit();
        return true;
      } catch (e) {
        problem(e);
        return false;
      }
    },
    checkpoint() {
      if (!scope) return null;
      return clone({
        schema: 'p19-linked-private-v1',
        mode: s.mode,
        scope,
        caseId: s.caseRow?.warranty_case_id,
        draftId: s.draftId,
        scanSessionId: s.scanSessionId,
        draftVersion: s.draftVersion,
        rows: s.rows,
        form: s.form,
        dirty: s.dirty,
        savedSnapshot: s.savedSnapshot,
        lastSaveKey: s.lastSaveKey,
        receipt: s.receipt,
        pending: s.pending,
        unknown: s.unknown || (!!s.pending && s.busy),
        result: s.result,
        recordRequest: s.recordRequest,
        recordEnvelope: s.recordEnvelope,
        phase: s.phase,
      });
    },
    restoreCheckpoint(c) {
      const fields = [
        'schema',
        'mode',
        'scope',
        'caseId',
        'draftId',
        'scanSessionId',
        'draftVersion',
        'rows',
        'form',
        'dirty',
        'savedSnapshot',
        'lastSaveKey',
        'receipt',
        'pending',
        'unknown',
        'result',
        'recordRequest',
        'recordEnvelope',
        'phase',
      ];
      if (
        !linkedObject(c) ||
        Object.keys(c).some(k => !fields.includes(k)) ||
        !Array.isArray(c.rows) ||
        !Number.isSafeInteger(c.draftVersion) ||
        c.draftVersion < 0
      )
        fail('P19_CHECKPOINT_SHAPE');
      if (
        !sameScope() ||
        !linkedObject(c) ||
        c.schema !== 'p19-linked-private-v1' ||
        c.mode !== P19_LINKED_MODE ||
        JSON.stringify(c.scope) !== JSON.stringify(scope) ||
        c.caseId !== s.caseRow?.warranty_case_id ||
        !LINKED_UUID.test(c.draftId || '') ||
        !LINKED_UUID.test(c.scanSessionId || '')
      )
        fail('P19_CHECKPOINT_ISOLATION');
      if (c.rows.some(r => !linkedObject(r.resolved)))
        fail('P19_CHECKPOINT_RESOLVE');
      linkedCodes(
        c.rows.map(r => ({
          raw_code: r.raw_code,
          quantity: r.quantity,
          scan_source: r.scan_source,
        })),
      );
      linkedMetadata(c.form.p19, c.caseId);
      if (c.result) {
        if (
          c.phase !== 'RECORDED' ||
          !c.recordRequest ||
          !c.recordEnvelope ||
          JSON.stringify(c.recordRequest.scope) !== JSON.stringify(scope)
        )
          fail('P19_CHECKPOINT_RESULT');
        const verified = linkedPostResult(c.recordEnvelope, c.recordRequest);
        if (JSON.stringify(verified.result) !== JSON.stringify(c.result))
          fail('P19_CHECKPOINT_RESULT');
      }
      if (
        c.pending &&
        (!['SAVE', 'RECORD'].includes(c.pending.command) ||
          !LINKED_UUID.test(c.pending.key || '') ||
          c.pending.headers?.Authorization !== undefined ||
          (c.pending.key === c.lastSaveKey && c.pending.command === 'RECORD'))
      )
        fail('P19_CHECKPOINT_REQUEST');
      if (
        c.pending &&
        (c.pending.draftId !== c.draftId ||
          c.pending.scanSessionId !== c.scanSessionId ||
          JSON.stringify(c.pending.scope) !== JSON.stringify(scope) ||
          c.pending.caseId !== c.caseId)
      )
        fail('P19_CHECKPOINT_REQUEST');
      Object.assign(s, clone(c), {
        context: s.context,
        caseRow: s.caseRow,
        busy: false,
        resolving: false,
        pendingQuantity: null,
        current: null,
        error: null,
      });
      if (c.pending) s.unknown = true;
      for (const v of [
        c.draftId,
        c.scanSessionId,
        c.lastSaveKey,
        c.pending?.key,
      ])
        if (v) originalKeys.add(v);
    },
    leave() {
      navEpoch++;
      s.pendingQuantity = null;
      if (s.pending) {
        s.unknown = true;
        s.busy = false;
      }
    },
    logoutEvidence() {
      const c = this.checkpoint();
      disposed = true;
      epoch++;
      return c;
    },
    dispose() {
      disposed = true;
      epoch++;
    },
  };
}
