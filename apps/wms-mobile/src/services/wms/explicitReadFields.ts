import { AppError } from '../../errors/AppError';

export type ReadObject = Record<string, unknown>;
export function readAssert(value: unknown, code: string): asserts value {
  if (!value)
    throw new AppError({
      kind: 'parse',
      code,
      message:
        'Dữ liệu đọc chưa khớp contract hoặc phạm vi được cấp. Vui lòng tải lại.',
    });
}
export function readObject(value: unknown): ReadObject {
  readAssert(
    value && typeof value === 'object' && !Array.isArray(value),
    'READ_OBJECT_INVALID',
  );
  return value as ReadObject;
}
export type ReadField<T> =
  | { supplied: true; value: T }
  | { supplied: false; status: string };
const CONTRACT = 'explicit-read-fields-v1';
export const EXPLICIT_READ_HEADER = { 'X-Read-Fields-Contract': CONTRACT };
function parts(path: string) {
  readAssert(/^\/(?:[^~]|~[01])*$/.test(path), 'READ_POINTER_INVALID');
  return path
    .slice(1)
    .split('/')
    .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}
function at(
  root: unknown,
  path: string,
): { present: boolean; value?: unknown } {
  let node = root;
  for (const part of parts(path)) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, part))
      return { present: false };
    node = (node as ReadObject)[part];
  }
  return { present: true, value: node };
}
/** Separate representation. Never rehydrate nulls or feed an old nullable decoder. */
export function explicitRead(value: unknown, owner: string) {
  const body = readObject(value),
    meta = readObject(body.meta),
    info = readObject(meta.read_fields);
  readAssert(
    body.success === true &&
      meta.contract === CONTRACT &&
      info.contract === CONTRACT &&
      info.owner_contract === owner &&
      info.value_policy ===
        'KNOWN_VALUES_UNCHANGED_ABSENT_VALUES_EXPLAINED_NO_NULL_OR_FAKE_DEFAULTS' &&
      Array.isArray(info.missing_fields) &&
      info.missing_fields.length <= 10000,
    'READ_CONTRACT_INVALID',
  );
  const walk = (node: unknown, depth: number) => {
    readAssert(
      depth <= 64 && node !== null && node !== undefined,
      'READ_NULL_OR_DEPTH_INVALID',
    );
    if (typeof node === 'object')
      Object.values(node as ReadObject).forEach(v => walk(v, depth + 1));
    else
      readAssert(
        ['string', 'boolean', 'number'].includes(typeof node) &&
          (typeof node !== 'number' || Number.isFinite(node)),
        'READ_VALUE_INVALID',
      );
  };
  walk(body, 0);
  const missing = new Map<string, string>();
  for (const raw of info.missing_fields) {
    const entry = readObject(raw);
    readAssert(
      typeof entry.path === 'string' &&
        typeof entry.status === 'string' &&
        /^[A-Z][A-Z0-9_]{0,99}$/.test(entry.status) &&
        entry.source === 'AUTHORIZED_OWNER_RESPONSE' &&
        entry.value_supplied === false &&
        !missing.has(entry.path) &&
        !at(body, entry.path).present &&
        Object.keys(entry).every(k =>
          [
            'path',
            'status',
            'source',
            'value_supplied',
            'owner_status',
          ].includes(k),
        ) &&
        (entry.owner_status === undefined ||
          (typeof entry.owner_status === 'string' &&
            /^[A-Z][A-Z0-9_]{0,99}$/.test(entry.owner_status))),
      'READ_AVAILABILITY_INVALID',
    );
    missing.set(entry.path, entry.status);
  }
  const precondition =
    info.owner_precondition === undefined
      ? undefined
      : readObject(info.owner_precondition);
  if (precondition)
    readAssert(
      typeof precondition.etag === 'string' &&
        precondition.etag.length > 0 &&
        precondition.source === 'EXACT_OWNER_RESPONSE_HEADER' &&
        precondition.use ===
          'ORIGINAL_OWNER_IF_MATCH_ONLY_NOT_HTTP_CACHE_VALIDATOR',
      'READ_PRECONDITION_INVALID',
    );
  return {
    body,
    meta,
    ownerPrecondition: precondition?.etag as string | undefined,
    field<T>(path: string, valid: (v: unknown) => v is T): ReadField<T> {
      const result = at(body, path);
      if (result.present) {
        readAssert(valid(result.value), 'READ_FIELD_INVALID');
        return { supplied: true, value: result.value };
      }
      const status = missing.get(path);
      readAssert(status, 'READ_AVAILABILITY_MISSING');
      return { supplied: false, status };
    },
  };
}
export const readString = (v: unknown): v is string => typeof v === 'string';
export const readInteger = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
export const readBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
export const readInstant = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) ===
    v.slice(0, 10);
