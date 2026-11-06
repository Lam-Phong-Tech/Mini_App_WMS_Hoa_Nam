import {
  fetchP05Provinces,
  fetchP05Wards,
  type GeoUnit,
} from '../../services/geo/provinces';
import { getAppStorage, type KeyValueStorage } from '../../storage/storage';
import { formatVietnamClock } from '../../time/vietnamTime';
import { assertP03ReconcileIdentity } from '../../services/wms/p03ReconcileIdentity';
import { fetchOutboundDocument } from '../../services/wms/queries';
import {
  P05_NUMBERING_CONTRACT,
  P05_NUMBERING_HEADER,
  p05NumberingCapability,
  p05CanNumber,
  p05NumberingMeta,
  p05OfficialDraftNumber,
} from '../../services/wms/p05Numbering';
import {
  p05RejectedObservation,
  type P05RejectedObservation,
} from './linked/p05-exceptions';
import {
  p03Scope,
  createP03RequestId,
  type P03Scope,
  type P03Draft,
} from '../../services/wms/p03Drafts';
import {
  createP05CreateService,
  verifyP05CreateRecord,
  type P05CreateService,
  type P05CreateRequest,
  type P05Catalogue,
} from '../../services/wms/p05Create';
import {
  P05ApiError,
  P03_CONTRACT,
  UUID,
  envelope,
  parseDraft,
  parseReceipt,
  draftEtagMatches,
} from './linked/p05-contract';
import { createP05Journal } from './linked/p05-journal';
import type {
  AcceptedCode,
  Attempt,
  Context,
  NativeView,
  ResponseData,
  CurrentDocument,
} from './linked/types';
import {
  emptyP05CreateForm,
  p05CreateErrors,
  p05DeliveryAddress,
  p05FormSnapshot,
  p05StableJSON,
  sanitiseP05Phone,
  validP05Phone,
  validP05Groups,
  p05SelectedGroups,
  type P05CreateTextField,
  type P05CreateForm,
} from './p05CreateForm';
import { p05RecipientAddress } from './p05RecipientAddress';
import { verifyP04Admission } from '../../shift/p04Admission';
import {
  createP05OwnerChecks,
  reconcileP05OwnerCheck,
  p05ChecksPending,
  restoreP05Checks,
  type P05ResolverBinding,
  type P05ResolverAdmission,
} from './linked/p05-owner-checks';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const foldGeoLabel = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\b(?:tinh|thanh pho|tp|phuong|xa|thi tran)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const findGeoInText = (raw: string, units: readonly GeoUnit[]) => {
  const segments = raw.split(',').map(foldGeoLabel).filter(Boolean);
  return units.find(unit => segments.includes(foldGeoLabel(unit.name)));
};
// Danh mục người nhận vẫn còn địa chỉ trước sáp nhập 2025. Chỉ ánh xạ tỉnh
// cũ khi tên đoạn địa chỉ khớp hoàn toàn; phường/xã vẫn phải khớp chính xác
// danh mục hiện hành sau khi tải đúng tỉnh, tuyệt đối không chọn gần đúng.
const LEGACY_PROVINCE_ALIASES = new Map([['quang nam', 'da nang']]);
const findProvinceInText = (raw: string, units: readonly GeoUnit[]) => {
  const exact = findGeoInText(raw, units);
  if (exact) return exact;
  const segments = raw.split(',').map(foldGeoLabel).filter(Boolean);
  for (const segment of segments) {
    const current = LEGACY_PROVINCE_ALIASES.get(segment);
    if (!current) continue;
    const unit = units.find(row => foldGeoLabel(row.name) === current);
    if (unit) return unit;
  }
  return undefined;
};
const textAddressDetail = (
  raw: string,
  ...units: Array<string | undefined>
) => {
  const labels = new Set(units.filter(Boolean).map(v => foldGeoLabel(v!)));
  for (const [legacy, current] of LEGACY_PROVINCE_ALIASES)
    if (labels.has(current)) labels.add(legacy);
  return raw
    .split(',')
    .map(segment => segment.trim())
    .filter(segment => !labels.has(foldGeoLabel(segment)))
    .join(', ')
    .trim();
};
export interface P05CreateState {
  numberingContract?: typeof P05_NUMBERING_CONTRACT;
  rejected?: P05RejectedObservation | null;
  ownerChecks?: P05ResolverBinding[];
  addressAutoFilled: boolean;
  message: string;
  geo: {
    provinces: readonly GeoUnit[];
    wards: readonly GeoUnit[];
    wardsProvince: string;
    busy: boolean;
    error: string;
    stale: boolean;
  };
  mode: 'manual-create';
  step: 1 | 2 | 3 | 4;
  draftId: string;
  scanSessionId: string;
  version: number;
  form: P05CreateForm;
  context: Context | null;
  catalogue: P05Catalogue | null;
  catalogueBusy: boolean;
  catalogueError: string;
  accepted: AcceptedCode[];
  attempts: Attempt[];
  busy: boolean;
  scanBusy: boolean;
  unknown: boolean;
  pending: P05CreateRequest | null;
  retry: 'NONE' | 'SAME_REQUEST_ONLY';
  error: string;
  errorCode?: string;
  outcome: 'recorded' | 'not-recorded' | null;
  savedSignature: string | null;
  serverDraft: P03Draft | null;
  saveReceiptKey: string | null;
  documentId: string | null;
  documentNo: string | null;
  committedAt: string | null;
  view: NativeView;
  current: CurrentDocument | null;
  currentError: string;
}
export function createP05CreateOwner({
  onChange = () => {},
  storage = getAppStorage(),
  service = createP05CreateService(),
  getScope = p03Scope,
  uuid = createP03RequestId,
  geo = { provinces: fetchP05Provinces, wards: fetchP05Wards },
  admission,
  readRelated = fetchOutboundDocument,
}: {
  onChange?: (s: P05CreateState) => void;
  storage?: KeyValueStorage;
  service?: P05CreateService;
  getScope?: () => P03Scope;
  uuid?: () => string;
  geo?: { provinces: typeof fetchP05Provinces; wards: typeof fetchP05Wards };
  admission?: P05ResolverAdmission;
  readRelated?: typeof fetchOutboundDocument;
} = {}) {
  const blank = (): P05CreateState => ({
    rejected: null,
    addressAutoFilled: false,
    message: '',
    geo: {
      provinces: [],
      wards: [],
      wardsProvince: '',
      busy: false,
      error: '',
      stale: false,
    },
    mode: 'manual-create',
    step: 1,
    draftId: uuid(),
    scanSessionId: uuid(),
    version: 0,
    form: emptyP05CreateForm(),
    context: null,
    catalogue: null,
    catalogueBusy: false,
    catalogueError: '',
    accepted: [],
    attempts: [],
    busy: false,
    scanBusy: false,
    unknown: false,
    pending: null,
    retry: 'NONE',
    error: '',
    errorCode: undefined,
    outcome: null,
    savedSignature: null,
    serverDraft: null,
    saveReceiptKey: null,
    documentId: null,
    documentNo: null,
    committedAt: null,
    view: {},
    current: null,
    currentError: '',
  });
  let s = blank(),
    scope: P03Scope | null = null,
    epoch = 0,
    nav = 0,
    disposed = false,
    active = true;
  let journal: ReturnType<typeof createP05Journal> | null = null;
  let journalReady = false;
  let deliveryEpoch = 0;
  let catalogueRead: AbortController | undefined;
  const owns = () => {
    try {
      return (
        !disposed &&
        !!scope &&
        p05StableJSON(scope) === p05StableJSON(getScope())
      );
    } catch {
      return false;
    }
  };
  const snapshot = () => clone(s),
    emit = () => {
      if (owns() || (!scope && !disposed)) onChange(snapshot());
    };
  const signature = () =>
    p05StableJSON({
      form: p05FormSnapshot(s.form),
      codes: s.accepted.map(c => ({
        raw_code: c.raw,
        scan_source: c.source,
      })),
    });
  const locked = () =>
    s.busy ||
    s.scanBusy ||
    s.unknown ||
    !!s.pending ||
    s.outcome === 'recorded';
  const canWrite = () =>
    owns() &&
    active &&
    s.context?.permissions.read === true &&
    s.context?.permissions.save === true &&
    s.context.permissions.record === true &&
    (!p05NumberingCapability(s.context) || p05CanNumber(s.context)) &&
    !locked() &&
    !p05ChecksPending(s) &&
    !s.error;
  function explainBlockedWrite(command:'SAVE'|'CANCEL') {
    if(!owns() || !active || locked() || s.error) return;
    s.message = command==='CANCEL' && s.context?.permissions.cancel!==true
      ? 'Chưa có quyền hủy nháp trên Web tại kho này. Phiếu vẫn được giữ nguyên.'
      : p05NumberingCapability(s.context) && !p05CanNumber(s.context)
      ? 'Chưa được phép cấp mã PX tại kho này. Phiếu chưa được lưu lên Web; dữ liệu đang nhập vẫn được giữ.'
      : p05ChecksPending(s)
      ? 'Cần kiểm tra lại thông tin người nhận và nhóm hàng trước khi lưu. Dữ liệu đang nhập vẫn được giữ.'
      : 'Chưa có đủ quyền hoặc ngữ cảnh để lưu phiếu xuất tại kho này. Dữ liệu đang nhập vẫn được giữ.';
    emit();
  }
  const exceptionScope = () =>
    owns() && active && s.context?.permissions.read === true
      ? JSON.stringify([
          scope,
          epoch,
          nav,
          s.draftId,
          s.scanSessionId,
          s.version,
        ])
      : null;
  function persist() {
    if (!owns() || !journalReady) return false;
    try {
      const state: Partial<P05CreateState> = { ...s };
      for (const key of [
        'rejected',
        'context',
        'catalogue',
        'catalogueBusy',
        'catalogueError',
        'geo',
        'current',
        'currentError',
      ] as const)
        delete state[key];
      journal?.write(state);
      if (!journal || p05StableJSON(journal.read()) !== p05StableJSON(state))
        throw Error('P05 journal persistence not verified');
      return true;
    } catch {
      s.error = 'Không lưu được định danh phiếu. Chưa gửi thao tác mới.';
      return false;
    }
  }
  function problem(e: unknown, mutation = false) {
    const err =
      e instanceof P05ApiError
        ? e
        : new P05ApiError(
            'API_ERROR',
            e instanceof Error ? e.message : 'Chưa xác minh kết quả.',
            { unknown: mutation },
          );
    s.busy = false;
    s.scanBusy = false;
    s.error = err.message;
    s.errorCode = err.code;
    if (mutation && err.unknown) s.unknown = true;
    persist();
    emit();
  }
  const resolverContext = () => {
    if (!owns() || !scope)
      throw new P05ApiError('OWNER_CHANGED', 'Phiên/kho đã thay đổi.');
    return {
      scope: clone(scope),
      draftId: s.draftId,
      scanSessionId: s.scanSessionId,
      version: s.version,
      runtime: JSON.stringify([epoch, nav, active]),
    };
  };
  const resolveOwned = createP05OwnerChecks({
    state: () => s,
    capture: resolverContext,
    persist,
    uuid,
    admit:
      admission ??
      (service.live
        ? (c, v) => verifyP04Admission(c, 'VALIDATE', v)
        : async () => ({})),
  });
  function restore(v: unknown) {
    if (!v || typeof v !== 'object')
      throw new P05ApiError('JOURNAL_INVALID', 'Nháp tạo phiếu không hợp lệ.');
    const d = clone(v) as P05CreateState;
    if (d.form)
      d.form = {
        ...emptyP05CreateForm(),
        ...d.form,
        phone: sanitiseP05Phone(d.form.phone ?? ''),
      };
    if (
      d.mode !== 'manual-create' ||
      !Number.isSafeInteger(d.version) ||
      d.version < 0 ||
      ![d.draftId, d.scanSessionId].every(x => UUID.test(x)) ||
      !d.form ||
      !validP05Groups(d.form) ||
      Object.keys(emptyP05CreateForm()).some(
        k => typeof d.form[k as keyof P05CreateForm] !== 'string',
      ) ||
      !Array.isArray(d.accepted) ||
      !Array.isArray(d.attempts) ||
      d.accepted.some(
        c =>
          !UUID.test(c.itemId) ||
          !UUID.test(c.skuId) ||
          c.quantity !== 1 ||
          !c.raw.trim(),
      ) ||
      new Set(d.accepted.map(c => c.itemId)).size !== d.accepted.length
    )
      throw new P05ApiError(
        'JOURNAL_INVALID',
        'Nháp khác schema; dữ liệu vẫn được giữ.',
      );
    if (
      d.pending &&
      (d.pending.draftId !== d.draftId ||
        d.pending.scanSessionId !== d.scanSessionId ||
        d.pending.body.warehouse_id !== scope?.warehouseId)
    )
      throw new P05ApiError(
        'JOURNAL_INVALID',
        'Yêu cầu chưa xác định không khớp nháp.',
      );
    s = {
      ...blank(),
      ...d,
      rejected: null,
      context: s.context,
      catalogue: null,
      catalogueBusy: false,
      catalogueError: '',
      current: null,
      currentError: '',
      geo: {
        provinces: [],
        wards: [],
        wardsProvince: '',
        busy: false,
        error: '',
        stale: false,
      },
      busy: false,
      scanBusy: false,
      unknown: !!d.pending || d.unknown,
    };
    restoreP05Checks(s, resolverContext());
  }
  async function loadCatalogue() {
    if (!owns() || !active || s.catalogueBusy) return false;
    const token = epoch;
    const read = new AbortController();
    catalogueRead = read;
    s.catalogueBusy = true;
    s.catalogueError = '';
    emit();
    try {
      const d = await service.catalogue(read.signal);
      if (!owns() || !active || read.signal.aborted || token !== epoch)
        return false;
      s.catalogue = d;
      s.catalogueError = [d.recipientError, d.groupError]
        .filter(Boolean)
        .join('\n');
      s.catalogueBusy = false;
      emit();
      return true;
    } catch (e) {
      if (owns() && active && !read.signal.aborted && token === epoch) {
        s.catalogueBusy = false;
        s.catalogueError =
          e instanceof Error ? e.message : 'Không tải được danh mục.';
        emit();
      }
      return false;
    } finally {
      if (catalogueRead === read) catalogueRead = undefined;
    }
  }
  async function hydrateRetainedRecipient(token: number) {
    const recipientId = s.form.recipientId,
      retainedRecipient = s.catalogue?.recipients.find(
        row => row.id === recipientId,
      );
    if (
      !retainedRecipient ||
      !retainedRecipient.address ||
      (s.form.province && s.form.ward)
    )
      return;
    const address = p05RecipientAddress(retainedRecipient.address),
      province =
        s.geo.provinces.find(row => row.code === address.province) ??
        findProvinceInText(retainedRecipient.address, s.geo.provinces),
      textAddress = !address.province;
    if (
      !province ||
      !owns() ||
      token !== epoch ||
      s.form.recipientId !== recipientId
    )
      return;
    s.addressAutoFilled = true;
    s.form = {
      ...s.form,
      province: province.code,
      provinceName: province.name,
      ward: '',
      wardName: '',
      address: textAddress
        ? textAddressDetail(retainedRecipient.address, province.name)
        : address.detail,
    };
    await loadGeo(province.code);
    if (
      !owns() ||
      token !== epoch ||
      s.form.recipientId !== recipientId ||
      s.form.province !== province.code
    )
      return;
    const ward =
      s.geo.wards.find(row => row.code === address.ward) ??
      findGeoInText(retainedRecipient.address, s.geo.wards);
    if (ward)
      s.form = {
        ...s.form,
        ward: ward.code,
        wardName: ward.name,
        ...(textAddress
          ? {
              address: textAddressDetail(
                retainedRecipient.address,
                province.name,
                ward.name,
              ),
            }
          : {}),
      };
    persist();
  }
  async function initialize(
    returnDocumentId?: string,
    newAttempt = true,
    resumeDraftId?: string,
  ) {
    if (disposed) return false;
    const token = ++epoch;
    journalReady = false;
    s.busy = true;
    emit();
    try {
      const previousScope = scope;
      scope = clone(getScope());
      if (
        previousScope &&
        p05StableJSON(previousScope) !== p05StableJSON(scope)
      )
        s = blank();
      s.busy = true;
      emit();
      if (!Object.values(scope).every(v => UUID.test(v)))
        throw new P05ApiError(
          'AUTH_CONTEXT_REQUIRED',
          'Phiên/kho chưa xác minh.',
        );
      journal = createP05Journal(
        {
          getItem: k => storage.getString(k) ?? null,
          setItem: (k, v) => storage.setString(k, v),
          removeItem: k => storage.remove(k),
        },
        scope,
        service.baseUrl,
        'hn-p05-create-v1:',
      );
      const old = journal.read();
      if (
        resumeDraftId &&
        (!old || (old as P05CreateState).draftId !== resumeDraftId)
      )
        throw new P05ApiError(
          'P05_RESUME_DRAFT_MISMATCH',
          'Không tìm thấy đúng nháp của phiên/kho này. Giữ dữ liệu; chưa mở nháp khác.',
        );
      if (old) restore(old);
      journalReady = true;
      s.busy = true;
      emit();
      const context = await service.context();
      if (!owns() || token !== epoch) return false;
      s.context = context;
      if (
        s.numberingContract &&
        (!p05NumberingCapability(context) ||
          s.numberingContract !== P05_NUMBERING_CONTRACT)
      )
        throw new P05ApiError(
          'P05_NUMBERING_CONTRACT_INVALID',
          'Máy chủ chưa xác nhận contract của mã PX đang giữ.',
        );
      if (
        newAttempt &&
        s.outcome &&
        !s.pending &&
        !s.unknown &&
        !returnDocumentId
      ) {
        journal.remove();
        s = { ...blank(), context };
      }
      s.busy = true;
      s.error = '';
      s.errorCode = undefined;
      if (p05ChecksPending(s)) {
        s.error =
          'Lượt kiểm mã trước chưa rõ kết quả. Giữ nguyên request gốc; chưa lưu hoặc gửi lại.';
        persist();
      }
      emit();
      if (s.version > 0 && !s.pending && !s.outcome) {
        const numberedRead =
          !!s.numberingContract ||
          p05NumberingCapability(context)?.schema_ready === true;
        const d = await service.draft(s.draftId, s.scanSessionId, numberedRead);
        if (!owns() || token !== epoch) return false;
        if (
          d.version !== s.version ||
          d.status !== 'DRAFT' ||
          p05StableJSON({
            form: d.form,
            codes: d.codes.map(c => ({
              raw_code: c.raw_code,
              scan_source: c.scan_source,
            })),
          }) !== s.savedSignature
        )
          throw new P05ApiError(
            'STALE_VERSION',
            'Nháp server đã thay đổi; giữ nguyên dữ liệu để xử lý.',
          );
        s.serverDraft = d;
        if (numberedRead) {
          const number = p05OfficialDraftNumber(d);
          if (s.documentNo && s.documentNo !== number)
            throw new P05ApiError(
              'P05_NUMBER_CHANGED',
              'Mã PX đọc lại không khớp mã đã giữ.',
              { unknown: true },
            );
          if (number) {
            s.numberingContract = P05_NUMBERING_CONTRACT;
            s.documentNo = number;
          }
        }
      }
      if (s.outcome === 'recorded') await readCurrent();
      // Opening a new outbound form must not wait for every catalogue page.
      // The controls keep their own loading state and remain disabled until
      // their verified lists arrive; SAVE/RECORD still use the same guard.
      const catalogueTask = loadCatalogue(),
        provincesTask = loadGeo(),
        needsVerifiedCatalogue =
          Boolean(s.form.group) ||
          Boolean(s.form.recipientId && s.form.recipientId !== 'walk-in'),
        needsAddressHydration = Boolean(s.form.province),
        // Fixtures/non-live adapters keep deterministic fully-hydrated setup.
        // The real DEV/TEST service may release a new form once the verified
        // context arrives, while catalogue/address reads continue separately.
        waitForInitialReads =
          !service.live || needsVerifiedCatalogue || needsAddressHydration;
      if (waitForInitialReads) {
        await Promise.all([catalogueTask, provincesTask]);
        if (needsVerifiedCatalogue) await hydrateRetainedRecipient(token);
        if (s.form.province && s.geo.wardsProvince !== s.form.province)
          await loadGeo(s.form.province);
      }
      if (!owns() || token !== epoch) return false;
      s.busy = false;
      emit();
      return !s.error;
    } catch (e) {
      if ((!scope || owns()) && token === epoch) problem(e);
      return false;
    }
  }
  function frozen(command: P05CreateRequest['command']): P05CreateRequest {
    const key = uuid(),
      batch = s.accepted.map(c => ({
        raw_code: c.raw,
        scan_source: c.source,
      }));
    const headers: Record<string, string> = { 'Idempotency-Key': key };
    if (s.numberingContract)
      headers[P05_NUMBERING_HEADER] = s.numberingContract;
    let path = `/api/v1/mini-app/drafts/${s.draftId}`,
      method: 'PUT' | 'POST' = 'PUT';
    let body: Record<string, unknown> = {
      warehouse_id: scope!.warehouseId,
      operation: 'OUTBOUND',
      scan_session_id: s.scanSessionId,
      title: s.form.name || null,
      codes: batch,
      form: p05FormSnapshot(s.form),
    };
    if (command === 'RECORD') {
      method = 'POST';
      path = '/api/v1/mini-app/outbound/record';
      Object.assign(headers, {
        'X-Draft-ID': s.draftId,
        'X-Draft-Scan-Session-ID': s.scanSessionId,
        'X-Draft-Version': String(s.version),
      });
      body = {
        name: s.form.name,
        warehouse_id: scope!.warehouseId,
        recipient_name: s.form.recipient,
        recipient_address: p05DeliveryAddress(s.form),
        recipient_contact_phone: s.form.phone,
        note: s.form.note,
        expected_total_qty: Number(s.form.plannedInput),
        items: batch,
      };
    } else {
      headers['If-Match'] = `"${s.version}"`;
      if (command === 'CANCEL') {
        method = 'POST';
        path += '/cancel';
        body = {
          warehouse_id: scope!.warehouseId,
          operation: 'OUTBOUND',
          scan_session_id: s.scanSessionId,
          confirmed_request_id: s.saveReceiptKey,
          reason: 'Người dùng xác nhận bỏ nháp xuất kho',
        };
      }
    }
    return clone({
      ...(s.numberingContract
        ? {
            numberingContract: s.numberingContract,
            reservedDocumentNo: s.documentNo,
          }
        : {}),
      mode: 'manual-create',
      command,
      key,
      draftId: s.draftId,
      scanSessionId: s.scanSessionId,
      method,
      path,
      headers,
      body,
      form: s.form,
      batch: s.accepted,
    });
  }
  function accept(r: ResponseData, q: P05CreateRequest, current?: P03Draft) {
    if (q.command === 'RECORD') {
      const v = verifyP05CreateRecord(r, q, scope!);
      s.documentId = v.documentId;
      s.documentNo = v.documentNo;
      s.committedAt = v.receipt.committed_at;
      s.serverDraft = current ?? v.draft;
      s.version = s.serverDraft.version;
      s.outcome = 'recorded';
      s.step = 4;
    } else {
      const b = envelope(r, P03_CONTRACT, [200, 201]),
        data = b.data as Record<string, unknown>,
        receipt = parseReceipt(data.receipt, q),
        d = parseDraft(data.document, scope!, s.draftId, s.scanSessionId);
      if (
        d.version !== receipt.version ||
        (current && current.version !== receipt.version) ||
        !draftEtagMatches(r.etag, d.version)
      )
        throw new P05ApiError(
          'STALE_VERSION',
          'Version nháp/receipt không khớp.',
          { unknown: true },
        );
      if (q.command === 'SAVE') {
        let number: string | null = null;
        if (q.numberingContract) {
          p05NumberingMeta(b);
          number = p05OfficialDraftNumber(d, true);
          if (q.reservedDocumentNo && number !== q.reservedDocumentNo)
            throw new P05ApiError(
              'P05_NUMBER_CHANGED',
              'SAVE đổi mã PX đã cấp.',
              { unknown: true },
            );
          if (current && p05OfficialDraftNumber(current, true) !== number)
            throw new P05ApiError(
              'P05_NUMBER_CHANGED',
              'Mã PX hiện tại khác biên nhận SAVE.',
              { unknown: true },
            );
        }
        if (
          d.status !== 'DRAFT' ||
          p05StableJSON(d.form) !== p05StableJSON(q.body.form) ||
          d.title !== q.body.title ||
          JSON.stringify(
            d.codes.map(c => ({
              raw_code: c.raw_code,
              scan_source: c.scan_source,
            })),
          ) !== JSON.stringify(q.body.codes)
        )
          throw new P05ApiError(
            'SNAPSHOT_MISMATCH',
            'SAVE chưa xác nhận đầy đủ form/mã.',
            { unknown: true },
          );
        if (q.numberingContract) {
          s.numberingContract = q.numberingContract;
          s.documentNo = number;
        }
        s.savedSignature = p05StableJSON({
          form: q.body.form,
          codes: q.body.codes,
        });
        s.saveReceiptKey = q.key;
      } else if (d.status !== 'CANCELLED')
        throw new P05ApiError(
          'CONTRACT_INVALID',
          'Nháp chưa được xác nhận hủy.',
          { unknown: true },
        );
      if (q.command === 'CANCEL' && q.numberingContract) {
        p05NumberingMeta(b);
        if (p05OfficialDraftNumber(d, true) !== q.reservedDocumentNo)
          throw new P05ApiError(
            'P05_NUMBER_CHANGED',
            'Biên nhận hủy không giữ mã PX gốc.',
            { unknown: true },
          );
      }
      s.version = d.version;
      s.serverDraft = d;
    }
    s.pending = null;
    s.busy = false;
    s.unknown = false;
    s.retry = 'NONE';
    s.error = '';
    s.errorCode = undefined;
    if (q.command === 'CANCEL') {
      journal?.remove();
      s = { ...blank(), context: s.context, catalogue: s.catalogue };
    } else persist();
    emit();
  }
  async function execute(q: P05CreateRequest) {
    if (!owns() || s.busy) return false;
    s.pending = clone(q);
    s.busy = true;
    s.error = '';
    s.errorCode = undefined;
    if (!persist()) {
      s.busy = false;
      emit();
      return false;
    }
    emit();
    const token = epoch;
    try {
      const r = await service.execute(q);
      if (!owns() || token !== epoch) return false;
      accept(r, q);
      return true;
    } catch (e) {
      if (owns() && token === epoch) {
        if (
          e instanceof P05ApiError &&
          !e.unknown &&
          e.code !== 'IDEMPOTENCY_CONFLICT'
        ) {
          s.pending = null;
          if (q.command === 'RECORD') s.outcome = 'not-recorded';
        }
        problem(e, true);
      }
      return false;
    }
  }
  async function save() {
    if (!canWrite()) {
      explainBlockedWrite('SAVE');
      return false;
    }
    if (p05CanNumber(s.context)) s.numberingContract = P05_NUMBERING_CONTRACT;
    if (
      s.savedSignature === signature() &&
      s.version > 0 &&
      (!s.numberingContract || !!s.documentNo)
    )
      return true;
    return execute(frozen('SAVE'));
  }
  async function requestDocumentNumber(explicitLegacy = false) {
    if (
      !canWrite() ||
      !p05CanNumber(s.context) ||
      s.documentNo ||
      (!explicitLegacy && s.version > 0)
    )
      return false;
    s.numberingContract = P05_NUMBERING_CONTRACT;
    return execute(frozen('SAVE'));
  }
  function field<K extends P05CreateTextField>(
    key: K,
    value: P05CreateForm[K],
  ) {
    if (
      !owns() ||
      locked() ||
      !Object.hasOwn(emptyP05CreateForm(), key) ||
      typeof value !== 'string' ||
      [
        'province',
        'provinceName',
        'ward',
        'wardName',
        'recipientId',
        'originalAddress',
        'group',
      ].includes(key)
    )
      return false;
    if ((key === 'plannedInput' || key === 'group') && s.accepted.length)
      return false;
    s.form = {
      ...s.form,
      [key]: key === 'phone' ? sanitiseP05Phone(value) : value,
    };
    if (key === 'address') {
      s.addressAutoFilled = false;
      deliveryEpoch++;
    }

    s.error = '';
    s.errorCode = undefined;
    persist();
    emit();
    return true;
  }
  let geoEpoch = 0;
  async function loadGeo(province?: string) {
    if (!owns()) return false;
    const ticket = ++geoEpoch,
      token = epoch;
    s.geo.busy = true;
    s.geo.error = '';
    emit();
    try {
      const r = await (province ? geo.wards(province) : geo.provinces());
      if (
        !owns() ||
        token !== epoch ||
        ticket !== geoEpoch ||
        (province && province !== s.form.province)
      )
        return false;
      if (
        !r.items.length ||
        r.items.some(v => !/^\d+$/.test(v.code) || !v.name)
      )
        throw new P05ApiError('GEO_INVALID', 'Danh mục địa chỉ không hợp lệ.');
      s.geo = {
        ...s.geo,
        busy: false,
        error: '',
        stale: r.stale,
        ...(province
          ? { wards: r.items, wardsProvince: province }
          : { provinces: r.items }),
      };
      emit();
      return true;
    } catch (e) {
      if (owns() && token === epoch && ticket === geoEpoch) {
        s.geo.busy = false;
        s.geo.error =
          e instanceof Error ? e.message : 'Không tải được địa chỉ.';
        emit();
      }
      return false;
    }
  }
  function chooseGroups(groups: readonly string[]) {
    // Known group labels can be selected locally before PX allocation.
    if (
      !owns() ||
      !active ||
      !journalReady ||
      s.context?.permissions.read !== true ||
      s.context?.permissions.save !== true ||
      s.context?.permissions.record !== true ||
      locked() ||
      p05ChecksPending(s) ||
      !!s.error ||
      s.accepted.length ||
      s.catalogueBusy ||
      !s.catalogue ||
      s.catalogue.groupError ||
      !Array.isArray(groups) ||
      !groups.length ||
      new Set(groups).size !== groups.length ||
      groups.some(
        v => typeof v !== 'string' || !s.catalogue!.groups.includes(v),
      )
    )
      return false;
    s.form = { ...s.form, group: groups[0]!, groups: [...groups] };
    s.error = '';
    s.errorCode = undefined;
    persist();
    emit();
    return true;
  }
  function choose(
    kind: 'province' | 'ward' | 'recipient' | 'group',
    id: string,
  ) {
    if (!owns() || locked()) return false;
    if (kind === 'province') {
      const row = s.geo.provinces.find(v => v.code === id);
      if (!row) return false;
      if (s.form.province === id) return true;
      const preservePrefill = !s.form.province && s.addressAutoFilled;
      deliveryEpoch++;
      s.form = {
        ...s.form,
        province: id,
        provinceName: row.name,
        ward: '',
        wardName: '',
        address: preservePrefill ? s.form.address : '',
      };
      if (!preservePrefill) s.addressAutoFilled = false;
      s.geo.wards = [];
      s.geo.wardsProvince = '';
      persist();
      emit();
      loadGeo(id);
      return true;
    }
    if (kind === 'ward') {
      const row = s.geo.wards.find(v => v.code === id);
      if (!row || s.geo.wardsProvince !== s.form.province) return false;
      if (s.form.ward === id) return true;
      const preservePrefill = !s.form.ward && s.addressAutoFilled;
      deliveryEpoch++;
      s.form = {
        ...s.form,
        ward: id,
        wardName: row.name,
        address: preservePrefill ? s.form.address : '',
      };
      if (!preservePrefill) s.addressAutoFilled = false;
    } else if (kind === 'group') {
      return chooseGroups([id]);
    } else {
      const row = s.catalogue?.recipients.find(v => v.id === id);
      if (id !== 'walk-in' && !row) return false;
      if (s.form.recipientId === id) return true;
      const address = p05RecipientAddress(row?.address ?? ''),
        province =
          s.geo.provinces.find(v => v.code === address.province) ??
          findProvinceInText(row?.address ?? '', s.geo.provinces),
        textAddress = !address.province && row?.address;
      const ticket = ++deliveryEpoch;
      s.form = {
        ...s.form,
        recipientId: id,
        recipient: row?.name ?? '',
        phone: sanitiseP05Phone(row?.phone ?? ''),
        province: province?.code ?? '',
        provinceName: province?.name ?? '',
        ward: '',
        wardName: '',
        address: textAddress
          ? textAddressDetail(row!.address, province?.name)
          : address.detail,
        originalAddress: row?.address ?? '',
      };
      s.geo.wards = [];
      s.geo.wardsProvince = '';
      ++geoEpoch;
      s.geo.busy = false;
      s.addressAutoFilled = !!row && !!row.address;
      if (province && row?.address) {
        const token = epoch,
          recipientId = id;
        loadGeo(province.code).then(ok => {
          if (
            !ok ||
            !owns() ||
            !active ||
            token !== epoch ||
            ticket !== deliveryEpoch ||
            s.form.recipientId !== recipientId ||
            s.form.province !== province.code ||
            s.geo.wardsProvince !== province.code ||
            locked()
          )
            return;
          const ward =
            s.geo.wards.find(v => v.code === address.ward) ??
            findGeoInText(row.address, s.geo.wards);
          if (!ward) return;
          s.form = {
            ...s.form,
            ward: ward.code,
            wardName: ward.name,
            ...(textAddress
              ? {
                  address: textAddressDetail(
                    row.address,
                    province.name,
                    ward.name,
                  ),
                }
              : {}),
          };
          persist();
          emit();
        });
      }
    }
    s.error = '';
    persist();
    emit();
    return true;
  }
  const errors = () => {
    const e = p05CreateErrors(s.form);
    if (!s.catalogue || s.catalogueBusy || s.catalogue.groupError)
      e.group = s.catalogueBusy
        ? 'Đang tải danh mục nhóm hàng.'
        : s.catalogue?.groupError || 'Chưa xác minh danh mục nhóm hàng.';
    if (
      s.form.recipientId &&
      s.form.recipientId !== 'walk-in' &&
      (!s.catalogue || s.catalogueBusy || s.catalogue.recipientError)
    )
      e.recipient = s.catalogueBusy
        ? 'Đang tải danh mục người nhận.'
        : s.catalogue?.recipientError || 'Chưa xác minh danh mục người nhận.';
    if (
      s.form.recipientId &&
      s.form.recipientId !== 'walk-in' &&
      s.catalogue &&
      !s.catalogue.recipients.some(v => v.id === s.form.recipientId)
    )
      e.recipient =
        'Người nhận không còn hoạt động trong danh mục. Chọn lại người nhận.';
    if (
      s.catalogue &&
      p05SelectedGroups(s.form).some(
        group => !s.catalogue!.groups.includes(group),
      )
    )
      e.group = 'Nhóm hàng không còn trong danh mục. Chọn lại nhóm hàng.';
    if (
      s.form.province &&
      s.geo.provinces.length &&
      !s.geo.provinces.some(
        v => v.code === s.form.province && v.name === s.form.provinceName,
      )
    )
      e.province = 'Tỉnh/Thành phố chưa khớp danh mục v2. Chọn lại tỉnh.';
    if (
      s.form.ward &&
      s.geo.wardsProvince === s.form.province &&
      !s.geo.wards.some(
        v => v.code === s.form.ward && v.name === s.form.wardName,
      )
    )
      e.ward = 'Phường/Xã chưa khớp tỉnh trong danh mục v2. Chọn lại phường.';
    return e;
  };
  const beginErrors = () => {
    const e: Partial<Record<keyof P05CreateForm, string>> = {};
    if (s.form.phone && !validP05Phone(s.form.phone))
      e.phone = p05CreateErrors(s.form).phone;
    if (s.form.recipientId && s.form.recipientId !== 'walk-in') {
      if (!s.catalogue || s.catalogueBusy || s.catalogue.recipientError)
        e.recipient = s.catalogueBusy
          ? 'Đang tải danh mục người nhận.'
          : s.catalogue?.recipientError || 'Chưa xác minh danh mục người nhận.';
      else if (!s.catalogue.recipients.some(v => v.id === s.form.recipientId))
        e.recipient =
          'Người nhận không còn hoạt động trong danh mục. Chọn lại người nhận.';
    }
    if (
      !validP05Groups(s.form) ||
      (p05SelectedGroups(s.form).length > 0 &&
        (!s.catalogue ||
          p05SelectedGroups(s.form).some(
            group => !s.catalogue!.groups.includes(group),
          )))
    )
      e.group = 'Nhóm hàng không còn trong danh mục. Chọn lại nhóm hàng.';
    if (
      s.form.province &&
      !s.geo.provinces.some(
        v => v.code === s.form.province && v.name === s.form.provinceName,
      )
    )
      e.province = 'Tỉnh/Thành phố chưa khớp danh mục v2. Chọn lại tỉnh.';
    if (
      s.form.ward &&
      (s.geo.wardsProvince !== s.form.province ||
        !s.geo.wards.some(
          v => v.code === s.form.ward && v.name === s.form.wardName,
        ))
    )
      e.ward = 'Phường/Xã chưa khớp tỉnh trong danh mục v2. Chọn lại phường.';
    return e;
  };
  async function begin() {
    if (!canWrite() || Object.keys(beginErrors()).length) return false;
    // Provided values must match loaded catalogues (see beginErrors above); missing values defer to RECORD.
    const navigation = nav;
    if (!(await save()) || !owns() || !active || navigation !== nav)
      return false;
    s.step = s.accepted.length ? 3 : 2;
    persist();
    emit();
    return true;
  }
  async function scan(
    raw: string,
    source: AcceptedCode['source'],
  ): Promise<'valid' | 'duplicate' | 'invalid' | false> {
    if (
      !canWrite() ||
      !active ||
      s.step !== 2 ||
      !raw.trim() ||
      raw.length > 512
    )
      return false;
    const token = epoch,
      navigation = nav,
      id = s.scanSessionId;
    raw = raw.trim();
    s.rejected = null;
    s.scanBusy = true;
    emit();
    const attempt = (kind: Attempt['kind'], reason: string) => {
      s.attempts.push({
        raw,
        source,
        time: formatVietnamClock(Date.now(), { seconds: true }),
        kind,
        reason,
        eventId: `${id}:${s.attempts.length + 1}`,
      });
      s.message = reason;
    };
    try {
      // A retained raw code is already known to this scan session, even when
      // its planned quantity is full. No extra resolve or SAVE is needed.
      if (s.accepted.some(c => c.raw === raw)) {
        s.scanBusy = false;
        attempt('duplicate', 'Hiện vật đã được quét; không cộng số lượng.');
        persist();
        emit();
        return 'duplicate';
      }
      const d = await resolveOwned(service, raw, 'SCAN');
      if (
        !owns() ||
        token !== epoch ||
        navigation !== nav ||
        id !== s.scanSessionId ||
        s.step !== 2
      )
        return false;
      s.scanBusy = false;
      let kind: 'valid' | 'invalid' | 'duplicate' = 'valid',
        reason = '';
      if (
        d.eligible_for_outbound !== true ||
        d.sku_type !== 'PRODUCT' ||
        !UUID.test(String(d.item_id)) ||
        !UUID.test(String(d.sku_id)) ||
        typeof d.available_qty !== 'number' ||
        d.available_qty <= 0
      ) {
        kind = 'invalid';
        reason = String(d.eligibility_code || 'Mã chưa đủ điều kiện xuất.');
      } else if (
        s.accepted.some(c => c.itemId === d.item_id || c.raw === raw)
      ) {
        kind = 'duplicate';
        reason = 'Hiện vật đã được quét; không cộng số lượng.';
      } else if (
        !p05SelectedGroups(s.form).includes(
          s.catalogue?.skuGroups[String(d.sku_id)] ?? '',
        )
      ) {
        kind = 'invalid';
        reason = 'Sản phẩm không thuộc nhóm hàng đã chọn.';
      }
      if (
        kind === 'valid' &&
        s.accepted.length >= Number(s.form.plannedInput)
      ) {
        s.message =
          'Đã soạn đủ kế hoạch; không thêm sản phẩm. Kiểm tra phiếu trước khi gửi.';
        persist();
        emit();
        return false;
      }
      attempt(kind, reason);
      s.rejected =
        kind === 'invalid'
          ? p05RejectedObservation(
              raw,
              s.attempts[s.attempts.length - 1]!.eventId,
              d,
              s.context?.permissions.read === true,
            )
          : null;
      if (kind === 'valid')
        s.accepted.push({
          raw,
          source,
          skuId: String(d.sku_id),
          itemId: String(d.item_id),
          sku: String(d.sku_code),
          quantity: 1,
        });
      s.error = '';
      s.errorCode = undefined;
      s.message = reason;
      persist();
      emit();
      if (kind === 'valid') await save();
      return kind;
    } catch (e) {
      if (
        owns() &&
        token === epoch &&
        active &&
        navigation === nav &&
        id === s.scanSessionId &&
        s.step === 2
      ) {
        s.scanBusy = false;
        s.message = e instanceof Error ? e.message : 'Chưa xác minh mã.';
        // Only this confirmed resolver rejection is a failed scan. A timeout,
        // server error or denied session must not be counted as an invalid item.
        if (
          e instanceof P05ApiError &&
          e.status === 422 &&
          e.code === 'PHYSICAL_CODE_NOT_FOUND' &&
          !e.unknown
        ) {
          attempt('invalid', s.message);
          s.rejected = p05RejectedObservation(
            raw,
            s.attempts[s.attempts.length - 1]!.eventId,
            { eligibility_code: e.code },
            s.context?.permissions.read === true,
          );
          persist();
          emit();
          return 'invalid';
        }
        if (e instanceof P05ApiError && [401, 403].includes(e.status))
          s.error = s.message;
        if (p05ChecksPending(s)) s.error = s.message;
        persist();
        emit();
      }
      return false;
    }
  }
  const canRecord = () =>
    canWrite() &&
    s.step === 3 &&
    !Object.keys(errors()).length &&
    s.accepted.length === Number(s.form.plannedInput) &&
    s.savedSignature === signature() &&
    s.serverDraft?.status === 'DRAFT' &&
    s.version > 0;
  async function send() {
    if (!canRecord()) return false;
    const token = epoch,
      id = s.draftId,
      navigation = nav;
    s.busy = true;
    emit();
    try {
      const context = await service.context();
      if (
        !owns() ||
        token !== epoch ||
        id !== s.draftId ||
        navigation !== nav ||
        !active
      ) {
        s.busy = false;
        return false;
      }
      s.context = context;
      if (
        !context.permissions.read ||
        !context.permissions.save ||
        !context.permissions.record
      )
        throw new P05ApiError(
          'OPERATION_DENIED',
          'Quyền thao tác đã thay đổi. Chưa gửi phiếu.',
        );
      for (const code of s.accepted) {
        const d = await resolveOwned(service, code.raw, 'REVALIDATE');
        if (
          !owns() ||
          token !== epoch ||
          id !== s.draftId ||
          navigation !== nav ||
          !active
        ) {
          s.busy = false;
          return false;
        }
        if (
          d.eligible_for_outbound !== true ||
          d.sku_type !== 'PRODUCT' ||
          d.item_id !== code.itemId ||
          d.sku_id !== code.skuId ||
          typeof d.available_qty !== 'number' ||
          d.available_qty <= 0
        )
          throw new P05ApiError(
            'BATCH_REVALIDATION_REQUIRED',
            'Mã không còn đủ điều kiện xuất. Dữ liệu và nháp vẫn được giữ.',
          );
      }
      s.busy = false;
      if (!canRecord()) {
        emit();
        return false;
      }
      const ok = await execute(frozen('RECORD'));
      if (ok) await readCurrent();
      return ok;
    } catch (e) {
      if (owns() && token === epoch) problem(e);
      return false;
    }
  }
  async function check() {
    if (!owns() || !s.pending || s.busy) return false;
    const q = clone(s.pending),
      token = epoch;
    s.busy = true;
    emit();
    try {
      const b = await service.reconcile(q);
      if (!owns() || token !== epoch) return false;
      const d = b.data as Record<string, unknown>;
      if (q.numberingContract) p05NumberingMeta(b);
      if (
        !d ||
        d.new_document_allowed !== false ||
        !['UNKNOWN', 'SUCCEEDED'].includes(String(d.outcome))
      )
        throw new P05ApiError('CONTRACT_INVALID', 'Đối chiếu chưa xác minh.', {
          unknown: true,
        });
      if (d.outcome === 'UNKNOWN') {
        assertP03ReconcileIdentity(d, {
          key: q.key,
          draftId: q.draftId,
          scanSessionId: q.scanSessionId,
          warehouseId: scope!.warehouseId,
          operation: 'OUTBOUND',
          command: q.command,
        });
        if (
          d.retry !==
            (q.numberingContract ? 'CHECK_ONLY' : 'SAME_REQUEST_ONLY') ||
          d.cancel_allowed !== false ||
          d.receipt !== null ||
          d.response !== null
        )
          throw new P05ApiError(
            'CONTRACT_INVALID',
            'UNKNOWN mâu thuẫn receipt/policy.',
            { unknown: true },
          );
        s.busy = false;
        s.unknown = true;
        s.retry = q.numberingContract ? 'NONE' : 'SAME_REQUEST_ONLY';
        persist();
        emit();
        return false;
      }
      if (d.retry !== 'NONE' || !d.response || !d.document)
        throw new P05ApiError(
          'CONTRACT_INVALID',
          'Thiếu receipt/response đối chiếu.',
          { unknown: true },
        );
      parseReceipt(d.receipt, q);
      const current = parseDraft(
        d.document,
        scope!,
        s.draftId,
        s.scanSessionId,
      );
      accept({ status: 200, body: d.response }, q, current);
      if (q.command === 'RECORD') await readCurrent();
      return true;
    } catch (e) {
      if (owns() && token === epoch) problem(e, true);
      return false;
    }
  }
  async function readCurrent() {
    if (!owns() || !s.documentId || s.outcome !== 'recorded') return false;
    const token = epoch,
      id = s.documentId,
      navigation = nav;
    try {
      const current = await service.current(id);
      if (
        !owns() ||
        token !== epoch ||
        id !== s.documentId ||
        navigation !== nav
      )
        return false;
      s.current = current;
      s.currentError = '';
      emit();
      return true;
    } catch (e) {
      if (
        owns() &&
        token === epoch &&
        id === s.documentId &&
        navigation === nav
      ) {
        s.currentError =
          e instanceof Error ? e.message : 'Chưa đọc được trạng thái hiện tại.';
        emit();
      }
      return false;
    }
  }
  async function discard() {
    if (!owns() || !active || !journalReady || locked()) return false;
    if (s.version === 0) {
      // Only a never-saved, empty-code checkpoint can be discarded locally.
      if(s.serverDraft || s.documentId || s.documentNo || s.saveReceiptKey || s.accepted.length) {
        s.message='Cần xác minh liên kết phiếu trước khi bỏ dữ liệu. Phiếu vẫn được giữ nguyên.';
        emit();
        return false;
      }
      journal?.remove();
      s = { ...blank(), context: s.context, catalogue: s.catalogue };
      emit();
      return true;
    }
    if (!canWrite() || !s.context?.permissions.cancel) {
      explainBlockedWrite('CANCEL');
      return false;
    }
    if (!(await save())) return false;
    return execute(frozen('CANCEL'));
  }
  return {
    snapshot,
    exceptionScope,
    dismissRejected(eventId: string, expectedScope: string) {
      if (
        !expectedScope ||
        exceptionScope() !== expectedScope ||
        s.step !== 2 ||
        locked() ||
        s.rejected?.eventId !== eventId
      )
        return false;
      s.rejected = null;
      s.message = '';
      emit();
      return true;
    },
    async readRejectedDocument(
      eventId: string,
      expectedScope: string,
      documentId: string,
    ) {
      const current = () =>
        !!expectedScope &&
        exceptionScope() === expectedScope &&
        s.step === 2 &&
        !locked() &&
        s.rejected?.eventId === eventId &&
        s.rejected.relatedDocument?.kind === 'visible' &&
        s.rejected.relatedDocument.canOpen === true &&
        s.rejected.relatedDocument.documentId === documentId &&
        UUID.test(documentId);
      if (!current()) return false;
      try {
        const document = await readRelated(documentId, {
          query: { warehouse_id: scope!.warehouseId },
        });
        if (current() && document.id === documentId) return true;
      } catch {
        // Denied/unavailable reads revoke the transient link, not the hold.
      }
      if (current() && s.rejected) {
        s.rejected.relatedDocument = { kind: 'unavailable' };
        emit();
      }
      return false;
    },
    isDirty: () => signature() !== s.savedSignature,
    readCurrent,
    initialize,
    loadCatalogue,
    field,
    choose,
    chooseGroups,
    loadGeo,
    errors,
    begin,
    save,
    requestDocumentNumber,
    scan,
    send,
    canRecord,
    check,
    async reconcileResolverCheck() {
      if (!owns() || s.busy || s.pending || s.unknown) return false;
      s.busy = true;
      emit();
      try {
        await reconcileP05OwnerCheck(
          { state: () => s, capture: resolverContext, persist },
          service,
        );
        s.error = '';
        s.errorCode = undefined;
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
    discard,
    retrySame: () =>
      s.pending && s.retry === 'SAME_REQUEST_ONLY' && !s.busy
        ? execute(clone(s.pending))
        : Promise.resolve(false),
    review() {
      if (
        !owns() ||
        !active ||
        locked() ||
        s.savedSignature !== signature() ||
        !s.accepted.length
      )
        return false;
      s.step = 3;
      persist();
      emit();
      return true;
    },
    back() {
      if (locked()) return false;
      s.step = Math.max(1, s.step - 1) as 1 | 2 | 3;
      persist();
      emit();
      return true;
    },
    setView(v: NativeView) {
      s.view = {
        ...s.view,
        ...v,
        scroll: v.scroll ? { ...s.view.scroll, ...v.scroll } : s.view.scroll,
      };
      persist();
    },
    hasWork: () =>
      s.version > 0 ||
      s.accepted.length > 0 ||
      p05StableJSON(s.form) !== p05StableJSON(emptyP05CreateForm()),
    leave() {
      active = false;
      catalogueRead?.abort();
      catalogueRead = undefined;
      s.catalogueBusy = false;
      nav++;
      s.scanBusy = false;
      persist();
    },
    dispose() {
      catalogueRead?.abort();
      catalogueRead = undefined;
      disposed = true;
      epoch++;
      nav++;
      deliveryEpoch++;
    },
  };
}
export type P05CreateOwner = ReturnType<typeof createP05CreateOwner>;
