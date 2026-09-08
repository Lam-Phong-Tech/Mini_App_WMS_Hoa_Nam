/**
 * Tầng **GHI** của luồng nhập kho — `GATE_WMS §2e`.
 *
 * Người dùng duyệt **A** (`resolve-code`) và **B** (`record`), trả lời rõ
 * **"chưa duyệt C"** (`post-receipt`). Bộ test này canh ba thứ:
 *
 * 1. Hai thao tác được duyệt gửi **đúng** cái contract đòi.
 * 2. `post-receipt` **vẫn không có đường nào** để gọi.
 * 3. Khoá idempotency **không bao giờ** bị sinh mới lúc gửi lại — quy tắc người
 *    dùng chốt 2026-09-05. Sai chỗ này là hai phiếu nhập cho cùng một lô hàng.
 */

import {
  INBOUND_WRITE_PATHS,
  NEW_ITEM_RESOLUTIONS,
  RECORD_TIMEOUT_MS,
  assertApprovedWrite,
  isNewItemCandidate,
  normalizeIfMatch,
  postReceipt,
  postReceiptPath,
  record,
  recordedDocumentNo,
  resolveCode,
  resolvedDisplayName,
  type WriteClient,
} from '../src/services/wms/inboundWrite';
import {
  RECORD_NOTE_PREFIX,
  createInboundSender,
  inboundScanFingerprint,
  localDateString,
  toRecordItems,
} from '../src/sync/inboundSender';
import { INBOUND_OUTBOX_KIND } from '../src/features/inbound/inboundDraft';
import { AppError } from '../src/errors/AppError';
import type { OutboxRecord } from '../src/sync/types';

