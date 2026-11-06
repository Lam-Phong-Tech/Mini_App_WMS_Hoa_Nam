import {
  apiClient,
  type RequestOptions,
  type ApiResponse,
} from '../../api/client';
import { getActiveSession, type Session } from '../../auth/session';
import { AppError } from '../../errors/AppError';
import { P03_UUID } from '../../services/wms/p03Drafts';
import { parseVietnamTimestamp } from '../../time/vietnamTime';
export interface P04Supplier {
  id: string;
  name: string;
  status: 'ACTIVE';
  version: number;
  updated_at: string;
}
interface SupplierEnvelope {
  success: boolean;
  data: P04Supplier[];
  meta: {
    total: number;
    contract: string;
    scope: 'GLOBAL';
    page: number;
    per_page: number;
    last_page: number;
    source: string;
  };
}
interface SupplierClient {
  get<T>(
    path: string,
    options?: Omit<RequestOptions, 'path' | 'method'>,
  ): Promise<ApiResponse<T>>;
}
export async function fetchP04Suppliers(
  warehouseId: string,
  q: string,
  page = 1,
  signal?: AbortSignal,
  deps: {
    client?: SupplierClient;
    getSession?: () => Session | undefined;
  } = {},
): Promise<{ items: P04Supplier[]; total: number }> {
  const read = deps.getSession ?? getActiveSession,
    client = deps.client ?? apiClient;
  const before = read();
  if (
    !before?.authSessionId ||
    !before.userId ||
    before.activeWarehouseId !== warehouseId ||
    !P03_UUID.test(warehouseId)
  )
    throw new AppError({
      kind: 'config',
      code: 'WAREHOUSE_CONTEXT_REQUIRED',
      message: 'Chưa xác nhận kho và phiên để đọc nhà cung cấp.',
    });
  if (q.length > 200 || !Number.isSafeInteger(page) || page < 1)
    throw new AppError({
      kind: 'config',
      code: 'INVALID_SUPPLIER_QUERY',
      message: 'Tìm kiếm tối đa 200 ký tự; trang từ 1.',
    });
  const r = await client.get<SupplierEnvelope>(
    '/api/v1/mini-app/inbound/suppliers',
    {
      query: {
        q,
        status: 'ACTIVE',
        page,
        per_page: 20,
      },
      signal,
    },
  );
  const now = read();
  if (
    !now ||
    now.userId !== before.userId ||
    now.authSessionId !== before.authSessionId ||
    now.activeWarehouseId !== warehouseId
  )
    throw new AppError({
      kind: 'cancelled',
      message: 'Phiên hoặc kho đã thay đổi.',
    });
  const meta = r.data?.meta;
  if (
    r.status !== 200 ||
    r.data.success !== true ||
    meta?.contract !== 'mini-app-p04-v1' ||
    meta.scope !== 'GLOBAL' ||
    meta.source !== 'inbound_suppliers' ||
    meta.page !== page ||
    meta.per_page !== 20 ||
    !Number.isSafeInteger(meta.total) ||
    meta.total < 0 ||
    meta.last_page !== Math.max(1, Math.ceil(meta.total / 20)) ||
    !Array.isArray(r.data.data) ||
    r.data.data.length > 20 ||
    r.data.data.some(
      s =>
        !P03_UUID.test(s.id) ||
        typeof s.name !== 'string' ||
        !s.name.trim() ||
        s.status !== 'ACTIVE' ||
        !Number.isSafeInteger(s.version) ||
        s.version < 1 ||
        typeof s.updated_at !== 'string' ||
        parseVietnamTimestamp(s.updated_at).status !== 'RECORDED',
    ) ||
    new Set(r.data.data.map(s => s.id)).size !== r.data.data.length
  )
    throw new AppError({
      kind: 'parse',
      code: 'INVALID_SUPPLIER_RESPONSE',
      message: 'Chưa xác minh được danh mục nhà cung cấp.',
    });
  return { items: r.data.data, total: r.data.meta.total };
}
export function supplierErrorMessage(error: unknown): string {
  if (!(error instanceof AppError))
    return error instanceof Error
      ? error.message
      : 'Chưa lấy được danh mục nhà cung cấp.';
  const messages: Record<string, string> = {
    WAREHOUSE_ACCESS_DENIED: 'Bạn không có quyền đọc nhà cung cấp của kho này.',
    P04_OPERATION_DENIED: 'Bạn chưa có quyền đọc nghiệp vụ Nhập kho.',
    WAREHOUSE_CONTEXT_REQUIRED:
      'Cần xác nhận kho làm việc trước khi chọn nhà cung cấp.',
    WAREHOUSE_CONTEXT_MISMATCH: 'Kho trong yêu cầu không khớp phiên hiện tại.',
    WAREHOUSE_INACTIVE: 'Kho đã tạm dừng; phiếu được giữ nguyên.',
    INBOUND_WAREHOUSE_NOT_SUPPORTED:
      'Kho hiện tại chưa được hỗ trợ trong luồng nhập.',
    SUPPLIER_NOT_AVAILABLE: 'Nhà cung cấp không còn trong phạm vi kho này.',
    SUPPLIER_INACTIVE: 'Nhà cung cấp đã ngừng sử dụng; chọn lại trước khi gửi.',
  };
  return error.status === 401
    ? 'Phiên chưa xác thực hoặc đã hết hạn.'
    : messages[error.code ?? ''] ?? error.message;
}
