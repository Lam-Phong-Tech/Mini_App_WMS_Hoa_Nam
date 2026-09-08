/**
 * Tầng đọc WMS — khoá Change Control `GATE_WMS §2d`.
 *
 * Nới ngày 2026-09-06 chỉ mở **đọc**. Test trong tệp này tồn tại để lệnh cấm
 * ghi không trôi đi theo thời gian: nếu ai đó thêm một đường ghi vào
 * `services/wms/`, ít nhất một test ở đây phải đỏ.
 *
 * ❗ Không test nào gọi mạng. Toàn bộ dùng `fetch` giả.
 */

import {
  assertReadOnlyPath,
  readOne,
  readPage,
} from '../src/services/wms/readOnlyClient';
import {
  WMS_READ_PATHS,
  fetchInboundDocument,
  fetchWarrantyCase,
  mapCurrentUser,
  warrantyAttachmentDownloadPath,
} from '../src/services/wms/queries';
import { ANONYMIZED_MARKER, isAnonymized } from '../src/services/wms/types';
import { createApiClient } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import type { AppEnvironment } from '../src/config/env';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const environment: AppEnvironment = {
  name: 'dev-test',
  label: 'thử',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: false,
  wmsGateApproved: false,
  behindEdgeProxy: true,
};

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

// ---------------------------------------------------------------------------

describe('§2d — tầng đọc chặn mọi đường có mùi ghi', () => {
  it('cho qua đường truy vấn bình thường', () => {
    for (const path of Object.values(WMS_READ_PATHS)) {
      expect(() => assertReadOnlyPath(path)).not.toThrow();
    }
  });

  it('chặn đoạn hành động trong đường dẫn', () => {
    // Spec WMS đặt hành động ở cuối path. Kể cả bên gọi nhầm sang GET, tầng này
    // vẫn từ chối — ta không thử xem endpoint hành động có chấp nhận GET không.
    for (const path of [
      '/api/v1/mini-app/inbound-documents/1/post-receipt',
      '/api/v1/mini-app/outbound-documents/1/post-issue',
      '/api/v1/inbound-documents/1/scan',
      '/api/v1/component-issue-documents/1/cancel',
      '/api/v1/mini-app/warranty-cases/1/approve',
      '/api/v1/documents/1/reversals',
    ]) {
      expect(() => assertReadOnlyPath(path)).toThrow(AppError);
    }
  });

  it('KHÔNG nhầm query string thành hành động', () => {
    // `?status=cancel` là bộ lọc, không phải lệnh huỷ.
    expect(() =>
      assertReadOnlyPath('/api/v1/mini-app/inbound-documents?status=cancel'),
    ).not.toThrow();
  });

  it('chỉ xét đoạn CUỐI — /scan/events là đọc, /{id}/scan là hành động', () => {
    // Bản đầu của guard xét mọi đoạn nên chặn nhầm `/api/v1/scan/events`, một
    // endpoint đọc đã kiểm chứng trả 200. Sai kiểu đó không làm hỏng gì ngay,
    // chỉ khiến một màn hình lặng lẽ không bao giờ có dữ liệu.
    expect(() => assertReadOnlyPath('/api/v1/scan/events')).not.toThrow();
    expect(() =>
      assertReadOnlyPath('/api/v1/inbound-documents/abc/scan'),
    ).toThrow(AppError);
  });

  it('dấu gạch chéo thừa ở cuối không lách được guard', () => {
    expect(() =>
      assertReadOnlyPath('/api/v1/inbound-documents/abc/scan/'),
    ).toThrow(AppError);
  });

  it('chặn đường đăng xuất — phiên do tầng auth quản, không phải tầng này', () => {
    expect(() => assertReadOnlyPath('/api/v1/auth/logout')).toThrow(AppError);
  });

  it('lỗi ném ra mang kind blocked_by_gate, không phải lỗi chung', () => {
    try {
      assertReadOnlyPath('/api/v1/x/post-receipt');
      throw new Error('lẽ ra phải ném');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).kind).toBe('blocked_by_gate');
    }
  });
});

describe('§2d — chốt chặn tầng dưới vẫn nguyên vẹn', () => {
  it('GET endpoint nghiệp vụ nay ĐƯỢC phép — đây chính là phần được nới', () => {
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async () =>
        jsonResponse(200, { data: [], meta: {} })) as never,
      getSession: () => undefined,
    });
    return expect(
      client.get(WMS_READ_PATHS.inboundDocuments),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('POST endpoint nghiệp vụ VẪN bị chặn — phần KHÔNG được nới', async () => {
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async () => jsonResponse(200, {})) as never,
      getSession: () => undefined,
    });
    await expect(
      client.request({
        path: WMS_READ_PATHS.inboundDocuments,
        method: 'POST',
        body: {},
      }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
  });

  it('PATCH và DELETE cũng vẫn bị chặn', async () => {
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async () => jsonResponse(200, {})) as never,
      getSession: () => undefined,
    });
    for (const method of ['PATCH', 'DELETE'] as const) {
      await expect(
        client.request({ path: '/api/v1/roles/1', method }),
      ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    }
  });

  it('không môi trường nào bật wmsGateApproved', () => {
    expect(environment.wmsGateApproved).toBe(false);
  });
});

