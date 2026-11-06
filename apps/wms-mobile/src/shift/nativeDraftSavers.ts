import { getAppStorage } from '../storage/storage';
import { getSession } from '../auth/session';
import { p03Scope, sameP03Scope } from '../services/wms/p03Drafts';
import { getCurrentEnvironment } from '../config/env';
import { createP05CreateOwner } from '../features/outbound/p05CreateOwner';
import { p05StableJSON } from '../features/outbound/p05CreateForm';
import { createP04Flow, type P04Run } from '../features/inbound/p04Flow';
import { fetchCurrentUser } from '../services/wms/queries';
import { createP09Service } from '../services/wms/p09Warranty';
import { createP19EntryController } from '../features/warranty/p19/p19Entry';
import { createOpenDraftSaver, type DraftSaveJob } from './saveOpenDrafts';
import { draftSaveStorage } from './draftSaveStorage';

/** Reuse each owner SAVE implementation; no duplicate HTTP/business writer. */
export function createNativeDraftSaver() {
  return createOpenDraftSaver(async owners => {
    const store = getAppStorage(),
      scope = p03Scope(),
      jobs: DraftSaveJob[] = [];
    const rows = (prefix: string) =>
      store
        .keys()
        .filter(k => k.startsWith(prefix))
        .map(key => ({ key, row: store.getObject<any>(key) }))
        .filter(({ row }) => row?.scope && sameP03Scope(row.scope, scope));
    // Preflight every requested owner before any mutation; unsupported owners
    // stay available through their normal resume path rather than a fake SAVE.
    for (const owner of owners) {
      if (owner === 'P05') {
        const manual = rows('hn-p05-create-v1:'),
          linked = rows('hn-p05-linked-v1:');
        const expectedKey =
          'hn-p05-create-v1:' +
          JSON.stringify([
            getCurrentEnvironment().apiBaseUrl,
            scope.actorId,
            scope.authSessionId,
            scope.warehouseId,
          ]);
        if (
          linked.some(
            ({ row }) => row.state?.dirty !== false && !row.state?.outcome,
          ) ||
          manual.length !== 1 ||
          manual[0].key !== expectedKey
        )
          throw Error(
            'P05 có nháp nguồn hoặc nguồn lưu khác. Mở Xuất kho để lưu đúng nháp trước.',
          );
        const row = manual[0].row.state;
        if (!row || row.pending || row.unknown || row.outcome)
          throw Error('P05 cần đối chiếu tại nghiệp vụ.');
        if (row.version < 1)
          throw Error(
            'P05 chưa có SAVE đầu tiên. Mở đúng Xuất kho để lưu trước khi kiểm tra kết thúc ca.',
          );
        const leased = draftSaveStorage(
          store,
          manual.map(r => r.key),
          'hn-p05-create-v1:',
        );
        jobs.push({
          owner,
          async save() {
            const flow = createP05CreateOwner({ storage: leased });
            try {
              if (!(await flow.initialize(undefined, false)))
                throw Error(
                  flow.snapshot().error || 'Không mở được đúng nháp P05.',
                );
              const current = flow.snapshot();
              if (
                current.draftId !== row.draftId ||
                current.scanSessionId !== row.scanSessionId ||
                p05StableJSON(current.form) !== p05StableJSON(row.form) ||
                current.version !== row.version
              )
                throw Error(
                  'Nháp P05 đã thay đổi. Mở phiếu để kiểm tra trước khi lưu.',
                );
              if (!(await flow.save()))
                throw Error(
                  flow.snapshot().error || 'Chưa có biên nhận SAVE P05.',
                );
            } finally {
              flow.dispose();
            }
          },
        });
      } else if (owner === 'P04') {
        const active = rows('p04.runs.v1/').filter(
          ({ row }) => !row.closed && !row.result,
        );
        if (active.length !== 1 || active[0].row.pending)
          throw Error(
            'Nhập kho có nhiều nháp hoặc cần đối chiếu. Mở đúng phiếu để lưu.',
          );
        const run = active[0].row as P04Run;
        if (!run.server?.version)
          throw Error(
            'P04 chưa có SAVE đầu tiên. Mở đúng Nhập kho để lưu trước khi kiểm tra kết thúc ca.',
          );
        const leased = draftSaveStorage(
          store,
          rows('p04.runs.v1/').map(r => r.key),
          'p04.runs.v1/',
        );
        jobs.push({
          owner,
          async save() {
            const flow = createP04Flow({
              storage: leased,
              autoNameFromDocumentCode: run.nameMode === 'BE_DOCUMENT_NO',
            });
            try {
              if (
                !(await flow.begin(
                  undefined,
                  undefined,
                  run.identity.documentId,
                ))
              )
                throw Error(
                  flow.snapshot().message || 'Chưa mở được nháp P04.',
                );
              if (flow.snapshot().run?.id !== run.id)
                throw Error('Nháp P04 đang mở đã thay đổi.');
              if (!(await flow.saveAndLeave()))
                throw Error(
                  flow.snapshot().message || 'Chưa có biên nhận SAVE P04.',
                );
            } finally {
              flow.dispose();
            }
          },
        });
      } else if (owner === 'P19') {
        const dirty = rows('p19-linked-private/v1/').filter(
          ({ row }) => row.dirty,
        );
        if (
          !dirty.length ||
          dirty.some(({ row }) => row.pending || row.unknown || row.result)
        )
          throw Error('P19 cần đối chiếu tại hồ sơ gốc.');
        if (dirty.some(({ row }) => row.draftVersion < 1))
          throw Error(
            'P19 chưa có SAVE đầu tiên. Mở hồ sơ gốc để lưu trước khi kiểm tra kết thúc ca.',
          );
        const leased = draftSaveStorage(
          store,
          rows('p19-linked-private/v1/').map(r => r.key),
          'p19-linked-private/v1/',
        );
        jobs.push({
          owner,
          async save() {
            const user = await fetchCurrentUser(),
              service = createP09Service(() => ({
                session: getSession(),
                user,
              }));
            for (const { row } of dirty) {
              const detail = await service.detail(row.caseId),
                controller = createP19EntryController(service, detail, {
                  storage: leased,
                });
              try {
                if (!(await controller.initialize()))
                  throw Error('Không mở được đúng nháp linh kiện.');
                const state = controller.snapshot();
                if (
                  state.document.documentId !== row.draftId ||
                  state.scanSessionId !== row.scanSessionId ||
                  state.document.version !== row.draftVersion
                )
                  throw Error('Định danh hoặc phiên bản P19 đã thay đổi.');
                if (!(await controller.flow.prepareReview()))
                  throw Error(
                    controller.snapshot().error?.message ||
                      'Chưa có biên nhận SAVE P19.',
                  );
              } finally {
                controller.dispose();
              }
            }
          },
        });
      } else
        throw Error(
          owner +
            ' cần mở tại nghiệp vụ để đối chiếu; chưa có đường lưu nháp an toàn từ Kết thúc ca.',
        );
    }
    return jobs;
  });
}
