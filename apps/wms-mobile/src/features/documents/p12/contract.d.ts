export type Raw = Record<string, unknown>;
import type { DocumentTimestamp } from '../../../services/wms/documentTimestamps';
import type {QueueProjection} from '../../../services/wms/p13QueueProjection';
import type {PartnerSnapshot} from './partnerSnapshot';
import type {PersistedWebHandoff} from '../../../services/wms/persistedWebHandoff';
import type {OwnerProjection} from './ownerProjection';
export type Source = 'inbound' | 'outbound' | 'warranty';
export type Query = Record<string, string | number | boolean>;
export interface Scope {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
  rights: string[];
  generation: number;
}
export interface Target {
  method: 'GET';
  path: string;
  query: Query;
}
export interface Milestone {
  availability:
    | 'RECORDED'
    | 'NOT_RECORDED'
    | 'SOURCE_MAPPING_PENDING'
    | 'NOT_APPLICABLE';
  occurred_at: string | null;
  timestamp_source: string | null;
  event_id: null;
}
export interface Projection {
  event_evidence?: Raw;
  identity: {
    source: string;
    resource_type: string;
    id: string;
    warehouse_id: string | null;
  };
  read_target: Target;
  status: {
    canonical: string | null;
    mini_app: string | null;
    readiness: Raw;
    waiting_for_web: null;
  };
  timeline?: {
    contract?: 'p12-timeline-handoff-v1';
    coverage: 'PARTIAL';
    is_workflow_state: false;
    milestones: Record<string, Milestone>;
  } | null;
  timelineError?: { code: string; message: string };
}
export interface Document {
  partnerSnapshot?:PartnerSnapshot;
  webHandoff?:PersistedWebHandoff;
  queueProjection?:QueueProjection;
  ownerProjection?:OwnerProjection|null;
  ownerProjectionIssue?:'NOT_PROVIDED'|'UNVERIFIED'|'INVALID'|null;
  type: Source;
  id: string;
  number?: string | null;
  warehouseId: string | null;
  rawStatus?: string;
  /** Validated by mixed parser; never inferred from readiness or a receipt. */
  displayStatus?: {
    availability: 'MAPPED' | 'PENDING_BA_MAPPING' | 'STALE' | 'UNAVAILABLE';
    label: string | null;
    value: string | null;
  };
  createdAt?: string | null;
  createdTimestamp?: DocumentTimestamp;
  rowKey?: string;
  note?: string | null;
  p12: Projection;
  source: Raw;
  meta?: Raw;
}
export interface Paging {
  total: number;
  page: number | null;
  perPage: number;
  lastPage?: number;
  hasMore?: boolean;
  nextPage?: number | null;
  nextCursor?: string | null;
  mode?: 'OFFSET' | 'KEYSET';
  snapshotConsistent: false;
}
export interface Page<T> {
  items: T[];
  paging: Paging;
  meta: Raw;
  summary?: Summary;
  refreshRequired?: boolean;
}
export interface Scan extends Raw {
  id: string;
  document_id: string;
  quantity: number | null;
  unit: string | null;
  sku_name?: string | null;
  sku_code?: string | null;
  raw_code: string | null;
  serial_number: string | null;
  candidate_serial_number?: string | null;
}
export interface File extends Raw {
  id?: string;
  attachment_id?: string;
  document_id?: string;
  document_type?: string;
  warranty_case_id?: string;
  file_name: string | null;
  content_type: string;
  file_size_bytes: number | null;
  status: string;
  can_download?: boolean;
  download_url?: string | null;
}
export interface Summary {
  entry_count: number;
  sku_count: number;
  item_count: number;
  resolved_serial_count: number;
  quantity_total: number | null;
  quantity_by_unit: {
    unit: string | null;
    quantity: number | null;
    known_quantity: number | null;
    entry_count: number | null;
    missing_quantity_count: number | null;
  }[];
  quantity_complete: boolean | null;
  unit_complete: boolean | null;
  missing_quantity_count: number | null;
  unknown_unit_entry_count: number | null;
  mixed_units: boolean | null;
  coverage: 'CURRENT_QUERY' | 'LEGACY_CACHE_PENDING_REFRESH';
}
export interface Receipt {
  requestId: string;
  receipt: Raw;
  source: Raw;
  p12: Raw;
  readTarget: Target | null;
  caseId: string | null;
}
export const P12_RELEASE: {
  commit: string;
  contract: string;
  scanContract: string;
  fullActivation: false;
};
export class P12ReadError extends Error {
  code: string;
  status: number | null;
}
export function requireValue(
  ok: unknown,
  code?: string,
  message?: string,
): asserts ok;
export function uuid(value: unknown): value is string;
export function sourcePath(type: Source, id?: string | null): string;
export function stockListQuery(type: Source, input?: Query): Query;
export function warrantyQuery(resource: string, input?: Query): Query;
export function evidenceQuery(input?: Query): Query;
export function attachmentQuery(input?: Query): Query;
export function supplierQuery(input?: Query): Query;
export function parseStockList(
  body: unknown,
  type: Source,
  query: Query,
  options?: { origin: string;rights?:string[] },
): Page<Document>;
export function parseStockDetail(
  body: unknown,
  type: Source,
  id: string,
  warehouse: string,
  options?: { origin: string; rights?:string[]; timelineContract?: 'p12-timeline-handoff-v1' },
): Document;
export function parseWarranty(
  body: unknown,
  resource: 'detail',
  id: string,
  scope: Scope,
  options?: { origin: string },
): Document;
export function parseWarranty(
  body: unknown,
  resource: 'list' | 'events' | 'attachments',
  id: string | null,
  scope: Scope,
  options?: { origin: string },
): Page<Raw>;
export function parseP12Metadata(meta: Raw, type: Source): Raw;
export function parseP12Record(
  row: Raw,
  type: Source,
  options?: { detail?: boolean; origin?: string; timelineContract?: 'p12-timeline-handoff-v1'; timelineDiscovery?: unknown },
): Projection;
export function parseScans(
  body: unknown,
  type: Source,
  id: string,
  query: Query,
): Page<Scan>;
export function parseAttachments(
  body: unknown,
  type: Source,
  id: string,
  query: Query,
): Page<File>;
export function parseSuppliers(body: unknown, query: Query): Page<Raw>;
export function parseWarrantyReceipt(
  body: unknown,
  id: string,
  scope: Scope,
  options?: { origin: string },
): Receipt;
export function validateReadTarget(
  target: Target,
  type: Source,
  id: string,
  warehouse: string | null,
  options?: { origin?: string; context?: Scope },
): Target;
export function stockHistory(document: Document): { items: Raw[] };
export function p04Seed(input: { supplierId: string | null; note: string; docDate?: string }): {
  supplierId: string | null;
  note: string;
  docDate?: string;
};
