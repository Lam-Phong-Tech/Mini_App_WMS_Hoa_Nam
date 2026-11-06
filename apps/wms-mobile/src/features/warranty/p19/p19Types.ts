export interface P19Scope {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
  actorStatus: 'ACTIVE';
  warehouseStatus: 'ACTIVE';
  warehouseConfirmed: true;
  permissions: string[];
}
export interface P19Descriptor {
  path: string;
  method: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  live: false;
  credentials: 'OMITTED_OFFLINE';
}
export type P19OfflineRequest = (
  descriptor: P19Descriptor,
) => Promise<{ status: number; body: unknown; etag?: string }>;
export type P19LiveRequest = (
  descriptor: Omit<P19Descriptor, 'live' | 'credentials'> & {
    live: true;
    credentials: 'NATIVE_AUTH_CLIENT';
  },
) => Promise<{ status: number; body: unknown; etag?: string }>;
export interface P19Row {
  code: string;
  kind: 'UNIT' | 'BOX';
  sku: string;
  name: string;
  quantity: number;
  available: number | null;
}
/** Navigation only; all three IDs originate from the strict POSTED result. */
export interface P19VerifiedResult {
  caseId: string;
  businessDocumentId: string;
  requestId: string;
}
export interface P19View {
  caseId?: string;
  document: { documentId: string | null; version: number };
  scanSessionId: string | null;
  scope: P19Scope | null;
  lines: P19Row[];
  counts: { codes: number; quantity: number };
  pending: (P19Row & { limit: number }) | null;
  dirty: boolean;
  canPost: boolean;
  busy: boolean;
  unknown: boolean;
  request: { id: string; version: number; command: 'SAVE' | 'RECORD' } | null;
  receipt: {
    id: string;
    documentNo: string;
    status: 'POSTED';
    caseId: string;
    requestId: string;
    postedAt: string;
    quantity: number;
    version: number;
  } | null;
  error: { code: string; message: string } | null;
}
export interface P19Owner {
  snapshot(): {
    phase: string;
    dirty: boolean;
    unknown: boolean;
    busy: boolean;
    result: unknown;
    pending: unknown;
    [key: string]: unknown;
  };
  initialize(caseId: string): Promise<boolean>;
  checkpoint(): unknown;
  leave(): void;
  dispose(): void;
  resume(): Promise<boolean>;
  revalidate(): Promise<boolean>;
  readCurrent(): Promise<boolean>;
  metadata(patch: { note?: string; document_date?: string | null }): boolean;
  logoutEvidence(): unknown;
}
export interface P19Flow {
  scan(
    raw: string,
    source?: 'CAMERA' | 'SCANNER' | 'HARDWARE' | 'MANUAL',
  ): Promise<{ kind: string; error?: string }>;
  editQuantity(raw: string): { kind: string; error?: string };
  quantity(value: string | number): { kind: string; error?: string };
  quantityError(value: string | number): string;
  cancelQuantity(): void;
  remove(raw: string): { kind: string; error?: string };
  prepareReview(): Promise<boolean>;
  post(): Promise<{ kind: string; error?: string }>;
  reconcile(): Promise<{ kind: string; error?: string }>;
}
