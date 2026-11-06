import type { Document } from './contract';
export interface OwnerProjection {
  contract: 'p12-owner-projection-v1';
  revision: 'p12-owner-projection-r1';
  document_id: string;
  warehouse_id: string;
  source: 'INBOUND' | 'OUTBOUND';
  supplier: {
    status: string;
    id: string | null;
    name: string | null;
    name_status: string;
    version: number | null;
    recorded_at: string | null;
    source: string | null;
  };
  creator: {
    actor_id: string | null;
    source: string | null;
    display_name: null;
    display_name_status: string;
    role: null;
    role_status: string;
    current_display_name: string | null;
    current_display_name_status: string;
    current_display_name_source: string | null;
  };
}
export function parseOwnerProjection(
  value: unknown,
  marker: unknown,
  parent: Document,
  rights?: string[],
): {
  ownerProjection: OwnerProjection | null;
  ownerProjectionIssue: 'NOT_PROVIDED' | 'UNVERIFIED' | 'INVALID' | null;
};
export function ownerProjectionPresentation(d: Document): {
  supplier: string | null;
  supplierNote: string | null;
  creator: unknown;
  creatorNote: string | null;
};
