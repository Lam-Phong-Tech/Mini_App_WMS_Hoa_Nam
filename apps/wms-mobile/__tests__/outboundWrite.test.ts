/**
 * Tầng **GHI** của luồng xuất kho — `GATE_WMS §2g` (D, E) và `§2h` (F).
 *
 * `post-issue` là lệnh **giảm tồn kho**, nguy hiểm theo chiều khó thấy hơn
 * `post-receipt`: post nhầm phiếu nhập thì tồn dư ra và lần đếm nào cũng thấy;
 * post nhầm phiếu xuất thì hàng bị trừ khỏi sổ trong khi vẫn nằm trên kệ.
 *
 * Vì vậy nó có nguyên một nhóm test canh riêng, và điều được canh **không còn
 * là "có bị chặn không"** mà là: khớp đường dẫn đúng chỗ, không gửi khi thiếu
 * version, không gửi khi sai tier, và kiểm tier **trước** khi gửi.
 */

import {
  OUTBOUND_RECORD_TIMEOUT_MS,
  OUTBOUND_RESOLVE_TIMEOUT_MS,
  OUTBOUND_WRITE_PATHS,
  assertApprovedOutboundWrite,
  ineligibleReason,
  isEligibleForOutbound,
  outboundDisplayName,
  recordOutbound,
  postIssue,
  postIssuePath,
  recordedOutboundDocumentNo,
  resolveOutboundCode,
  type WriteClient,
} from '../src/services/wms/outboundWrite';
import {
  createOutboundSender,
  toOutboundRecordItems,
} from '../src/sync/outboundSender';
import { OUTBOUND_OUTBOX_KIND } from '../src/features/outbound/outboundDraft';
import {
  allowsIdempotencyKey,
  allowsIfMatch,
  approvedWriteFor,
} from '../src/api/writeGate';
import { AppError } from '../src/errors/AppError';
import type { OutboxRecord } from '../src/sync/types';

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
// 🔴 F — post-issue
// ---------------------------------------------------------------------------

describe('F — post-issue: lệnh GIẢM TỒN KHO', () => {
  const DOC = 'PX-COV-001';
  const tierOk = async () => ({ status: 'matched' as const });

  it('nhận mọi {id} hợp lệ', () => {
    for (const id of ['1', '9999', DOC]) {
      expect(approvedWriteFor('POST', postIssuePath(id))).toBe(
        'outbound.postIssue',
      );
    }
  });

  it.each([
    // 🔒 Chống đi ngược thư mục.
    '/api/v1/mini-app/outbound-documents/../roles/post-issue',
    '/api/v1/mini-app/outbound-documents/./post-issue',
    // Thiếu / thừa đoạn.
    '/api/v1/mini-app/outbound-documents/post-issue',
    '/api/v1/mini-app/outbound-documents/1/2/post-issue',
    // Sai đoạn giữa — đây là đường NHẬP kho.
    '/api/v1/mini-app/inbound-documents/1/post-issue',
  ])('CHẶN %s', path => {
    expect(approvedWriteFor('POST', path)).toBeUndefined();
  });

  it('gửi đúng đường dẫn, method và body rỗng', async () => {
    const { client, sent } = spyClient({ data: { status: 'POSTED' } });
    await postIssue({ documentId: DOC, version: 7 }, 'k', {
      ensureTier: tierOk,
    }, client);
    expect(sent[0]?.path).toBe(postIssuePath(DOC));
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.body).toEqual({});
  });

  it('gửi CẢ If-Match lẫn Idempotency-Key', async () => {
    // Bản kiểm kê spec của tôi khai post-issue chỉ có Idempotency-Key — SAI.
    // Mã đang chạy gửi cả hai (`scan.service.ts:1747-1748`).
    const { client, sent } = spyClient({ data: {} });
    await postIssue({ documentId: DOC, version: '"12"' }, 'wmshn-k', {
      ensureTier: tierOk,
    }, client);
    expect(sent[0]?.headers?.['If-Match']).toBe('12');
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-k');
  });

  it('🔒 KHÔNG gửi khi thiếu version', async () => {
    // Client cũ gọi normalizeIfMatch mà không kiểm kết quả, nên khi thiếu
    // version nó gửi `If-Match: undefined` — máy chủ hoặc bỏ qua (mất hẳn
    // optimistic locking) hoặc từ chối. Không port lỗi đó.
    const { client, sent } = spyClient({ data: {} });
    for (const version of [undefined, null, '', '  ']) {
      await expect(
        postIssue({ documentId: DOC, version: version as never }, 'k', {
          ensureTier: tierOk,
        }, client),
      ).rejects.toMatchObject({ kind: 'config' });
    }
    expect(sent).toHaveLength(0);
  });

  it('🔒 KHÔNG gửi khi preflight tier không đạt', async () => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      postIssue({ documentId: DOC, version: 7 }, 'k', {
        ensureTier: async () => {
          throw new AppError({
            kind: 'wrong_environment',
            message: 'Sai môi trường',
          });
        },
      }, client),
    ).rejects.toMatchObject({ kind: 'wrong_environment' });
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
    await postIssue({ documentId: DOC, version: 7 }, 'k', {
      ensureTier: async () => {
        order.push('tier');
        return {};
      },
    }, client);
    expect(order).toEqual(['tier', 'send']);
  });

  it.each([
    ['khoá rỗng', DOC, '  '],
    ['mã phiếu rỗng', ' ', 'k'],
  ])('từ chối %s và KHÔNG gửi gì', async (_label, documentId, key) => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      postIssue({ documentId, version: 7 }, key, { ensureTier: tierOk }, client),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });

  it('success:false là LỖI — phiếu KHÔNG được coi là đã xuất', async () => {
    const { client } = spyClient({ success: false, message: 'Chưa quét đủ' });
    await expect(
      postIssue({ documentId: DOC, version: 7 }, 'k', { ensureTier: tierOk }, client),
    ).rejects.toMatchObject({ message: 'Chưa quét đủ' });
  });
});

