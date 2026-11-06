/**
 * Tầng **GHI** của luồng bảo hành — `GATE_WMS §2i`.
 *
 * Người dùng duyệt **G, H, I, J**, trả lời rõ **"chưa duyệt K"** cho
 * `DELETE warranty-attachments/{id}`.
 *
 * K đặc biệt ở hai chỗ, nên có nhóm test canh riêng: nó **xoá vĩnh viễn**, và
 * nó sẽ là method `DELETE` **đầu tiên** trong danh sách trắng.
 */

import {
  ATTACHMENT_TYPES,
  ATTACHMENT_UPLOAD_TIMEOUT_MS,
  WARRANTY_WRITE_PATHS,
  assertApprovedWarrantyWrite,
  createWarrantyCase,
  isEligibleForWarranty,
  resolveWarrantyCode,
  updateWarrantyStatus,
  uploadWarrantyAttachment,
  uploadOwnerAttachment,
  reconcileOwnerAttachment,
  hashAttachmentFile,
  OWNER_ATTACHMENT_UPLOAD_CONTRACT,
  warrantyAttachmentsPath,
  warrantyStatusPath,
  type WriteClient,
} from '../src/services/wms/warrantyWrite';
import {
  allowsIdempotencyKey,
  allowsIfMatch,
  approvedWriteFor,
  usesMultipart,
} from '../src/api/writeGate';
import { AppError } from '../src/errors/AppError';
import { setSession, clearSession } from '../src/auth/session';

