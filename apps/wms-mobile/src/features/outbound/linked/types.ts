import type {
  P03Scope,
  P03Draft,
  P03Receipt,
} from '../../../services/wms/p03Drafts';
export type ScanSource = 'MANUAL' | 'CAMERA' | 'SCANNER' | 'HARDWARE';
export interface SourceLine {
  line_id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  planned_qty: number;
  scanned_qty: number;
}
export interface Source {
  source_kind: 'WMS_OUTBOUND_DOCUMENT';
  source_document_id: string;
  document_id: string;
  source_version: number;
  warehouse_id: string;
  outbound_request_id: string;
  doc_no: string;
  status: 'DRAFT';
  planned_total_qty: number;
  lines: SourceLine[];
  recipient: {
    agency_id: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
  };
  note: string | null;
  created_at: string;
  expires_at: string;
  address_format: 'TEXT';
  address_dataset_version: null;
}
export interface Context {
  document_number_assignment?: 'WITH_DRAFT_SAVE' | 'UNAVAILABLE';
  numbering?: import('../../../services/wms/p05Numbering').P05NumberingCapability;
  actor_id: string;
  auth_session_id: string;
  active_warehouse_id: string;
  warehouse_context: { status: 'READY' };
  available_warehouses: {
    warehouse_id: string;
    name: string;
    status: string;
  }[];
  permissions: {
    read: boolean;
    save: boolean;
    cancel: boolean;
    record: boolean;
  };
  record: { reconcile_mode: 'P03_LINKED' };
  address_contract: { format: 'TEXT'; structured_codes_supported: false };
}
export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
  warehouse_id: string;
  source_kind: 'WMS_OUTBOUND_DOCUMENT';
}
export interface FrozenRequest {
  command: 'SAVE' | 'RECORD' | 'CANCEL';
  key: string;
  draftId: string;
  scanSessionId: string;
  sourceId: string;
  sourceVersion: number;
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}
export interface Envelope {
  success: true;
  data: unknown;
  meta: {
    contract: string;
    request_id?: string;
    p03_draft?: unknown;
    [key: string]: unknown;
  };
}
export interface ResponseData {
  status: number;
  body: unknown;
  etag?: string | null;
  traceId?: string | null;
}
export interface AcceptedCode {
  raw: string;
  source: ScanSource;
  itemId: string;
  skuId: string;
  sku: string;
  quantity: 1;
}
export interface Attempt {
  raw: string;
  source: ScanSource;
  time: string;
  kind: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
  eventId: string;
}
export interface CurrentDocument {
  document: {
    id: string;
    doc_no?: string;
    src_warehouse_id: string;
    version: number;
    status: string;
    [key: string]: unknown;
  };
  status: 'DRAFT' | 'SCANNING' | 'POSTED' | 'CANCELLED' | 'REVERSED';
  posted: boolean;
  observed_at: string;
  history: {
    id: string;
    stock_document_id: string;
    action?: string;
    to_status: string;
    created_at: string;
    changed_by?: string;
    note?: string;
  }[];
}
export interface NativeView {
  manual?: boolean;
  rawInput?: string;
  filter?: 'all' | 'valid' | 'duplicate' | 'invalid';
  all?: boolean;
  scroll?: Partial<Record<1 | 2 | 3 | 4, number>>;
}
export interface Snapshot {
  rejected?: import('./p05-exceptions').P05RejectedObservation | null;
  ownerChecks?: import('./p05-owner-checks').P05ResolverBinding[];
  nativeView?: NativeView;
  mode: 'source-linked';
  step: 1 | 2 | 3 | 4;
  source: Source | null;
  document: null | {
    documentId: string;
    actorId: string;
    authSessionId: string;
    warehouseId: string;
    scanSessionId: string;
    warehouseName: string;
    number: string;
    recipient: string;
    phone: string;
    address: string;
    note: string;
    planned: number;
    group: string;
  };
  draftId: string | null;
  scanSessionId: string | null;
  draftVersion: number;
  accepted: AcceptedCode[];
  attempts: Attempt[];
  form: Record<string, unknown>;
  title: string | null;
  busy: boolean;
  scanBusy: boolean;
  dirty: boolean;
  unknown: boolean;
  recorded: boolean;
  outcome: string | null;
  pending: FrozenRequest | null;
  request: FrozenRequest | null;
  receipt: (P03Receipt & { committed_at: string }) | null;
  serverDraft?: P03Draft;
  message: string;
  error: {
    code: string;
    message: string;
    status?: number;
    unknown?: boolean;
  } | null;
  context: Context | null;
  current: CurrentDocument | null;
  retry?: 'NONE' | 'SAME_REQUEST_ONLY';
  sentAt?: string;
  sources: {
    items: Source[];
    meta: PageMeta | null;
    q: string;
    loading: boolean;
    error: { code: string; message: string } | null;
  };
}
export interface P05Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Service {
  live?: boolean;
  fixture: false;
  baseUrl: string;
  now: () => number;
  context(): Promise<Context>;
  sources(input?: {
    q?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ items: Source[]; meta: PageMeta }>;
  source(id: string): Promise<Source>;
  resolve(
    raw: string,
    binding?: import('./p05-owner-checks').P05ResolverBinding,
  ): Promise<Record<string, unknown>>;
  execute(request: FrozenRequest): Promise<ResponseData>;
  reconcile(request: FrozenRequest): Promise<Envelope>;
  draft(id: string, scan: string): Promise<P03Draft>;
  current(id: string): Promise<CurrentDocument>;
}
export interface Flow {
  exceptionScope(): string | null;
  dismissRejected(eventId: string, expectedScope: string): boolean;
  readRejectedDocument(
    eventId: string,
    expectedScope: string,
    documentId: string,
  ): Promise<boolean>;
  setViewState(patch: NativeView): void;
  snapshot(): Snapshot;
  initialize(): Promise<boolean>;
  searchSources(q?: string, page?: number): Promise<boolean>;
  selectSource(id: string, options?: { replace?: boolean }): Promise<boolean>;
  save(): Promise<boolean>;
  check(): Promise<boolean>;
  reconcileResolverCheck(): Promise<boolean>;
  cancel(): Promise<boolean>;
  discardServer(fingerprint: string): Promise<boolean>;
  refreshSource(): Promise<boolean>;
  readDraft(): Promise<boolean>;
  refreshCurrent(): Promise<boolean>;
  canRecord(): boolean;
  fieldErrors(): Record<string, string>;
  start(
    context?: { documentId?: string },
    options?: { newAttempt?: boolean },
  ): boolean;
  send(): Promise<boolean>;
  retrySame(): Promise<boolean> | false;
  next(): boolean;
  back(): boolean;
  bindScan(
    source?: string,
  ): (
    raw: string,
    time?: string,
  ) => Promise<'valid' | 'invalid' | 'duplicate' | false> | false;
  hasUnfinishedWork(): boolean;
  leave(): void;
  message(text: string): void;
  dispose(): void;
}
export interface FlowOptions {
  readRelated?: typeof import('../../../services/wms/queries').fetchOutboundDocument;
  admission?: import('./p05-owner-checks').P05ResolverAdmission;
  adapter: Service;
  getScope: () => P03Scope;
  storage: P05Storage;
  onChange?: (s: Snapshot) => void;
  uuid: () => string;
}
