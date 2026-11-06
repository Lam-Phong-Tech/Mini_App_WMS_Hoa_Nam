import type { P09Service } from '../../../services/wms/p09Warranty';
import type { ResumeTask } from '../../../services/wms/linkedHistoryRead';
import { p19LinkedJournal } from './p19LinkedJournal';
import { createP19NativeController } from './p19NativeController';
import { createP19LiveTransport } from './p19LiveTransport';
import type { P19Scope } from './p19Types';
import { p19DevEnabled } from '../../../config/p19Release';
import { retainedP19Owner } from './p19OwnerRegistry';
import { getAppStorage } from '../../../storage/storage';

export function p19LocalPendingTasks(
  service: P09Service,
  caseId?: string,
): ResumeTask[] {
  if (!p19DevEnabled()) return [];
  const scope = service.componentScope();
  if (!scope.permissions.includes('warranty.component_issue')) return [];
  const prefix =
    'p19-linked-private/v1/' +
    [scope.actorId, scope.authSessionId, scope.warehouseId].join('/') +
    '/';
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  return getAppStorage()
    .keys()
    .filter(key => key.startsWith(prefix))
    .flatMap(key => {
      const row = getAppStorage().getObject<any>(key),
        pending = row?.pending;
      if (
        row?.schema !== 'p19-linked-private-v1' ||
        !pending ||
        ![row.caseId, row.draftId, row.scanSessionId, pending.key].every(
          value => uuid.test(value ?? ''),
        ) ||
        (caseId && row.caseId !== caseId) ||
        pending.caseId !== row.caseId ||
        pending.draftId !== row.draftId ||
        pending.scanSessionId !== row.scanSessionId ||
        !['SAVE', 'RECORD'].includes(pending.command) ||
        ['actorId', 'authSessionId', 'warehouseId'].some(
          field => row.scope?.[field] !== scope[field as keyof typeof scope],
        )
      )
        return [];
      const codes = Array.isArray(row.rows)
        ? row.rows.map((entry: any) => ({
            raw_code: entry.raw_code,
            quantity: entry.quantity,
            scan_source: entry.scan_source,
          }))
        : [];
      return [
        {
          id: row.draftId,
          scanSessionId: row.scanSessionId,
          caseId: row.caseId,
          version: row.draftVersion,
          status: 'UNKNOWN',
          policy: 'LOCAL_ORIGINAL_REQUEST_ONLY',
          businessId: null,
          businessVersion: null,
          number: null,
          postedAt: null,
          canOpenBusiness: false,
          quantity: null,
          codeCount: codes.length,
          codes,
          lastKey: pending.key,
          lastCommand: pending.command,
          localOnly: true,
        },
      ];
    });
}

/** Recovery consumes the private frozen owner; server list rows are not intent. */
export function p19OriginalRecovery(service: P09Service, task: ResumeTask) {
  const getScope = (): P19Scope => {
    if (!p19DevEnabled()) throw Error('P19_DEV_ONLY');
    const s = service.componentScope();
    return {
      actorId: s.actorId,
      authSessionId: s.authSessionId,
      warehouseId: s.warehouseId,
      actorStatus: s.actorStatus,
      warehouseStatus: s.warehouseStatus,
      warehouseConfirmed: s.warehouseConfirmed,
      permissions: s.permissions,
    };
  };
  const journal = p19LinkedJournal(getScope(), task.caseId),
    saved = journal.load();
  const checkpoint = saved.checkpoint as any,
    pending = checkpoint?.pending;
  if (
    saved.invalid ||
    !pending ||
    checkpoint.draftId !== task.id ||
    checkpoint.scanSessionId !== task.scanSessionId ||
    pending.draftId !== task.id ||
    pending.scanSessionId !== task.scanSessionId ||
    pending.caseId !== task.caseId ||
    !['SAVE', 'RECORD'].includes(pending.command)
  )
    return undefined;
  const frozen = JSON.stringify(pending);
  let controller: ReturnType<typeof createP19NativeController>;
  const transport = createP19LiveTransport({
    getScope,
    caseId: task.caseId,
    getCheckpoint: () => controller.checkpoint(),
  });
  const retained = retainedP19Owner(service, task.caseId);
  if (
    retained &&
    JSON.stringify((retained.checkpoint() as any)?.pending) !== frozen
  )
    throw Error('P21_ORIGINAL_OWNER_CHANGED');
  controller =
    retained ??
    createP19NativeController({
      getScope,
      caseId: task.caseId,
      presentation: { caseLabel: task.caseId, status: '' },
      checkpoint,
      journal,
      liveRequest: descriptor => {
        if (descriptor.method !== 'GET') throw Error('P21_CHECK_ONLY');
        return transport(descriptor);
      },
    });
  return {
    key: String(pending.key),
    command: pending.command as 'SAVE' | 'RECORD',
    async check() {
      const current = journal.load().checkpoint as any;
      if (JSON.stringify(current?.pending) !== frozen)
        throw Error('P21_ORIGINAL_REQUEST_CHANGED');
      if (!(await controller.initialize())) throw Error('P21_OWNER_UNVERIFIED');
      const result = await controller.flow.reconcile();
      const state = controller.snapshot();
      return {
        outcome:
          result.kind === 'posted' || result.kind === 'saved'
            ? ('SUCCEEDED' as const)
            : ('UNKNOWN' as const),
        receipt: state.receipt,
        businessId: state.receipt?.id,
        caseId: task.caseId,
      };
    },
  };
}
