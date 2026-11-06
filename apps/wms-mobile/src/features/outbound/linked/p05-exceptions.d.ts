import type { P17View, P17RequestIdentity } from '../../scan/P17ScanExceptions';
import type { FrozenRequest } from './types';
import type { P05CreateRequest } from '../../../services/wms/p05Create';

export type P05RejectedObservation = Pick<
  Extract<P17View, { panel: 'P17.S02' }>,
  'raw' | 'reasonCode' | 'product' | 'relatedDocument'
> & { eventId: string };
export function p05RejectedObservation(
  raw: string,
  eventId: string,
  resolved: unknown,
  readVerified: boolean,
): P05RejectedObservation;
export function p05PendingIdentity(
  request: FrozenRequest | P05CreateRequest | null,
): P17RequestIdentity | null;
