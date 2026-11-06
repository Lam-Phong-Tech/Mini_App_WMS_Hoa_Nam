// Offline contract fixtures only; never bundled or used as live evidence.
import type { ApiResponse, RequestOptions } from '../../src/api/client';
import {
  createP09Service,
  type P09Case,
  type P09Context,
  type P09Receipt,
} from '../../src/services/wms/p09Warranty';
export const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const context = (): P09Context => ({
  session: {
    accessToken: 'offline-token',
    userId: id(1),
    authSessionId: id(2),
    activeWarehouseId: id(3),
  },
  user: {
    id: id(1),
    auth_session_id: id(2),
    active_warehouse_id: id(3),
    warehouse_context: { status: 'READY' },
    available_warehouses: [{ warehouse_id: id(3), status: 'ACTIVE' }],
    permissions: [
      'warranty.view',
      'warranty.manage',
      'documents.read',
      'warranty.component_issue',
      'warranty.pii.view',
    ],
  },
});
export const caseRow = (n = 4): P09Case => ({
  warranty_case_id: id(n),
  version: 2,
  status: 'RECEIVED',
  customer_name: 'Offline',
  customer_phone: '0100000000',
  description: 'Test',
});
export const fields = {
  customer_name: 'A',
  customer_phone: '0100000000',
  description: 'Offline request',
};
export const resolved = {
  resolved: true,
  sku_id: id(6),
  serial_number: 'SER-000123',
  stock_effect: 'NONE',
  movement_created: false,
  wms_case_created: false,
  item_id: id(5),
  eligible_for_warranty: true,
  eligibility_code: 'ELIGIBLE',
  active_warranty_exists: false,
};
export const pageMeta = {
  total: 40,
  hasMore: false,
  nextCursor: null,
  nextPage: null,
  pagination: 'KEYSET',
};
export function envelope(data: unknown, meta: Record<string, unknown> = {}) {
  return {
    success: true,
    data,
    meta: { contract: 'mini-app-p09-v1', warehouse_id: id(3), ...meta },
  };
}
export function receipt(
  state: P09Receipt['state'] = 'SUCCEEDED',
  extra: Record<string, unknown> = {},
) {
  return {
    request_id: id(20),
    state,
    operation: 'CREATE',
    warranty_case_id: id(4),
    version: 2,
    status: 'RECEIVED',
    may_create_new_request: false,
    stock_effect: 'NONE',
    ...extra,
  };
}
export function harness(
  reply: (o: RequestOptions) => unknown | Promise<unknown> = () =>
    envelope(caseRow()),
) {
  let ctx = context(),
    counter = 19;
  const calls: RequestOptions[] = [];
  const client = {
    async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
      calls.push(options);
      return {
        status: 200,
        data: (await reply(options)) as T,
        header: () => undefined,
      };
    },
  };
  const service = createP09Service(() => ctx, {
    client,
    assertConnected: () => {},
    newId: () => id(++counter),
  });
  return {
    service,
    calls,
    context: () => ctx,
    setContext: (value: P09Context) => {
      ctx = value;
    },
  };
}
export function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
