import type { P05Storage } from './types';
import type { P03Scope } from '../../../services/wms/p03Drafts';
export function createP05Journal(
  storage: P05Storage,
  scope: P03Scope,
  origin: string,
  namespace?: string,
): {
  read(): unknown;
  write(state: unknown): void;
  remove(): void;
};
