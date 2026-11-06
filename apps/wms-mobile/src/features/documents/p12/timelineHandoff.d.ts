import type { Milestone, Raw, Source } from './contract';
export const P12_TIMELINE_CONTRACT: 'p12-timeline-handoff-v1';
export const P12_TIMELINE_HEADER: 'X-P12-Timeline-Contract';
export interface HandoffMilestone extends Milestone {
  actor: null;
  actor_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE';
  description: null;
  description_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE';
  evidence_kind: 'PERSISTED_SUBMISSION_INTENT_NOT_CURRENT_WAITING_OR_DELIVERY_ACK';
  source_record?: {
    table: 'mini_app_web_post_handoffs';
    document_id: string;
    warehouse_id: string;
    document_version_at_record: number;
  };
}
export function parseHandoffMilestone(
  value: unknown,
  row: Raw,
  type: Source,
): HandoffMilestone;
