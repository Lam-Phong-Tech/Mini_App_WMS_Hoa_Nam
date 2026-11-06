import { AppError } from '../../errors/AppError';

export function assertP03ReconcileIdentity(
  value: Record<string, unknown>,
  expected: {
    key: string;
    draftId: string;
    scanSessionId: string;
    warehouseId: string;
    operation: string;
    command: string;
  },
): void {
  if (
    value.request_id !== expected.key ||
    value.document_id !== expected.draftId ||
    value.scan_session_id !== expected.scanSessionId ||
    value.warehouse_id !== expected.warehouseId ||
    value.operation !== expected.operation ||
    value.command !== expected.command
  )
    throw new AppError({
      kind: 'parse',
      code: 'REQUEST_IDENTITY_MISMATCH',
      message:
        'Kết quả đối chiếu không khớp yêu cầu gốc. Giữ nguyên yêu cầu; chưa gửi lại.',
    });
}
