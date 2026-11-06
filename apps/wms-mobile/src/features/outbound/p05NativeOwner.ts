import { getAppStorage, type KeyValueStorage } from '../../storage/storage';
import {
  createP03RequestId,
  p03Scope,
  type P03Scope,
} from '../../services/wms/p03Drafts';
import { createP05Service } from '../../services/wms/p05Outbound';
import { fetchOutboundDocument } from '../../services/wms/queries';
import { createSourceLinkedFlow } from './linked/p05-linked-flow';
import type { Snapshot, Service } from './linked/types';
import { verifyP04Admission } from '../../shift/p04Admission';
import type { P05ResolverAdmission } from './linked/p05-owner-checks';
export function createP05NativeOwner({
  onChange,
  storage = getAppStorage(),
  service = createP05Service(),
  getScope = () => {
    try {
      return p03Scope();
    } catch {
      return { actorId: '', authSessionId: '', warehouseId: '' };
    }
  },
  admission,
  readRelated = fetchOutboundDocument,
}: {
  onChange: (s: Snapshot) => void;
  storage?: KeyValueStorage;
  service?: Service;
  getScope?: () => P03Scope;
  admission?: P05ResolverAdmission;
  readRelated?: typeof fetchOutboundDocument;
}) {
  return createSourceLinkedFlow({
    adapter: service,
    readRelated,
    admission:
      admission ??
      (service.live
        ? (c, v) => verifyP04Admission(c, 'VALIDATE', v)
        : async () => ({})),
    getScope,
    uuid: createP03RequestId,
    onChange,
    storage: {
      getItem: key => storage.getString(key) ?? null,
      setItem: (key, value) => storage.setString(key, value),
      removeItem: key => storage.remove(key),
    },
  });
}
