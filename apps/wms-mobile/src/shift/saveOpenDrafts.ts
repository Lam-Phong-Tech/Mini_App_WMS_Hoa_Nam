import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { readShiftLocalOwners, readShiftLocalOwnerStatus } from './localOwners';

export interface DraftSaveJob {
  owner: 'P03' | 'P04' | 'P05' | 'P07' | 'P09' | 'P19';
  save(): Promise<void>;
}
export interface DraftSavePlan {
  revision: string;
  scope: ReturnType<typeof captureSessionScope>;
  owners: DraftSaveJob['owner'][];
}
/** Explicit SAVE intent only. A failure may leave earlier successful SAVE receipts;
 * it never rolls back, clears UNKNOWN, records a document, or ends a shift. */
export function createOpenDraftSaver(
  makeJobs: (owners: DraftSaveJob['owner'][]) => Promise<DraftSaveJob[]>,
  deps = {
    local: readShiftLocalOwners,
    status: readShiftLocalOwnerStatus,
    capture: captureSessionScope,
    current: isSessionScopeCurrent,
  },
) {
  let running = false;
  const plan = (): DraftSavePlan => {
    const local = deps.local(),
      rows = deps.status();
    if (
      local.busy ||
      local.pendingRequestIds.length ||
      rows.some(r => r.state === 'UNKNOWN' || !r.coverageComplete)
    )
      throw Error(
        'Còn yêu cầu hoặc nguồn dữ liệu chưa xác minh. Đối chiếu tại nghiệp vụ trước khi lưu.',
      );
    return {
      revision: local.revision,
      scope: deps.capture(),
      owners: rows.filter(r => r.state === 'DIRTY').map(r => r.owner),
    };
  };
  async function save(expected: DraftSavePlan) {
    if (running) throw Error('Đang lưu nháp.');
    const valid = () => deps.current(expected.scope);
    if (!valid() || deps.local().revision !== expected.revision)
      throw Error('Dữ liệu hoặc phiên đã thay đổi. Kiểm tra và xác nhận lại.');
    running = true;
    try {
      const jobs = await makeJobs(expected.owners);
      if (!valid() || deps.local().revision !== expected.revision)
        throw Error('Dữ liệu đã thay đổi trong khi chuẩn bị lưu.');
      if (
        jobs.length !== expected.owners.length ||
        new Set(jobs.map(j => j.owner)).size !== jobs.length ||
        jobs.some(j => !expected.owners.includes(j.owner))
      )
        throw Error('Chưa có đường SAVE an toàn cho đủ nghiệp vụ.');
      let revision = expected.revision;
      for (const job of jobs) {
        if (!valid() || deps.local().revision !== revision)
          throw Error(
            'Dữ liệu đã thay đổi. Các nháp đã lưu được giữ; cần kiểm tra phần còn lại.',
          );
        await job.save();
        const row = deps.status().find(r => r.owner === job.owner);
        if (!valid() || !row || row.state !== 'CLEAN' || !row.coverageComplete)
          throw Error(
            'Chưa xác nhận SAVE đầy đủ. Giữ dữ liệu để đối chiếu tại ' +
              job.owner +
              '.',
          );
        revision = deps.local().revision;
      }
      const final = deps.local();
      if (
        !valid() ||
        final.state !== 'CLEAN' ||
        !final.coverageComplete ||
        final.busy ||
        final.pendingRequestIds.length
      )
        throw Error('Các SAVE thành công được giữ; vẫn còn dữ liệu cần xử lý.');
    } finally {
      running = false;
    }
  }
  return { plan, save };
}