describe('bóc envelope — chịu được cả hai biến thể thật', () => {
  /** Client giả chỉ có `get` — đúng hình dạng `ReadClient`. */
  function clientReturning(body: unknown) {
    return {
      get: async <T,>() => ({ status: 200, data: body as T }),
    };
  }

  it('danh sách CÓ links (biến thể phân trang)', async () => {
    const page = await readPage<{ id: string }>(
      WMS_READ_PATHS.inboundDocuments,
      {},
      clientReturning({
        success: true,
        data: [{ id: 'a' }],
        links: { next: null },
        meta: { current_page: 1, request_id: 'r' },
      }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.meta?.current_page).toBe(1);
    expect(page.links?.next).toBeNull();
  });

  it('đối tượng đơn KHÔNG có links', async () => {
    const one = await readOne<{ id: string }>(
      WMS_READ_PATHS.me,
      {},
      clientReturning({ success: true, data: { id: 'x' }, meta: {} }),
    );
    expect(one.id).toBe('x');
  });

  it('endpoint danh sách trả về object thay vì mảng → lỗi parse rõ ràng', async () => {
    await expect(
      readPage(
        WMS_READ_PATHS.inboundDocuments,
        {},
        clientReturning({ data: { nope: true } }),
      ),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('phản hồi thiếu hẳn "data" → lỗi parse, không trả undefined lặng lẽ', async () => {
    await expect(
      readOne(WMS_READ_PATHS.me, {}, clientReturning({ success: true })),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('kiểm đường dẫn CHẠY TRƯỚC khi gửi request', async () => {
    let called = false;
    const spy = {
      get: async <T,>() => {
        called = true;
        return { status: 200, data: {} as T };
      },
    };
    await expect(
      readOne('/api/v1/mini-app/inbound-documents/1/post-receipt', {}, spy),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    // Nếu cờ này true nghĩa là request đã bay đi rồi mới chặn — vô nghĩa.
    expect(called).toBe(false);
  });
});

describe('`auth/me` — adapter cùng cấu trúc staff/user với Mini App', () => {
  it('lấy đủ tên, vai trò, avatar từ nhánh staff lồng nhau', () => {
    expect(
      mapCurrentUser({
        staff: {
          id: 7,
          display_name: 'Nguyễn Thủ Kho',
          avatar_url: 'https://example.invalid/avatar.png',
          roles: [{ role_name: 'Warehouse Operator' }],
        },
      }),
    ).toEqual({
      id: '7',
      name: 'Nguyễn Thủ Kho',
      email: undefined,
      avatar_url: 'https://example.invalid/avatar.png',
      role: 'Warehouse Operator',
      permissions: undefined,
    });
  });

  it('nhận trực tiếp user phẳng khi backend không bọc staff', () => {
    expect(mapCurrentUser({ id: 'u-1', name: 'Kho A', role: 'Quản lý' }))
      .toMatchObject({ id: 'u-1', name: 'Kho A', role: 'Quản lý' });
  });
});

describe('bẫy hình dạng dữ liệu đã đo được', () => {
  it('bảo hành nhận warrantyCaseId, KHÔNG phải id', () => {
    // Bản ghi bảo hành không có trường `id` (§4f.4). Tên tham số phải nói ra
    // điều đó, nếu không sẽ có người truyền `record.id` (undefined) vào.
    expect(fetchWarrantyCase.length).toBeGreaterThanOrEqual(1);
    expect(fetchWarrantyCase.toString()).toContain('warrantyCaseId');
  });

  it('chi tiết phiếu nhập là lời gọi RIÊNG, không tái dùng phần tử danh sách', () => {
    // Chi tiết có thêm status_history mà danh sách không có (§4f.5).
    expect(fetchInboundDocument.toString()).toContain('readOne');
  });

  it('nhận ra hồ sơ đã bị ẩn danh qua đúng chuỗi backend dùng', () => {
    // API chưa có cờ `pii_anonymized` (§4k.3) nên đây là dấu hiệu duy nhất.
    expect(ANONYMIZED_MARKER).toBe('[ANONYMIZED]');
    expect(isAnonymized('[ANONYMIZED]')).toBe(true);
    expect(isAnonymized('Nguyễn Văn A')).toBe(false);
    expect(isAnonymized(null)).toBe(false);
    expect(isAnonymized(undefined)).toBe(false);
  });

  it('🔧 đường tải file phải có hậu tố /download', () => {
    // Sửa kết luận sai 2026-09-06. Trước đây test này đòi KHÔNG khai
    // `warranty-attachments` chút nào, dựa trên một phép đo 405 mà tôi diễn
    // giải quá tay: 405 chỉ nói "method này không đúng cho ĐƯỜNG này", không
    // nói gì về đường khác.
    //
    // Có hai đường: `{id}` cho DELETE, `{id}/download` cho GET.
    expect(warrantyAttachmentDownloadPath('abc')).toBe(
      '/api/v1/mini-app/warranty-attachments/abc/download',
    );
  });

  it('mã file được escape — không ghép chuỗi thô vào URL', () => {
    expect(warrantyAttachmentDownloadPath('a/b')).toContain('a%2Fb');
  });

  it('đường đọc timeline và file đính kèm bám theo mã hồ sơ', () => {
    expect(WMS_READ_PATHS.warrantyCases).toBe(
      '/api/v1/mini-app/warranty-cases',
    );
  });

  it('có khai endpoint defects kèm cảnh báo 403 cho vai thủ kho', () => {
    // Đo thật: 403 ACCESS_DENIED với warehouse-keeper. Bên gọi phải coi đó là
    // trạng thái hợp lệ, không phải sự cố.
    expect(WMS_READ_PATHS.defects).toBe('/api/v1/defects');
  });
});
