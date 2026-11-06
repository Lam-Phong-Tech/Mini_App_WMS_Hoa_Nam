import type { Session } from '../../auth/session';
import type { CurrentUser } from './types';

export const P08_SOURCES = ['DOCUMENT', 'WARRANTY', 'NFC', 'SCAN'] as const;
export const P08_BUSINESSES = [
  'INBOUND',
  'OUTBOUND',
  'WARRANTY',
  'NFC',
  'SCAN',
  'OTHER',
] as const;
export type P08Source = (typeof P08_SOURCES)[number];
export type P08Business = (typeof P08_BUSINESSES)[number];
export type P08Date =
  | { date_mode: 'ALL'; date?: never; from?: never; to?: never }
  | { date_mode: 'DATE'; date: string; from?: never; to?: never }
  | { date_mode: 'RANGE'; from: string; to: string; date?: never };
export type P08Filters = P08Date & {
  source?: P08Source | 'ALL';
  business?: P08Business | 'ALL';
  status?: string;
  keyword?: string;
};
export interface P08Paging {
  limit?: number;
  cursor?: string;
}
export interface P08Context {
  session: Session | undefined;
  user: CurrentUser | undefined;
}
export interface P08Scope {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
  permissions: readonly string[];
}
export interface P08Capability {
  canOpen: boolean;
  url: string | null;
}
export interface P08Event {
  activityId: string;
  recordId: string;
  eventId: string;
  source: P08Source;
  sourceTable: string;
  business: P08Business;
  status: string | null;
  action: string | null;
  label: string | null;
  time: string | null;
  timeStatus: 'NOT_RECORDED' | 'SOURCE_TIMESTAMP';
  codeId: string | null;
  rawCode: null;
  quantity: null;
  rawCodePolicy: 'OMITTED_MAY_CONTAIN_PII_OR_SECRETS';
  detail: P08Capability & { ownerPermissionRechecked: true };
  attachments: P08Capability & {
    policy: 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL';
  };
  isConfirmationReceipt: false;
}
export type P08SourceState =
  | 'INCLUDED'
  | 'FORBIDDEN'
  | 'NOT_REQUESTED'
  | 'UNAVAILABLE'
  | 'PARTIAL';
export interface P08Meta {
  record_target_contract?: 'p08-record-target-v1';
  contract: 'mini-app-p08-v1';
  warehouseId: string;
  timezone: string;
  countUnit: 'ACTIVITY';
  historyExportAvailable: false;
  sources: Record<
    P08Source,
    { status: P08SourceState; adapters?: Record<string, string> }
  >;
  dateMode: 'ALL' | 'DATE' | 'RANGE';
  total: number;
  request_id: string | null;
  timestamp: string;
  asOf: string;
  snapshot: Record<string, unknown>;
  organizationScope: Record<string, string>;
  tenantIsolation:
    | 'SINGLE_TENANT_DATABASE_REQUIRED'
    | 'TRUSTED_ACTOR_AND_WAREHOUSE_COLUMNS';
  scopePolicy: 'PERSISTED_OWNER_WAREHOUSE_BEFORE_DEDUP_AND_TOTAL';
  coveragePolicy: 'ONLY_PERSISTED_SCOPED_EVENTS_NOT_ALL_BUSINESS_RECORDS';
  nfcLegacyPolicy: 'EXCLUDED_WHEN_ASSIGNMENT_WAREHOUSE_NOT_RECORDED';
  paginationConsistency: 'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT';
}
export interface P08PageMeta extends P08Meta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}
export interface P08Response<T, M = P08PageMeta> {
  data: T;
  meta: M;
}
export interface P08Detail {
  recordTarget?: import('./p08RecordTarget').P08RecordTarget;
  recordId: string;
  selectedActivity: P08Event | null;
  events: P08Event[];
}
export interface P08Batch {
  sessionId: string;
  sessionType: 'SCAN_BATCH';
  sourceTables: string[];
  total: number;
  accepted: number;
  duplicate: number;
  other: number;
  statusTotals: Record<string, number>;
  quantity: null;
  quantityStatus: 'NOT_RECORDED_IN_SCAN_EVIDENCE';
  acceptedStatusValues: ['ACCEPTED'];
  duplicateStatusValues: ['DUPLICATE'];
  events: P08Event[];
}
export interface P08Summary {
  grandTotal: number | null;
  availableTotal: number;
  countUnit: 'ACTIVITY';
  groups: { business: P08Business; availableTotal: number }[];
  statusTotals: { source: P08Source; status: string | null; total: number }[];
  coverage: 'COMPLETE_FOR_AUTHORIZED_SUPPORTED_SCOPE' | 'PARTIAL';
  quantity: null;
  quantityStatus: 'NOT_AN_ACTIVITY_COUNT';
}
export interface P08HistoryService {
  scopeKey(): string;
  records(
    filters: P08Filters,
    paging?: P08Paging,
    signal?: AbortSignal,
  ): Promise<P08Response<P08Event[]>>;
  detail(
    recordId: string,
    activityId?: string,
    paging?: P08Paging,
    signal?: AbortSignal,
  ): Promise<P08Response<P08Detail>>;
  session(
    batchId: string,
    paging?: P08Paging,
    signal?: AbortSignal,
  ): Promise<P08Response<P08Batch>>;
  summary(
    filters: P08Filters,
    signal?: AbortSignal,
  ): Promise<P08Response<P08Summary, P08Meta>>;
}
