/** ISOLATED MOCK ONLY. mini-app-p06-v1 verified at BE7d661813; no credentials/network. */
import type { Session } from '../auth/session';
import type { ApiResponse, RequestOptions } from '../api/client';
import type { ReadClient } from '../services/wms/readOnlyClient';
import { AppError } from '../errors/AppError';
import {
  createP06CatalogService,
  P06_BASE,
  type P06Card,
  type P06Context,
  type P06Event,
  type P06GalleryImage,
  type P06Stock,
} from '../services/wms/p06Catalog';
export const mockId = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const p06MockSession: Session = {
  accessToken: 'ISOLATED_MOCK_NOT_A_CREDENTIAL',
  userId: mockId(1),
  authSessionId: mockId(2),
  activeWarehouseId: mockId(3),
};
export const mockTime = '2026-10-08T02:15:00Z';
export type P06MockScenario =
  | 'ready'
  | 'empty'
  | 'forbidden'
  | 'unavailable'
  | 'incomplete'
  | 'mismatch'
  | 'warehouse-required'
  | 'warehouse-inactive'
  | 'limited-rights'
  | 'loading'
  | 'list-loading'
  | 'detail-loading'
  | 'stock-loading'
  | 'gallery-loading'
  | 'timeline-loading'
  | 'not-found'
  | 'auth-error'
  | 'schema-error'
  | 'stock-forbidden'
  | 'ledger-only'
  | 'warranty-only'
  | 'no-timeline'
  | 'timeline-empty'
  | 'long-content';
