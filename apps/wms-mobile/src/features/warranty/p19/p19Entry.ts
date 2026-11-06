import type { P09Service, P09Case } from '../../../services/wms/p09Warranty';
import type { WarrantyCase } from '../../../services/wms/types';
import { canIssueWarrantyComponents } from '../warrantyPolicy';
import { createP19NativeController } from './p19NativeController';
import { p19LinkedJournal } from './p19LinkedJournal';
import type { P19Scope } from './p19Types';
import { p19DevEnabled } from '../../../config/p19Release';
import { createP19LiveTransport } from './p19LiveTransport';
import type { KeyValueStorage } from '../../../storage/storage';

export function canEnterP19(service: P09Service, row: WarrantyCase): boolean {
  try {
    const scope = service.scope();
    const ownership = (row as P09Case).ownerScope;
    return (
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
        row.warranty_case_id,
      ) &&
      ownership?.source === 'P09_META' &&
      ownership.policy === 'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL' &&
      ownership.warehouseId === scope.warehouseId &&
      Number.isSafeInteger(row.version) &&
      Number(row.version) > 0 &&
      canIssueWarrantyComponents(row.status) &&
      scope.permissions.includes('warranty.component_issue')
    );
  } catch {
    return false;
  }
}
export function createP19EntryController(
  service: P09Service,
  row: WarrantyCase,
  options: { getVerifiedScope?(): P19Scope; storage?: KeyValueStorage } = {},
) {
  if (!canEnterP19(service, row)) throw Error('P19_ENTRY_NOT_ALLOWED');
  const getScope =
    options.getVerifiedScope ??
    (() => {
      if (!p19DevEnabled()) throw Error('P19_P01_SCOPE_NOT_VERIFIED');
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
    });
  const journal =
    options.getVerifiedScope || p19DevEnabled()
      ? p19LinkedJournal(getScope(), row.warranty_case_id, options.storage)
      : undefined;
  const saved = journal?.load();
  let controller: ReturnType<typeof createP19NativeController>;
  const liveRequest =
    !options.getVerifiedScope && p19DevEnabled()
      ? createP19LiveTransport({
          getScope,
          caseId: row.warranty_case_id,
          getCheckpoint: () => controller.checkpoint(),
          storage: options.storage,
        })
      : undefined;
  controller = createP19NativeController({
    getScope,
    caseId: row.warranty_case_id,
    presentation: {
      caseLabel: row.warranty_case_code ?? row.warranty_case_id,
      productName: row.sku_name ?? row.manual_product_description,
      status: row.status ?? '',
    },
    checkpoint: saved?.invalid ? { invalid_journal: true } : saved?.checkpoint,
    journal,
    liveRequest,
  });
  return controller;
}
