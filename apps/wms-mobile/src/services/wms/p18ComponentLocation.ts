import { apiClient } from '../../api/client';
import { ownerUuid } from '../../app/ownerNavigation';
import { getActiveSession } from '../../auth/session';
import { getCurrentEnvironment, type AppEnvironment } from '../../config/env';
import { p12DevEnabled } from '../../config/p12Release';
import { AppError } from '../../errors/AppError';
import type { Scope } from '../../features/documents/p12/contract';
import { p12Scope, type Context } from '../../features/documents/p12/service';
import {
  compareDocumentTimestamps,
  parseDocumentTimestamp,
} from './documentTimestamps';
import {
  explicitRead,
  EXPLICIT_READ_HEADER,
  readAssert,
  readInteger,
  readObject,
  readString,
  type ReadField,
} from './explicitReadFields';
import { fetchCurrentUser } from './queries';
import type { ReadClient } from './readOnlyClient';
import type { CurrentUser } from './types';

export const P18_LOCATION_CONTRACT = 'p18-component-location-read-v1';
export const P18_LOCATION_REVISION = 'p18-component-location-read-r1';
export const P18_LOCATION_POLICY_REVISION='p18-component-location-read-r2';
export const P18_LOCATION_BE_SOURCE =
  '99ffd6c652a662470c762da3487e743ccb67497a';
