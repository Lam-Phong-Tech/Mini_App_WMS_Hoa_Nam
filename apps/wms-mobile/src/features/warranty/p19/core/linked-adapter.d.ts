import type { P19OfflineRequest, P19LiveRequest } from '../p19Types';
export function createP19LinkedAdapter(options?: {
  offlineRequest?: P19OfflineRequest | null;
  liveRequest?: P19LiveRequest | null;
  mode?: string;
}): unknown;