interface Sent {
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function spyClient(response: unknown = { data: {} }) {
  const sent: Sent[] = [];
  const client: WriteClient = {
    async request<T>(options: {
      path: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }) {
      sent.push({
        path: options.path,
        method: options.method,
        body: options.body,
        headers: options.headers,
        timeoutMs: options.timeoutMs,
      });
      return { status: 200, data: response as T };
    },
  };
  return { client, sent };
}

// ---------------------------------------------------------------------------
// 🔴 K — xoá file
// ---------------------------------------------------------------------------

describe('🔴 K — xoá file đính kèm: chưa duyệt', () => {
  const PATHS = [
    '/api/v1/mini-app/warranty-attachments/1',
    '/api/v1/mini-app/warranty-attachments/abc-123',
  ];

  it('module ghi KHÔNG phơi ra hàm nào xoá file', () => {
    const module = require('../src/services/wms/warrantyWrite');
    const names = Object.keys(module).join(' ').toLowerCase();
    expect(names).not.toContain('delete');
    expect(names).not.toContain('remove');
  });

  it.each(PATHS)('cổng ghi chặn DELETE %s', path => {
    expect(approvedWriteFor('DELETE', path)).toBeUndefined();
    expect(() => assertApprovedWarrantyWrite('DELETE', path)).toThrow(AppError);
  });

  it('🔒 KHÔNG method DELETE nào được duyệt, ở bất kỳ đường nào', () => {
    // K sẽ là DELETE đầu tiên. Chừng nào chưa duyệt, cổng phải từ chối DELETE
    // trên MỌI đường — kể cả những đường đã duyệt cho POST.
    for (const path of [
      ...PATHS,
      '/api/v1/mini-app/warranty-cases',
      '/api/v1/mini-app/warranty-cases/1/status',
      '/api/v1/mini-app/inbound/record',
      '/api/v1/roles/1',
    ]) {
      expect(approvedWriteFor('DELETE', path)).toBeUndefined();
    }
  });

  it('thông báo nói RÕ xoá file là thứ chưa được duyệt', () => {
    let message = '';
    try {
      assertApprovedWarrantyWrite('DELETE', PATHS[0] ?? '');
    } catch (error) {
      message = (error as AppError).message;
    }
    expect(message).toContain('GATE_WMS §2i');
    expect(message).toContain('XOÁ');
  });
});

// ---------------------------------------------------------------------------
// G — resolve-code
// ---------------------------------------------------------------------------

describe('G — warranty/resolve-code', () => {
  it('gửi đúng đường dẫn và mã thô', async () => {
    const { client, sent } = spyClient({ data: { sku_code: 'X' } });
    await resolveWarrantyCode('SN-12345', {}, client);
    expect(sent[0]?.path).toBe(WARRANTY_WRITE_PATHS.resolveCode);
    expect(sent[0]?.body).toEqual({ raw_code: 'SN-12345' });
  });

  it('KHÔNG gắn Idempotency-Key', async () => {
    const { client, sent } = spyClient({ data: {} });
    await resolveWarrantyCode('X', {}, client);
    expect(JSON.stringify(sent[0]?.headers ?? {})).not.toContain('dempotency');
    expect(allowsIdempotencyKey('POST', WARRANTY_WRITE_PATHS.resolveCode)).toBe(
      false,
    );
  });

  it('🔒 thiếu eligible_for_warranty ⇒ coi là KHÔNG đủ điều kiện', () => {
    expect(isEligibleForWarranty({})).toBe(false);
    expect(isEligibleForWarranty({ eligible_for_warranty: false })).toBe(false);
    expect(isEligibleForWarranty({ eligible_for_warranty: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H — tạo hồ sơ
// ---------------------------------------------------------------------------

describe('P09 legacy commands retired', () => {
  it('blocks legacy create/update even with an injected client', async () => {
    const client = { request: jest.fn() };
    await expect(
      createWarrantyCase({} as never, 'old', {}, client),
    ).rejects.toMatchObject({ code: 'P09_LEGACY_DISABLED' });
    await expect(
      updateWarrantyStatus({} as never, 'old', {}, client),
    ).rejects.toMatchObject({ code: 'P09_LEGACY_DISABLED' });
    expect(client.request).not.toHaveBeenCalled();
  });
});

describe('J — tải file đính kèm', () => {
  const file = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' };

  it('gửi FormData tới đúng đường dẫn', async () => {
    const { client, sent } = spyClient({ data: {} });
    await uploadWarrantyAttachment('case-1', file, 'INTAKE', {}, client);
    expect(sent[0]?.path).toBe(warrantyAttachmentsPath('case-1'));
    expect(sent[0]?.body).toBeInstanceOf(FormData);
  });

  it('🔒 client PHẢI biết đây là multipart', () => {
    // Đặt `Content-Type` tay cho FormData làm máy chủ đọc ra thân rỗng — hỏng
    // theo kiểu khó đoán, không phải lỗi rõ ràng.
    expect(usesMultipart('POST', warrantyAttachmentsPath('c'))).toBe(true);
    expect(usesMultipart('POST', WARRANTY_WRITE_PATHS.cases)).toBe(false);
    expect(usesMultipart('POST', '/api/v1/mini-app/inbound/record')).toBe(
      false,
    );
  });

  it('timeout dài — video tới 300 MB qua mạng kho', async () => {
    const { client, sent } = spyClient({ data: {} });
    await uploadWarrantyAttachment('c', file, 'INTAKE', {}, client);
    expect(sent[0]?.timeoutMs).toBe(ATTACHMENT_UPLOAD_TIMEOUT_MS);
  });

  it('KHÔNG gắn Idempotency-Key — spec không khai cho endpoint này', async () => {
    const { client, sent } = spyClient({ data: {} });
    await uploadWarrantyAttachment('c', file, 'INTAKE', {}, client);
    expect(JSON.stringify(sent[0]?.headers ?? {})).not.toContain('dempotency');
    expect(allowsIdempotencyKey('POST', warrantyAttachmentsPath('c'))).toBe(
      false,
    );
  });

  it.each([
    ['mã hồ sơ rỗng', ' ', file],
    ['thiếu uri', 'c', { ...file, uri: '' }],
    ['thiếu tên file', 'c', { ...file, name: '' }],
  ])('từ chối %s và KHÔNG gửi gì', async (_label, caseId, badFile) => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      uploadWarrantyAttachment(caseId, badFile, 'INTAKE', {}, client),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });

  it('bốn nhóm file đúng như mô tả', () => {
    expect(ATTACHMENT_TYPES.map(item => item.value)).toEqual([
      'INTAKE',
      'DIAGNOSTIC',
      'RETURN',
      'OTHER',
    ]);
  });
});

describe('P18 owner upload opt-in', () => {
  const parent = '11111111-1111-4111-8111-111111111111';
  const warehouse = '22222222-2222-4222-8222-222222222222';
  const key = '33333333-3333-4333-8333-333333333333';
  const actor = '44444444-4444-4444-8444-444444444444';
  const family = '55555555-5555-4555-8555-555555555555';
  const attachment = '66666666-6666-4666-8666-666666666666';
  beforeEach(() =>
    setSession({
      accessToken: 'offline-test',
      userId: actor,
      authSessionId: family,
      activeWarehouseId: warehouse,
    }),
  );
  afterEach(clearSession);
  const file = {
    uri: 'blob:fixture',
    name: 'test.jpg',
    type: 'image/jpeg',
    blob: new Blob(['abc']),
  };
  it('sends exact contract/key/warehouse/hash and requires HTTP 201 receipt', async () => {
    const sha = await hashAttachmentFile(file);
    const sent: any[] = [];
    const client: WriteClient = {
      request: jest.fn(async (options: any) => {
        sent.push(options);
        return {
          status: 201,
          data: {
            success: true,
            data: { id: attachment },
            meta: {
              upload_receipt: {
                contract: OWNER_ATTACHMENT_UPLOAD_CONTRACT,
                command: 'UPLOAD',
                outcome: 'SUCCEEDED',
                actor_id: actor,
                auth_session_id: family,
                parent_type: 'WARRANTY',
                attachment_id: attachment,
                http_status: 201,
                attachment_status_at_completion: 'ACTIVE',
                attachment_version_at_completion: 1,
                scan_result: 'UNSCANNED',
                completed_at: '2026-10-22T01:00:00Z',
                request_key: key,
                parent_id: parent,
                warehouse_id: warehouse,
                file_sha256: sha,
              },
            },
          },
        } as any;
      }),
    };
    const result = await uploadOwnerAttachment(
      'warranty',
      parent,
      file,
      { warehouseId: warehouse, idempotencyKey: key, attachmentType: 'INTAKE' },
      client,
    );
    expect(result).toMatchObject({ requestKey: key, sha256: sha });
    expect(sent[0]).toMatchObject({ method: 'POST', p18Upload: true });
    expect(sent[0].headers).toEqual({
      'X-Upload-Contract': OWNER_ATTACHMENT_UPLOAD_CONTRACT,
      'Idempotency-Key': key,
      'X-Upload-Warehouse-ID': warehouse,
      'X-Upload-SHA256': sha,
    });
    expect(sent[0].body).toBeInstanceOf(FormData);
  });
  it('never sends warranty note and rejects an invalid owner/mime before network', async () => {
    const client: WriteClient = { request: jest.fn() };
    await expect(
      uploadOwnerAttachment(
        'warranty',
        parent,
        { ...file, type: 'application/pdf' },
        { warehouseId: warehouse, note: 'not allowed' },
        client,
      ),
    ).rejects.toMatchObject({ code: 'P18_MIME_NOT_ALLOWED' });
    expect(client.request).not.toHaveBeenCalled();
  });
  it('reconciles exact key/hash and preserves UNKNOWN CHECK_ONLY', async () => {
    const sha = await hashAttachmentFile(file);
    const get = jest.fn(async (_path: string, _options: any) => ({
      status: 200,
      data: {
        success: true,
        meta: { contract: OWNER_ATTACHMENT_UPLOAD_CONTRACT },
        data: {
          outcome: 'UNKNOWN',
          request_key: key,
          parent_type: 'WARRANTY',
          parent_id: parent,
          file_sha256: sha,
          auth_session_id: family,
          warehouse_id: warehouse,
          request_state: 'PENDING',
          receipt: null,
          current_attachment: null,
          retry_policy: 'CHECK_ONLY',
          cancel_supported: false,
          observed_at: '2026-10-15T00:00:00Z',
        },
      },
      header: () => undefined,
    }));
    const result = await reconcileOwnerAttachment(
      'warranty',
      parent,
      key,
      warehouse,
      sha,
      { get } as any,
    );
    expect(result.outcome).toBe('UNKNOWN');
    expect(get).toHaveBeenCalledWith(
      '/api/v1/mini-app/warranty-cases/' +
        parent +
        '/attachments/requests/' +
        key,
      { query: { warehouse_id: warehouse, file_sha256: sha } },
    );
  });
  it('rejects changed receipt identity instead of treating HTTP 201 as success', async () => {
    const sha = await hashAttachmentFile(file);
    const client: WriteClient = {
      request: jest.fn(
        async () =>
          ({
            status: 201,
            data: {
              success: true,
              meta: {
                upload_receipt: {
                  request_key: key,
                  parent_id: '44444444-4444-4444-8444-444444444444',
                  warehouse_id: warehouse,
                  file_sha256: sha,
                },
              },
            },
          } as any),
      ),
    };
    await expect(
      uploadOwnerAttachment(
        'warranty',
        parent,
        file,
        { warehouseId: warehouse, idempotencyKey: key },
        client,
      ),
    ).rejects.toMatchObject({ code: 'P18_UPLOAD_RECEIPT_INVALID' });
  });
  it('treats legacy HTTP 200 without receipt as UNKNOWN, never a successful upload', async () => {
    const client: WriteClient = {
      request: jest.fn(
        async () => ({ status: 200, data: { success: true, data: {} } } as any),
      ),
    };
    await expect(
      uploadOwnerAttachment(
        'warranty',
        parent,
        file,
        { warehouseId: warehouse, idempotencyKey: key },
        client,
      ),
    ).rejects.toMatchObject({ code: 'P18_UPLOAD_OUTCOME_UNKNOWN' });
  });
});

// ---------------------------------------------------------------------------

describe('cổng ghi sau §2i — mười thao tác, không hơn', () => {
  it('bốn thao tác bảo hành được duyệt', () => {
    for (const path of [
      WARRANTY_WRITE_PATHS.resolveCode,
      WARRANTY_WRITE_PATHS.cases,
      warrantyStatusPath('1'),
      warrantyAttachmentsPath('1'),
    ]) {
      expect(approvedWriteFor('POST', path)).toBeDefined();
    }
  });

  it.each([
    // 🔒 Chống đi ngược thư mục.
    '/api/v1/mini-app/warranty-cases/../roles/status',
    '/api/v1/mini-app/warranty-cases/./status',
    // Thiếu / thừa đoạn.
    '/api/v1/mini-app/warranty-cases/status',
    '/api/v1/mini-app/warranty-cases/1/2/status',
    // Đoạn cuối chưa duyệt.
    '/api/v1/mini-app/warranty-cases/1/close',
    '/api/v1/mini-app/warranty-cases/1/events',
  ])('CHẶN %s', path => {
    expect(approvedWriteFor('POST', path)).toBeUndefined();
  });

  it('🔒 Idempotency-Key: đúng SÁU thao tác', () => {
    const withKey = [
      '/api/v1/mini-app/inbound/record',
      '/api/v1/mini-app/inbound-documents/1/post-receipt',
      '/api/v1/mini-app/outbound/record',
      '/api/v1/mini-app/outbound-documents/1/post-issue',
      WARRANTY_WRITE_PATHS.cases,
      warrantyStatusPath('1'),
    ];
    for (const path of withKey) {
      expect(allowsIdempotencyKey('POST', path)).toBe(true);
    }
    for (const path of [
      '/api/v1/mini-app/inbound/resolve-code',
      '/api/v1/mini-app/outbound/resolve-code',
      WARRANTY_WRITE_PATHS.resolveCode,
      warrantyAttachmentsPath('1'),
    ]) {
      expect(allowsIdempotencyKey('POST', path)).toBe(false);
    }
  });

  it('🔒 If-Match: đúng BA thao tác', () => {
    for (const path of [
      '/api/v1/mini-app/inbound-documents/1/post-receipt',
      '/api/v1/mini-app/outbound-documents/1/post-issue',
      warrantyStatusPath('1'),
    ]) {
      expect(allowsIfMatch('POST', path)).toBe(true);
    }
  });

  it('🔒 multipart: đúng MỘT thao tác', () => {
    let count = 0;
    for (const path of [
      '/api/v1/mini-app/inbound/resolve-code',
      '/api/v1/mini-app/inbound/record',
      '/api/v1/mini-app/inbound-documents/1/post-receipt',
      '/api/v1/mini-app/outbound/resolve-code',
      '/api/v1/mini-app/outbound/record',
      '/api/v1/mini-app/outbound-documents/1/post-issue',
      WARRANTY_WRITE_PATHS.resolveCode,
      WARRANTY_WRITE_PATHS.cases,
      warrantyStatusPath('1'),
      warrantyAttachmentsPath('1'),
    ]) {
      if (usesMultipart('POST', path)) {
        count += 1;
      }
    }
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hook chuyển trạng thái
// ---------------------------------------------------------------------------