export function p06MockContext(): P06Context & Record<string, unknown> {
  return {
    actor_id: mockId(1),
    auth_session_id: mockId(2),
    active_warehouse_id: mockId(3),
    warehouse_context: { status: 'READY', error_code: null },
    available_warehouses: [
      {
        warehouse_id: mockId(3),
        code: 'MOCK-HN',
        name: 'Kho Hoa Nam (mock)',
        status: 'ACTIVE',
      },
    ],
    warehouse_status: 'ACTIVE',
    read_only: true,
    permissions: {
      skus: true,
      items: true,
      stock: true,
      ledger: true,
      warranty_view: true,
      warranty_manage: false,
      label_print_permission: true,
    },
    identity_types: ['SKU', 'ITEM'],
    sku_scope: 'GLOBAL_MASTER_WITH_SELECTED_WAREHOUSE_STOCK',
    item_scope:
      'SELECTED_WAREHOUSE_HISTORY_OR_PERMITTED_WARRANTY_NOT_CURRENT_LOCATION',
    tab_field: 'sku_type',
    tab_values: ['ALL', 'PRODUCT', 'COMPONENT'],
    location_breakdown: {
      supported: false,
      level: 'WAREHOUSE',
      reason: 'NO_LOCATION_BALANCE_MODEL',
    },
    label_print: {
      action_exposed: false,
      required_target_type: 'LABEL_SNAPSHOT',
      target_id: null,
    },
    address_contract: {
      format: 'TEXT',
      dataset_version: null,
      history_policy: 'PRESERVE_TEXT',
      owner: 'DEV_BA',
      decision: 'PENDING_DEV_BA',
    },
  };
}
export function p06MockCard(n = 0, type: 'SKU' | 'ITEM' = 'SKU'): P06Card {
  const names = [
    'Máy in nhiệt XP-420B',
    'Máy in nhiệt XP-420B (đen)',
    'Giấy in nhiệt 80mm',
    'Cáp nguồn XP-420B',
    'Bộ vệ sinh đầu in',
  ];
  return {
    card_type: type,
    sku_id: mockId(100 + n),
    sku_code:
      ['XP-420B', 'XP-420B-BK', 'PAPER-80', 'CABLE-01', 'CLEAN-01'][n % 5] +
      (n >= 5 ? `-${n}` : ''),
    sku_name: names[n % names.length],
    sku_type: n === 4 ? 'COMPONENT' : 'PRODUCT',
    sku_status: 'ACTIVE',
    unit: 'Cái',
    item_id: type === 'ITEM' ? mockId(200 + n) : null,
    item_code: type === 'ITEM' ? `HN${12345 + n}` : null,
    serial_number: type === 'ITEM' && n !== 0 ? `MOCK-SN-${n}` : null,
    item_status: type === 'ITEM' ? 'AVAILABLE' : null,
    item_condition: type === 'ITEM' ? 'NEW' : null,
    version: 2,
    updated_at: mockTime,
    current_location: null,
    current_location_status: 'NOT_ASSERTED',
  };
}
export function p06MockStock(
  sku = mockId(100),
  snapshot = mockId(900),
): P06Stock {
  return {
    sku_id: sku,
    warehouse_id: mockId(3),
    status: 'CONFIRMED',
    total_qty: 12,
    available_qty: 10,
    reserved_qty: 1,
    unavailable_qty: 1,
    ledger_total: 12,
    quantity_source: 'INVENTORY_BALANCE_PROJECTION',
    reservation_basis: 'BALANCE_RESERVED_QTY_NOT_LIVE_SCAN_MATCH_COUNT',
    version: 'a'.repeat(64),
    version_kind: 'CONTENT_FINGERPRINT',
    updated_at: mockTime,
    ledger_event_at: mockTime,
    snapshot_id: snapshot,
    observed_at: mockTime,
    location_level: 'WAREHOUSE',
    location_breakdown: null,
    location_breakdown_status: 'NOT_TRACKED',
    by_stock_status: [],
  };
}
export function p06MockImage(): P06GalleryImage {
  return {
    image_id: mockId(300),
    owner_type: 'SKU',
    full_url: 'https://images.example.invalid/product.png',
    thumbnail_url: null,
    thumbnail_status: 'NOT_GENERATED',
    order: 0,
    is_primary: true,
    alt_text: 'Ảnh nguồn mock, không được fetch',
    version: 1,
    updated_at: mockTime,
    access: 'UNKNOWN',
    expires_at: null,
    expiry_policy: 'UNKNOWN',
  };
}
export function p06MockEvents(): P06Event[] {
  return Array.from({ length: 25 }, (_, n) => {
    const warranty = n % 3 === 2;
    const source = warranty ? 'WARRANTY' : 'LEDGER',
      id = mockId(400 + n);
    return {
      event_id: `${source}:${id}`,
      source_event_id: id,
      source,
      occurred_at:
        n === 24
          ? null
          : new Date(Date.parse(mockTime) - n * 3600000).toISOString(),
      event_type: warranty ? 'RECEIVED' : n % 3 === 0 ? 'RECEIPT' : 'ISSUE',
      signed_quantity: warranty ? null : n % 3 === 0 ? 20 : -2.5,
      quantity_applicability: warranty ? 'NOT_APPLICABLE' : 'STOCK_DELTA',
      item_id: mockId(200),
      document: {
        id: mockId(500 + n),
        type: warranty ? 'WARRANTY_CASE' : n % 3 === 0 ? 'receipt' : 'issue',
        number: `MOCK-${n + 1}`,
        current_status: 'POSTED',
        can_open: true,
      },
      from_status: warranty ? 'NEW' : null,
      to_status: warranty ? 'RECEIVED' : null,
    };
  });
}
export interface P06MockCall {
  path: string;
  options?: Omit<RequestOptions, 'path' | 'method'>;
}
export function p06MockHarness(scenario: P06MockScenario = 'ready') {
  let session: Session | undefined = { ...p06MockSession },
    sequence = 900;
  const calls: P06MockCall[] = [],
    context = p06MockContext();
  if (scenario === 'warehouse-required' || scenario === 'warehouse-inactive') {
    context.active_warehouse_id = null;
    context.warehouse_status =
      scenario === 'warehouse-inactive' ? 'INACTIVE' : null;
    context.warehouse_context = {
      status: scenario === 'warehouse-inactive' ? 'UNAVAILABLE' : 'REQUIRED',
      error_code:
        scenario === 'warehouse-inactive'
          ? 'WAREHOUSE_INACTIVE'
          : 'WAREHOUSE_CONTEXT_REQUIRED',
    };
  }
  if (scenario === 'limited-rights')
    Object.assign(context.permissions, {
      items: false,
      stock: false,
      ledger: false,
      label_print_permission: false,
    });
  const cards = Array.from({ length: 24 }, (_, n) => p06MockCard(n)),
    items = cards.map((_, n) => p06MockCard(n, 'ITEM'));
  const events = p06MockEvents();
  if (scenario === 'stock-forbidden') context.permissions.stock = false;
  if (scenario === 'ledger-only') {
    context.permissions.warranty_view = false;
    context.permissions.warranty_manage = false;
  }
  if (scenario === 'warranty-only') context.permissions.ledger = false;
  if (scenario === 'no-timeline') {
    context.permissions.ledger = false;
    context.permissions.warranty_view = false;
    context.permissions.warranty_manage = false;
  }
  if (scenario === 'timeline-empty') events.splice(0);
  if (scenario === 'long-content') {
    cards[0].sku_name = 'Sản phẩm Tiếng Việt 日本語 🧰 '.repeat(20);
    cards[0].sku_code = 'SKU'.repeat(70);
    context.available_warehouses[0].name = 'Kho Hoa Nam '.repeat(30);
  }
  const client: ReadClient = {
    async get<T>(
      path: string,
      options?: Omit<RequestOptions, 'path' | 'method'>,
    ): Promise<ApiResponse<T>> {
      calls.push({ path, options });
      const scopedLoading =
        (scenario === 'list-loading' && /\/catalog\/skus$/.test(path)) ||
        (scenario === 'detail-loading' &&
          /\/catalog\/(skus|items)\/[a-f0-9-]{36}$/.test(path)) ||
        (scenario === 'stock-loading' && path.endsWith('/stock')) ||
        (scenario === 'gallery-loading' && path.endsWith('/gallery')) ||
        (scenario === 'timeline-loading' && path.endsWith('/timeline'));
      if (scenario === 'loading' || scopedLoading)
        await new Promise<void>((_done, reject) => {
          const stop = () =>
            reject(
              new AppError({
                kind: 'cancelled',
                message: 'Đã hủy mock loading.',
              }),
            );
          if (options?.signal?.aborted) stop();
          else options?.signal?.addEventListener('abort', stop, { once: true });
        });
      if (scenario === 'auth-error')
        throw new AppError({
          kind: 'auth',
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Phiên mock không còn hợp lệ.',
        });
      if (
        scenario === 'not-found' &&
        !path.endsWith('/context') &&
        /\/[a-f0-9-]{36}(?:\/|$)/.test(path)
      )
        throw new AppError({
          kind: 'http',
          status: 404,
          code: 'P06_RESOURCE_NOT_FOUND',
          message: 'Mock không có đối tượng trong scope.',
        });
      if (scenario === 'schema-error' && !path.endsWith('/context'))
        return {
          status: 200,
          data: {
            success: true,
            data: [],
            meta: { contract: 'WRONG_CONTRACT' },
          } as T,
        };
      if (scenario === 'unavailable')
        throw new AppError({
          kind: 'network',
          code: 'MOCK_OFFLINE',
          message: 'Mất kết nối trong kịch bản mock.',
        });
      const snapshot = {
        id: mockId(sequence++),
        observed_at: mockTime,
        consistency: 'SINGLE_RESPONSE_DATABASE_SNAPSHOT',
        cross_request_snapshot: false,
      };
      let data: unknown,
        extra: Record<string, unknown> = {};
      const q = options?.query ?? {},
        page = Number(q.page || 1),
        perPage = Number(q.per_page || 20);
      const stock = (id: string) => {
        const v = p06MockStock(id, snapshot.id);
        if (scenario === 'incomplete')
          Object.assign(v, {
            status: 'INCOMPLETE',
            total_qty: null,
            available_qty: null,
            reserved_qty: null,
            unavailable_qty: null,
          });
        if (scenario === 'mismatch') v.status = 'MISMATCH';
        if (id === mockId(104))
          Object.assign(v, {
            status: 'EMPTY',
            total_qty: 0,
            available_qty: 0,
            reserved_qty: 0,
            unavailable_qty: 0,
            ledger_total: 0,
          });
        return v;
      };
      if (scenario === 'forbidden')
        Object.assign(context.permissions, {
          skus: false,
          items: false,
          stock: false,
          ledger: false,
          warranty_view: false,
        });
      // Match the shared BE projection: dependent rights never outlive their base right.
      if (!context.permissions.skus) {
        context.permissions.items = false;
        context.permissions.stock = false;
      }
      if (context.permissions.warranty_manage)
        context.permissions.warranty_view = true;
      const route = path.slice(P06_BASE.length + 1).split('/'),
        isItem = route[0] === 'items';
      const listCard = (card: P06Card) => ({
        ...card,
        stock:
          card.card_type === 'ITEM' || !context.permissions.stock
            ? null
            : stock(card.sku_id),
        stock_availability:
          card.card_type === 'ITEM'
            ? 'USE_SKU_STOCK_ENDPOINT'
            : context.permissions.stock
            ? 'INCLUDED'
            : 'FORBIDDEN',
      });
      if (route[0] === 'context') data = context;
      else if (route.length === 1) {
        let all = scenario === 'empty' ? [] : [...(isItem ? items : cards)];
        if (q.keyword)
          all = all.filter(c =>
            `${c.sku_code} ${c.sku_name} ${
              isItem ? c.item_code + ' ' + c.serial_number : ''
            }`
              .toLocaleLowerCase()
              .includes(String(q.keyword).trim().toLocaleLowerCase()),
          );
        if (q.item_code || q.serial) {
          // Match persisted ITEM identities, then project related SKU cards.
          // Never populate nullable ITEM fields on SKU or count matching ITEMs.
          const matches = (isItem ? all : items).filter(
            c =>
              (!q.item_code ||
                c.item_code?.toLowerCase() ===
                  String(q.item_code).trim().toLowerCase()) &&
              (!q.serial ||
                c.serial_number?.toLowerCase() ===
                  String(q.serial).trim().toLowerCase()),
          );
          const matchedSkuIds = new Set(matches.map(c => c.sku_id));
          all = isItem ? matches : all.filter(c => matchedSkuIds.has(c.sku_id));
        }
        if (q.sku_id) all = all.filter(c => c.sku_id === q.sku_id);
        if (q.status && q.status !== 'ALL')
          all = all.filter(c => c.sku_status === q.status);
        const totals = {
          ALL: all.length,
          PRODUCT: all.filter(c => c.sku_type === 'PRODUCT').length,
          COMPONENT: all.filter(c => c.sku_type === 'COMPONENT').length,
        };
        const filtered =
          q.sku_type && q.sku_type !== 'ALL'
            ? all.filter(c => c.sku_type === q.sku_type)
            : all;
        data = filtered
          .slice((page - 1) * perPage, page * perPage)
          .map(listCard);
        extra = {
          warehouse_id: mockId(3),
          page,
          per_page: perPage,
          total: filtered.length,
          last_page: Math.max(1, Math.ceil(filtered.length / perPage)),
          tab_totals: totals,
          count_unit: isItem ? 'ITEM' : 'SKU',
          scope_policy: isItem
            ? 'WAREHOUSE_HISTORY_NOT_CURRENT_LOCATION'
            : 'GLOBAL_SKU_MASTER_SCOPED_STOCK',
        };
      } else {
        const card = (isItem ? items : cards).find(
          c => (isItem ? c.item_id : c.sku_id) === route[1],
        );
        if (!card)
          throw new AppError({
            kind: 'http',
            status: 404,
            code: 'P06_RESOURCE_NOT_FOUND',
            message: 'Mock: không có đối tượng.',
          });
        if (route[2] === 'stock') data = stock(card.sku_id);
        else if (route[2] === 'gallery') {
          data = [p06MockImage()];
          extra = { owner_type: 'SKU', sku_id: card.sku_id, total: 1 };
        } else if (route[2] === 'timeline') {
          const source = q.source || 'ALL',
            rights = {
              LEDGER: context.permissions.ledger,
              WARRANTY: context.permissions.warranty_view,
            };
          const sources = {
            LEDGER: !rights.LEDGER
              ? 'FORBIDDEN'
              : source === 'ALL' || source === 'LEDGER'
              ? 'INCLUDED'
              : 'NOT_REQUESTED',
            WARRANTY: !rights.WARRANTY
              ? 'FORBIDDEN'
              : source === 'ALL' || source === 'WARRANTY'
              ? 'INCLUDED'
              : 'NOT_REQUESTED',
          };
          const filtered = events
            .filter(e => sources[e.source] === 'INCLUDED')
            .map(e => ({
              ...e,
              item_id: context.permissions.items
                ? isItem
                  ? card.item_id
                  : e.item_id
                : null,
            }));
          data = filtered.slice((page - 1) * perPage, page * perPage);
          extra = {
            warehouse_id: mockId(3),
            page,
            per_page: perPage,
            total: filtered.length,
            last_page: Math.max(1, Math.ceil(filtered.length / perPage)),
            sources,
            linkage_policy: 'EXPLICIT_IDS_ONLY',
            unlinked_warranty_policy: 'EXCLUDED_NO_INFERRED_SKU_OR_ITEM',
            quantity_policy: 'LEDGER_QTY_DELTA_WARRANTY_NULL',
          };
        } else {
          const c = context.permissions;
          data = {
            card,
            ...{
              stock: listCard(card).stock,
              stock_availability: listCard(card).stock_availability,
            },
            gallery: [p06MockImage()],
            gallery_owner_type: 'SKU',
            capabilities: {
              warranty: {
                view_permitted: c.warranty_view,
                manage_permitted: c.warranty_manage,
                target_type: isItem ? 'ITEM' : null,
                target_id: isItem ? card.item_id : null,
                action_exposed: false,
                reason: 'P06_READ_ONLY_OWNER_FLOW_REVALIDATES',
              },
              label_print: {
                permission_granted: c.label_print_permission,
                target_type: 'LABEL_SNAPSHOT',
                target_id: null,
                action_exposed: false,
                reason: 'LABEL_TARGET_REQUIRED_NO_P06_PRINT_API',
              },
            },
          };
          extra = { warehouse_id: mockId(3) };
        }
      }
      // JSON clone: mutations in a test cannot alter the next response/source.
      return {
        status: 200,
        data: JSON.parse(
          JSON.stringify({
            success: true,
            data,
            meta: {
              contract: 'mini-app-p06-v1',
              snapshot,
              request_id: `mock-p06-${sequence}`,
              timestamp: mockTime,
              ...extra,
            },
          }),
        ) as T,
      };
    },
  };
  return {
    client,
    calls,
    context,
    cards,
    items,
    events,
    readSession: () => session,
    setSession: (s: Session | undefined) => {
      session = s;
    },
    service: createP06CatalogService(
      client,
      () => session,
      () => true,
    ),
  };
}
