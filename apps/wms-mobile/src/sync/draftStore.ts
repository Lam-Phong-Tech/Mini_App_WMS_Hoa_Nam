/**
 * Nháp cục bộ cho các phiếu đang soạn.
 *
 * BE hiện không có endpoint tạo phiếu nháp generic cho inbound/outbound. Nháp
 * ở đây là bản lưu bền vững trên thiết bị để người dùng có thể tiếp tục sau
 * khi thoát/app restart; chỉ `record` hiện hữu mới tạo chứng từ WMS thật.
 */

import { getAppStorage, type KeyValueStorage } from '../storage/storage';

export type WorkflowDraftKind = 'inbound' | 'outbound';
export type WorkflowDraftStatus = 'DRAFT' | 'CANCELLED';

export interface WorkflowDraft<T = unknown> {
  readonly id: string;
  readonly kind: WorkflowDraftKind;
  readonly status: WorkflowDraftStatus;
  readonly payload: T;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export const WORKFLOW_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'workflow.drafts.v1';

function storage(): KeyValueStorage {
  return getAppStorage();
}

function readAll(store: KeyValueStorage = storage()): WorkflowDraft[] {
  const value = store.getObject<unknown>(STORAGE_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(item => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.id === 'string' &&
      (record.kind === 'inbound' || record.kind === 'outbound') &&
      (record.status === 'DRAFT' || record.status === 'CANCELLED') &&
      typeof record.createdAt === 'string' &&
      typeof record.updatedAt === 'string' &&
      typeof record.expiresAt === 'string'
    );
  }) as WorkflowDraft[];
}

function writeAll(items: readonly WorkflowDraft[], store: KeyValueStorage = storage()): void {
  store.setObject(STORAGE_KEY, items);
}

function nowIso(now: () => number): string {
  return new Date(now()).toISOString();
}

/** Xóa nháp quá hạn nhưng giữ lại các bản ghi đã hủy để audit trên thiết bị. */
export function cleanupExpiredDrafts(
  kind?: WorkflowDraftKind,
  now: () => number = Date.now,
  store: KeyValueStorage = storage(),
): number {
  const nowMs = now();
  const current = readAll(store);
  const next = current.filter(item =>
    item.status === 'CANCELLED' ||
    (kind !== undefined && item.kind !== kind) ||
    Date.parse(item.expiresAt) > nowMs,
  );
  if (next.length !== current.length) writeAll(next, store);
  return current.length - next.length;
}

export function getActiveDraft<T = unknown>(
  kind: WorkflowDraftKind,
  now: () => number = Date.now,
  store: KeyValueStorage = storage(),
): WorkflowDraft<T> | undefined {
  cleanupExpiredDrafts(kind, now, store);
  return readAll(store)
    .filter(item => item.kind === kind && item.status === 'DRAFT')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] as WorkflowDraft<T> | undefined;
}

export function saveDraft<T>(
  kind: WorkflowDraftKind,
  id: string,
  payload: T,
  now: () => number = Date.now,
  store: KeyValueStorage = storage(),
): WorkflowDraft<T> {
  const current = readAll(store);
  const previous = current.find(item => item.id === id && item.kind === kind);
  const updatedAt = nowIso(now);
  const next: WorkflowDraft<T> = {
    id,
    kind,
    status: 'DRAFT',
    payload,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    expiresAt: new Date(now() + WORKFLOW_DRAFT_TTL_MS).toISOString(),
  };
  writeAll([...current.filter(item => item.id !== id), next], store);
  return next;
}

export function cancelDraft(
  kind: WorkflowDraftKind,
  id: string,
  now: () => number = Date.now,
  store: KeyValueStorage = storage(),
): WorkflowDraft | undefined {
  const current = readAll(store);
  const found = current.find(item => item.id === id && item.kind === kind);
  if (found === undefined) return undefined;
  const cancelled: WorkflowDraft = {
    ...found,
    status: 'CANCELLED',
    updatedAt: nowIso(now),
  };
  writeAll([...current.filter(item => item.id !== id), cancelled], store);
  return cancelled;
}

/** Nháp đã được ghi thành công lên WMS thì không còn là nháp trên thiết bị. */
export function removeDraft(
  kind: WorkflowDraftKind,
  id: string,
  store: KeyValueStorage = storage(),
): void {
  writeAll(readAll(store).filter(item => item.id !== id || item.kind !== kind), store);
}
