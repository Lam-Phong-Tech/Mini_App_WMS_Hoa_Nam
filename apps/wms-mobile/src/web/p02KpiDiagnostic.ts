/** Safe Web acceptance evidence only; never grants scope or supplies KPI values. */
import { AppError } from '../errors/AppError';
import {
  confirmedHomeWarehouse,
  hasHomePermission,
  HOME_CAPABILITIES,
} from '../services/wms/home';
import type { CurrentUser } from '../services/wms/types';

export function kpiAdmission(user: CurrentUser) {
  const warehouse = confirmedHomeWarehouse(user);
  const rights = {
    inbound: hasHomePermission(user, 'inbound.view'),
    outbound: hasHomePermission(user, 'outbound.view'),
    warranty: hasHomePermission(user, 'warranty.view', 'warranty.manage'),
  };
  const code = !HOME_CAPABILITIES.stockSummary
    ? 'P02_DEV_CLOSED'
    : !warehouse
    ? 'P02_WAREHOUSE_SCOPE_UNVERIFIED'
    : !Object.values(rights).some(Boolean)
    ? 'P02_KPI_READ_NOT_GRANTED'
    : 'P02_KPI_ADMITTED';
  const label =
    code === 'P02_WAREHOUSE_SCOPE_UNVERIFIED'
      ? 'Chưa gọi summary: /auth/me chưa xác nhận đầy đủ UUID và phạm vi kho cho Home.'
      : code === 'P02_KPI_READ_NOT_GRANTED'
      ? 'Chưa gọi summary: phiên chưa có quyền đọc KPI nhập/xuất/bảo hành.'
      : code === 'P02_DEV_CLOSED'
      ? 'KPI P02 chưa mở trong môi trường này.'
      : 'Đủ điều kiện gửi GET summary.';
  return {
    code,
    label,
    context_ready: user.warehouse_context?.status === 'READY',
    warehouse_present: typeof user.active_warehouse_id === 'string',
    warehouse_verified: !!warehouse,
    scope_shape:
      user.warehouse_scope_ids === null
        ? 'UNRESTRICTED'
        : Array.isArray(user.warehouse_scope_ids)
        ? 'EXPLICIT'
        : 'MISSING',
    rights,
  };
}

export function kpiFailure(cause: unknown) {
  const e = cause instanceof AppError ? cause : undefined;
  const rawCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined;
  const code =
    typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(rawCode)
      ? rawCode
      : cause instanceof TypeError
      ? 'JAVASCRIPT_TYPE_ERROR'
      : e?.kind ?? 'UNAVAILABLE';
  const localMessages = [
    'Tổng công việc chưa được xác nhận cho đúng kho.',
    'Schema KPI chưa khớp contract P02.',
    'Chỉ số công việc thiếu dữ liệu hợp lệ.',
    'Nguồn KPI bảo hành chưa khớp contract hoặc kho.',
  ];
  const label =
    e?.kind === 'parse' && localMessages.includes(e.message)
      ? e.message
      : e?.status === 403
      ? 'API từ chối quyền/phạm vi đọc KPI.'
      : e?.kind === 'cancelled'
      ? 'Kết quả cũ đã hủy vì phiên hoặc lần đọc thay đổi.'
      : 'Đọc KPI chưa thành công; xem mã và trace bên dưới.';
  return {
    code,
    label,
    kind: e?.kind ?? 'unknown',
    http: e?.status ?? null,
    request_id:
      e?.requestId &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(e.requestId)
        ? e.requestId
        : null,
  };
}
