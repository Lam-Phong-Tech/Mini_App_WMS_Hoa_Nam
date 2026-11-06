// Offline review only; resolved by the isolated Vite config, never AppShell.
const state = {
  items: [],
  phase: 'ready' as const,
  stale: false,
  reload: () => undefined,
};
export const useProvinces = () => state;
export const useWards = () => state;