interface Sent {
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function spyClient(response: unknown = { data: {} }): {
  client: WriteClient;
  sent: Sent[];
} {
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
// A — resolve-code
// ---------------------------------------------------------------------------

describe('A — resolve-code', () => {
  it('gửi đúng đường dẫn và đúng hai trường contract đòi', async () => {
    const { client, sent } = spyClient({ data: { raw_code: 'HN1|SKU=A' } });
    await resolveCode(
      { warehouseId: 'wh-1', rawCode: 'HN1|SKU=A' },
      {},
      client,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe(INBOUND_WRITE_PATHS.resolveCode);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.body).toEqual({
      raw_code: 'HN1|SKU=A',
      warehouse_id: 'wh-1',
    });
  });

  it('KHÔNG gắn Idempotency-Key — spec không khai header đó cho nó', async () => {
    const { client, sent } = spyClient({ data: { raw_code: 'X' } });
    await resolveCode({ warehouseId: 'wh-1', rawCode: 'X' }, {}, client);
    expect(JSON.stringify(sent[0]?.headers ?? {})).not.toContain('dempotency');
  });

  it('bóc đúng phần data khỏi envelope', async () => {
    const { client } = spyClient({
      data: { raw_code: 'X', sku_name: 'Bơm nước' },
    });
    const resolved = await resolveCode(
      { warehouseId: 'wh-1', rawCode: 'X' },
      {},
      client,
    );
    expect(resolved.sku_name).toBe('Bơm nước');
  });

  it('HTTP 200 kèm success:false vẫn là LỖI, không phải thành công', async () => {
    // WMS trả 200 cho lỗi nghiệp vụ. Bỏ qua `success` thì một mã bị từ chối sẽ
    // hiện ra như đã resolve xong.
    const { client } = spyClient({
      success: false,
      message: 'Mã không hợp lệ',
    });
    await expect(
      resolveCode({ warehouseId: 'wh-1', rawCode: 'X' }, {}, client),
    ).rejects.toMatchObject({ message: 'Mã không hợp lệ' });
  });
});

describe('đọc kết quả resolve', () => {
  it('nhận ra mã của vật chưa có trong WMS', () => {
    for (const status of NEW_ITEM_RESOLUTIONS) {
      expect(
        isNewItemCandidate({ raw_code: 'X', resolution_status: status }),
      ).toBe(true);
    }
    expect(
      isNewItemCandidate({ raw_code: 'X', resolution_status: 'EXISTING_ITEM' }),
    ).toBe(false);
    expect(isNewItemCandidate({ raw_code: 'X' })).toBe(false);
  });

  it('tên hiển thị theo đúng thứ tự ưu tiên của Mini App', () => {
    expect(
      resolvedDisplayName({ raw_code: 'X', sku_name: 'A', product_name: 'B' }),
    ).toBe('A');
    expect(
      resolvedDisplayName({ raw_code: 'X', product_name: 'B', name: 'C' }),
    ).toBe('B');
    expect(resolvedDisplayName({ raw_code: 'X', name: 'C' })).toBe('C');
  });

  it('không có tên thì trả undefined, KHÔNG bịa chuỗi thay người dùng', () => {
    expect(resolvedDisplayName({ raw_code: 'X' })).toBeUndefined();
    expect(
      resolvedDisplayName({ raw_code: 'X', sku_name: '   ' }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B — record
// ---------------------------------------------------------------------------

describe('B — record', () => {
  const items = [
    { raw_code: 'A-001', scan_source: 'CAMERA' as const },
    { raw_code: 'A-002', scan_source: 'MANUAL' as const },
  ];

  it('gửi Idempotency-Key ĐÚNG khoá được truyền vào', async () => {
    const { client, sent } = spyClient({ data: { doc_no: 'PN-1' } });
    await record(
      { name: 'Lô sáng', dstWarehouseId: 'wh-1', items },
      'wmshn-abc',
      {},
      client,
    );
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-abc');
  });

  it('expected_total_qty tự tính từ số mã, KHÔNG nhận từ bên ngoài', async () => {
    // Số lượng có thẩm quyền duy nhất là số mã đã quét. Hai con số lệch nhau
    // thì máy chủ từ chối cả phiếu.
    const { client, sent } = spyClient({ data: {} });
    await record(
      { name: 'Lô sáng', dstWarehouseId: 'wh-1', items },
      'k',
      {},
      client,
    );
    const body = sent[0]?.body as { expected_total_qty: number; items: [] };
    expect(body.expected_total_qty).toBe(2);
    expect(body.items).toHaveLength(2);
  });

  it('gửi đủ các trường contract đòi, đúng tên snake_case', async () => {
    const { client, sent } = spyClient({ data: {} });
    await record(
      {
        name: 'Lô sáng',
        dstWarehouseId: 'wh-1',
        items,
        docDate: '2026-09-06',
        note: 'ghi chú',
      },
      'k',
      {},
      client,
    );
    expect(sent[0]?.body).toEqual({
      name: 'Lô sáng',
      dst_warehouse_id: 'wh-1',
      expected_total_qty: 2,
      doc_date: '2026-09-06',
      note: 'ghi chú',
      items: [
        { raw_code: 'A-001', scan_source: 'CAMERA' },
        { raw_code: 'A-002', scan_source: 'MANUAL' },
      ],
    });
  });

  it('hộp linh kiện gửi SKU, số hộp và số kiểm đếm; tổng phiếu là số linh kiện', async () => {
    const { client, sent } = spyClient({ data: {} });
    await record(
      {
        name: 'Lô linh kiện',
        dstWarehouseId: 'wh-1',
        items: [
          {
            raw_code: 'BOX-DCPL1-001',
            scan_source: 'CAMERA',
            item_type: 'BOX',
            sku_code: 'DCPL1',
            quantity: 24,
            box_number: '001',
          },
        ],
      },
      'k',
      {},
      client,
    );
    expect(sent[0]?.body).toMatchObject({
      expected_total_qty: 24,
      items: [
        {
          raw_code: 'BOX-DCPL1-001',
          scan_source: 'CAMERA',
          item_type: 'BOX',
          sku_code: 'DCPL1',
          quantity: 24,
          box_number: '001',
        },
      ],
    });
  });

  it('vẫn gửi quantity khi mã hộp chỉ có một linh kiện', async () => {
    const { client, sent } = spyClient({ data: {} });
    await record(
      {
        name: 'Hộp một linh kiện',
        dstWarehouseId: 'wh-1',
        items: [
          {
            raw_code: 'BOX-DCPL1-002',
            scan_source: 'CAMERA',
            item_type: 'BOX',
            sku_code: 'DCPL1',
            quantity: 1,
            box_number: '002',
          },
        ],
      },
      'k',
      {},
      client,
    );
    expect(sent[0]?.body).toMatchObject({
      expected_total_qty: 1,
      items: [
        expect.objectContaining({
          item_type: 'BOX',
          quantity: 1,
        }),
      ],
    });
  });

  it('bỏ hẳn doc_date và note khi không có, không gửi undefined', async () => {
    const { client, sent } = spyClient({ data: {} });
    await record(
      { name: 'Lô sáng', dstWarehouseId: 'wh-1', items },
      'k',
      {},
      client,
    );
    expect(Object.keys(sent[0]?.body as object)).not.toContain('doc_date');
    expect(Object.keys(sent[0]?.body as object)).not.toContain('note');
  });

  it('dùng timeout 30 giây — cả lô chạy trong một transaction', async () => {
    const { client, sent } = spyClient({ data: {} });
    await record(
      { name: 'Lô sáng', dstWarehouseId: 'wh-1', items },
      'k',
      {},
      client,
    );
    expect(sent[0]?.timeoutMs).toBe(RECORD_TIMEOUT_MS);
    expect(RECORD_TIMEOUT_MS).toBe(30_000);
  });

  it('từ chối khoá rỗng thay vì tự sinh khoá mới', async () => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      record({ name: 'A', dstWarehouseId: 'wh-1', items }, '  ', {}, client),
    ).rejects.toBeInstanceOf(AppError);
    // Quan trọng hơn cả việc ném lỗi: KHÔNG có gì đi ra mạng.
    expect(sent).toHaveLength(0);
  });

  it('từ chối phiếu rỗng — không gửi phiếu 0 mã lên WMS', async () => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      record({ name: 'A', dstWarehouseId: 'wh-1', items: [] }, 'k', {}, client),
    ).rejects.toBeInstanceOf(AppError);
    expect(sent).toHaveLength(0);
  });

  it('success:false là LỖI, kèm nguyên văn lý do máy chủ', async () => {
    const { client } = spyClient({
      success: false,
      message: 'Trùng mã A-001',
      error_code: 'DUPLICATE_ITEM_IN_BATCH',
      meta: { request_id: 'req-200-false' },
    });
    await expect(
      record({ name: 'A', dstWarehouseId: 'wh-1', items }, 'k', {}, client),
    ).rejects.toMatchObject({
      message: 'Trùng mã A-001',
      code: 'DUPLICATE_ITEM_IN_BATCH',
      route: '/api/v1/mini-app/inbound/record',
      requestId: 'req-200-false',
    });
  });

  it('số phiếu đọc được từ cả doc_no lẫn document_no', () => {
    expect(recordedDocumentNo({ doc_no: 'PN-1' })).toBe('PN-1');
    expect(recordedDocumentNo({ document_no: 'PN-2' })).toBe('PN-2');
    expect(recordedDocumentNo({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C — post-receipt: lệnh TĂNG TỒN KHO
// ---------------------------------------------------------------------------

describe('C — post-receipt', () => {
  const DOC = 'PN-COV-P00060';
  /** Preflight tier luôn đạt, trừ khi test tự thay. */
  const tierOk = async () => ({ status: 'matched' as const });

  it('gửi đúng đường dẫn, method và body rỗng', async () => {
    const { client, sent } = spyClient({ data: { status: 'POSTED' } });
    await postReceipt(
      { documentId: DOC, version: 7 },
      'wmshn-k',
      { ensureTier: tierOk },
      client,
    );
    expect(sent[0]?.path).toBe(
      '/api/v1/mini-app/inbound-documents/' + DOC + '/post-receipt',
    );
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.body).toEqual({});
  });

  it('gửi CẢ If-Match lẫn Idempotency-Key', async () => {
    const { client, sent } = spyClient({ data: {} });
    await postReceipt(
      { documentId: DOC, version: '"7"' },
      'wmshn-k',
      { ensureTier: tierOk },
      client,
    );
    // Dấu nháy của ETag bị bóc — cùng cách client đang chạy làm.
    expect(sent[0]?.headers?.['If-Match']).toBe('7');
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-k');
  });

  it('🔒 KHÔNG gửi khi thiếu version — không rơi về "1"', async () => {
    // Client cũ rơi về "1" ở nhánh tạo phiếu. If-Match: 1 gửi lên một phiếu đã
    // sang version 3 là hoặc bị từ chối, hoặc ghi đè mất thay đổi người khác.
    // Đó là cả điểm tồn tại của kiểm soát lạc quan.
    const { client, sent } = spyClient({ data: {} });
    for (const version of [undefined, null, '', '  ']) {
      await expect(
        postReceipt(
          { documentId: DOC, version: version as never },
          'wmshn-k',
          { ensureTier: tierOk },
          client,
        ),
      ).rejects.toMatchObject({ kind: 'config' });
    }
    expect(sent).toHaveLength(0);
  });

  it('🔒 KHÔNG gửi khi preflight tier không đạt', async () => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      postReceipt(
        { documentId: DOC, version: 7 },
        'wmshn-k',
        {
          ensureTier: async () => {
            throw new AppError({
              kind: 'wrong_environment',
              message: 'Sai môi trường',
            });
          },
        },
        client,
      ),
    ).rejects.toMatchObject({ kind: 'wrong_environment' });
    // Quan trọng hơn việc ném lỗi: KHÔNG có lệnh tăng tồn nào đi ra mạng.
    expect(sent).toHaveLength(0);
  });

  it('🔒 kiểm tier TRƯỚC khi gửi, không phải sau', async () => {
    const order: string[] = [];
    const client: WriteClient = {
      async request<T>() {
        order.push('send');
        return { status: 200, data: { data: {} } as T };
      },
    };
    await postReceipt(
      { documentId: DOC, version: 7 },
      'wmshn-k',
      {
        ensureTier: async () => {
          order.push('tier');
          return {};
        },
      },
      client,
    );
    expect(order).toEqual(['tier', 'send']);
  });

  it('từ chối khoá rỗng — không tự sinh như client cũ', async () => {
    // Client cũ gọi generateClientScanId() MỖI LẦN, tức mỗi lần thử lại một
    // khoá mới — đúng thứ người dùng cấm 2026-09-05.
    const { client, sent } = spyClient({ data: {} });
    await expect(
      postReceipt(
        { documentId: DOC, version: 7 },
        '  ',
        { ensureTier: tierOk },
        client,
      ),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });

  it('từ chối mã phiếu rỗng', async () => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      postReceipt(
        { documentId: ' ', version: 7 },
        'k',
        { ensureTier: tierOk },
        client,
      ),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });

  it('normalizeIfMatch bóc nháy và khoảng trắng, giữ phần còn lại', () => {
    expect(normalizeIfMatch('"7"')).toBe('7');
    expect(normalizeIfMatch(7)).toBe('7');
    expect(normalizeIfMatch(undefined)).toBeUndefined();
    expect(normalizeIfMatch(null)).toBeUndefined();
    expect(normalizeIfMatch('""')).toBeUndefined();
  });

  it('success:false là LỖI — phiếu KHÔNG được coi là đã post', async () => {
    const { client } = spyClient({ success: false, message: 'Chưa quét đủ' });
    await expect(
      postReceipt(
        { documentId: DOC, version: 7 },
        'k',
        { ensureTier: tierOk },
        client,
      ),
    ).rejects.toMatchObject({ message: 'Chưa quét đủ' });
  });
});

describe('cổng ghi ở tầng nghiệp vụ', () => {
  it('ba thao tác được duyệt thì KHÔNG bị chặn', () => {
    for (const path of [
      INBOUND_WRITE_PATHS.resolveCode,
      INBOUND_WRITE_PATHS.record,
      postReceiptPath('PN-1'),
    ]) {
      expect(() => assertApprovedWrite('POST', path)).not.toThrow();
    }
  });

  it('🔴 endpoint chưa duyệt vẫn bị chặn', () => {
    // `post-issue` (§2h) và luồng bảo hành (§2i) đã rời danh sách này — chúng
    // được duyệt và có bộ test riêng.
    for (const path of [
      '/api/v1/roles/1',
      '/api/v1/mini-app/inbound-documents',
      '/api/v1/mini-app/outbound-documents/1/unmatch',
      '/api/v1/mini-app/warranty-cases/1/close',
    ]) {
      expect(() => assertApprovedWrite('POST', path)).toThrow(AppError);
    }
  });

  it('thông báo nói RÕ phải xin duyệt cái gì, không chỉ "bị chặn"', () => {
    let message = '';
    try {
      assertApprovedWrite('DELETE', '/api/v1/roles/1');
    } catch (error) {
      message = (error as AppError).message;
    }
    expect(message).toContain('GATE_WMS');
    expect(message).toContain('/api/v1/roles/1');
  });
});

// ---------------------------------------------------------------------------
// Bộ gửi hàng đợi
// ---------------------------------------------------------------------------

describe('createInboundSender', () => {
  function outboxRecord(
    payload: unknown,
    overrides: Partial<OutboxRecord> = {},
  ): OutboxRecord {
    return {
      id: 'rec-1',
      kind: INBOUND_OUTBOX_KIND,
      state: 'pending',
      createdAt: '2026-09-06T01:00:00+07:00',
      updatedAt: '2026-09-06T01:00:00+07:00',
      attemptCount: 0,
      idempotencyKey: 'wmshn-stable-key',
      payload,
      ...overrides,
    };
  }

  const draftPayload = {
    name: 'Lô sáng',
    warehouseId: 'wh-1',
    codes: [
      { raw: 'A-001', sku: 'A', item: '001', source: 'CAMERA' as const, at: 1 },
      { raw: 'A-002', sku: 'A', item: '002', source: 'MANUAL' as const, at: 2 },
    ],
  };

  it('🔒 gửi lại dùng ĐÚNG khoá cũ, không sinh khoá mới', async () => {
    // Quy tắc người dùng chốt 2026-09-05. Sai chỗ này = hai phiếu nhập cho cùng
    // một lô hàng, đúng cái idempotency sinh ra để chặn.
    const keys: string[] = [];
    const sender = createInboundSender(async () => undefined, {
      send: async (_input, key) => {
        keys.push(key);
        return {};
      },
    });
    const rec = outboxRecord(draftPayload);
    await sender(rec);
    await sender(rec);
    await sender({ ...rec, attemptCount: 5 });

    expect(keys).toEqual([
      'wmshn-stable-key',
      'wmshn-stable-key',
      'wmshn-stable-key',
    ]);
    expect(new Set(keys).size).toBe(1);
  });

  it('giữ nguyên nguồn quét của từng mã', async () => {
    let captured: readonly { scan_source: string }[] = [];
    const sender = createInboundSender(async () => undefined, {
      send: async input => {
        captured = input.items;
        return {};
      },
    });
    await sender(outboxRecord(draftPayload));
    expect(captured.map(item => item.scan_source)).toEqual([
      'CAMERA',
      'MANUAL',
    ]);
  });

  it('gửi mã GỐC, không phải khoá chống trùng', async () => {
    let captured: readonly { raw_code: string }[] = [];
    const sender = createInboundSender(async () => undefined, {
      send: async input => {
        captured = input.items;
        return {};
      },
    });
    await sender(outboxRecord(draftPayload));
    expect(captured.map(item => item.raw_code)).toEqual(['A-001', 'A-002']);
  });

  it('giữ metadata của hộp linh kiện tới đúng payload gửi WMS', () => {
    expect(
      toRecordItems({
        name: 'Lô hộp',
        codes: [
          {
            raw: 'BOX-DCPL1-001',
            sku: 'DCPL1',
            itemType: 'COMPONENT',
            quantity: 24,
            boxNumber: '001',
            source: 'CAMERA',
            at: 1,
          },
        ],
      }),
    ).toEqual([
      {
        raw_code: 'BOX-DCPL1-001',
        scan_source: 'CAMERA',
        item_type: 'BOX',
        sku_code: 'DCPL1',
        quantity: 24,
        box_number: '001',
      },
    ]);
  });

  it('gửi đúng hai trường riêng cho ITEM mới: dạng vật lý và loại catalog', () => {
    expect(
      toRecordItems({
        name: 'Lô mới',
        codes: [
          {
            raw: 'HN1|SKU=SKU-MOI-01|ITEM=ITEM-MOI-01',
            sku: 'SKU-MOI-01',
            itemType: 'PRODUCT',
            quantity: 1,
            source: 'CAMERA',
            at: 1,
          },
        ],
      }),
    ).toEqual([
      {
        raw_code: 'HN1|SKU=SKU-MOI-01|ITEM=ITEM-MOI-01',
        scan_source: 'CAMERA',
        item_type: 'ITEM',
        new_sku_type: 'PRODUCT',
        quantity: 1,
        box_number: undefined,
      },
    ]);
  });

  it('thiếu kho nhận thì BÁO LỖI, không đoán một kho nào đó', async () => {
    // Gửi sai kho là hàng vào nhầm chỗ, mà phiếu đã POSTED thì app không sửa
    // được. Thà bắt tạo lại phiếu.
    let called = false;
    const sender = createInboundSender(async () => undefined, {
      send: async () => {
        called = true;
        return {};
      },
    });
    await expect(
      sender(outboxRecord({ ...draftPayload, warehouseId: undefined })),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(called).toBe(false);
  });

  it('payload sai dạng thì báo parse, không gửi bừa', async () => {
    const sender = createInboundSender(async () => undefined, {
      send: async () => ({}),
    });
    await expect(
      sender(outboxRecord({ khong: 'dung dang' })),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('🔒 kind KHÁC thì uỷ quyền về bộ gửi cũ — luồng chưa duyệt vẫn bị chặn', async () => {
    const delegated: string[] = [];
    let inboundCalled = false;
    const sender = createInboundSender(
      async rec => {
        delegated.push(rec.kind);
        throw new AppError({ kind: 'blocked_by_gate', message: 'chưa duyệt' });
      },
      {
        send: async () => {
          inboundCalled = true;
          return {};
        },
      },
    );

    for (const kind of ['OUTBOUND_ISSUE_DRAFT', 'WARRANTY_CASE_DRAFT']) {
      await expect(
        sender(outboxRecord(draftPayload, { kind })),
      ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    }
    expect(delegated).toEqual(['OUTBOUND_ISSUE_DRAFT', 'WARRANTY_CASE_DRAFT']);
    expect(inboundCalled).toBe(false);
  });

  it('ghi chú mang tiền tố người duyệt đã quen nhận diện', async () => {
    let note: string | undefined;
    const sender = createInboundSender(async () => undefined, {
      send: async input => {
        note = input.note;
        return {};
      },
    });
    await sender(outboxRecord(draftPayload));
    expect(note).toBe(RECORD_NOTE_PREFIX + 'Lô sáng');
  });

  it('409 giữ đầy đủ mã lỗi, route, request ID và vân tay lô QR', async () => {
    const contexts: unknown[] = [];
    const sender = createInboundSender(async () => undefined, {
      send: async () => {
        throw new AppError({
          kind: 'http',
          status: 409,
          code: 'DUPLICATE_ITEM_IN_BATCH',
          route: '/api/v1/mini-app/inbound/record',
          requestId: 'req-409-02',
          message: 'Một ITEM xuất hiện hai lần trong lô.',
        });
      },
      log: {
        debug: () => undefined,
        info: () => undefined,
        error: () => undefined,
        warn: (_message, context) => contexts.push(context),
      },
    });

    await expect(sender(outboxRecord(draftPayload))).rejects.toMatchObject({
      code: 'DUPLICATE_ITEM_IN_BATCH',
      route: '/api/v1/mini-app/inbound/record',
      requestId: 'req-409-02',
      scanFingerprint: inboundScanFingerprint(draftPayload),
      scanCount: 2,
    });
    expect(contexts).toEqual([
      expect.objectContaining({
        errorCode: 'DUPLICATE_ITEM_IN_BATCH',
        route: '/api/v1/mini-app/inbound/record',
        requestId: 'req-409-02',
        scanFingerprint: inboundScanFingerprint(draftPayload),
        scanCount: 2,
      }),
    ]);
  });
});

describe('chi tiết dễ sai', () => {
  it('vân tay lô không phụ thuộc thứ tự quét và không chứa QR thô', () => {
    const payload = {
      name: 'Lô fingerprint',
      codes: [
        { raw: 'A-001', at: 1 },
        { raw: 'A-002', at: 2 },
      ],
    };
    const original = inboundScanFingerprint(payload);
    const reversed = inboundScanFingerprint({
      ...payload,
      codes: [...payload.codes].reverse(),
    });
    expect(reversed).toBe(original);
    expect(original).not.toContain('A-001');
  });

  it('bản ghi CŨ không có source thì mặc định CAMERA, không vu oan gõ tay', () => {
    const items = toRecordItems({
      name: 'X',
      codes: [{ raw: 'A-001', at: 1 }],
    });
    expect(items[0]?.scan_source).toBe('CAMERA');
  });

  it('ngày chứng từ theo giờ MÁY, không phải UTC', () => {
    // 06:00 ngày 7 giờ Việt Nam là 23:00 ngày 6 theo UTC. Dùng toISOString sẽ
    // ghi phiếu ca đêm sai một ngày.
    const local = new Date(2026, 8, 7, 6, 0, 0);
    expect(localDateString(local)).toBe('2026-09-07');
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
