// Native port of approved P19 pure JSON owner. See CORE_PROVENANCE.json.
import {
  P19_LINKED_GATE,
  P19_LINKED_MODE,
  P19_LINKED_CONTRACT,
  LINKED_UUID,
  LinkedIssueError,
  linkedObject,
  linkedEnvelope,
  linkedScope,
  linkedCodes,
  linkedMetadata,
  snapshotEqual,
  clone,
} from './linked-contract.js';

const p03 = '/api/v1/mini-app/drafts',
  p19 = '/api/v1/mini-app/warranty-component-issues';
const error = (code, message = code) => {
  throw new LinkedIssueError(code, message);
};
// No default fetch, origin, token or live transport. This adapter is OFF in product.
export function createP19LinkedAdapter({
  offlineRequest = null,
  liveRequest = null,
  mode = P19_LINKED_MODE,
} = {}) {
  let calls = 0;
  const sentKeys = new Set();
  const ready = () => {
    if (mode !== P19_LINKED_MODE) error('P19_MODE_UNSUPPORTED');
    if (liveRequest && offlineRequest) error('P19_TRANSPORT_AMBIGUOUS');
    if (typeof (liveRequest || offlineRequest) !== 'function')
      error('P19_ACTIVATION_OFF');
  };
  async function request(descriptor) {
    ready();
    calls++;
    const r = await (liveRequest || offlineRequest)(
      clone({
        ...descriptor,
        credentials: liveRequest ? 'NATIVE_AUTH_CLIENT' : 'OMITTED_OFFLINE',
        live: !!liveRequest,
      }),
    );
    if (!r || !Number.isInteger(r.status))
      throw new LinkedIssueError(
        'P19_TRANSPORT_UNKNOWN',
        'No verified response.',
        { unknown: true },
      );
    if (r.status >= 400) {
      throw new LinkedIssueError(
        r.body?.error?.code || r.body?.error_code || 'P19_HTTP_ERROR',
        r.body?.message ||
          r.body?.error?.message ||
          'Chưa thể xác minh yêu cầu.',
        {
          status: r.status,
          unknown:
            r.status === 404 ||
            r.status === 408 ||
            r.status === 429 ||
            r.status >= 500,
        },
      );
    }
    return r;
  }
  const id = v => {
    if (!LINKED_UUID.test(v || '')) error('P19_ID_INVALID');
  };
  return {
    gate: P19_LINKED_GATE,
    mode,
    get calls() {
      return calls;
    },
    context: async () =>
      linkedEnvelope(
        await request({
          path: '/api/v1/mini-app/p03/context',
          method: 'GET',
          query: {},
        }),
        { contract: 'mini-app-p03-v1' },
      ),
    case: async (scope, caseId) => {
      linkedScope(scope);
      id(caseId);
      if (
        !scope.permissions.some(p =>
          ['warranty.view', 'warranty.manage'].includes(p),
        )
      )
        error('P19_CASE_READ_DENIED');
      return linkedEnvelope(
        await request({
          path: '/api/v1/mini-app/warranty-cases/' + caseId,
          method: 'GET',
          query: { warehouse_id: scope.warehouseId },
        }),
        { contract: 'mini-app-p09-v1' },
      );
    },
    resolve: async (scope, caseId, raw) => {
      linkedScope(scope);
      id(caseId);
      if (
        typeof raw !== 'string' ||
        !raw.trim() ||
        Array.from(raw).length > 512
      )
        error('P19_RAW_INVALID');
      return linkedEnvelope(
        await request({
          path: p19 + '/resolve-code',
          method: 'POST',
          body: {
            warehouse_id: scope.warehouseId,
            raw_code: raw,
            warranty_case_id: caseId,
          },
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }),
      );
    },
    async execute(frozen) {
      ready();
      const r = clone(frozen);
      linkedScope(r.scope);
      for (const v of [r.draftId, r.scanSessionId, r.key]) id(v);
      if (
        r.mode !== mode ||
        r.lifecycle !== 'NEW_NOT_SENT' ||
        !['SAVE', 'RECORD'].includes(r.command) ||
        r.headers?.['Idempotency-Key'] !== r.key ||
        r.headers.Authorization !== undefined ||
        r.headers['Content-Type'] !== 'application/json'
      )
        error('P19_COMMAND_INVALID');
      if (r.command === 'SAVE') {
        if (
          r.method !== 'PUT' ||
          r.path !== p03 + '/' + r.draftId ||
          r.headers['If-Match'] !== `"${r.draftVersion}"` ||
          !Number.isSafeInteger(r.draftVersion) ||
          r.draftVersion < 0 ||
          r.body.operation !== 'COMPONENT_ISSUE' ||
          r.body.warehouse_id !== r.scope.warehouseId ||
          r.body.scan_session_id !== r.scanSessionId ||
          Object.keys(r.headers).some(
            k =>
              ![
                'Accept',
                'Content-Type',
                'Idempotency-Key',
                'If-Match',
              ].includes(k),
          )
        )
          error('P19_SAVE_INVALID');
        linkedCodes(r.body.codes);
        linkedMetadata(r.body.form?.p19, r.caseId);
        if (
          Object.keys(r.body).some(
            k =>
              ![
                'warehouse_id',
                'operation',
                'scan_session_id',
                'codes',
                'form',
              ].includes(k),
          ) ||
          Object.keys(r.body.form).join(',') !== 'p19'
        )
          error('P19_BODY_INVALID');
      } else {
        if (
          Object.keys(r.headers).some(
            k =>
              ![
                'Accept',
                'Content-Type',
                'Idempotency-Key',
                'X-Component-Issue-Contract',
                'X-Draft-ID',
                'X-Draft-Scan-Session-ID',
                'X-Draft-Version',
              ].includes(k),
          ) ||
          r.method !== 'POST' ||
          r.path !== p19 + '/record' ||
          r.headers['If-Match'] !== undefined ||
          r.headers['X-Component-Issue-Contract'] !== P19_LINKED_CONTRACT ||
          r.headers['X-Draft-ID'] !== r.draftId ||
          r.headers['X-Draft-Scan-Session-ID'] !== r.scanSessionId ||
          r.headers['X-Draft-Version'] !== String(r.draftVersion) ||
          r.draftVersion < 1 ||
          r.lastSaveKey === r.key ||
          !LINKED_UUID.test(r.lastSaveKey || '') ||
          r.confirmed !== true ||
          r.body.post_immediately !== true ||
          r.body.warehouse_id !== r.scope.warehouseId ||
          r.body.warranty_case_id !== r.caseId ||
          !linkedObject(r.savedSnapshot)
        )
          error('P19_RECORD_INVALID');
        linkedCodes(r.body.items, { empty: false });
        if (r.body.items.length > P19_LINKED_GATE.maxRecordRows)
          error(
            'P19_RECORD_LIMIT_PENDING_BE',
            '501–1000 rows require BE limit confirmation.',
          );
        if (
          Object.keys(r.body).some(
            k =>
              ![
                'warehouse_id',
                'warranty_case_id',
                'post_immediately',
                'items',
                'document_date',
                'note',
              ].includes(k),
          )
        )
          error('P19_BODY_INVALID');
        const meta = r.savedSnapshot.form?.p19;
        linkedMetadata(meta, r.caseId);
        if (
          !snapshotEqual(r.savedSnapshot, {
            warehouse_id: r.body.warehouse_id,
            operation: 'COMPONENT_ISSUE',
            scan_session_id: r.scanSessionId,
            codes: r.body.items,
            form: {
              p19: {
                contract: P19_LINKED_CONTRACT,
                warranty_case_id: r.caseId,
                ...(r.body.document_date !== undefined
                  ? { document_date: r.body.document_date }
                  : {}),
                ...(r.body.note !== undefined ? { note: r.body.note } : {}),
              },
            },
          })
        )
          error('P19_SNAPSHOT_MISMATCH');
      }
      if (sentKeys.has(r.key)) error('P19_WRITE_ALREADY_SENT');
      sentKeys.add(r.key);
      const response = await request({
        path: r.path,
        method: r.method,
        headers: r.headers,
        body: r.body,
      });
      const body = linkedEnvelope(response, {
        contract: r.command === 'SAVE' ? 'mini-app-p03-v1' : undefined,
        statuses: r.command === 'SAVE' ? [200, 201] : [201],
      });
      return { body, etag: response.etag ?? null, status: response.status };
    },
    async check(frozen) {
      const r = clone(frozen);
      linkedScope(r.scope);
      for (const v of [r.draftId, r.scanSessionId, r.key]) id(v);
      if (r.mode !== mode || !['SAVE', 'RECORD'].includes(r.command))
        error('P19_RECONCILE_MODE_INVALID');
      return linkedEnvelope(
        await request({
          path: p03 + '/' + r.draftId + '/requests/' + r.key,
          method: 'GET',
          query: {
            warehouse_id: r.scope.warehouseId,
            operation: 'COMPONENT_ISSUE',
            scan_session_id: r.scanSessionId,
            command: r.command,
          },
        }),
        { contract: 'mini-app-p03-v1' },
      );
    },
    async draft(scope, draftId, scanSessionId) {
      linkedScope(scope);
      id(draftId);
      id(scanSessionId);
      return linkedEnvelope(
        await request({
          path: p03 + '/' + draftId,
          method: 'GET',
          query: {
            warehouse_id: scope.warehouseId,
            operation: 'COMPONENT_ISSUE',
            scan_session_id: scanSessionId,
          },
        }),
        { contract: 'mini-app-p03-v1' },
      );
    },
    async current(scope, businessId) {
      linkedScope(scope);
      id(businessId);
      return linkedEnvelope(
        await request({
          path: p19 + '/' + businessId,
          method: 'GET',
          query: {},
        }),
      );
    },
  };
}
