import { loadP14DraftOverview } from '../src/shift/p14DraftOverview';
import {
  emptyP05CreateForm,
  p05FormSnapshot,
  p05StableJSON,
} from '../src/features/outbound/p05CreateForm';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('new server number projection keeps existing local dirty state without replacing official number from title', async () => {
  const scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) },
    store = createStorage(createMemoryBackend()),
    form = emptyP05CreateForm();
  const item: any = {
    document_id: id(4),
    scan_session_id: id(5),
    actor_id: id(1),
    auth_session_id: id(2),
    warehouse_id: id(3),
    operation: 'OUTBOUND',
    status: 'DRAFT',
    version: 1,
    title: 'Tên nháp',
    document_no: 'PX-20261104-0001',
    document_no_availability: 'AVAILABLE',
    document_no_source: 'outbound_draft_numbers.doc_no',
    document_no_reason: null,
    business_document_id: null,
  };
  const server = {
    ...item,
    numbering_status: 'ASSIGNED',
    form: p05FormSnapshot(form),
    codes: [],
  };
  store.setObject('hn-p05-create-v1:test', {
    scope,
    state: {
      draftId: id(4),
      scanSessionId: id(5),
      version: 1,
      form: { ...form, note: 'Thay đổi chưa SAVE' },
      accepted: [],
      serverDraft: server,
      savedSignature: p05StableJSON({ form: server.form, codes: [] }),
      documentNo: item.document_no,
      numberingContract: 'p05-save-numbering-v1',
      saveReceiptKey: id(6),
    },
  });
  const service: any = {
    context: async () => ({ permissions: { OUTBOUND: { read: true } } }),
    list: async () => ({ data: [item], meta: { total: 1 } }),
  };
  const result = await loadP14DraftOverview(service, () => scope, store);
  expect(result.items[0]).toMatchObject({
    displayTitle: item.document_no,
    displayTitleSource: 'SERVER_PERSISTED_NUMBER_READ',
    localState: 'DIRTY',
  });
});
