/** Synthetic visual evidence only; never imported by the release entry. */
import { P12_TIMELINE_CONTRACT } from '../features/documents/p12/timelineHandoff';

export function localHandoffTimeline(body: Record<string, any>) {
  const result = JSON.parse(JSON.stringify(body));
  const row = result.data;
  const table = 'mini_app_web_post_handoffs';
  const warehouse =
    row.doc_type === 'receipt' ? row.dst_warehouse_id : row.src_warehouse_id;
  const submittedAt = '2026-09-27T02:20:00.123456Z';
  result.meta.p12.timeline_contract = P12_TIMELINE_CONTRACT;
  row.p12.timeline.contract = P12_TIMELINE_CONTRACT;
  row.p13 = {
    current_handoff_availability: 'RECORDED',
    current_handoff: {
      contract: 'p13-web-post-queue-v1',
      source: table + '+stock_documents.status',
      warehouse_id: warehouse,
      document_version_at_record: 1,
      submitted_at: submittedAt,
    },
  };
  row.p12.timeline.milestones.sent_to_web = {
    availability: 'RECORDED',
    occurred_at: submittedAt,
    timestamp_source: table + '.submitted_at',
    event_id: null,
    actor: null,
    actor_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    description: null,
    description_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    evidence_kind:
      'PERSISTED_SUBMISSION_INTENT_NOT_CURRENT_WAITING_OR_DELIVERY_ACK',
    source_record: {
      table,
      document_id: row.id,
      warehouse_id: warehouse,
      document_version_at_record: 1,
    },
  };
  return result;
}
