import {
  WORKFLOW_DRAFT_TTL_MS,
  cancelDraft,
  cleanupExpiredDrafts,
  getActiveDraft,
  saveDraft,
} from '../src/sync/draftStore';
import {
  createMemoryBackend,
  createStorage,
} from '../src/storage/storage';

describe('nháp phiếu nghiệp vụ', () => {
  it('giữ nháp qua lần đọc và hết hạn sau đúng một tuần', () => {
    const store = createStorage(createMemoryBackend());
    const start = 1_757_000_000_000;
    saveDraft('inbound', 'draft-1', { name: 'Ca sáng' }, () => start, store);

    expect(getActiveDraft('inbound', () => start + WORKFLOW_DRAFT_TTL_MS - 1, store)?.payload)
      .toEqual({ name: 'Ca sáng' });
    expect(getActiveDraft('inbound', () => start + WORKFLOW_DRAFT_TTL_MS + 1, store))
      .toBeUndefined();
    expect(cleanupExpiredDrafts('inbound', () => start + WORKFLOW_DRAFT_TTL_MS + 1, store))
      .toBe(0);
  });

  it('hủy nháp bằng trạng thái CANCELLED, không xóa bản ghi', () => {
    const store = createStorage(createMemoryBackend());
    const start = 1_757_000_000_000;
    saveDraft('outbound', 'draft-2', { name: 'Xuất chiều' }, () => start, store);
    const cancelled = cancelDraft('outbound', 'draft-2', () => start + 1000, store);

    expect(cancelled?.status).toBe('CANCELLED');
    expect(store.getObject<unknown[]>('workflow.drafts.v1')).toHaveLength(1);
    expect(getActiveDraft('outbound', () => start + 1000, store)).toBeUndefined();
  });
});
