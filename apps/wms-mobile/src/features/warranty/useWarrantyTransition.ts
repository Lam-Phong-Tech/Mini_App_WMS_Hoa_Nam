import { useP09Command } from './useP09Command';
import type {
  P09Case,
  P09Service,
  P09Update,
  P09Handover,
} from '../../services/wms/p09Warranty';

/** Snapshot the version the user reviewed. No read-and-overwrite, no status-derived key. */
export function useWarrantyTransition(current: P09Case, service: P09Service) {
  const command = useP09Command(service);
  return {
    ...command,
    run: (values: P09Update) =>
      command.owner.confirm(() => service.prepareUpdate(current, values)),
    handover: (values: P09Handover) =>
      command.owner.confirm(() => service.prepareHandover(current, values)),
  };
}