export type ComponentLocationTarget = { kind: 'ITEM' | 'BOX'; id: string };
export interface ComponentPlacement {
  id: string;
  code: string;
  label: string;
  warehouseId: string;
  effectiveAt: string;
  observedAt: string;
  placementVersion: number;
  boxVersion: number;
  locationVersion: number;
  eventId: string;
  receiptId: string;
  parentBoxId?: string;
  membershipId?: string;
  membershipVersion?: number;
}
export interface ComponentLocation {
  target: ComponentLocationTarget;
  warehouseId: string;
  physicalCode: ReadField<string>;
  skuId: ReadField<string>;
  skuCode: ReadField<string>;
  name: ReadField<string>;
  unit: ReadField<string>;
  skuStatus?:ReadField<string>;
  masterReadPolicy?:'INACTIVE_READ_ALLOWED_NOT_ISSUE_ELIGIBILITY';
  location: ReadField<ComponentPlacement>;
  requestId: string;
  revision: typeof P18_LOCATION_REVISION;
  snapshot: { id: string; observedAt: string; consistency: string };
}
export function componentLocationTarget(
  value: unknown,
): ComponentLocationTarget {
  const t = readObject(value);
  readAssert(
    Object.keys(t).length === 2 &&
      ['ITEM', 'BOX'].includes(String(t.kind)) &&
      ownerUuid(t.id),
    'P18_LOCATION_TARGET_INVALID',
  );
  return { kind: t.kind as 'ITEM' | 'BOX', id: t.id };
}
export function canReadComponentLocation(
  rights: readonly string[],
  kind: 'ITEM' | 'BOX',
) {
  return (
    rights.includes('sku.view') &&
    (kind === 'ITEM'
      ? rights.includes('item_instance.view')
      : ['container.view', 'putaway.view', 'putaway.manage'].some(p =>
          rights.includes(p),
        ))
  );
}
const text = (v: unknown): v is string => readString(v) && v.trim().length > 0;
const version = (v: unknown): v is number => readInteger(v) && v >= 1;
const statuses = ['NOT_RECORDED', 'SOURCE_INCONSISTENT', 'REDACTED_PERMISSION'];
export function parseComponentLocation(
  value: unknown,
  scope: Scope,
  input: ComponentLocationTarget,
): ComponentLocation {
  const target = componentLocationTarget(input),
    r = explicitRead(value, P18_LOCATION_CONTRACT),
    d = readObject(r.body.data),
    m = r.meta,
    identity = readObject(d.identity),
    snapshot = readObject(m.snapshot),
    capability = readObject(m.capability);
  const observed = parseDocumentTimestamp(snapshot.observed_at);
  readAssert(
    m.revision === P18_LOCATION_REVISION &&
      text(m.request_id) &&
      m.timestamp_contract === 'document-timestamps-v1' &&
      ownerUuid(snapshot.id) &&
      observed.status === 'RECORDED' &&
      String(snapshot.observed_at).endsWith('Z') &&
      ['SINGLE_RESPONSE_DATABASE_SNAPSHOT', 'ENCLOSING_TRANSACTION'].includes(
        String(snapshot.consistency),
      ) &&
      snapshot.cross_request_snapshot === false &&
      capability.supported === true &&
      capability.model === 'CONFIRMED_BOX_PUTAWAY' &&
      capability.direct_item_placement_supported === false &&
      Array.isArray(capability.write_operations) &&
      capability.write_operations.length === 0 &&
      m.cache_policy === 'NO_INTERNAL_RESULT_CACHE' &&
      [
        'SINGLE_TENANT_DATABASE_REQUIRED',
        'TRUSTED_ACTOR_WAREHOUSE_AND_SOURCE_COLUMNS',
      ].includes(String(m.tenant_policy)) &&
      d.warehouse_id === scope.warehouseId &&
      d.warehouse_scope_basis ===
        'SINGLE_WAREHOUSE_REGISTER_NOT_PHYSICAL_PLACEMENT' &&
      d.master_source === 'sku' &&
      d.master_semantics === 'CURRENT_DIRECTORY_NOT_HISTORICAL_SNAPSHOT' &&
      d.stock_effect === 'NONE' &&
      identity.kind === target.kind &&
      identity[target.kind === 'ITEM' ? 'item_id' : 'container_id'] ===
        target.id &&
      !Object.hasOwn(
        identity,
        target.kind === 'ITEM' ? 'container_id' : 'item_id',
      ),
    'P18_LOCATION_SCOPE_OR_CONTRACT_INVALID',
  );
  const physicalCode = r.field('/data/identity/physical_code', text),
    skuId = r.field('/data/sku_id', ownerUuid),
    skuCode = r.field('/data/sku_code', text),
    name = r.field('/data/component_name', text),
    unit = r.field('/data/unit', text);
  let skuStatus:ReadField<string>|undefined;
  const policySupplied=Object.hasOwn(m,'policy_revision')||Object.hasOwn(d,'master_read_policy')||Object.hasOwn(d,'sku_status_availability');
  if(policySupplied){
    readAssert(m.policy_revision===P18_LOCATION_POLICY_REVISION&&d.master_read_policy==='INACTIVE_READ_ALLOWED_NOT_ISSUE_ELIGIBILITY','P18_LOCATION_MASTER_POLICY_INVALID');
    skuStatus=r.field('/data/sku_status',(v):v is string=>typeof v==='string'&&/^[A-Z][A-Z0-9_]*$/.test(v));
    readAssert(skuStatus.supplied?d.sku_status_availability==='CURRENT_DIRECTORY':skuStatus.status==='NOT_RECORDED'&&d.sku_status_availability==='NOT_RECORDED','P18_LOCATION_SKU_STATUS_INVALID');
  }
  readAssert(
    physicalCode.supplied
      ? identity.physical_code_status === 'RECORDED_PHYSICAL_CODE'
      : ['NOT_RECORDED', 'SOURCE_INCONSISTENT'].includes(physicalCode.status) &&
          identity.physical_code_status === physicalCode.status,
    'P18_LOCATION_PHYSICAL_CODE_INVALID',
  );
  for (const [key, field] of [
    ['sku_id', skuId],
    ['sku_code', skuCode],
    ['component_name', name],
    ['unit', unit],
  ] as const) {
    readAssert(
      field.supplied
        ? d[key + '_status'] === 'CURRENT_DIRECTORY'
        : field.status === 'NOT_RECORDED' &&
            d[key + '_status'] === field.status,
      'P18_LOCATION_MASTER_INVALID',
    );
  }
  for (const key of ['hierarchy', 'capacity']) {
    const f = r.field('/data/' + key, readString);
    readAssert(
      !f.supplied &&
        f.status === 'NOT_CONFIGURED' &&
        d[key + '_status'] === f.status,
      'P18_LOCATION_MODEL_INVALID',
    );
  }
  const locationField = r.field(
    '/data/current_location',
    (v): v is Record<string, unknown> =>
      Boolean(v && typeof v === 'object' && !Array.isArray(v)),
  );
  let location: ReadField<ComponentPlacement>;
  if (locationField.supplied) {
    const l = locationField.value,
      p = readObject(l.provenance),
      effective = parseDocumentTimestamp(l.effective_at);
    readAssert(
      ['putaway.view', 'putaway.manage'].some(k => scope.rights.includes(k)) &&
        d.current_location_status === 'RECORDED' &&
        ownerUuid(l.location_id) &&
        text(l.location_code) &&
        l.location_label === l.location_code &&
        l.location_kind === 'TRAY' &&
        l.label_semantics === 'ACTUAL_CONTAINER_CODE_NOT_SHELF_OR_BIN' &&
        l.warehouse_id === scope.warehouseId &&
        version(l.placement_version) &&
        version(l.box_version) &&
        version(l.location_version) &&
        effective.status === 'RECORDED' &&
        String(l.effective_at).endsWith('Z') &&
        l.observed_at === snapshot.observed_at &&
        compareDocumentTimestamps(effective, observed) <= 0 &&
        ownerUuid(p.event_id) &&
        ownerUuid(p.receipt_id) &&
        p.event_source === 'putaway_events' &&
        p.effective_time_source === 'putaway_events.confirmed_at' &&
        p.parent_source === 'containers.parent_container_id' &&
        p.location_source === 'containers.container_id/container_code',
      'P18_LOCATION_PROOF_INVALID',
    );
    let parentBoxId: string | undefined;
    if (target.kind === 'ITEM') {
      const parent = readObject(d.parent_container_identity);
      readAssert(
        p.basis === 'ACTIVE_ITEM_MEMBERSHIP_AND_CONFIRMED_BOX_PUTAWAY' &&
          ownerUuid(p.membership_id) &&
          version(p.membership_version) &&
          parent.kind === 'BOX' &&
          ownerUuid(parent.container_id),
        'P18_LOCATION_MEMBERSHIP_INVALID',
      );
      parentBoxId = parent.container_id;
    } else
      readAssert(
        p.basis === 'CONFIRMED_BOX_PUTAWAY_AND_CURRENT_PARENT' &&
          !Object.hasOwn(d, 'parent_container_identity'),
        'P18_LOCATION_PROOF_INVALID',
      );
    location = {
      supplied: true,
      value: {
        id: l.location_id,
        code: l.location_code,
        label: l.location_label,
        warehouseId: scope.warehouseId,
        effectiveAt: l.effective_at as string,
        observedAt: l.observed_at as string,
        placementVersion: l.placement_version,
        boxVersion: l.box_version,
        locationVersion: l.location_version,
        eventId: p.event_id,
        receiptId: p.receipt_id,
        ...(parentBoxId
          ? {
              parentBoxId,
              membershipId: p.membership_id as string,
              membershipVersion: p.membership_version as number,
            }
          : {}),
      },
    };
  } else {
    readAssert(
      statuses.includes(locationField.status) &&
        d.current_location_status === locationField.status &&
        !Object.hasOwn(d, 'parent_container_identity'),
      'P18_LOCATION_AVAILABILITY_INVALID',
    );
    location = locationField;
  }
  return {
    target,
    warehouseId: scope.warehouseId,
    physicalCode,
    skuId,
    skuCode,
    name,
    unit,
    ...(skuStatus?{skuStatus,masterReadPolicy:'INACTIVE_READ_ALLOWED_NOT_ISSUE_ELIGIBILITY' as const}:{}),
    location,
    requestId: m.request_id,
    revision: P18_LOCATION_REVISION,
    snapshot: {
      id: snapshot.id,
      observedAt: snapshot.observed_at as string,
      consistency: String(snapshot.consistency),
    },
  };
}
export function createP18LocationService(
  getContext: () => Context,
  deps: {
    client?: ReadClient;
    environment?: AppEnvironment;
    freshUser?: (signal?: AbortSignal) => Promise<CurrentUser>;
  } = {},
) {
  const client = deps.client ?? apiClient,
    environment = deps.environment ?? getCurrentEnvironment(),
    freshUser = deps.freshUser ?? (signal => fetchCurrentUser({ signal }));
  const scope = () =>
      p12Scope({ ...getContext(), session: getActiveSession() }),
    key = (s: Scope) => JSON.stringify(s);
  return {
    scopeKey: () => key(scope()),
    async read(
      input: ComponentLocationTarget,
      signal?: AbortSignal,
    ): Promise<ComponentLocation> {
      const target = componentLocationTarget(input);
      if (!p12DevEnabled(environment))
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'P18_LOCATION_DEV_ONLY',
          message: 'Vị trí linh kiện chỉ mở trên DEV/TEST.',
        });
      const captured = scope(),
        owner = key(captured);
      if (!canReadComponentLocation(captured.rights, target.kind))
        throw new AppError({
          kind: 'http',
          status: 403,
          code: 'P18_LOCATION_FORBIDDEN',
          message: 'Không có quyền đọc hiện vật này.',
        });
      const c = new AbortController(),
        abort = () => c.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const current = () => {
        let matches = false;
        try {
          matches = key(scope()) === owner;
        } catch {
          /* An incomplete/revoked context is stale too. */
        }
        if (c.signal.aborted || !matches)
          throw new AppError({
            kind: 'cancelled',
            code: 'P18_LOCATION_SCOPE_CHANGED',
            message: 'Phiên, kho hoặc quyền đã thay đổi. Cần đọc lại.',
          });
      };
      try {
        return await Promise.race([
          (async () => {
            current();
            const user = await freshUser(c.signal);
            current();
            const fresh = p12Scope({ session: getActiveSession(), user });
            if (
              user.status !== 'ACTIVE' ||
              key(fresh) !== owner ||
              !canReadComponentLocation(fresh.rights, target.kind)
            )
              throw new AppError({
                kind: 'http',
                status: 403,
                code: 'P18_LOCATION_RIGHTS_CHANGED',
                message: 'Quyền hoặc kho đã thay đổi. Cần xác nhận lại phiên.',
              });
            const res = await client.get<unknown>(
              '/api/v1/' +
                (target.kind === 'BOX' ? 'containers/' : 'item-instances/') +
                target.id,
              {
                query: { warehouse_id: fresh.warehouseId },
                beAppRead: 'p18-location',
                signal: c.signal,
                headers: {
                  ...EXPLICIT_READ_HEADER,
                  'X-Component-Location-Contract': P18_LOCATION_CONTRACT,
                },
              },
            );
            current();
            const h = (k: string) => res.header?.(k),
              vary = (h('Vary') ?? '')
                .toLowerCase()
                .split(',')
                .map(v => v.trim()),
              cache = h('Cache-Control') ?? '';
            readAssert(
              res.status === 200 &&
                cache.includes('private') &&
                cache.includes('no-store') &&
                h('Content-Type')?.split(';')[0] === 'application/json' &&
                h('X-Content-Type-Options') === 'nosniff' &&
                h('X-Read-Fields-Contract') === 'explicit-read-fields-v1' &&
                [
                  'authorization',
                  'origin',
                  'x-component-location-contract',
                  'x-read-fields-contract',
                ].every(k => vary.includes(k)) &&
                !h('ETag') &&
                !h('Last-Modified'),
              'P18_LOCATION_PRIVATE_HEADERS_INVALID',
            );
            const result = parseComponentLocation(res.data, fresh, target);
            readAssert(
              h('X-Request-ID') === result.requestId,
              'P18_LOCATION_REQUEST_ID_INVALID',
            );
            return result;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              abort();
              reject(
                new AppError({
                  kind: 'timeout',
                  message: 'Đọc vị trí quá thời gian. Vui lòng thử lại.',
                }),
              );
            }, 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}
export type P18LocationService = ReturnType<typeof createP18LocationService>;
