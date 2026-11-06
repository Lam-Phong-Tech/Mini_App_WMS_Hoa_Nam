import { AppError } from '../errors/AppError';
import { p12DevEnabled } from './p12Release';
import type { AppEnvironment } from './env';

export const BE_APP_READ_RELEASE = Object.freeze({
  source: 'a9053a21bc35ece367be0b76db727d4749b59855',
  p11CommandsEnabled: false,
  productionEnabled: false,
});
const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
export function assertBeAppRead(
  options: {
    method?: string;
    path: string;
    beAppRead?: 'p13' | 'p18-boxes' | 'p18-location';
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    responseType?: string;
    receiptTransport?: string;
  },
  environment: AppEnvironment,
) {
  const headers = options.headers ?? {},
    keys = Object.keys(headers),
    mode = options.beAppRead;
  const opted = keys.some(k =>
    [
      'x-read-fields-contract',
      'x-container-read-contract',
      'x-component-location-contract',
    ].includes(k.toLowerCase()),
  );
  if (!mode && !opted) return;
  const expected: Record<string, string> = {
    'x-read-fields-contract': 'explicit-read-fields-v1',
    ...(mode === 'p18-boxes'
      ? { 'x-container-read-contract': 'p18-single-warehouse-boxes-v1' }
      : {}),
    ...(mode === 'p18-location'
      ? { 'x-component-location-contract': 'p18-component-location-read-v1' }
      : {}),
  };
  const validPath =
    mode === 'p13'
      ? options.path === '/api/v1/mini-app/documents'
      : mode === 'p18-location'
      ? new RegExp(
          '^/api/v1/(?:containers|item-instances)/' + uuid + '$',
          'i',
        ).test(options.path)
      : mode === 'p18-boxes' &&
        new RegExp('^/api/v1/containers(?:/' + uuid + ')?$', 'i').test(
          options.path,
        );
  if (
    !p12DevEnabled(environment) ||
    !validPath ||
    (options.method ?? 'GET') !== 'GET' ||
    Object.hasOwn(options, 'body') ||
    options.responseType ||
    options.receiptTransport ||
    (mode === 'p18-location' &&
      (!options.query ||
        Object.keys(options.query).length !== 1 ||
        !new RegExp('^' + uuid + '$', 'i').test(
          String(options.query.warehouse_id),
        ))) ||
    keys.length !== Object.keys(expected).length ||
    !keys.every(
      k =>
        Object.hasOwn(expected, k.toLowerCase()) &&
        headers[k] === expected[k.toLowerCase()],
    )
  )
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'BE_RELEASE_GET_ONLY',
      message:
        'Contract đọc mới chỉ mở cho đúng GET P13/BOX/vị trí linh kiện trên DEV/TEST.',
    });
}
