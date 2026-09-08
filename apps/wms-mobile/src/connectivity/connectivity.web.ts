import { useEffect, useState } from 'react';

export interface ConnectivityState {
  readonly isConnected: boolean;
  readonly isInternetReachable: boolean | null;
  readonly type: string;
}

export const UNKNOWN_CONNECTIVITY: ConnectivityState = {
  isConnected: false,
  isInternetReachable: null,
  type: 'unknown',
};

function current(): ConnectivityState {
  const connected = navigator.onLine;
  return { isConnected: connected, isInternetReachable: connected, type: connected ? 'web' : 'none' };
}

export function canReachNetwork(state: ConnectivityState): boolean {
  return state.isConnected && state.isInternetReachable !== false;
}

export function subscribeConnectivity(listener: (state: ConnectivityState) => void): () => void {
  const notify = () => listener(current());
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export async function fetchConnectivity(): Promise<ConnectivityState> {
  return current();
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(() => current());
  useEffect(() => subscribeConnectivity(setState), []);
  return state;
}
