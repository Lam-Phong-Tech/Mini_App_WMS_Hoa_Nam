import type { P09Service } from '../../../services/wms/p09Warranty';
import type { P19NativeController } from './p19NativeController';
const owners = new WeakMap<P09Service, Map<string, P19NativeController>>();
const key = (service: P09Service, caseId: string) =>
  service.contextKey() + '/' + caseId;
export function retainedP19Owner(service: P09Service, caseId: string) {
  return owners.get(service)?.get(key(service, caseId));
}
export function retainP19Owner(
  service: P09Service,
  caseId: string,
  owner: P19NativeController,
) {
  let entries = owners.get(service);
  if (!entries) {
    entries = new Map();
    owners.set(service, entries);
  }
  entries.set(key(service, caseId), owner);
}
