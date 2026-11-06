/** P02 reads the same scoped mixed source as P12, without client-side merging. */
import { createP12Service, type P12Service } from '../documents/p12/service';
import type { Document } from '../documents/p12/contract';
import { getActiveSession } from '../../auth/session';
import type { CurrentUser } from '../../services/wms/types';
import type { ReadOptions } from '../../services/wms/readOnlyClient';
import type { RecentDocument } from '../../services/wms/home';
import { parseDocumentTimestamp } from '../../services/wms/documentTimestamps';
import { documentStatusPresentation } from '../documents/p12/presentation';

export function homeRecentRecord(row: Document): RecentDocument {
  return {
    id: row.id,
    number: row.number ?? null,
    type: row.type,
    status: row.p12.status.canonical ?? undefined,
    miniAppStatus: row.p12.status.mini_app ?? undefined,
    ...(Object.hasOwn(row, 'createdAt') ? { createdAt: row.createdAt } : {}),
    timestamp: row.createdTimestamp ?? parseDocumentTimestamp(row.createdAt),
    displayMappingPending:
      row.displayStatus?.availability === 'PENDING_BA_MAPPING',
    statusPresentation: documentStatusPresentation(row),
  };
}
export async function fetchHomeRecentDocuments(
  user: CurrentUser,
  options: ReadOptions = {},
  service?: Pick<P12Service, 'mixed'>,
): Promise<readonly RecentDocument[]> {
  const api =
    service ?? createP12Service(() => ({ user, session: getActiveSession() }));
  const result = await api.mixed(
    { source: 'ALL', status: 'ALL', sort: 'created_at_desc', per_page: 3 },
    options.signal,
  );
  return result.items.map(homeRecentRecord);
}