describe('🔴 endpoint xuất kho NGOÀI ba thao tác vẫn bị chặn', () => {
  it.each([
    '/api/v1/mini-app/outbound-documents',
    '/api/v1/mini-app/outbound-documents/1/scan',
    '/api/v1/mini-app/outbound-documents/1/unmatch',
    '/api/v1/mini-app/outbound-documents/1/packing-labels/2/print',
  ])('%s', path => {
    expect(approvedWriteFor('POST', path)).toBeUndefined();
    expect(() => assertApprovedOutboundWrite('POST', path)).toThrow(AppError);
    expect(allowsIdempotencyKey('POST', path)).toBe(false);
    expect(allowsIfMatch('POST', path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — resolve-code
// ---------------------------------------------------------------------------

describe('D — outbound/resolve-code', () => {
  it('gửi đúng đường dẫn và đúng hai trường contract đòi', async () => {
    const { client, sent } = spyClient({ data: { sku_code: 'PVC-90' } });
    await resolveOutboundCode(
      { warehouseId: 'wh-1', rawCode: 'HN1|SKU=A' },
      {},
      client,
    );
    expect(sent[0]?.path).toBe(OUTBOUND_WRITE_PATHS.resolveCode);
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.body).toEqual({
      raw_code: 'HN1|SKU=A',
      warehouse_id: 'wh-1',
    });
  });

  it('KHÔNG gắn Idempotency-Key', async () => {
    const { client, sent } = spyClient({ data: {} });
    await resolveOutboundCode({ warehouseId: 'wh-1', rawCode: 'X' }, {}, client);
    expect(JSON.stringify(sent[0]?.headers ?? {})).not.toContain('dempotency');
  });

  it('timeout NGẮN — nó chạy mỗi lần quét', async () => {
    // 20 giây thì thủ kho nghĩ máy treo và quét lại, sinh mã trùng và một lần
    // gọi nữa.
    const { client, sent } = spyClient({ data: {} });
    await resolveOutboundCode({ warehouseId: 'wh-1', rawCode: 'X' }, {}, client);
    expect(sent[0]?.timeoutMs).toBe(OUTBOUND_RESOLVE_TIMEOUT_MS);
    expect(OUTBOUND_RESOLVE_TIMEOUT_MS).toBeLessThan(
      OUTBOUND_RECORD_TIMEOUT_MS,
    );
  });

  it('success:false là LỖI, không phải "mã không hợp lệ"', async () => {
    const { client } = spyClient({ success: false, message: 'Kho không tồn tại' });
    await expect(
      resolveOutboundCode({ warehouseId: 'x', rawCode: 'X' }, {}, client),
    ).rejects.toMatchObject({ message: 'Kho không tồn tại' });
  });

  it('tên hiển thị ưu tiên sku_name rồi tới sku_code', () => {
    expect(outboundDisplayName({ sku_name: 'Ống PVC', sku_code: 'PVC' })).toBe(
      'Ống PVC',
    );
    expect(outboundDisplayName({ sku_code: 'PVC' })).toBe('PVC');
    expect(outboundDisplayName({})).toBeUndefined();
  });

  it('🔒 resolve THÀNH CÔNG không có nghĩa là XUẤT ĐƯỢC', async () => {
    // Một kiện đang giữ chỗ cho phiếu khác vẫn resolve ra SKU đúng. Coi hai
    // câu hỏi này là một chính là cách hàng của phiếu này bị lấy sang phiếu kia.
    const { client } = spyClient({
      data: {
        sku_code: 'PVC-90',
        eligible_for_outbound: false,
        reservation: { doc_no: 'PX-01' },
      },
    });
    const resolved = await resolveOutboundCode(
      { warehouseId: 'wh-1', rawCode: 'X' },
      {},
      client,
    );
    expect(resolved.sku_code).toBe('PVC-90');
    expect(isEligibleForOutbound(resolved)).toBe(false);
    expect(ineligibleReason(resolved)).toContain('PX-01');
  });
});

// ---------------------------------------------------------------------------
// E — record
// ---------------------------------------------------------------------------

describe('E — outbound/record', () => {
  const base = {
    name: 'Giao Hải Phòng',
    warehouseId: 'wh-1',
    recipientName: 'Đại lý Minh Anh',
    items: [
      { raw_code: 'A-001', scan_source: 'CAMERA' as const },
      { raw_code: 'A-002', scan_source: 'MANUAL' as const },
    ],
  };

  it('gửi Idempotency-Key ĐÚNG khoá được truyền vào', async () => {
    const { client, sent } = spyClient({ data: { doc_no: 'PX-1' } });
    await recordOutbound(base, 'wmshn-abc', {}, client);
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-abc');
  });

  it('gửi đủ trường contract đòi, đúng tên snake_case', async () => {
    const { client, sent } = spyClient({ data: {} });
    await recordOutbound(
      {
        ...base,
        recipientAddress: 'Số 5, Phường Lê Chân, Hải Phòng',
        recipientPhone: '0901234567',
        note: 'Đối tượng xuất: Đại Lý',
      },
      'k',
      {},
      client,
    );
    expect(sent[0]?.body).toEqual({
      name: 'Giao Hải Phòng',
      warehouse_id: 'wh-1',
      recipient_name: 'Đại lý Minh Anh',
      recipient_address: 'Số 5, Phường Lê Chân, Hải Phòng',
      recipient_contact_phone: '0901234567',
      note: 'Đối tượng xuất: Đại Lý',
      expected_total_qty: 2,
      items: [
        { raw_code: 'A-001', scan_source: 'CAMERA' },
        { raw_code: 'A-002', scan_source: 'MANUAL' },
      ],
    });
  });

  it('expected_total_qty tự tính từ số mã, KHÔNG nhận từ bên ngoài', async () => {
    const { client, sent } = spyClient({ data: {} });
    await recordOutbound(base, 'k', {}, client);
    expect((sent[0]?.body as { expected_total_qty: number }).expected_total_qty)
      .toBe(2);
  });

  it('bỏ hẳn trường tuỳ chọn khi trống, không gửi chuỗi rỗng', async () => {
    const { client, sent } = spyClient({ data: {} });
    await recordOutbound({ ...base, recipientPhone: '' }, 'k', {}, client);
    const keys = Object.keys(sent[0]?.body as object);
    expect(keys).not.toContain('recipient_address');
    expect(keys).not.toContain('recipient_contact_phone');
    expect(keys).not.toContain('note');
  });

  it.each([
    ['khoá rỗng', { ...base }, '  '],
    ['phiếu rỗng', { ...base, items: [] }, 'k'],
    ['thiếu kho', { ...base, warehouseId: ' ' }, 'k'],
    ['thiếu người nhận', { ...base, recipientName: '' }, 'k'],
  ])('từ chối %s và KHÔNG gửi gì', async (_label, input, key) => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      recordOutbound(input as typeof base, key, {}, client),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });

  it('success:false là LỖI, kèm nguyên văn lý do máy chủ', async () => {
    const { client } = spyClient({ success: false, message: 'Mã A-001 đã xuất' });
    await expect(
      recordOutbound(base, 'k', {}, client),
    ).rejects.toMatchObject({ message: 'Mã A-001 đã xuất' });
  });

  it('số phiếu đọc được từ cả doc_no lẫn document_no', () => {
    expect(recordedOutboundDocumentNo({ doc_no: 'PX-1' })).toBe('PX-1');
    expect(recordedOutboundDocumentNo({ document_no: 'PX-2' })).toBe('PX-2');
    expect(recordedOutboundDocumentNo({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bộ gửi hàng đợi
// ---------------------------------------------------------------------------

describe('createOutboundSender', () => {
  function outboxRecord(
    payload: unknown,
    overrides: Partial<OutboxRecord> = {},
  ): OutboxRecord {
    return {
      id: 'rec-1',
      kind: OUTBOUND_OUTBOX_KIND,
      state: 'pending',
      createdAt: '2026-09-06T01:00:00+07:00',
      updatedAt: '2026-09-06T01:00:00+07:00',
      attemptCount: 0,
      idempotencyKey: 'wmshn-stable-key',
      payload,
      ...overrides,
    };
  }

  const payload = {
    name: 'Giao Hải Phòng',
    warehouseId: 'wh-1',
    recipientGroup: 'DEALER',
    recipientName: 'Đại lý Minh Anh',
    phone: '0901234567',
    recipientAddress: 'Số 5, Phường Lê Chân, Hải Phòng',
    province: '31',
    ward: '11683',
    address: 'Số 5',
    quantity: 2,
    note: 'Đối tượng xuất: Đại Lý',
    codes: [
      { raw: 'A-001', source: 'CAMERA' as const, at: 1 },
      { raw: 'A-002', source: 'MANUAL' as const, at: 2 },
    ],
  };

  it('🔒 gửi lại dùng ĐÚNG khoá cũ, không sinh khoá mới', async () => {
    const keys: string[] = [];
    const sender = createOutboundSender(async () => undefined, {
      send: async (_input, key) => {
        keys.push(key);
        return {};
      },
    });
    const rec = outboxRecord(payload);
    await sender(rec);
    await sender(rec);
    await sender({ ...rec, attemptCount: 7 });
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('wmshn-stable-key');
  });

  it('ghép đủ người nhận, địa chỉ, điện thoại và ghi chú', async () => {
    let captured: Record<string, unknown> = {};
    const sender = createOutboundSender(async () => undefined, {
      send: async input => {
        captured = input as unknown as Record<string, unknown>;
        return {};
      },
    });
    await sender(outboxRecord(payload));
    expect(captured.recipientName).toBe('Đại lý Minh Anh');
    expect(captured.recipientAddress).toContain('Hải Phòng');
    expect(captured.recipientPhone).toBe('0901234567');
    expect(captured.note).toContain('Đại Lý');
  });

  it('giữ nguyên nguồn quét của từng mã', () => {
    expect(toOutboundRecordItems(payload).map(item => item.scan_source)).toEqual(
      ['CAMERA', 'MANUAL'],
    );
  });

  it('bản ghi cũ không có source thì mặc định CAMERA', () => {
    expect(
      toOutboundRecordItems({ ...payload, codes: [{ raw: 'A-001', at: 1 }] })[0]
        ?.scan_source,
    ).toBe('CAMERA');
  });

  it('thiếu kho thì BÁO LỖI, không đoán một kho nào đó', async () => {
    let called = false;
    const sender = createOutboundSender(async () => undefined, {
      send: async () => {
        called = true;
        return {};
      },
    });
    await expect(
      sender(outboxRecord({ ...payload, warehouseId: undefined })),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(called).toBe(false);
  });

  it('payload sai dạng thì báo parse, không gửi bừa', async () => {
    const sender = createOutboundSender(async () => undefined, {
      send: async () => ({}),
    });
    await expect(
      sender(outboxRecord({ khong: 'dung dang' })),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('🔒 kind KHÁC thì uỷ quyền tiếp — luồng chưa duyệt vẫn bị chặn', async () => {
    const delegated: string[] = [];
    let outboundCalled = false;
    const sender = createOutboundSender(
      async rec => {
        delegated.push(rec.kind);
        throw new AppError({ kind: 'blocked_by_gate', message: 'chưa duyệt' });
      },
      {
        send: async () => {
          outboundCalled = true;
          return {};
        },
      },
    );

    for (const kind of ['WARRANTY_CASE_DRAFT', 'INBOUND_RECEIPT_DRAFT']) {
      await expect(
        sender(outboxRecord(payload, { kind })),
      ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    }
    expect(delegated).toEqual(['WARRANTY_CASE_DRAFT', 'INBOUND_RECEIPT_DRAFT']);
    expect(outboundCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cổng ghi tổng thể
// ---------------------------------------------------------------------------

describe('cổng ghi sau §2h — sáu thao tác, không hơn', () => {
  const RESOLVE_IN = '/api/v1/mini-app/inbound/resolve-code';
  const RECORD_IN = '/api/v1/mini-app/inbound/record';
  const POST_RECEIPT = '/api/v1/mini-app/inbound-documents/1/post-receipt';
  const RESOLVE_OUT = '/api/v1/mini-app/outbound/resolve-code';
  const RECORD_OUT = '/api/v1/mini-app/outbound/record';
  const POST_ISSUE = '/api/v1/mini-app/outbound-documents/1/post-issue';

  it('đúng sáu thao tác được duyệt', () => {
    for (const path of [
      RESOLVE_IN,
      RECORD_IN,
      POST_RECEIPT,
      RESOLVE_OUT,
      RECORD_OUT,
      POST_ISSUE,
    ]) {
      expect(approvedWriteFor('POST', path)).toBeDefined();
    }
  });

  it('🔒 Idempotency-Key: đúng BỐN thao tác', () => {
    for (const path of [RECORD_IN, POST_RECEIPT, RECORD_OUT, POST_ISSUE]) {
      expect(allowsIdempotencyKey('POST', path)).toBe(true);
    }
    // Hai `resolve-code` KHÔNG được gửi: chúng không tạo gì để cần chống trùng.
    for (const path of [RESOLVE_IN, RESOLVE_OUT]) {
      expect(allowsIdempotencyKey('POST', path)).toBe(false);
    }
  });

  it('🔒 If-Match: đúng HAI thao tác — và đó là hai lệnh đổi tồn kho', () => {
    for (const path of [POST_RECEIPT, POST_ISSUE]) {
      expect(allowsIfMatch('POST', path)).toBe(true);
    }
    for (const path of [RESOLVE_IN, RECORD_IN, RESOLVE_OUT, RECORD_OUT]) {
      expect(allowsIfMatch('POST', path)).toBe(false);
    }
  });

  it('vẫn khoá theo method', () => {
    for (const path of [RECORD_OUT, RESOLVE_OUT, POST_ISSUE]) {
      expect(approvedWriteFor('DELETE', path)).toBeUndefined();
      expect(approvedWriteFor('PATCH', path)).toBeUndefined();
    }
  });

  it('🔴 endpoint ghi ngoài danh sách vẫn bị chặn', () => {
    for (const path of [
      '/api/v1/roles/1',
      '/api/v1/mini-app/inbound-documents',
      '/api/v1/mini-app/outbound-documents/1/unmatch',
      '/api/v1/mini-app/warranty-cases/1/close',
    ]) {
      expect(approvedWriteFor('POST', path)).toBeUndefined();
    }
  });
});
