import { getActiveSession, type Session } from '../../auth/session';
import { getAppStorage, type KeyValueStorage } from '../../storage/storage';
import { createRepository } from '../../storage/repository';
import { AppError, toAppError } from '../../errors/AppError';
import { p04ScanMessage } from './p04ScanMessage';
import {
  verifyP04Admission,
  type P04Admission,
  type P04CommandBinding,
} from '../../shift/p04Admission';
import { serverNow } from '../../auth/serverClock';
import { p08ValidDate, p08QuickDate } from '../history/p08Dates';
import type { P04ViewState } from './p04View';
import {
  createP03Identity,
  createP03RequestId,
  p03Scope,
  sameP03Scope,
  uncertainP03,
  p03ErrorMessage,
  type P03Identity,
  type P03Scope,
  type P03RequestCommand,
  type P03Receipt,
} from '../../services/wms/p03Drafts';
import {
  createP04Service,
  parseP04Record,
  type P04Service,
  type P04Body,
  type P04Item,
  type P04Row,
  type P04Context,
  type P04Draft,
  type P04Review,
  type P04Record,
} from '../../services/wms/p04Inbound';
import {
  initialInboundDraft,
  type InboundDraft,
  type ScannedCode,
} from './inboundDraft';
type Pending = {
  /** Absent in old journals: GET-only; never backfilled to replay them. */
  requestId?: string;
  shiftId?: string;
  command: P03RequestCommand;
  key: string;
  version: number;
  body:
    | P04Body
    | {
        warehouse_id: string;
        scan_session_id: string;
        confirmed_request_id?: string;
        reason?: string;
      };
  outcome: 'IN_FLIGHT' | 'UNKNOWN' | 'FAILED' | 'CONFLICT';
  retryAllowed?: boolean;
  message?: string;
};
export interface P04Run {
  /** Opt-in is stamped only when a new run is created; never migrate old journals. */
  nameMode?: 'BE_DOCUMENT_NO';
  ownerChecks?: {
    command: 'VALIDATE' | 'REVIEW';
    requestId: string;
    shiftId: string;
    version: number;
    body: unknown;
    outcome: 'IN_FLIGHT' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';
  }[];
  view?: P04ViewState;
  id: string;
  identity: P03Identity;
  scope: P03Scope;
  ui: InboundDraft;
  items: P04Item[];
  rows: P04Row[];
  savedBody?: P04Body;
  server?: P04Draft;
  saveReceipt?: P03Receipt;
  pending?: Pending;
  completed?: { request: Pending; receipt: P03Receipt }[];
  result?: {
    data: P04Record;
    receipt: P03Receipt;
    sentAt?: string;
    postedOnWeb?: boolean;
  };
  closed: boolean;
  updatedAt: number;
}
export interface P04FlowState {
  phase: 'loading' | 'ready' | 'error';
  context?: P04Context;
  types: { id: 'receipt'; code: 'receipt'; label: string; allowed: boolean }[];
  run?: P04Run;
  busy: boolean;
  review?: P04Review;
  message?: string;
  messageCode?: string;
  resume: boolean;
}
/** Read-only presentation binding. Contains no credential or replay authority. */
export type P04RunBinding = Pick<P04Run, 'id' | 'scope' | 'identity'>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export function p04Body(run: P04Run): P04Body {
  return {
    warehouse_id: run.scope.warehouseId,
    scan_session_id: run.identity.scanSessionId,
    inbound_type: 'receipt',
    ...(run.ui.inboundCategory
      ? { inbound_category: run.ui.inboundCategory }
      : {}),
    supplier_id: run.ui.supplierId ?? null,
    ...(run.ui.docDate ? { doc_date: run.ui.docDate } : {}),
    name: run.ui.name,
    note: run.ui.note ?? '',
    items: clone(run.items),
  };
}
export function createP04Flow({
  service = createP04Service(),
  storage = getAppStorage(),
  getSession = getActiveSession,
  onChange = () => undefined,
  admission,
  autoNameFromDocumentCode = false,
}: {
  service?: P04Service;
  storage?: KeyValueStorage;
  getSession?: () => Session | undefined;
  onChange?: (state: P04FlowState) => void;
  admission?: P04Admission;
  autoNameFromDocumentCode?: boolean;
} = {}) {
  const admit: P04Admission =
    admission ??
    (service.live
      ? verifyP04Admission
      : async () => ({ shiftId: '00000000-0000-4000-8000-000000000001' }));
  const repository = createRepository<P04Run>(storage, 'p04.runs.v1');
  let state: P04FlowState = {
      phase: 'loading',
      types: [],
      busy: false,
      resume: false,
    },
    disposed = false,
    locked = false,
    epoch = 0;
  const snapshot = () => clone(state);
  function emit(changes: Partial<P04FlowState> = {}) {
    if (disposed) return;
    state = { ...state, ...changes };
    if (state.run) {
      state.run.updatedAt = serverNow();
      repository.put(clone(state.run));
    }
    onChange(snapshot());
  }
  function run() {
    if (!state.run)
      throw new AppError({
        kind: 'config',
        message: 'Chưa xác nhận phiên và phiếu nhập.',
      });
    let current: P03Scope;
    try {
      current = p03Scope(getSession());
    } catch {
      throw new AppError({
        kind: 'cancelled',
        message: 'Phiên hoặc kho đã thay đổi. Dữ liệu vẫn được giữ.',
      });
    }
    if (disposed || !sameP03Scope(state.run.scope, current))
      throw new AppError({
        kind: 'cancelled',
        message: 'Phiên hoặc kho đã thay đổi. Dữ liệu vẫn được giữ.',
      });
    return state.run;
  }
  function make(scope: P03Scope): P04Run {
    const identity = createP03Identity();
    return {
      id: identity.documentId,
      identity,
      scope,
      ...(autoNameFromDocumentCode
        ? { nameMode: 'BE_DOCUMENT_NO' as const }
        : {}),
      ui: {
        ...initialInboundDraft,
        warehouseId: scope.warehouseId,
        warehouseName: state.context?.available_warehouses.find(
          w => w.warehouse_id === scope.warehouseId,
        )?.name,
      },
      items: [],
      rows: [],
      closed: false,
      updatedAt: serverNow(),
    };
  }
  function assignDocumentName(r: P04Run) {
    const value = r.server?.document_no;
    if (
      autoNameFromDocumentCode &&
      r.nameMode === 'BE_DOCUMENT_NO' &&
      !r.pending &&
      !r.result &&
      !r.ui.name &&
      typeof value === 'string' &&
      value.trim() &&
      value.length <= 200
    )
      r.ui = { ...r.ui, name: value };
  }
  async function permission(action: 'read' | 'save' | 'record' | 'cancel') {
    const r = run(),
      c = await service.context(r.scope);
    run();
    emit({ context: c });
    if (
      c.warehouse_context.status !== 'READY' ||
      c.warehouse_status !== 'ACTIVE' ||
      !c.inbound_supported ||
      !c.permissions[action]
    )
      throw new AppError({
        kind: 'http',
        code:
          c.warehouse_context.error_code ?? 'WAREHOUSE_OR_PERMISSION_DENIED',
        message:
          'Kho hoặc quyền nhập chưa cho phép thao tác. Phiếu được giữ nguyên.',
      });
  }
  async function setPending(
    command: P03RequestCommand,
    body: Pending['body'],
    key = createP03RequestId(),
    version = run().server?.version ?? 0,
  ) {
    const r = run();
    if (
      r.ownerChecks?.some(
        c => c.outcome === 'UNKNOWN' || c.outcome === 'IN_FLIGHT',
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P04_CHECK_OUTCOME_UNKNOWN',
        message:
          'Lượt kiểm tra cũ chưa rõ kết quả. Giữ nguyên; không gửi thêm lệnh.',
      });
    const bound = await admit(r.scope, command, version);
    run();
    const requestId = createP03RequestId();
    if (requestId === key)
      throw new AppError({
        kind: 'config',
        code: 'P04_TRACE_KEY_CONFLICT',
        message: 'Không dùng operation key làm trace.',
      });
    r.pending = {
      requestId,
      shiftId: bound.shiftId,
      command,
      key,
      body: clone(body),
      version,
      outcome: 'IN_FLIGHT',
    };
    emit();
    return clone(r.pending);
  }
  function failure(error: unknown) {
    const e = toAppError(error),
      r = state.run;
    if (r?.pending?.outcome === 'IN_FLIGHT') {
      r.pending.message = p03ErrorMessage(e);
      r.pending.outcome = uncertainP03(e)
        ? 'UNKNOWN'
        : [
            'STALE_VERSION',
            'IDEMPOTENCY_CONFLICT',
            'REQUEST_IDENTITY_MISMATCH',
            'DRAFT_STATE_CONFLICT',
            'DRAFT_OUTCOME_UNKNOWN',
          ].includes(e.code ?? '')
        ? 'CONFLICT'
        : 'FAILED';
    }
    emit({ message: p03ErrorMessage(e), messageCode: e.code });
  }
  async function mutation(p: Pending) {
    const r = run();
    if (!p.requestId || !p.shiftId)
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P04_LEGACY_INTENT_CHECK_ONLY',
        message:
          'Yêu cầu cũ thiếu trace/ca đã lưu. Giữ nguyên và chỉ đối chiếu bằng GET; không gắn định danh mới để gửi lại.',
      });
    await admit(r.scope, p.command, p.version, p.shiftId);
    run();
    const binding: P04CommandBinding = {
      requestId: p.requestId,
      shiftId: p.shiftId,
    };
    r.pending = clone({ ...p, outcome: 'IN_FLIGHT' });
    emit();
    if (p.command === 'SAVE') {
      const saved = await service.save(
        r.scope,
        r.identity,
        p.body as P04Body,
        p.key,
        p.version,
        binding,
      );
      run();
      r.server = saved.document;
      r.savedBody = clone(p.body as P04Body);
      r.saveReceipt = saved.receipt;
      r.completed = [
        ...(r.completed ?? []),
        { request: clone(p), receipt: saved.receipt },
      ];
      r.pending = undefined;
      assignDocumentName(r);
      emit();
      return;
    }
    if (p.command === 'RECORD') {
      const recorded = await service.record(
        r.scope,
        r.identity,
        p.version,
        p.key,
        binding,
      );
      run();
      r.result = {
        data: recorded.data,
        receipt: recorded.receipt,
        sentAt: recorded.sentAt,
      };
      r.completed = [
        ...(r.completed ?? []),
        { request: clone(p), receipt: recorded.receipt },
      ];
      r.pending = undefined;
      emit({ message: undefined });
      return;
    }
    const body = p.body as { confirmed_request_id: string; reason: string };
    const cancelled = await service.cancel(
      r.scope,
      r.identity,
      p.version,
      p.key,
      body.confirmed_request_id,
      body.reason,
      binding,
    );
    run();
    r.server = cancelled.document;
    r.pending = undefined;
    r.closed = true;
    emit();
  }
  async function save() {
    const r = run();
    if (r.pending)
      throw new AppError({
        kind: 'config',
        message: 'Cần đối chiếu yêu cầu trước khi lưu/gửi tiếp.',
      });
    if (r.result || r.server?.status === 'CANCELLED')
      throw new AppError({
        kind: 'config',
        message: 'Phiếu đã kết thúc; không lưu lại.',
      });
    // Capability/warehouse/permission may change while S01 is open. Read the
    // authoritative context before deciding whether this snapshot can be sent.
    await permission('save');
    if (
      r.ui.inboundCategory &&
      (state.context?.ui_metadata_extension !== 'p04-ui-options-v1' ||
        !state.context.inbound_categories?.some(
          c => c.id === r.ui.inboundCategory,
        ))
    )
      throw new AppError({
        kind: 'config',
        code: 'P04_CATEGORY_CONTRACT_PENDING',
        message:
          'Loại nhập đã chọn được giữ trên thiết bị. Backend DEV chưa công bố bản cập nhật ba loại nhập; chưa lưu/gửi để tránh mất lựa chọn.',
      });
    const body = p04Body(r);
    if (
      r.savedBody &&
      JSON.stringify(r.savedBody) === JSON.stringify(body) &&
      (state.context?.document_number_assignment !== 'WITH_DRAFT_SAVE' ||
        r.server?.document_no)
    )
      return;
    await mutation(await setPending('SAVE', body));
  }
  async function ownerCheck<T>(
    command: 'VALIDATE' | 'REVIEW',
    body: unknown,
    send: (binding: P04CommandBinding) => Promise<T>,
  ): Promise<T> {
    const r = run();
    if (
      r.ownerChecks?.some(
        c => c.outcome === 'UNKNOWN' || c.outcome === 'IN_FLIGHT',
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P04_CHECK_OUTCOME_UNKNOWN',
        message: 'Lượt kiểm tra cũ chưa rõ kết quả; không tự kiểm tra/gửi lại.',
      });
    const version = r.server!.version,
      bound = await admit(r.scope, command, version);
    run();
    const intent = {
      command,
      requestId: createP03RequestId(),
      shiftId: bound.shiftId,
      version,
      body: clone(body),
      outcome: 'IN_FLIGHT' as const,
    };
    r.ownerChecks = [...(r.ownerChecks ?? []), intent];
    emit();
    try {
      const response = await send(intent);
      run();
      r.ownerChecks = r.ownerChecks!.map(c =>
        c.requestId === intent.requestId ? { ...c, outcome: 'SUCCEEDED' } : c,
      );
      emit();
      return response;
    } catch (error) {
      // No receipt protocol for these read-only POSTs: do not fabricate one.
      r.ownerChecks = r.ownerChecks!.map(c =>
        c.requestId === intent.requestId
          ? { ...c, outcome: uncertainP03(error) ? 'UNKNOWN' : 'FAILED' }
          : c,
      );
      emit();
      throw error;
    }
  }
  async function operation(fn: () => Promise<unknown>) {
    if (locked || disposed) return false;
    locked = true;
    emit({ busy: true, message: undefined, messageCode: undefined });
    try {
      await fn();
      return true;
    } catch (e) {
      failure(e);
      return false;
    } finally {
      locked = false;
      emit({ busy: false });
    }
  }
  function updateUiCode(row: P04Row, item: P04Item) {
    const r = run(),
      resolved = row.resolved!;
    const code: ScannedCode = {
      key: resolved.item_id ?? resolved.item_unique ?? item.raw_code,
      raw: item.raw_code,
      sku: resolved.sku_code,
      skuName: resolved.sku_name ?? undefined,
      itemId: resolved.item_id ?? undefined,
      item: resolved.serial_number ?? resolved.item_unique ?? undefined,
      itemType: item.new_sku_type ?? undefined,
      quantity: row.quantity!,
      boxNumber: item.box_number ?? undefined,
      source: item.scan_source,
      at: serverNow(),
    };
    r.ui = { ...r.ui, codes: [...r.ui.codes, code] };
  }
  async function validate(
    raw: string,
    source: P04Item['scan_source'],
    options: Partial<P04Item> = {},
    event = createP03RequestId(),
  ): Promise<P04Row> {
    const r = run();
    await permission('save');
    await save();
    await service.scanSession(r.scope, r.identity, r.server!.version);
    const item = {
      ...options,
      raw_code: raw,
      scan_source: source,
      quantity: options.quantity ?? 1,
    };
    return ownerCheck(
      'VALIDATE',
      {
        warehouse_id: r.scope.warehouseId,
        scan_session_id: r.identity.scanSessionId,
        client_event_id: event,
        item,
      },
      binding =>
        service.validate(
          r.scope,
          r.identity,
          r.server!.version,
          event,
          item,
          binding,
        ),
    );
  }
  function attempt(raw: string, row: P04Row) {
    const r = run();
    r.ui = {
      ...r.ui,
      scanAttempts: [
        ...(r.ui.scanAttempts ?? []),
        {
          raw,
          at: serverNow(),
          kind:
            row.outcome === 'ACCEPTED'
              ? 'valid'
              : row.outcome === 'DUPLICATE'
              ? 'duplicate'
              : 'invalid',
          reason:
            row.outcome === 'ACCEPTED' ? undefined : p04ScanMessage(row, raw),
          reasonCode: row.reason_code ?? undefined,
        },
      ],
    };
    emit();
  }
  async function applyRow(
    raw: string,
    source: P04Item['scan_source'],
    row: P04Row,
    options: Partial<P04Item>,
  ) {
    const r = run();
    attempt(raw, row);
    if (row.outcome !== 'ACCEPTED') return;
    const resolved = row.resolved!,
      item: P04Item = {
        raw_code: raw,
        scan_source: source,
        quantity: row.quantity!,
        item_type: resolved.item_type,
        ...(resolved.box_number ? { box_number: resolved.box_number } : {}),
        ...(options.new_sku_type ? { new_sku_type: options.new_sku_type } : {}),
      };
    r.items.push(item);
    r.rows.push(row);
    updateUiCode(row, item);
    emit({ review: undefined });
    await save();
  }
  return {
    snapshot,
    isCurrent(expected: P04RunBinding) {
      try {
        const current = run();
        return (
          current.id === expected.id &&
          sameP03Scope(current.scope, expected.scope) &&
          current.identity.documentId === expected.identity.documentId &&
          current.identity.scanSessionId === expected.identity.scanSessionId
        );
      } catch {
        return false;
      }
    },
    view(patch: P04ViewState) {
      if (disposed) return;
      let r: P04Run;
      try {
        r = run();
      } catch {
        return;
      }
      r.view = {
        ...r.view,
        ...patch,
        scroll: { ...r.view?.scroll, ...patch.scroll },
      };
      repository.put(clone(r));
    },
    async begin(
      returnDocumentId?: string,
      seed?: {
        supplierId: string | null;
        supplierName?: string;
        note: string;
        docDate?: string;
      },
      resumeDraftId?: string,
    ) {
      const ok = await operation(async () => {
        const scope = p03Scope(getSession()),
          context = await service.context(scope);
        emit({ context });
        if (
          context.warehouse_context.status !== 'READY' ||
          context.warehouse_status !== 'ACTIVE'
        )
          throw new AppError({
            kind: 'config',
            code:
              context.warehouse_status === 'INACTIVE'
                ? 'WAREHOUSE_INACTIVE'
                : 'WAREHOUSE_CONTEXT_REQUIRED',
            message: 'Kho chưa xác nhận hoạt động. Phiếu được giữ nguyên.',
          });
        const types = await service.types(scope);
        state.types = types;
        const candidates = repository
          .list()
          .filter(r => !r.closed && sameP03Scope(r.scope, scope))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        const candidate = resumeDraftId
          ? candidates.find(
              r => r.identity.documentId === resumeDraftId && !r.result,
            )
          : returnDocumentId
          ? candidates.find(
              r => r.result?.data.document_id === returnDocumentId,
            )
          : candidates.find(r => !r.result);
        if ((returnDocumentId || resumeDraftId) && !candidate)
          throw new AppError({
            kind: 'config',
            message:
              'Không tìm thấy kết quả của đúng phiếu trong phiên/kho này.',
          });
        if (!returnDocumentId)
          for (const finished of candidates.filter(r => r.result)) {
            finished.closed = true;
            repository.put(clone(finished));
          }
        state.run = candidate ?? make(scope);
        if (!candidate && seed) {
          const currentDate = p08QuickDate(1, 'Asia/Ho_Chi_Minh');
          if (
            Array.from(seed.note).length > 1000 ||
            (seed.docDate !== undefined &&
              (!p08ValidDate(seed.docDate) ||
                seed.docDate < '2000-01-01' ||
                currentDate.date_mode !== 'DATE' ||
                seed.docDate > currentDate.date)) ||
            (seed.supplierId !== null &&
              !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
                seed.supplierId,
              ))
          )
            throw new AppError({
              kind: 'config',
              message: 'Thông tin nhập kho từ Chứng từ chưa hợp lệ.',
            });
          state.run.ui = {
            ...state.run.ui,
            supplierId: seed.supplierId ?? undefined,
            supplierName: seed.supplierName,
            note: seed.note,
            ...(seed.docDate ? { docDate: seed.docDate } : {}),
          };
        }
        if (candidate?.pending?.outcome === 'IN_FLIGHT')
          candidate.pending.outcome = 'UNKNOWN';
        if (state.run.ownerChecks)
          state.run.ownerChecks = state.run.ownerChecks.map(c =>
            c.outcome === 'IN_FLIGHT' ? { ...c, outcome: 'UNKNOWN' } : c,
          );
        if (candidate?.server && !candidate.pending && !candidate.result) {
          const current = await service.detail(scope, candidate.identity);
          if (
            current.version !== candidate.server.version ||
            current.status !== 'DRAFT'
          ) {
            emit({
              phase: 'error',
              message:
                'Nháp trên Web đã thay đổi. Giữ dữ liệu để đối chiếu, chưa ghi đè.',
            });
            return;
          }
          candidate.server = current;
          assignDocumentName(candidate);
        }
        if (candidate?.result) {
          const observed = await service.document(
            scope,
            candidate.result.data.document_id,
          );
          candidate.result.postedOnWeb = observed.posted as boolean;
        }
        if (
          state.run.nameMode === 'BE_DOCUMENT_NO' &&
          !state.run.ui.name &&
          !state.run.pending &&
          !state.run.result &&
          context.document_number_assignment !== 'WITH_DRAFT_SAVE'
        )
          throw new AppError({
            kind: 'config',
            code: 'P04_NUMBERING_CONTRACT_REQUIRED',
            message:
              'Máy chủ chưa công bố cấp mã phiếu khi lưu nháp theo P04. Phiếu được giữ nguyên; cần đồng bộ contract trước khi tiếp tục.',
          });
        if (
          !candidate &&
          !state.run.pending &&
          !state.run.result &&
          context.document_number_assignment === 'WITH_DRAFT_SAVE' &&
          !state.run.server?.document_no
        ) {
          // Only a new run may allocate its number on entry. Merely opening an
          // older checkpoint must not write/upgrade it; explicit owner intent
          // after its resume/UNKNOWN checks still uses the original identity.
          await save();
        }
        emit({
          phase: 'ready',
          resume:
            !!candidate &&
            !candidate.pending &&
            !candidate.result &&
            !!(candidate.server || candidate.ui.name || candidate.items.length),
          message:
            candidate?.pending?.outcome === 'FAILED'
              ? candidate.pending.message ??
                'Yêu cầu lần trước đã bị từ chối. Kiểm tra trạng thái phiếu trước khi sửa hoặc bắt đầu lượt mới.'
              : undefined,
        });
      });
      if (!ok) emit({ phase: 'error' });
      return ok;
    },
    metadata(ui: InboundDraft) {
      const r = run();
      if (locked || r.pending || r.result) return false;
      if (
        ui.warehouseId !== r.scope.warehouseId ||
        ui.name.length > 200 ||
        Array.from(ui.note ?? '').length > 1000 ||
        ((r.items.length || r.ui.scanAttempts?.length) &&
          ui.inboundCategory !== r.ui.inboundCategory)
      )
        return false;
      r.ui = {
        ...ui,
        ...(r.nameMode === 'BE_DOCUMENT_NO' ? { name: r.ui.name } : {}),
        codes: r.ui.codes,
        scanAttempts: r.ui.scanAttempts,
      };
      emit({ review: undefined });
      return true;
    },
    resume() {
      const r = run();
      if (r.ui.step === 2 && !state.review && !r.pending && !r.result)
        r.ui = { ...r.ui, step: 1 };
      emit({ resume: false });
    },
    requestDocumentNumber() {
      return operation(async () => {
        const r = run();
        if (
          state.resume ||
          r.pending ||
          r.result ||
          r.closed ||
          r.ui.step !== 0 ||
          r.nameMode !== 'BE_DOCUMENT_NO'
        )
          throw new AppError({
            kind: 'blocked_by_gate',
            message:
              'Phiếu đang khóa hoặc cần đối chiếu. Không gửi thêm yêu cầu cấp số.',
          });
        await permission('save');
        if (state.context?.document_number_assignment !== 'WITH_DRAFT_SAVE')
          throw new AppError({
            kind: 'config',
            code: 'P04_NUMBERING_CONTRACT_REQUIRED',
            message:
              'Máy chủ chưa hỗ trợ cấp mã khi SAVE. Dữ liệu vẫn được giữ.',
          });
        if (!r.server?.document_no) await save();
        assignDocumentName(r);
        if (!r.server?.document_no || !r.ui.name)
          throw new AppError({
            kind: 'parse',
            code: 'P04_DOCUMENT_NUMBER_REQUIRED',
            message:
              'SAVE đã được đối chiếu nhưng chưa có mã phiếu hợp lệ từ máy chủ. Chưa thể tiếp tục quét.',
          });
        emit({ message: 'Mã phiếu nhập đã được máy chủ xác nhận.' });
      });
    },
    next() {
      return operation(async () => {
        const r = run();
        if (state.resume || r.pending || r.result) return;
        assignDocumentName(r);
        if (r.nameMode === 'BE_DOCUMENT_NO' && !r.ui.name)
          throw new AppError({
            kind: 'config',
            code: 'P04_DOCUMENT_NUMBER_REQUIRED',
            message: 'Chưa có mã phiếu do máy chủ cấp. Chưa thể tiếp tục quét.',
          });
        if (
          !r.ui.name.trim() ||
          r.ui.name.length > 200 ||
          Array.from(r.ui.note ?? '').length > 1000
        )
          throw new AppError({
            kind: 'config',
            message: 'Nhập Tên phiếu hợp lệ trước khi tiếp tục.',
          });
        if (!state.types.some(t => t.allowed && t.id === 'receipt'))
          throw new AppError({
            kind: 'config',
            message: 'Chưa xác minh loại nhập được phép.',
          });
        await save();
        if (r.ui.step === 0) {
          await service.scanSession(r.scope, r.identity, r.server!.version);
          r.ui = { ...r.ui, step: 1 };
          emit();
        } else if (r.ui.step === 1) {
          await permission('save');
          const review = await ownerCheck(
            'REVIEW',
            {
              warehouse_id: r.scope.warehouseId,
              scan_session_id: r.identity.scanSessionId,
            },
            binding =>
              service.review(r.scope, r.identity, r.server!.version, binding),
          );
          r.ui = { ...r.ui, step: 2 };
          emit({
            review,
            message: review.can_record
              ? undefined
              : 'Có mã chưa hợp lệ. Kiểm tra lại trước khi gửi.',
          });
        }
      });
    },
    back() {
      try {
        const r = run();
        if (locked || r.pending || r.result) return false;
        epoch++;
        r.ui = { ...r.ui, step: r.ui.step === 2 ? 1 : 0 };
        emit();
        return true;
      } catch (error) {
        // Back is a synchronous UI callback. A changed session/warehouse must
        // keep the draft and surface the guarded error, never throw into the
        // React Native RedBox.
        const e = toAppError(error);
        if (state.run?.pending?.outcome === 'IN_FLIGHT') failure(e);
        else emit({ message: e.message });
        return false;
      }
    },
    async scan(
      raw: string,
      source: P04Item['scan_source'],
      options: Partial<P04Item> = {},
      event = createP03RequestId(),
    ): Promise<{ row: P04Row; eventId: string; requiresInput: boolean }> {
      if (
        locked ||
        disposed ||
        state.resume ||
        run().pending ||
        run().ui.step !== 1
      )
        throw new AppError({
          kind: 'config',
          message: 'Phiên quét đang bận hoặc cần đối chiếu.',
        });
      if (!raw.trim() || raw.length > 512)
        throw new AppError({
          kind: 'config',
          message: 'Mã quét phải có 1–512 ký tự; dữ liệu gốc được giữ nguyên.',
        });
      const generation = epoch;
      let output:
        | { row: P04Row; eventId: string; requiresInput: boolean }
        | undefined;
      await operation(async () => {
        const row = await validate(raw, source, options, event);
        if (generation !== epoch || disposed)
          throw new AppError({
            kind: 'cancelled',
            message: 'Đã rời phiên quét.',
          });
        const resolved = row.resolved,
          requiresInput =
            !!resolved &&
            ((resolved.requires_quantity && options.quantity === undefined) ||
              (resolved.requires_new_sku_type && !options.new_sku_type));
        output = { row, eventId: event, requiresInput };
        if (!requiresInput) await applyRow(raw, source, row, options);
      });
      if (!output)
        throw new AppError({
          kind: 'unknown',
          message:
            state.message ?? 'Chưa xác minh được mã; giữ nguyên dữ liệu.',
        });
      return output;
    },
    record() {
      return operation(async () => {
        const r = run();
        if (r.result || r.pending) return;
        await permission('record');
        await save();
        const review = await ownerCheck(
          'REVIEW',
          {
            warehouse_id: r.scope.warehouseId,
            scan_session_id: r.identity.scanSessionId,
          },
          binding =>
            service.review(r.scope, r.identity, r.server!.version, binding),
        );
        emit({ review });
        if (
          !review.can_record ||
          review.items.some(row => row.outcome !== 'ACCEPTED')
        )
          throw new AppError({
            kind: 'http',
            code: 'P04_REVALIDATION_FAILED',
            message: 'Kiểm tra lại mã và số lượng trước khi gửi.',
          });
        await mutation(
          await setPending('RECORD', {
            warehouse_id: r.scope.warehouseId,
            scan_session_id: r.identity.scanSessionId,
          }),
        );
      });
    },
    reconcileOwnerCheck() {
      return operation(async () => {
        const r = run(),
          ticket = epoch,
          pending = (r.ownerChecks ?? []).filter(c =>
            ['UNKNOWN', 'IN_FLIGHT'].includes(c.outcome),
          );
        if (pending.length !== 1)
          throw new AppError({
            kind: 'blocked_by_gate',
            code: 'P04_CHECK_RECONCILE_REQUIRED',
            message: 'Cần đúng một lượt kiểm tra chưa rõ kết quả.',
          });
        const intent = pending[0];
        if (r.server?.version !== intent.version)
          throw new AppError({
            kind: 'blocked_by_gate',
            code: 'P04_CHECK_VERSION_CHANGED',
            message:
              'Version nháp không còn khớp lượt kiểm tra gốc. Giữ dữ liệu để đối chiếu.',
          });
        // The read-only POST has no separate receipt endpoint. A lost response
        // may only be checked by replaying the exact original intent: same
        // command/body/version/shift/trace. Do not narrow it to a freshly
        // constructed header pair or expose the local UNKNOWN transition as a
        // different request identity.
        const binding = {
          ...clone(intent),
          outcome: 'IN_FLIGHT' as const,
        };
        const body = intent.body as {
          warehouse_id?: string;
          scan_session_id?: string;
          client_event_id?: string;
          item?: P04Item;
        };
        if (
          body.warehouse_id !== r.scope.warehouseId ||
          body.scan_session_id !== r.identity.scanSessionId
        )
          throw new AppError({
            kind: 'parse',
            code: 'P04_CHECK_BODY_INVALID',
            message: 'Định danh lượt kiểm tra cũ không khớp phiếu.',
          });
        await permission('read');
        if (intent.command === 'VALIDATE') {
          if (!body.client_event_id || !body.item)
            throw new AppError({
              kind: 'parse',
              code: 'P04_CHECK_BODY_INVALID',
              message: 'Không đọc được body kiểm mã gốc.',
            });
          await service.validate(
            r.scope,
            r.identity,
            intent.version,
            body.client_event_id,
            body.item,
            binding,
          );
        } else
          await service.review(r.scope, r.identity, intent.version, binding);
        if (ticket !== epoch || run() !== r) return;
        r.ownerChecks = r.ownerChecks!.map(c =>
          c.requestId === intent.requestId ? { ...c, outcome: 'SUCCEEDED' } : c,
        );
        emit({
          message:
            'Đã đối chiếu lượt kiểm tra cũ. Thực hiện lại bước quét/kiểm tra để tiếp tục.',
        });
      });
    },
    check() {
      return operation(async () => {
        const r = run(),
          p = r.pending;
        if (!p) return;
        await permission('read');
        const response = await service.reconcile(
          r.scope,
          r.identity,
          p.key,
          p.command,
        );
        run();
        if (response.outcome === 'UNKNOWN') {
          r.pending = {
            ...p,
            outcome: 'UNKNOWN',
            retryAllowed: response.retry === 'SAME_REQUEST_ONLY',
          };
          emit({
            message: 'Chưa xác định kết quả. Giữ nguyên phiếu và yêu cầu.',
          });
          return;
        }
        if (p.command === 'RECORD') {
          const verified = parseP04Record(
            { status: 200, data: response.response },
            r.scope,
            r.identity,
            p.key,
            p.version,
          );
          r.result = {
            data: verified.data,
            receipt: verified.receipt,
            sentAt: verified.sentAt,
            postedOnWeb: response.state === 'POSTED',
          };
          r.pending = undefined;
          emit({ message: undefined });
          return;
        }
        const current = await service.detail(r.scope, r.identity);
        r.server = current;
        if (
          p.command === 'SAVE' &&
          current.status === 'DRAFT' &&
          current.version === p.version + 1
        ) {
          r.savedBody = clone(p.body as P04Body);
          r.saveReceipt = response.receipt as unknown as P03Receipt;
          r.pending = undefined;
          assignDocumentName(r);
          emit({
            phase: 'ready',
            messageCode: undefined,
            message: 'Đã xác nhận lưu nháp trên Web.',
          });
          return;
        }
        if (p.command === 'CANCEL' && current.status === 'CANCELLED') {
          r.pending = undefined;
          r.closed = true;
          emit({ message: 'Đã xác nhận hủy nháp.' });
          return;
        }
        r.pending = { ...p, outcome: 'CONFLICT', retryAllowed: false };
        emit({
          message:
            'Trạng thái hiện tại đã thay đổi. Giữ dữ liệu; chưa gửi lại.',
        });
      });
    },
    retry() {
      return operation(async () => {
        const r = run(),
          p = r.pending;
        if (!p || p.outcome !== 'UNKNOWN' || p.retryAllowed !== true) return;
        await permission(
          p.command === 'CANCEL'
            ? 'cancel'
            : p.command === 'RECORD'
            ? 'record'
            : 'save',
        );
        await mutation(p);
      });
    },
    recoverRejected(startFresh = false) {
      return operation(async () => {
        const r = run(),
          p = r.pending;
        if (!p || p.outcome !== 'FAILED') return;
        await permission('read');
        const current = await service.detail(r.scope, r.identity);
        if (
          current.status !== 'DRAFT' ||
          current.business_document_id ||
          current.version !== p.version
        )
          throw new AppError({
            kind: 'parse',
            message:
              'Chưa xác nhận phiếu có thể sửa. Giữ nguyên yêu cầu để đối chiếu.',
          });
        r.server = current;
        r.pending = undefined;
        emit({
          review: undefined,
          message: 'Đã xác nhận phiếu chưa ghi nhận. Dữ liệu được giữ để sửa.',
        });
        if (startFresh) {
          r.closed = true;
          repository.put(clone(r));
          epoch++;
          state.run = make(r.scope);
          emit({ message: undefined, resume: false });
          if (state.context?.document_number_assignment === 'WITH_DRAFT_SAVE')
            await save();
        }
      });
    },
    saveAndLeave() {
      return operation(async () => {
        await save();
        emit({ resume: false });
      });
    },
    cancel(reason: string) {
      return operation(async () => {
        const r = run();
        if (r.pending || r.result) return;
        await permission('cancel');
        await save();
        if (
          !r.saveReceipt ||
          r.server?.status !== 'DRAFT' ||
          r.server.business_document_id
        )
          throw new AppError({
            kind: 'config',
            message: 'Chưa có receipt SAVE hiện tại để bỏ nháp an toàn.',
          });
        await mutation(
          await setPending('CANCEL', {
            warehouse_id: r.scope.warehouseId,
            scan_session_id: r.identity.scanSessionId,
            confirmed_request_id: r.saveReceipt.request_id,
            reason,
          }),
        );
      });
    },
    newRun() {
      const r = run();
      if (locked || r.pending || (!r.result && !r.closed)) return false;
      r.closed = true;
      repository.put(clone(r));
      epoch++;
      state.run = make(r.scope);
      emit({ review: undefined, resume: false, message: undefined });
      if (state.context?.document_number_assignment === 'WITH_DRAFT_SAVE')
        void operation(save);
      return true;
    },
    finish() {
      const r = run();
      if (locked || r.pending || !r.result) return false;
      r.closed = true;
      emit();
      return true;
    },
    document() {
      const r = run();
      if (!r.result)
        throw new AppError({
          kind: 'config',
          message: 'Chưa có ID chứng từ đã xác nhận.',
        });
      return service.document(r.scope, r.result.data.document_id);
    },
    dismiss() {
      emit({ message: undefined });
    },
    dispose() {
      disposed = true;
      epoch++;
      if (state.run?.pending?.outcome === 'IN_FLIGHT') {
        state.run.pending.outcome = 'UNKNOWN';
        repository.put(clone(state.run));
      }
    },
  };
}
export type P04Flow = ReturnType<typeof createP04Flow>;
