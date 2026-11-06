import type {
  P03Scope,
  P03Draft,
  P03Receipt,
} from '../../../services/wms/p03Drafts';
import type {
  Context,
  Source,
  Envelope,
  FrozenRequest,
  ResponseData,
} from './types';
export const P05_CONTRACT: string, P03_CONTRACT: string, UUID: RegExp;
export class P05ApiError extends Error {
  code: string;
  status: number;
  unknown: boolean;
  traceId: string | null;
  constructor(
    code: string,
    message?: string,
    options?: { status?: number; unknown?: boolean; traceId?: string | null },
  );
}
export function obj(value: unknown): boolean;
export function draftEtagMatches(
  etag: string | null | undefined,
  version: number,
): boolean;
export function envelope(
  response: ResponseData,
  contract: string,
  statuses?: number[],
): Envelope;
export function parseContext(value: Envelope, scope: P03Scope): Context;
export function parseSource(
  value: unknown,
  scope: P03Scope,
  now?: number,
): Source;
export function parseDraft(
  value: unknown,
  scope: P03Scope,
  id: string,
  scan: string,
): P03Draft;
export function parseReceipt(
  value: unknown,
  request: Pick<
    FrozenRequest,
    'key' | 'draftId' | 'scanSessionId' | 'body' | 'command'
  >,
): P03Receipt & { committed_at: string };
export function verifyRecord(
  value: Envelope,
  request: FrozenRequest,
  scope: P03Scope,
): {
  result: Record<string, unknown>;
  receipt: P03Receipt & { committed_at: string };
  draft: P03Draft;
};
