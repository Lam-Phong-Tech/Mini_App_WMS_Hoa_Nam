import type { Session } from '../auth/session';
import {
  createP04Service,
  type P04Body,
  type P04Item,
  type P04Row,
  type P04Service,
} from '../services/wms/p04Inbound';
import type { RequestOptions } from '../api/client';
import type { P03Client, P03Identity } from '../services/wms/p03Drafts';
import { AppError } from '../errors/AppError';

/**
 * Deterministic local-only P04 service for the visual/E2E review page.
 * It intentionally has no fetch, token, MMKV, or DEV write path.
 */
export const P04_REVIEW_SESSION: Session = {
  accessToken: 'local-review-token',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  activeWarehouseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userName: 'Nguyễn Văn Test',
};

const warehouse = P04_REVIEW_SESSION.activeWarehouseId!;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type P04ReviewScenario =
  | 'normal'
  | 'context-error'
  | 'warehouse-inactive'
  | 'denied'
  | 'context-required'
  | 'revalidation'
  | 'record-reject'
  | 'record-timeout'
  | 'save-timeout'
  | 'record-not-sent'
  | 'supplier-empty'
  | 'supplier-error';
export function createP04ReviewService(
  options: { scenario?: P04ReviewScenario; calls?: RequestOptions[] } = {},
): P04Service {
  const scenario = options.scenario ?? 'normal';
  let version = 0;
  let sequence = 0;
  let failedOnce = false;
  let status: 'DRAFT' | 'RECORDED' | 'CANCELLED' = 'DRAFT';
  let saved: P04Body | undefined;
  let documentId = '';

  const receipt = (key: string, command: 'SAVE' | 'RECORD' | 'CANCEL') => ({
    request_id: key,
    document_id: documentId,
    scan_session_id: saved?.scan_session_id ?? '',
    warehouse_id: warehouse,
    operation: 'INBOUND' as const,
    command,
    version,
    outcome: 'SUCCEEDED' as const,
    committed_at: '2026-10-13T03:25:00Z',
  });

  const draft = () => ({
    document_id: documentId,
    document_kind: 'STAGING_DRAFT' as const,
    actor_id: P04_REVIEW_SESSION.userId!,
    auth_session_id: P04_REVIEW_SESSION.authSessionId!,
    warehouse_id: warehouse,
    operation: 'INBOUND' as const,
    scan_session_id: saved?.scan_session_id ?? '',
    version,
    status,
    codes: (saved?.items ?? []).map(item => ({
      raw_code: item.raw_code,
      quantity: item.quantity,
      scan_source: item.scan_source,
    })),
    form: {
      p04_contract: 'mini-app-p04-v1',
      metadata: { inbound_type: 'receipt' },
    },
    codes_validated: false as const,
    business_document_id:
      status === 'RECORDED'
        ? `dddddddd-dddd-4ddd-8ddd-${String(sequence).padStart(12, '0')}`
        : null,
    business_status: status === 'RECORDED' ? 'SCANNING' : null,
    last_request_id: null,
    stock_effect: 'NONE' as const,
    metadata: {
      inbound_type: 'receipt' as const,
      inbound_category: saved?.inbound_category,
      supplier_id: saved?.supplier_id ?? null,
      name: saved?.name ?? '',
      note: saved?.note ?? '',
    },
    items: saved?.items ?? [],
    document_no:
      version > 0 ? `PN-20261013-${String(sequence).padStart(4, '0')}` : null,
    scan_session: {
      status: status === 'DRAFT' ? ('OPEN' as const) : ('CLOSED' as const),
      document_version: version,
      expires_at: null,
      expiry_policy: 'AUTH_SESSION' as const,
    },
    created_at: '2026-10-13T03:20:00Z',
    updated_at: '2026-10-13T03:25:00Z',
  });

  const acceptedRow = (item: P04Item, rowNo: number): P04Row => ({
    row_no: rowNo + 1,
    raw_code: item.raw_code,
    outcome: 'ACCEPTED',
    reason_code: null,
    quantity: item.quantity,
    resolved: {
      item_type: item.raw_code.startsWith('BOX-') ? 'BOX' : 'ITEM',
      sku_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      sku_code: item.raw_code.startsWith('NEW-')
        ? 'LOCAL-NEW-SKU'
        : 'DCJZ2090i',
      sku_name: 'Sản phẩm kiểm thử local',
      sku_type: item.new_sku_type ?? 'PRODUCT',
      item_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      item_unique: item.raw_code,
      serial_number: item.raw_code,
      box_number: item.raw_code.startsWith('BOX-') ? '001' : null,
      requires_quantity: item.raw_code.startsWith('BOX-'),
      requires_new_sku_type: item.raw_code.startsWith('NEW-'),
      is_serial_tracked: true,
      warehouse_id: warehouse,
      stock_effect: 'NONE',
    },
  });

  const memory: P04Service = {
    live: false,
    async context() {
      if (scenario === 'context-error')
        throw new AppError({
          kind: 'network',
          message: 'Local: không tải được ngữ cảnh kho.',
        });
      return {
        actor_id: P04_REVIEW_SESSION.userId!,
        auth_session_id: P04_REVIEW_SESSION.authSessionId!,
        active_warehouse_id: warehouse,
        warehouse_context: {
          status: scenario === 'context-required' ? 'REQUIRED' : 'READY',
        },
        warehouse_status:
          scenario === 'warehouse-inactive' ? 'INACTIVE' : 'ACTIVE',
        inbound_supported: true,
        permissions: {
          read: scenario !== 'denied',
          save: scenario !== 'denied',
          cancel: scenario !== 'denied',
          record: scenario !== 'denied',
        },
        available_warehouses: [
          {
            warehouse_id: warehouse,
            name: 'Kho Hoa Nam',
            code: 'KHO-TONG-HN',
            status: 'ACTIVE',
          },
        ],
        ui_metadata_extension: 'p04-ui-options-v1',
        inbound_categories: [
          { id: 'PRODUCT', label: 'Nhập sản phẩm' },
          { id: 'COMPONENT', label: 'Nhập linh kiện' },
          { id: 'OTHER', label: 'Khác' },
        ],
        document_number_assignment: 'WITH_DRAFT_SAVE' as const,
      };
    },
    async types() {
      return [
        {
          id: 'receipt' as const,
          code: 'receipt' as const,
          label: 'Nhập kho',
          allowed: true,
        },
      ];
    },
    async save(_scope, identity, body, key, expectedVersion) {
      if (documentId !== identity.documentId) {
        version = 0;
        status = 'DRAFT';
        sequence += 1;
      }
      documentId = identity.documentId;
      if (expectedVersion !== version)
        throw new Error('local version mismatch');
      saved = copy(body);
      version += 1;
      return { document: draft(), receipt: receipt(key, 'SAVE') };
    },
    async detail() {
      return draft();
    },
    async scanSession(_scope, identity, currentVersion) {
      return {
        document_id: identity.documentId,
        scan_session_id: identity.scanSessionId,
        auth_session_id: P04_REVIEW_SESSION.authSessionId!,
        warehouse_id: warehouse,
        status: 'OPEN' as const,
        document_version: currentVersion,
        expires_at: null,
        expiry_policy: 'AUTH_SESSION' as const,
      };
    },
    async validate(_scope, _identity, _version, _event, item) {
      const existing = (saved?.items ?? []).some(
        i => i.raw_code.toUpperCase() === item.raw_code.toUpperCase(),
      );
      if (item.raw_code === 'BAD' || item.raw_code.includes('INACTIVE'))
        return {
          row_no: 1,
          raw_code: item.raw_code,
          outcome: 'REJECTED',
          reason_code:
            item.raw_code === 'BAD' ? 'CODE_REJECTED' : 'SKU_INACTIVE',
          message: 'Mã không hợp lệ cho nhập kho.',
          quantity: 1,
        };
      const result = acceptedRow(item, saved?.items.length ?? 0);
      if (item.raw_code.startsWith('NEW-') && !item.new_sku_type)
        return {
          ...result,
          outcome: 'REJECTED',
          reason_code: 'NEW_SKU_TYPE_REQUIRED',
        };
      return existing
        ? {
            row_no: 1,
            raw_code: item.raw_code,
            outcome: 'DUPLICATE' as const,
            reason_code: 'DUPLICATE_ITEM_IN_BATCH',
            message: 'Mã đã có trong phiếu. Không cộng thêm số lượng.',
            quantity: item.quantity,
          }
        : result;
    },
    async review() {
      const items = (saved?.items ?? []).map((item, i) =>
        scenario === 'revalidation'
          ? {
              ...acceptedRow(item, i),
              outcome: 'REJECTED' as const,
              reason_code: 'SKU_INACTIVE',
            }
          : acceptedRow(item, i),
      );
      return {
        document: draft(),
        metadata: draft().metadata,
        items,
        sku_summary: [
          {
            sku_code: 'DCJZ2090i',
            sku_name: 'Sản phẩm kiểm thử local',
            quantity: items.reduce((n, row) => n + (row.quantity ?? 0), 0),
          },
        ],
        can_record:
          items.length > 0 && items.every(row => row.outcome === 'ACCEPTED'),
        revalidated_at: '2026-10-13T03:25:00Z',
        stock_effect: 'NONE' as const,
      };
    },
    async record(_scope, identity, currentVersion, key) {
      if (currentVersion !== version) throw new Error('local version mismatch');
      status = 'RECORDED';
      version += 1;
      const data = {
        document_id: `dddddddd-dddd-4ddd-8ddd-${String(sequence).padStart(
          12,
          '0',
        )}`,
        doc_no: draft().document_no!,
        record_status: 'RECORDED' as const,
        posted: false as const,
        status: 'SCANNING',
        draft_id: identity.documentId,
        stock_effect: 'NONE' as const,
      };
      return {
        data,
        draft: draft(),
        receipt: receipt(key, 'RECORD'),
        sentAt: '2026-10-13T03:25:00Z',
      };
    },
    async reconcile() {
      return {
        outcome: 'UNKNOWN' as const,
        state: 'UNKNOWN',
        retry: 'SAME_REQUEST_ONLY' as const,
        new_document_allowed: false,
        cancel_allowed: false,
      };
    },
    async cancel(_scope, _id, _version, key) {
      status = 'CANCELLED';
      version += 1;
      return { document: draft(), receipt: receipt(key, 'CANCEL') };
    },
    async document(_scope, id) {
      return {
        document: { id, dst_warehouse_id: warehouse },
        status: 'SCANNING',
        posted: false,
        history: [],
      };
    },
  };
  const scope = {
    actorId: P04_REVIEW_SESSION.userId!,
    authSessionId: P04_REVIEW_SESSION.authSessionId!,
    warehouseId: warehouse,
  };
  const envelopes = new Map<
    string,
    { success: true; data: unknown; meta: Record<string, unknown> }
  >();
  const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({
    success: true as const,
    data,
    meta: { contract: 'mini-app-p04-v1', ...meta },
  });
  // Transport fixture exercises the production response parsers and request bodies.
  const client = {
    async request(request: RequestOptions) {
      options.calls?.push(copy(request));
      const path = request.path;
      const body = request.body as P04Body & {
        item: P04Item;
        client_event_id: string;
        confirmed_request_id: string;
        reason: string;
      };
      const id: P03Identity = {
        documentId: path.split('/drafts/')[1]?.split('/')[0] ?? '',
        scanSessionId: body?.scan_session_id ?? saved?.scan_session_id ?? '',
      };
      const expectedVersion = Number(
        request.headers?.['If-Match']?.replaceAll('"', '') ?? version,
      );
      const key = request.headers?.['Idempotency-Key'] ?? '';
      if (path.endsWith('/context'))
        return { status: 200, data: envelope(await memory.context(scope)) };
      if (path.endsWith('/types'))
        return { status: 200, data: envelope(await memory.types(scope)) };
      if (path.includes('/requests/')) {
        const original = envelopes.get(path.split('/').at(-1)!);
        const originalData = original?.data as
          | { receipt?: unknown }
          | undefined;
        const recordMeta = original?.meta.p03_draft as
          | { receipt?: unknown }
          | undefined;
        const identity = {
          request_id: path.split('/').at(-1),
          document_id: id.documentId,
          scan_session_id: request.query?.scan_session_id,
          warehouse_id: scope.warehouseId,
          operation: 'INBOUND',
          command: request.query?.command,
        };
        return {
          status: 200,
          data: envelope(
            original
              ? {
                  ...identity,
                  outcome: 'SUCCEEDED',
                  state: status,
                  document: draft(),
                  receipt: originalData?.receipt ?? recordMeta?.receipt,
                  response: original,
                  retry: 'NONE',
                  new_document_allowed: false,
                  cancel_allowed: false,
                }
              : {
                  ...identity,
                  outcome: 'UNKNOWN',
                  state: 'UNKNOWN',
                  receipt: null,
                  response: null,
                  retry: 'SAME_REQUEST_ONLY',
                  new_document_allowed: false,
                  cancel_allowed: false,
                },
          ),
        };
      }
      if (envelopes.has(key))
        return {
          status: path.endsWith('/record')
            ? 201
            : expectedVersion === 0
            ? 201
            : 200,
          data: envelopes.get(key),
        };
      if (request.method === 'PUT') {
        const response = envelope(
          await memory.save(scope, id, body, key, expectedVersion),
        );
        envelopes.set(key, response);
        if (scenario === 'save-timeout' && body.items.length && !failedOnce) {
          failedOnce = true;
          throw new AppError({
            kind: 'timeout',
            message: 'Local: mất phản hồi SAVE sau khi lưu.',
          });
        }
        return { status: expectedVersion === 0 ? 201 : 200, data: response };
      }
      if (path.endsWith('/scan-session'))
        return {
          status: 200,
          data: envelope(await memory.scanSession(scope, id, expectedVersion)),
        };
      if (path.endsWith('/validate-code'))
        return {
          status: 200,
          data: envelope({
            document_id: id.documentId,
            scan_session_id: id.scanSessionId,
            version,
            client_event_id: body.client_event_id,
            result: await memory.validate(
              scope,
              id,
              expectedVersion,
              body.client_event_id,
              body.item,
            ),
            event_persisted: false,
            stock_effect: 'NONE',
          }),
        };
      if (path.endsWith('/review'))
        return {
          status: 200,
          data: envelope({
            ...(await memory.review(scope, id, expectedVersion)),
            revalidation_policy: 'AGAIN_AT_RECORD',
            scan_evidence_created: false,
          }),
        };
      if (path.endsWith('/record')) {
        if (scenario === 'record-reject' && !failedOnce) {
          failedOnce = true;
          throw new AppError({
            kind: 'http',
            status: 422,
            code: 'P04_REVALIDATION_FAILED',
            message: 'Local: Web từ chối phiếu; dữ liệu được giữ.',
          });
        }
        if (scenario === 'record-not-sent' && !failedOnce) {
          failedOnce = true;
          throw new AppError({
            kind: 'timeout',
            message: 'Local: chưa nhận được kết quả RECORD.',
          });
        }
        const result = await memory.record(scope, id, expectedVersion, key);
        const response = envelope(result.data, {
          p03_draft: {
            document: result.draft,
            receipt: { ...result.receipt, committed_at: result.sentAt },
          },
        });
        envelopes.set(key, response);
        if (scenario === 'record-timeout' && !failedOnce) {
          failedOnce = true;
          throw new AppError({
            kind: 'timeout',
            message: 'Local: mất phản hồi RECORD sau khi ghi nhận.',
          });
        }
        return { status: 201, data: response };
      }
      if (path.endsWith('/cancel'))
        return {
          status: 200,
          data: envelope(
            await memory.cancel(
              scope,
              id,
              expectedVersion,
              key,
              body.confirmed_request_id,
              body.reason,
            ),
          ),
        };
      if (path.includes('/documents/'))
        return {
          status: 200,
          data: envelope(await memory.document(scope, path.split('/').at(-1)!)),
        };
      if (path.includes('/drafts/'))
        return {
          status: 200,
          data: envelope({ document: await memory.detail(scope, id) }),
        };
      throw new Error('Unexpected local P04 route: ' + path);
    },
  } as P03Client;
  return createP04Service(client, () => P04_REVIEW_SESSION);
}
