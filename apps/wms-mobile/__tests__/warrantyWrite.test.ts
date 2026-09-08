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
import {
  TRANSITION_KEY_PREFIX,
  transitionIdempotencyKey,
} from '../src/features/warranty/useWarrantyTransition';

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

describe('H — tạo hồ sơ bảo hành', () => {
  const base = {
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    customerAddress: 'Số 5, Phường Lê Chân, Hải Phòng',
    description: 'Máy không lên nguồn',
    defectIds: ['DEF-006'],
  };

  it('nhánh CÓ mã gửi item_code', async () => {
    const { client, sent } = spyClient({ data: {} });
    await createWarrantyCase(
      { ...base, itemCode: 'ITEM-1' },
      'wmshn-k',
      {},
      client,
    );
    const body = sent[0]?.body as Record<string, unknown>;
    expect(body.item_code).toBe('ITEM-1');
    expect(body.customer_name).toBe('Nguyễn Văn A');
    expect(body.defect_ids).toEqual(['DEF-006']);
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-k');
  });

  it('🔴 không chọn lỗi nào thì BỎ HẲN defect_ids, không gửi []', async () => {
    // Danh mục lỗi trên WMS dev-test đang rỗng (đo 2026-09-06), nên đây là
    // đường đi thường gặp chứ không phải ca hiếm. Gửi `[]` có thể vướng luật
    // `min:1` phía máy chủ; vắng mặt thì lọt qua `nullable`. Mini App gốc bỏ
    // khoá theo đúng cách này — `warranty-flow.service.ts:497`.
    const { client, sent } = spyClient({ data: {} });
    await createWarrantyCase(
      { ...base, defectIds: [], itemCode: 'ITEM-1' },
      'k',
      {},
      client,
    );
    const body = sent[0]?.body as Record<string, unknown>;
    expect('defect_ids' in body).toBe(false);
  });

  it('nhánh MẤT mã gửi lý do và mô tả thay cho item_code', async () => {
    const { client, sent } = spyClient({ data: {} });
    await createWarrantyCase(
      {
        ...base,
        missingCodeReason: 'Tem bong',
        manualProductDescription: 'Máy khoan cầm tay',
      },
      'k',
      {},
      client,
    );
    const body = sent[0]?.body as Record<string, unknown>;
    expect(body.item_code).toBeUndefined();
    expect(body.missing_code_reason).toBe('Tem bong');
    expect(body.manual_product_description).toBe('Máy khoan cầm tay');
  });

  it('🐞 nhánh MẤT mã VẪN gửi phụ kiện và tình trạng', async () => {
    // Lỗi của Mini App: hàm chuẩn hoá payload chỉ giữ hai trường này ở nhánh có
    // item_code. Hồ sơ tạm là loại hay có tranh chấp nhất — mất thông tin phụ
    // kiện ở đúng đó là mất nó ở chỗ cần nhất.
    const { client, sent } = spyClient({ data: {} });
    await createWarrantyCase(
      {
        ...base,
        missingCodeReason: 'Tem bong',
        manualProductDescription: 'Máy khoan',
        accessoriesReceived: 'Sạc, hộp',
        receivedCondition: 'Xước vỏ',
      },
      'k',
      {},
      client,
    );
    const body = sent[0]?.body as Record<string, unknown>;
    expect(body.accessories_received).toBe('Sạc, hộp');
    expect(body.received_condition).toBe('Xước vỏ');
  });

  it('bỏ hẳn trường tuỳ chọn khi trống', async () => {
    const { client, sent } = spyClient({ data: {} });
    await createWarrantyCase({ ...base, itemCode: 'I' }, 'k', {}, client);
    const keys = Object.keys(sent[0]?.body as object);
    expect(keys).not.toContain('accessories_received');
    expect(keys).not.toContain('received_condition');
  });

  it.each([
    ['khoá rỗng', { ...base, itemCode: 'I' }, '  '],
    ['không mã và không mô tả', { ...base }, 'k'],
    ['thiếu tên khách', { ...base, itemCode: 'I', customerName: ' ' }, 'k'],
    ['thiếu mô tả', { ...base, itemCode: 'I', description: '' }, 'k'],
  ])('từ chối %s và KHÔNG gửi gì', async (_label, input, key) => {
    const { client, sent } = spyClient({ data: {} });
    await expect(
      createWarrantyCase(input as typeof base, key, {}, client),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// I — chuyển trạng thái
// ---------------------------------------------------------------------------

describe('I — chuyển trạng thái hồ sơ', () => {
  it('gửi đủ status, note, confirmed_defect và cả hai header', async () => {
    const { client, sent } = spyClient({ data: {} });
    await updateWarrantyStatus(
      {
        caseId: 'case-1',
        status: 'REPAIRING',
        version: '"4"',
        note: 'Chuyển sửa chữa',
        confirmedDefect: 'Rò dầu ở gioăng',
      },
      'wmshn-k',
      {},
      client,
    );
    expect(sent[0]?.path).toBe(warrantyStatusPath('case-1'));
    expect(sent[0]?.body).toEqual({
      status: 'REPAIRING',
      note: 'Chuyển sửa chữa',
      confirmed_defect: 'Rò dầu ở gioăng',
    });
    expect(sent[0]?.headers?.['If-Match']).toBe('4');
    expect(sent[0]?.headers?.['Idempotency-Key']).toBe('wmshn-k');
  });

  it('🔒 KHÔNG gửi khi thiếu version', async () => {
    // Hai người cùng mở một hồ sơ là chuyện thường; ghi đè Kết quả kiểm tra của
    // nhau thì mất hẳn phần hồ sơ kỹ thuật.
    const { client, sent } = spyClient({ data: {} });
    for (const version of [undefined, null, '', '  ']) {
      await expect(
        updateWarrantyStatus(
          { caseId: 'c', status: 'CHECKING', version: version as never },
          'k',
          {},
          client,
        ),
      ).rejects.toMatchObject({ kind: 'config' });
    }
    expect(sent).toHaveLength(0);
  });

  it('trường rỗng bị bỏ hẳn, không gửi chuỗi rỗng đè lên ghi chú cũ', async () => {
    const { client, sent } = spyClient({ data: {} });
    await updateWarrantyStatus(
      { caseId: 'c', status: 'CHECKING', version: 1, note: '   ' },
      'k',
      {},
      client,
    );
    expect(Object.keys(sent[0]?.body as object)).toEqual(['status']);
  });

  it('If-Match được phép ở đúng đường này', () => {
    expect(allowsIfMatch('POST', warrantyStatusPath('c'))).toBe(true);
    expect(allowsIfMatch('POST', WARRANTY_WRITE_PATHS.cases)).toBe(false);
    expect(allowsIfMatch('POST', WARRANTY_WRITE_PATHS.resolveCode)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// J — tải file
// ---------------------------------------------------------------------------

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
    expect(usesMultipart('POST', '/api/v1/mini-app/inbound/record')).toBe(false);
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

describe('useWarrantyTransition — khoá idempotency theo BƯỚC', () => {
  it('cùng hồ sơ + cùng bước ⇒ cùng khoá', () => {
    expect(transitionIdempotencyKey('c1', 'CHECKING')).toBe(
      transitionIdempotencyKey('c1', 'checking'),
    );
  });

  it('🔒 bước KHÁC ⇒ khoá KHÁC', () => {
    // Dùng chung một khoá cho cả vòng đời thì bước thứ hai bị máy chủ coi là
    // gửi trùng của bước đầu và lặng lẽ không xảy ra.
    expect(transitionIdempotencyKey('c1', 'CHECKING')).not.toBe(
      transitionIdempotencyKey('c1', 'REPAIRING'),
    );
  });

  it('hồ sơ khác ⇒ khoá khác', () => {
    expect(transitionIdempotencyKey('c1', 'CHECKING')).not.toBe(
      transitionIdempotencyKey('c2', 'CHECKING'),
    );
  });

  it('không vượt 100 ký tự', () => {
    expect(transitionIdempotencyKey('x'.repeat(500), 'CHECKING').length).toBe(
      100,
    );
  });

  it('mang tiền tố nhận diện được phía máy chủ', () => {
    expect(
      transitionIdempotencyKey('c1', 'CHECKING').startsWith(
        TRANSITION_KEY_PREFIX,
      ),
    ).toBe(true);
  });
});
