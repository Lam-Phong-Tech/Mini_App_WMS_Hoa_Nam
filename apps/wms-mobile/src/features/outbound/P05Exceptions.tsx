import React from 'react';
import { P17ScanExceptions, type P17View } from '../scan/P17ScanExceptions';
import {
  p05PendingIdentity,
  type P05RejectedObservation,
} from './linked/p05-exceptions';
import type { FrozenRequest } from './linked/types';
import type { P05CreateRequest } from '../../services/wms/p05Create';

interface State {
  step: number;
  busy: boolean;
  scanBusy: boolean;
  unknown: boolean;
  pending: FrozenRequest | P05CreateRequest | null;
  rejected?: P05RejectedObservation | null;
  accepted: readonly unknown[];
  documentNo?: string | null;
  document?: { number: string } | null;
}
interface Owner {
  snapshot(): State;
  exceptionScope(): string | null;
  dismissRejected(eventId: string, scope: string): boolean;
  readRejectedDocument(
    eventId: string,
    scope: string,
    documentId: string,
  ): Promise<boolean>;
  check(): Promise<boolean>;
}

export function p05ExceptionView(s: State): P17View | null {
  const context = {
    documentNo: s.documentNo ?? s.document?.number ?? null,
    acceptedCodeCount: s.accepted.length,
  };
  if (s.unknown && s.pending) {
    const identity = p05PendingIdentity(s.pending);
    if (identity)
      return {
        panel: 'P17.S04',
        owner: 'P05',
        phase: s.busy ? 'checking' : 'unknown',
        identity,
        context,
        canCheck: !s.busy && !s.scanBusy,
      };
  }
  if (s.step === 2 && s.rejected && !s.pending && !s.unknown)
    return { panel: 'P17.S02', ...s.rejected, context };
  return null;
}

/** Replaces the scanner tree, releasing its camera and generic feedback modal.
 * The same owner retains scanner mode/raw/filter/scroll; no navigation/reset occurs.
 */
export function P05Exceptions({
  state,
  owner,
  refresh,
  onHome,
  onViewDocument,
}: {
  state: State;
  owner: Owner;
  refresh(): void;
  onHome(): void;
  onViewDocument?: (id: string) => void;
}) {
  const view = p05ExceptionView(state);
  if (!view) return null;
  const scope = owner.exceptionScope();
  const original = state.pending ? JSON.stringify(state.pending) : null;
  const eventId = state.rejected?.eventId;
  const isCurrent = () => {
    if (!scope || owner.exceptionScope() !== scope) return false;
    const latest = owner.snapshot();
    return view.panel === 'P17.S04'
      ? latest.unknown && JSON.stringify(latest.pending) === original
      : latest.step === 2 &&
          !latest.pending &&
          !latest.unknown &&
          latest.rejected?.eventId === eventId;
  };
  const scanOther = () => {
    if (isCurrent() && eventId && scope) owner.dismissRejected(eventId, scope);
    refresh();
  };
  return (
    <P17ScanExceptions
      // A revoked holder projection also discards any open reader of its old data.
      key={
        view.panel === 'P17.S02'
          ? JSON.stringify(view.relatedDocument)
          : view.panel
      }
      scopeKey={scope ?? 'P05.scope-unavailable'}
      view={view}
      isCurrent={isCurrent}
      busy={state.busy || state.scanBusy}
      onBack={view.panel === 'P17.S02' ? scanOther : onHome}
      onScanOther={scanOther}
      onViewRelated={
        onViewDocument
          ? async documentId => {
              if (!isCurrent() || !eventId || !scope) return;
              const allowed = await owner.readRejectedDocument(
                eventId,
                scope,
                documentId,
              );
              if (allowed && isCurrent()) onViewDocument(documentId);
              refresh();
            }
          : undefined
      }
      onCheck={async () => {
        if (!isCurrent()) return;
        // Owner owns GET reconciliation and receipt verification. Never retry here.
        try {
          await owner.check();
        } finally {
          refresh();
        }
      }}
    />
  );
}
