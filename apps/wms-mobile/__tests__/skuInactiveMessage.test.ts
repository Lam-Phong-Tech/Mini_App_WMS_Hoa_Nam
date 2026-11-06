import {
  skuCodeFromErrorBody,
  skuInactiveMessage,
} from '../src/errors/skuInactiveMessage';
import { createApiClient } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import type { AppEnvironment } from '../src/config/env';

test('formats only SKU_INACTIVE and never rewrites another business outcome', () => {
  expect(
    skuInactiveMessage(
      'SKU_INACTIVE',
      'SKU trong QR đang không Đang hoạt động.',
      'DF123456',
    ),
  ).toBe(
    'Sản phẩm DF123456 đang ngừng hoạt động. Liên hệ quản trị để kiểm tra.',
  );
  expect(skuInactiveMessage('SKU_INACTIVE', 'ACTIVE')).toBe(
    'Sản phẩm này đang ngừng hoạt động. Liên hệ quản trị để kiểm tra.',
  );
  expect(
    skuInactiveMessage(
      'ITEM_NOT_AVAILABLE',
      'Item hiện không ở trạng thái IN_STOCK.',
      'DF123456',
    ),
  ).toBe('Item hiện không ở trạng thái IN_STOCK.');
  expect(skuInactiveMessage(undefined, 'Mất mạng')).toBe('Mất mạng');
});

test('uses sku_code from canonical error details, never prefixes or guessed SKU fields', () => {
  expect(
    skuCodeFromErrorBody({
      error: {
        code: 'SKU_INACTIVE',
        details: { sku_code: 'DF123456', status: 'INACTIVE' },
      },
    }),
  ).toBe('DF123456');
  expect(skuCodeFromErrorBody({ errors: { sku_code: 'DF1234567' } })).toBe(
    'DF1234567',
  );
  expect(
    skuCodeFromErrorBody({ error: { details: { sku_code: ['DF123456'] } } }),
  ).toBeUndefined();
  expect(
    skuCodeFromErrorBody({ data: { sku_code: 'WRONG-SOURCE' } }),
  ).toBeUndefined();
});

test('real HTTP pipeline keeps 422/code/route/request ID and no retry while presenting the new message', async () => {
  const body = {
    success: false,
    message: 'SKU trong QR đang không Đang hoạt động.',
    error: {
      code: 'SKU_INACTIVE',
      details: { sku_code: 'DF123456', status: 'INACTIVE' },
    },
    meta: { request_id: 'sku-message-check' },
  };
  const before = JSON.stringify(body);
  const fetchImpl = jest.fn(async () => ({
    ok: false,
    status: 422,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  }));
  const environment: AppEnvironment = {
    name: 'dev-test',
    label: 'DEV test',
    apiBaseUrl: 'https://example.invalid',
    requestTimeoutMs: 1000,
    expectedTier: 'dev-test',
    environmentClassVerified: true,
    wmsGateApproved: true,
    behindEdgeProxy: false,
  };
  const log = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const client = createApiClient({
    environment,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    log,
    getSession: () => undefined,
  });
  let error!: AppError;
  try {
    await client.request({
      method: 'POST',
      path: '/api/v1/mini-app/outbound/resolve-code',
      body: {
        warehouse_id: 'wh-test',
        raw_code: 'HN1|SKU=DF123456|ITEM=DF123456-01|SER=DF123456-01',
      },
    });
  } catch (caught) {
    error = caught as AppError;
  }
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({
    status: 422,
    code: 'SKU_INACTIVE',
    route: '/api/v1/mini-app/outbound/resolve-code',
    requestId: 'sku-message-check',
    message:
      'Sản phẩm DF123456 đang ngừng hoạt động. Liên hệ quản trị để kiểm tra.',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(body)).toBe(before);
});
