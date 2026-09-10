/**
 * Phiên xuất linh kiện đang làm dở.
 *
 * Đây không phải cache giao diện: sau mỗi mốc ghi WMS, bản ghi được lưu nguyên
 * tử xuống thiết bị. Nhờ vậy app bị đóng giữa create/scan/Post vẫn biết phải
 * tiếp tục đúng phiếu nào và giữ nguyên Idempotency-Key của Post.
 */

import { getAppStorage } from '../../storage/storage';
import type { WarrantyComponentDraft } from './warrantyComponentDraft';

const STORAGE_PREFIX = 'warranty-component-session/';

export type WarrantyComponentSessionStage =
  | 'local'
  | 'creating'
  | 'scanning'
  | 'posting';

export interface WarrantyComponentSession {
  readonly caseId: string;
  readonly draft: WarrantyComponentDraft;
  readonly warehouseId?: string;
  readonly documentId?: string;
  readonly version?: string;
  /**
   * Được ghi ngay sau khi mã linh kiện/hộp được resolver nhận diện thành công.
   * Mốc này độc lập với số dòng nháp để không thể đổi kho bằng cách xóa dòng.
   */
  readonly warehouseLocked?: boolean;
  /** Các mã đã nhận phản hồi scan thành công từ WMS. */
  readonly scannedCodeKeys: readonly string[];
  /** Mã đang gửi lúc app bị đóng; phải đối chiếu lại chi tiết phiếu trước retry. */
  readonly pendingCodeKey?: string;
  readonly stage: WarrantyComponentSessionStage;
  readonly updatedAt: string;
}

function keyFor(caseId: string): string {
  return STORAGE_PREFIX + encodeURIComponent(caseId);
}

function isDraft(value: unknown, caseId: string): value is WarrantyComponentDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<WarrantyComponentDraft>;
  return (
    draft.caseId === caseId &&
    typeof draft.sessionId === 'string' &&
    Array.isArray(draft.items)
  );
}

function isSession(value: unknown, caseId: string): value is WarrantyComponentSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<WarrantyComponentSession>;
  return (
    session.caseId === caseId &&
    isDraft(session.draft, caseId) &&
    Array.isArray(session.scannedCodeKeys) &&
    ['local', 'creating', 'scanning', 'posting'].includes(String(session.stage))
  );
}

export function loadWarrantyComponentSession(
  caseId: string,
): WarrantyComponentSession | undefined {
  const value = getAppStorage().getObject<unknown>(keyFor(caseId));
  return isSession(value, caseId) ? value : undefined;
}

export function saveWarrantyComponentSession(session: WarrantyComponentSession): void {
  getAppStorage().setObject(keyFor(session.caseId), session);
}

/**
 * Tương thích phiên cũ: trước khi có cờ riêng, đã có dòng nháp hoặc phiếu WMS
 * vẫn đủ bằng chứng rằng mã đã được đối soát theo một kho và không được đổi.
 */
export function isWarrantyComponentWarehouseLocked(
  session: WarrantyComponentSession | undefined,
): boolean {
  return (
    session?.warehouseLocked === true ||
    session?.draft.items.length !== 0 ||
    session?.documentId !== undefined
  );
}

/** Chỉ gọi sau khi WMS xác nhận Post thành công hoặc nhân viên chủ động huỷ phiếu. */
export function clearWarrantyComponentSession(caseId: string): void {
  getAppStorage().remove(keyFor(caseId));
}
