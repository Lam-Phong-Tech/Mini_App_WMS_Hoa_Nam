import type { RequestOptions } from './client';
import type { AppEnvironment } from '../config/env';
import { p12DevEnabled } from '../config/p12Release';
import { AppError } from '../errors/AppError';
import {
  P12_TIMELINE_CONTRACT,
  P12_TIMELINE_HEADER,
} from '../features/documents/p12/timelineHandoff';

/** Restrict the optional candidate header to the two existing scoped GETs. */
export function assertP12TimelineRead(
  options: RequestOptions,
  environment: AppEnvironment,
) {
  const headers = Object.entries(options.headers ?? {}).filter(
    ([name]) => name.toLowerCase() === P12_TIMELINE_HEADER.toLowerCase(),
  );
  if (!headers.length) return;
  const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
  if (
    headers.length !== 1 ||
    headers[0][1] !== P12_TIMELINE_CONTRACT ||
    (options.method ?? 'GET') !== 'GET' ||
    options.p12Read !== true ||
    !new RegExp(
      '^/api/v1/mini-app/(?:inbound|outbound)-documents/' + uuid + '$',
      'i',
    ).test(options.path) ||
    !new RegExp('^' + uuid + '$', 'i').test(
      String(options.query?.warehouse_id ?? ''),
    ) ||
    Object.hasOwn(options, 'body') ||
    !p12DevEnabled(environment)
  ) {
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P12_TIMELINE_GET_ONLY',
      message:
        'Mốc gửi Web chỉ được đọc trên chi tiết phiếu nhập hoặc xuất trong kho đã xác minh.',
    });
  }
}
