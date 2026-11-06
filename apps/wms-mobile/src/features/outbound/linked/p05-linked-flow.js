// Portable source-linked owner; scope/storage/HTTP are injected by the native runtime.
import { formatVietnamClock } from '../../../time/vietnamTime';
import { assertP03ReconcileIdentity } from '../../../services/wms/p03ReconcileIdentity';
const structuredClone = value => JSON.parse(JSON.stringify(value));
const stable = value =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(k => [k, stable(value[k])]),
      )
    : value;
const formJSON = value => JSON.stringify(stable(value));
import {
  P05_CONTRACT,
  P03_CONTRACT,
  P05ApiError,
  UUID,
  envelope,
  parseDraft,
  parseReceipt,
  verifyRecord,
  obj,
  draftEtagMatches,
} from './p05-contract';
import { createP05Journal } from './p05-journal';
import { p05RejectedObservation } from './p05-exceptions';
import {
  createP05OwnerChecks,
  reconcileP05OwnerCheck,
  p05ChecksPending,
  restoreP05Checks,
} from './p05-owner-checks';

export function createSourceLinkedFlow({
  adapter,
  getScope,
  storage,
  canMutate = () => true,
  onChange = () => {},
  uuid,
  admission = async () => ({}),
  readRelated,
}) {
  let disposed = false,
    epoch = 0,
    searchEpoch = 0,
    active = false,
    navigationEpoch = 0,
    journal = null,
    scope = null;
  const empty = () => ({
    rejected: null,
    mode: 'source-linked',
    step: 1,
    document: null,
    source: null,
    draftId: null,
    draftVersion: 0,
    scanSessionId: null,
    accepted: [],
    attempts: [],
    form: {},
    title: null,
    busy: false,
    scanBusy: false,
    unknown: false,
    recorded: false,
    outcome: null,
    request: null,
    pending: null,
    receipt: null,
    savedCodes: null,
    dirty: false,
    message: '',
    error: null,
    context: null,
    current: null,
    sources: { items: [], meta: null, q: '', loading: false, error: null },
    returnToReview: false,
    revalidating: false,
  });
  let s = empty();
  const finished = [];
  const owns = () =>
    !disposed && scope && JSON.stringify(getScope()) === JSON.stringify(scope);
  const snap = () =>
    structuredClone({
      ...s,
      geography: {
        provinces: [],
        districts: [],
        provinceStatus: 'ready',
        districtStatus: 'ready',
      },
    });
  function persist() {
    if (!owns()) return false;
    try {
      const { context, sources, current, rejected, ...saved } = s;
      if (s.source) {
        journal?.write(saved);
        if (!journal || formJSON(journal.read()) !== formJSON(saved))
          throw Error('P05 journal persistence not verified');
      }
      return true;
    } catch {
      s.error = {
        code: 'JOURNAL_UNAVAILABLE',
        message:
          'Không lưu được journal. Chưa gửi thao tác để bảo toàn định danh.',
      };
      s.message = s.error.message;
      return false;
    }
  }
  const emit = () => {
    if (owns() || (!scope && !disposed)) onChange(snap());
  };
  const readOK = () => owns() && s.context?.permissions.read === true;
  const writeOK = () =>
    canMutate() &&
    readOK() &&
    s.context.permissions.save === true &&
    s.context.permissions.record === true &&
    s.serverDraft?.status !== 'CANCELLED' &&
    !s.busy &&
    !s.unknown &&
    !p05ChecksPending(s) &&
    !s.error;
  const exceptionScope = () =>
    readOK() && active
      ? JSON.stringify([
          scope,
          epoch,
          navigationEpoch,
          s.draftId,
          s.scanSessionId,
          s.draftVersion,
          s.source?.source_document_id,
          s.source?.source_version,
        ])
      : null;
  function problem(e, mutation = false) {
    if (!owns()) return;
    s.error = {
      code: e.code || 'CONTRACT_INVALID',
      message: e.message,
      status: e.status || 0,
      traceId: e.traceId || null,
      unknown: !!e.unknown,
    };
    s.message = e.message;
    if (mutation && e.unknown) {
      s.unknown = true;
      s.outcome = null;
    }
    s.busy = false;
    s.scanBusy = false;
    persist();
    emit();
  }
  const resolverContext = () => {
    if (!owns())
      throw new P05ApiError('OWNER_CHANGED', 'Phiên/kho đã thay đổi.');
    return {
      scope: structuredClone(scope),
      draftId: s.draftId,
      scanSessionId: s.scanSessionId,
      version: s.draftVersion,
      sourceId: s.source?.source_document_id,
      sourceVersion: s.source?.source_version,
      runtime: JSON.stringify([epoch, navigationEpoch, active]),
    };
  };
  const resolveOwned = createP05OwnerChecks({
    state: () => s,
    capture: resolverContext,
    persist,
    uuid,
    admit: admission,
  });
  const batch = () =>
    s.accepted.map(a => ({ raw_code: a.raw, scan_source: a.source }));
  const savedMatch = () =>
    s.savedCodes &&
    JSON.stringify(batch()) === JSON.stringify(s.savedCodes) &&
    !s.dirty;
  function planned() {
    const counts = new Map();
    for (const l of s.source?.lines || [])
      counts.set(l.sku_id, (counts.get(l.sku_id) || 0) + l.planned_qty);
    return counts;
  }
  function planOK() {
    const p = planned(),
      actual = new Map();
    for (const a of s.accepted)
      actual.set(a.skuId, (actual.get(a.skuId) || 0) + 1);
    return (
      p.size > 0 &&
      p.size === actual.size &&
      [...p].every(([k, n]) => actual.get(k) === n)
    );
  }
  function document(source) {
    return {
      namespace: P05_CONTRACT,
      documentId: source.source_document_id,
      sourceVersion: source.source_version,
      scanSessionId: s.scanSessionId,
      version: source.source_version,
      actorId: scope.actorId,
      authSessionId: scope.authSessionId,
      warehouseId: scope.warehouseId,
      warehouseName:
        s.context.available_warehouses.find(
          w => w.warehouse_id === scope.warehouseId,
        )?.name || 'Chưa xác minh',
      number: source.doc_no,
      recipient: source.recipient.name || '',
      recipientId: source.recipient.agency_id,
      phone: source.recipient.phone || '',
      address: source.recipient.address || '',
      districtName: '',
      provinceName: '',
      note: source.note || '',
      planned: source.planned_total_qty,
      group: source.lines.map(l => l.sku_code).join(', '),
      groupId: null,
    };
  }
  function frozen(command, body) {
    const key = uuid(),
      headers = { 'Idempotency-Key': key };
    let path = '/api/v1/mini-app/drafts/' + s.draftId,
      method = 'PUT';
    if (command === 'RECORD') {
      path = '/api/v1/mini-app/outbound/record';
      method = 'POST';
      Object.assign(headers, {
        'X-Draft-ID': s.draftId,
        'X-Draft-Scan-Session-ID': s.scanSessionId,
        'X-Draft-Version': String(s.draftVersion),
      });
    } else {
      headers['If-Match'] = '"' + s.draftVersion + '"';
      if (command === 'CANCEL') {
        path += '/cancel';
        method = 'POST';
      }
    }
    return {
      command,
      key,
      draftId: s.draftId,
      scanSessionId: s.scanSessionId,
      sourceId: s.source.source_document_id,
      sourceVersion: s.source.source_version,
      method,
      path,
      body: structuredClone(body),
      headers,
    };
  }
  function acceptResponse(
    response,
    request,
    _replayed = false,
    currentDraft = null,
  ) {
    if (request.command === 'RECORD') {
      const b = envelope(response, P05_CONTRACT),
        v = verifyRecord(b, request, scope);
      s.request = request;
      s.recorded = true;
      s.outcome = 'recorded';
      s.step = 4;
      s.sentAt = v.receipt.committed_at;
      s.draftVersion = (currentDraft || v.draft).version;
      s.serverDraft = currentDraft || v.draft;
      s.receipt = v.receipt;
      s.recordResponse = v.result;
    } else {
      const b = envelope(response, P03_CONTRACT, [200, 201]),
        r = parseReceipt(b.data?.receipt, request),
        d = parseDraft(b.data?.document, scope, s.draftId, s.scanSessionId);
      if (!draftEtagMatches(response.etag, d.version))
        throw new P05ApiError(
          'CONTRACT_INVALID',
          'ETag không khớp snapshot SAVE/CANCEL.',
          { unknown: true },
        );
      // Replayed receipt is historical: never silently SAVE against a newer current version.
      if (currentDraft && currentDraft.version !== r.version) {
        throw new P05ApiError(
          'STALE_VERSION',
          'Nháp hiện tại đã tiến tiếp. Cần đọc và xử lý xung đột.',
        );
      }
      if (request.command === 'SAVE') {
        if (
          d.version !== r.version ||
          d.codes.some(c => c.quantity !== undefined && c.quantity !== 1) ||
          d.status !== 'DRAFT' ||
          JSON.stringify(
            d.codes.map(c => ({
              raw_code: c.raw_code,
              scan_source: c.scan_source,
            })),
          ) !== JSON.stringify(request.body.codes) ||
          formJSON(d.form) !== formJSON(request.body.form) ||
          d.title !== request.body.title
        )
          throw new P05ApiError(
            'P05_DRAFT_ITEMS_MISMATCH',
            'Snapshot SAVE không khớp toàn bộ dữ liệu đã gửi.',
            { unknown: true },
          );
        s.savedCodes = structuredClone(request.body.codes);
        s.dirty = false;
      } else if (d.version !== r.version || d.status !== 'CANCELLED')
        throw new P05ApiError(
          'DRAFT_STATE_CONFLICT',
          'Nháp chưa xác nhận hủy.',
        );
      s.draftVersion = d.version;
      s.receipt = r;
      s.serverDraft = d;
    }
    s.pending = null;
    s.busy = false;
    s.unknown = false;
    s.error = null;
    s.message = '';
    if (request.command === 'CANCEL' && s.discardRequested) {
      finished.push(snap());
      journal.remove();
      s = { ...empty(), context: s.context, sources: s.sources };
      emit();
      return;
    }
    persist();
    emit();
  }
  async function execute(request) {
    if (!owns() || s.busy) return false;
    s.pending = structuredClone(request);
    if (request.command === 'RECORD') s.request = request;
    s.busy = true;
    s.error = null;
    s.message =
      request.command === 'SAVE'
        ? 'Đang lưu nháp…'
        : request.command === 'RECORD'
        ? 'Đang gửi phiếu…'
        : 'Đang hủy nháp…';
    if (!persist()) {
      s.busy = false;
      emit();
      return false;
    }
    emit();
    const token = epoch;
    try {
      const r = await adapter.execute(request);
      if (!owns() || token !== epoch) return false;
      acceptResponse(r, request);
      return true;
    } catch (e) {
      if (owns() && token === epoch) {
        if (!e.unknown && e.code !== 'IDEMPOTENCY_CONFLICT') {
          s.failedRequests = [...(s.failedRequests || []), request];
          s.pending = null;
          if (request.command === 'RECORD') {
            s.request = null;
            s.outcome = 'not-recorded';
          }
        }
        problem(e, true);
      }
      return false;
    }
  }
  async function save() {
    if (!writeOK() || !s.source || s.request || s.pending) return false;
    if (savedMatch() && s.draftVersion > 0) return true;
    return execute(
      frozen('SAVE', {
        warehouse_id: scope.warehouseId,
        operation: 'OUTBOUND',
        scan_session_id: s.scanSessionId,
        title: s.title,
        codes: batch(),
        form: structuredClone(s.form),
      }),
    );
  }
  async function initialize() {
    const token = ++epoch;
    scope = structuredClone(getScope());
    s.busy = true;
    emit();
    try {
      for (const k of ['actorId', 'authSessionId', 'warehouseId'])
        if (!UUID.test(scope[k] || ''))
          throw new P05ApiError(
            'AUTH_CONTEXT_REQUIRED',
            'Chưa có actor/phiên/kho hợp lệ từ owner P01.',
          );
      journal = createP05Journal(storage, scope, adapter.baseUrl);
      const context = await adapter.context();
      if (token !== epoch || !owns()) return false;
      const saved = journal.read();
      if (saved) {
        if (
          !UUID.test(saved.draftId || '') ||
          !UUID.test(saved.scanSessionId || '') ||
          saved.document?.actorId !== scope.actorId ||
          saved.document?.authSessionId !== scope.authSessionId ||
          saved.document?.warehouseId !== scope.warehouseId ||
          saved.source?.source_document_id !== saved.document?.documentId ||
          !Array.isArray(saved.accepted) ||
          !obj(saved.form) ||
          saved.form.p05_source?.document_id !==
            saved.source.source_document_id ||
          saved.form.p05_source.version !== saved.source.source_version
        )
          throw new P05ApiError(
            'JOURNAL_INVALID',
            'Journal không khớp owner/source. Chưa mở lượt mới.',
          );
        s = {
          ...empty(),
          ...saved,
          rejected: null,
          context,
          sources: empty().sources,
          busy: false,
          scanBusy: false,
        };
        restoreP05Checks(s, resolverContext());
        if (
          saved.pending &&
          (saved.pending.draftId !== saved.draftId ||
            saved.pending.scanSessionId !== saved.scanSessionId ||
            saved.pending.sourceId !== saved.source.source_document_id ||
            saved.pending.sourceVersion !== saved.source.source_version ||
            saved.pending.body?.warehouse_id !== scope.warehouseId ||
            !UUID.test(saved.pending.key || ''))
        )
          throw new P05ApiError(
            'JOURNAL_INVALID',
            'Frozen request không khớp scope/source.',
          );
        if (
          saved.accepted.some(
            a =>
              !UUID.test(a.itemId || '') ||
              !UUID.test(a.skuId || '') ||
              typeof a.raw !== 'string' ||
              a.quantity !== 1 ||
              !['MANUAL', 'CAMERA', 'SCANNER', 'HARDWARE'].includes(a.source),
          ) ||
          new Set(saved.accepted.map(a => a.itemId)).size !==
            saved.accepted.length
        )
          throw new P05ApiError(
            'JOURNAL_INVALID',
            'Batch journal không hợp lệ.',
          );
        if (saved.busy || saved.pending?.unknown || saved.unknown) {
          s.unknown = !!saved.pending;
          s.outcome = null;
        }
        if (s.pending && s.error?.unknown !== false) s.unknown = true;
      } else s = { ...empty(), context };
      s.busy = false;
      emit();
      if (s.recorded) await refreshCurrent();
      else if (s.source && !s.unknown) {
        await refreshSource();
        if (s.draftVersion && !s.error) {
          await readDraft();
          if (!s.error) await revalidateBatch();
        }
      }
      if (
        s.source &&
        !s.pending &&
        !s.unknown &&
        s.dirty &&
        s.failedRequests?.at(-1)?.command === 'SAVE' &&
        s.context.permissions.save &&
        s.context.permissions.record
      ) {
        const checked =
          s.draftVersion === 0
            ? !s.error || s.error.code !== 'SOURCE_STALE_VERSION'
            : await readDraft();
        if (
          checked &&
          ![
            'SOURCE_STALE_VERSION',
            'STALE_VERSION',
            'BATCH_REVALIDATION_REQUIRED',
          ].includes(s.error?.code || '')
        ) {
          s.error = null;
          s.message = '';
          persist();
          emit();
        }
      }
      if (!s.source) await searchSources();
      return !s.error;
    } catch (e) {
      if (token === epoch) problem(e);
      return false;
    }
  }
  async function searchSources(q = '', page = 1) {
    if (!readOK() || q.length > 200 || !Number.isSafeInteger(page) || page < 1)
      return false;
    const ticket = ++searchEpoch,
      owner = epoch;
    s.sources = { ...s.sources, q, loading: true, error: null };
    emit();
    try {
      const r = await adapter.sources({ q, page });
      if (!owns() || owner !== epoch || ticket !== searchEpoch) return false;
      s.sources = { ...r, q, loading: false, error: null };
      emit();
      return true;
    } catch (e) {
      if (owns() && owner === epoch && ticket === searchEpoch) {
        s.sources = {
          ...s.sources,
          loading: false,
          error: { code: e.code, message: e.message },
        };
        emit();
      }
      return false;
    }
  }
  async function chooseSource(id, { replace = false } = {}) {
    if (
      !canMutate() ||
      !readOK() ||
      !s.context.permissions.save ||
      !s.context.permissions.record ||
      s.busy ||
      s.unknown ||
      s.scanBusy ||
      s.pending ||
      s.request ||
      !UUID.test(id || '')
    )
      return false;
    if (
      s.source?.source_document_id === id &&
      s.serverDraft?.status !== 'CANCELLED'
    )
      return refreshSource();
    const owner = epoch,
      nav = navigationEpoch;
    s.busy = true;
    emit();
    let source;
    try {
      source = await adapter.source(id);
    } catch (e) {
      if (owns() && owner === epoch) problem(e);
      return false;
    }
    if (!owns() || owner !== epoch) return false;
    s.busy = false;
    if (nav !== navigationEpoch) {
      emit();
      return false;
    }
    if (s.source) {
      if (!replace) {
        s.message = 'Đổi nguồn cần xác nhận hủy nháp hiện tại.';
        emit();
        return false;
      }
      if (s.serverDraft?.status !== 'CANCELLED' && !(await cancel()))
        return false;
    }
    epoch++;
    s = {
      ...empty(),
      context: s.context,
      sources: s.sources,
      source,
      draftId: uuid(),
      scanSessionId: uuid(),
    };
    s.form = {
      p05_source: {
        document_id: source.source_document_id,
        version: source.source_version,
      },
    };
    s.title = source.doc_no;
    s.document = document(source);
    s.dirty = true;
    persist();
    emit();
    return save();
  }
  async function scan(
    raw,
    source = 'MANUAL',
    time = formatVietnamClock(Date.now(), { seconds: true }),
  ) {
    if (
      !writeOK() ||
      s.pending ||
      s.request ||
      s.scanBusy ||
      s.step !== 2 ||
      !['MANUAL', 'CAMERA', 'SCANNER', 'HARDWARE'].includes(source) ||
      typeof raw !== 'string' ||
      !raw.trim() ||
      raw.length > 512
    )
      return false;
    raw = raw.trim();
    s.rejected = null;
    if (s.accepted.some(a => a.raw === raw)) {
      s.attempts.push({
        raw,
        source,
        time,
        kind: 'duplicate',
        eventId: s.scanSessionId + ':' + (s.attempts.length + 1),
      });
      persist();
      emit();
      return 'duplicate';
    }
    const owner = epoch,
      nav = navigationEpoch,
      session = s.scanSessionId;
    s.scanBusy = true;
    emit();
    let d;
    try {
      d = await resolveOwned(adapter, raw, 'SCAN');
    } catch (e) {
      if (
        owns() &&
        owner === epoch &&
        nav === navigationEpoch &&
        session === s.scanSessionId &&
        s.step === 2 &&
        active
      ) {
        s.scanBusy = false;
        s.message = e.message;
        if (
          e instanceof P05ApiError &&
          e.status === 422 &&
          e.code === 'PHYSICAL_CODE_NOT_FOUND' &&
          !e.unknown
        ) {
          const eventId = s.scanSessionId + ':' + (s.attempts.length + 1);
          s.attempts.push({
            raw,
            source,
            time,
            kind: 'invalid',
            reason: e.code,
            eventId,
          });
          s.rejected = p05RejectedObservation(
            raw,
            eventId,
            { eligibility_code: e.code },
            s.context?.permissions.read === true,
          );
          persist();
          emit();
          return 'invalid';
        }
        if (
          p05ChecksPending(s) ||
          e.status === 401 ||
          e.status === 403 ||
          e.code.includes('CONTEXT') ||
          e.code === 'WAREHOUSE_INACTIVE'
        )
          problem(e);
        else {
          s.error = null;
          emit();
        }
      }
      return false;
    }
    if (
      !owns() ||
      owner !== epoch ||
      nav !== navigationEpoch ||
      session !== s.scanSessionId ||
      s.step !== 2
    )
      return false;
    s.scanBusy = false;
    let kind = 'valid',
      reason = '';
    if (
      d.eligible_for_outbound !== true ||
      d.sku_type !== 'PRODUCT' ||
      !UUID.test(d.sku_id || '') ||
      !UUID.test(d.item_id || '') ||
      !Number.isFinite(d.available_qty) ||
      d.available_qty <= 0
    ) {
      kind = 'invalid';
      reason = d.eligibility_code || 'Mã chưa đủ điều kiện xuất.';
    } else if (s.accepted.some(a => a.itemId === d.item_id)) {
      kind = 'duplicate';
      reason = 'Hiện vật đã được quét.';
    } else if (
      !planned().has(d.sku_id) ||
      s.accepted.filter(a => a.skuId === d.sku_id).length + 1 >
        planned().get(d.sku_id)
    ) {
      kind = 'invalid';
      reason = 'SKU hoặc số lượng không khớp kế hoạch phiếu nguồn.';
    }
    s.attempts.push({
      raw,
      source,
      time,
      kind,
      ...(reason ? { reason } : {}),
      eventId: s.scanSessionId + ':' + (s.attempts.length + 1),
    });
    s.rejected =
      kind === 'invalid'
        ? p05RejectedObservation(
            raw,
            s.attempts[s.attempts.length - 1].eventId,
            d,
            s.context?.permissions.read === true,
          )
        : null;
    if (kind === 'valid') {
      s.accepted.push({
        raw,
        source,
        itemId: d.item_id,
        skuId: d.sku_id,
        sku:
          d.sku_code ||
          s.source.lines.find(l => l.sku_id === d.sku_id).sku_code,
        quantity: 1,
      });
      s.dirty = true;
    }
    s.message = reason;
    persist();
    emit();
    if (kind === 'valid') await save();
    return kind;
  }
  async function reconcile() {
    const request = s.pending;
    if (!readOK() || !request || s.busy) return false;
    s.busy = true;
    emit();
    const token = epoch;
    try {
      const b = await adapter.reconcile(request);
      if (!owns() || token !== epoch) return false;
      const d = b.data;
      if (
        !obj(d) ||
        !['SUCCEEDED', 'UNKNOWN'].includes(d.outcome) ||
        d.new_document_allowed !== false ||
        !['NONE', 'SAME_REQUEST_ONLY'].includes(d.retry)
      )
        throw new P05ApiError('CONTRACT_INVALID', 'Đối chiếu chưa xác minh.', {
          unknown: true,
        });
      if (d.outcome === 'UNKNOWN') {
        assertP03ReconcileIdentity(d, {
          key: request.key,
          draftId: request.draftId,
          scanSessionId: request.scanSessionId,
          warehouseId: scope.warehouseId,
          operation: 'OUTBOUND',
          command: request.command,
        });
        if (
          d.receipt !== null ||
          d.response !== null ||
          d.retry !== 'SAME_REQUEST_ONLY' ||
          d.cancel_allowed !== false
        )
          throw new P05ApiError(
            'CONTRACT_INVALID',
            'UNKNOWN mâu thuẫn receipt/policy.',
            { unknown: true },
          );
        s.busy = false;
        s.unknown = true;
        s.retry = d.retry;
        persist();
        emit();
        return false;
      }
      parseReceipt(d.receipt, request);
      const current = d.document
        ? parseDraft(d.document, scope, s.draftId, s.scanSessionId)
        : null;
      if (!current || !obj(d.response))
        throw new P05ApiError(
          'CONTRACT_INVALID',
          'Thiếu current draft hoặc response lịch sử.',
          { unknown: true },
        );
      if (d.retry !== 'NONE')
        throw new P05ApiError(
          'CONTRACT_INVALID',
          'Receipt thành công không cho phép retry.',
          { unknown: true },
        );
      s.retry = 'NONE';
      s.unknown = false;
      const stored = d.response;
      acceptResponse(
        { status: request.command === 'SAVE' ? 200 : 200, body: stored },
        request,
        true,
        current,
      );
      if (request.command === 'RECORD') await refreshCurrent();
      return true;
    } catch (e) {
      if (owns() && token === epoch) problem(e, true);
      return false;
    }
  }
  async function revalidateBatch() {
    if (!s.accepted.length) return true;
    const token = epoch,
      id = s.draftId;
    s.busy = true;
    s.revalidating = true;
    emit();
    try {
      for (const a of s.accepted) {
        const d = await resolveOwned(adapter, a.raw, 'REVALIDATE');
        if (!owns() || token !== epoch || id !== s.draftId) return false;
        if (
          d.eligible_for_outbound !== true ||
          d.sku_type !== 'PRODUCT' ||
          d.item_id !== a.itemId ||
          d.sku_id !== a.skuId ||
          !Number.isFinite(d.available_qty) ||
          d.available_qty <= 0
        )
          throw new P05ApiError(
            'BATCH_REVALIDATION_REQUIRED',
            'Mã trong nháp không còn khớp điều kiện xuất. Giữ dữ liệu để đối chiếu.',
          );
      }
      s.busy = false;
      s.revalidating = false;
      emit();
      return true;
    } catch (e) {
      if (token === epoch) {
        s.revalidating = false;
        problem(e);
      }
      return false;
    }
  }
  async function refreshSource() {
    const token = epoch,
      id = s.source?.source_document_id;
    if (!readOK() || !s.source || s.busy || s.unknown) return false;
    try {
      const source = await adapter.source(s.source.source_document_id);
      if (!owns() || token !== epoch || id !== s.source?.source_document_id)
        return false;
      if (source.source_version !== s.source.source_version)
        throw new P05ApiError(
          'SOURCE_STALE_VERSION',
          'Version nguồn đã thay đổi. Giữ batch để xử lý, không tự tăng version.',
        );
      return true;
    } catch (e) {
      if (token === epoch) problem(e);
      return false;
    }
  }
  async function readDraft() {
    const token = epoch,
      id = s.draftId;
    if (!readOK() || !s.draftId || !s.draftVersion || s.busy || s.unknown)
      return false;
    try {
      const d = await adapter.draft(s.draftId, s.scanSessionId);
      if (!owns() || token !== epoch || id !== s.draftId) return false;
      if (
        d.status !== 'DRAFT' ||
        d.title !== s.title ||
        d.version !== s.draftVersion ||
        JSON.stringify(
          d.codes.map(c => ({
            raw_code: c.raw_code,
            scan_source: c.scan_source,
          })),
        ) !== JSON.stringify(s.savedCodes) ||
        formJSON(d.form) !== formJSON(s.form)
      )
        throw new P05ApiError(
          'STALE_VERSION',
          'Snapshot nháp server khác bản đang giữ. Không tự ghi đè.',
        );
      s.serverDraft = d;
      if (s.error?.code === 'STALE_VERSION') s.error = null;
      emit();
      return true;
    } catch (e) {
      if (token === epoch) problem(e);
      return false;
    }
  }
  async function refreshCurrent() {
    const token = epoch,
      id = s.source?.source_document_id;
    if (!readOK() || !s.source) return false;
    try {
      const current = await adapter.current(s.source.source_document_id);
      if (!owns() || token !== epoch || id !== s.source?.source_document_id)
        return false;
      s.current = current;
      emit();
      return true;
    } catch (e) {
      if (token === epoch) problem(e);
      return false;
    }
  }
  async function cancel() {
    if (
      !canMutate() ||
      !readOK() ||
      !s.context.permissions.save ||
      s.busy ||
      s.unknown ||
      s.scanBusy ||
      s.recorded ||
      !s.context.permissions.cancel ||
      s.pending ||
      s.request ||
      !s.source
    )
      return false;
    if (s.dirty && !(await save())) return false;
    if (
      !s.receipt ||
      s.receipt.command !== 'SAVE' ||
      s.receipt.version !== s.draftVersion
    )
      return false;
    return execute(
      frozen('CANCEL', {
        warehouse_id: scope.warehouseId,
        operation: 'OUTBOUND',
        scan_session_id: s.scanSessionId,
        confirmed_request_id: s.receipt.request_id,
        reason: s.discardRequested
          ? 'Người dùng xác nhận bỏ nháp xuất kho'
          : 'Người dùng xác nhận đổi phiếu nguồn',
      }),
    );
  }
  return {
    snapshot: snap,
    exceptionScope,
    dismissRejected(eventId, expectedScope) {
      if (
        !expectedScope ||
        exceptionScope() !== expectedScope ||
        s.step !== 2 ||
        s.busy ||
        s.scanBusy ||
        s.pending ||
        s.unknown ||
        s.rejected?.eventId !== eventId
      )
        return false;
      s.rejected = null;
      s.message = '';
      emit();
      return true;
    },
    async readRejectedDocument(eventId, expectedScope, documentId) {
      const current = () =>
        !!expectedScope &&
        exceptionScope() === expectedScope &&
        s.step === 2 &&
        !s.busy &&
        !s.scanBusy &&
        !s.pending &&
        !s.unknown &&
        s.rejected?.eventId === eventId &&
        s.rejected.relatedDocument?.kind === 'visible' &&
        s.rejected.relatedDocument.canOpen === true &&
        s.rejected.relatedDocument.documentId === documentId &&
        UUID.test(documentId);
      if (!readRelated || !current()) return false;
      try {
        const related = await readRelated(documentId, {
          query: { warehouse_id: scope.warehouseId },
        });
        if (current() && related.id === documentId) return true;
      } catch {
        // The same reservation remains; only its transient link is revoked.
      }
      if (current() && s.rejected) {
        s.rejected.relatedDocument = { kind: 'unavailable' };
        emit();
      }
      return false;
    },
    initialize,
    searchSources,
    selectSource: chooseSource,
    save,
    check: reconcile,
    cancel,
    refreshSource,
    readDraft,
    refreshCurrent,
    revalidateBatch,
    async discardServer(fingerprint) {
      if (
        fingerprint !==
        JSON.stringify([
          s.document,
          s.accepted,
          s.attempts,
          s.request,
          s.recorded,
          s.unknown,
          s.busy,
        ])
      )
        return false;
      s.discardRequested = true;
      persist();
      return cancel();
    },
    canRecord: () =>
      writeOK() &&
      !s.scanBusy &&
      !s.pending &&
      !s.request &&
      planOK() &&
      savedMatch() &&
      s.draftVersion > 0 &&
      s.receipt?.command === 'SAVE' &&
      s.serverDraft?.status === 'DRAFT',
    fieldErrors() {
      return {
        ...(!s.source ? { number: 'Vui lòng chọn phiếu nguồn.' } : {}),
        ...(!planOK() && s.step === 3
          ? { plan: 'Số mã và từng SKU phải khớp kế hoạch.' }
          : {}),
        ...(s.error ? { contract: s.error.message } : {}),
      };
    },
    start(context = {}, options = {}) {
      if (disposed) return false;
      active = true;
      if (
        s.recorded &&
        !s.pending &&
        options.newAttempt &&
        !context.documentId
      ) {
        finished.push(snap());
        journal?.remove();
        s = { ...empty(), context: s.context };
        emit();
      }
      return (
        !context.documentId ||
        [s.document?.documentId, s.draftId].includes(context.documentId)
      );
    },
    async send() {
      if (!this.canRecord()) return false;
      const ok = await execute(
        frozen('RECORD', {
          warehouse_id: scope.warehouseId,
          source_document_id: s.source.source_document_id,
          source_version: s.source.source_version,
          expected_total_qty: s.source.planned_total_qty,
          items: batch(),
        }),
      );
      if (ok) await refreshCurrent();
      return ok;
    },
    async reconcileResolverCheck() {
      if (!readOK() || s.busy || s.scanBusy || s.pending || s.unknown)
        return false;
      s.busy = true;
      emit();
      try {
        await reconcileP05OwnerCheck(
          { state: () => s, capture: resolverContext, persist },
          adapter,
        );
        s.error = null;
        s.message = 'Đã đối chiếu lượt kiểm mã cũ. Quét lại mã để tiếp tục.';
        persist();
        return true;
      } catch (e) {
        problem(e);
        return false;
      } finally {
        s.busy = false;
        emit();
      }
    },
    retrySame() {
      if (
        !canMutate() ||
        !owns() ||
        s.retry !== 'SAME_REQUEST_ONLY' ||
        !s.pending ||
        s.busy
      )
        return false;
      s.unknown = false;
      return execute(s.pending);
    },
    setViewState(patch) {
      s.nativeView = {
        ...s.nativeView,
        ...patch,
        scroll: patch.scroll
          ? { ...s.nativeView?.scroll, ...patch.scroll }
          : s.nativeView?.scroll,
      };
      persist();
    },
    next() {
      if (
        s.serverDraft?.status !== 'DRAFT' ||
        !readOK() ||
        s.busy ||
        s.scanBusy ||
        s.unknown ||
        s.error ||
        !s.source ||
        s.dirty ||
        s.pending
      )
        return false;
      if (s.step === 1) s.step = s.returnToReview ? 3 : 2;
      else if (s.step === 2 && s.accepted.length) s.step = 3;
      else return false;
      s.returnToReview = false;
      persist();
      emit();
      return true;
    },
    back() {
      if (s.recorded || s.busy || s.scanBusy || s.unknown) return false;
      s.step = Math.max(1, s.step - 1);
      persist();
      emit();
      return true;
    },
    editDelivery() {
      return false;
    },
    note() {
      return false;
    },
    field() {
      return false;
    },
    select() {
      return false;
    },
    fixtureBatch() {
      return false;
    },
    loadProvinces() {},
    loadDistricts() {},
    dismissException() {
      s.message = '';
      emit();
      return true;
    },
    bindScan(source = 'manual') {
      const token = epoch,
        nav = navigationEpoch,
        id = s.scanSessionId;
      return (raw, time) =>
        owns() &&
        active &&
        token === epoch &&
        nav === navigationEpoch &&
        id === s.scanSessionId
          ? scan(raw, source === 'manual' ? 'MANUAL' : source, time)
          : false;
    },
    hasUnfinishedWork: () => !!s.source && !s.recorded,
    finishedRuns: () => structuredClone(finished),
    canCheck: () => !!s.pending && !s.busy,
    leave() {
      active = false;
      navigationEpoch++;
      if (s.scanBusy) {
        s.scanBusy = false;
        persist();
      }
    },
    message(text) {
      s.message = text;
      emit();
    },
    dispose() {
      disposed = true;
      epoch++;
      searchEpoch++;
    },
  };
}
