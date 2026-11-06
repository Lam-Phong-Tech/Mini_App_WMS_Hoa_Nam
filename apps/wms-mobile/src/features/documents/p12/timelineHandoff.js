import { parseDocumentTimestamp } from '../../../services/wms/documentTimestamps';

export const P12_TIMELINE_CONTRACT = 'p12-timeline-handoff-v1';
export const P12_TIMELINE_HEADER = 'X-P12-Timeline-Contract';
const table = 'mini_app_web_post_handoffs';
const missing = 'NOT_RECORDED_IN_HANDOFF_SOURCE';
const evidence =
  'PERSISTED_SUBMISSION_INTENT_NOT_CURRENT_WAITING_OR_DELIVERY_ACK';
const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid() {
  const error = new Error('Chưa xác minh được thời điểm gửi phiếu lên Web.');
  error.code = 'P12_TIMELINE_HANDOFF_INVALID';
  throw error;
}

/** Opt-in extension only. Its persisted submission time is not a delivery ACK. */
export function parseHandoffMilestone(milestone, row, type) {
  if (
    !['inbound', 'outbound'].includes(type) ||
    !object(milestone) ||
    milestone.event_id !== null ||
    milestone.actor !== null ||
    milestone.actor_status !== missing ||
    milestone.description !== null ||
    milestone.description_status !== missing ||
    milestone.evidence_kind !== evidence
  )
    invalid();

  const result = {
    availability: milestone.availability,
    occurred_at: milestone.occurred_at,
    timestamp_source: milestone.timestamp_source,
    event_id: null,
    actor: null,
    actor_status: missing,
    description: null,
    description_status: missing,
    evidence_kind: evidence,
  };
  const projection = row.p13;
  if (milestone.availability === 'NOT_RECORDED') {
    if (
      milestone.occurred_at !== null ||
      milestone.timestamp_source !== null ||
      Object.hasOwn(milestone, 'source_record') ||
      projection?.current_handoff_availability !== 'NOT_ESTABLISHED'
    )
      invalid();
    return result;
  }

  const source = milestone.source_record;
  const handoff = projection?.current_handoff;
  const warehouse =
    row[type === 'inbound' ? 'dst_warehouse_id' : 'src_warehouse_id'];
  if (
    milestone.availability !== 'RECORDED' ||
    typeof milestone.occurred_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(
      milestone.occurred_at,
    ) ||
    parseDocumentTimestamp(milestone.occurred_at).status !== 'RECORDED' ||
    milestone.timestamp_source !== table + '.submitted_at' ||
    !object(source) ||
    source.table !== table ||
    source.document_id !== row.id ||
    source.warehouse_id !== warehouse ||
    !Number.isSafeInteger(source.document_version_at_record) ||
    source.document_version_at_record < 1 ||
    projection?.current_handoff_availability !== 'RECORDED' ||
    !object(handoff) ||
    handoff.contract !== 'p13-web-post-queue-v1' ||
    handoff.source !== table + '+stock_documents.status' ||
    handoff.warehouse_id !== warehouse ||
    handoff.submitted_at !== milestone.occurred_at ||
    handoff.document_version_at_record !== source.document_version_at_record
  )
    invalid();

  return {
    ...result,
    source_record: {
      table,
      document_id: source.document_id,
      warehouse_id: source.warehouse_id,
      document_version_at_record: source.document_version_at_record,
    },
  };
}
