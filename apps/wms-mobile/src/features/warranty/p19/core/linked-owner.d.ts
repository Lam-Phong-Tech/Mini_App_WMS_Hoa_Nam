import type { P19Owner, P19Scope } from '../p19Types';
export function createLinkedIssueOwner(options: {
  adapter: unknown;
  getScope(): P19Scope;
  uuid(): string;
  checkpoint?: unknown;
  onChange?(): void;
}): P19Owner;
