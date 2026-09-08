/**
 * Contract test — đối chiếu tầng xử lý lỗi của app với phản hồi THẬT của WMS.
 *
 * ⚠️ Fixture dưới đây **không phải do tôi bịa ra**. Đây là body nguyên văn thu
 * được từ staging `https://khohoanamdev.bigk.click` ngày 2026-09-05 bằng
 * request GET không kèm token. Người dùng xác nhận đây là môi trường **staging**
 * và yêu cầu chạy contract test đọc.
 *
 * Vì sao test này đáng có: `AppError.extractErrorCode` đọc mã lỗi theo **ba
 * dạng** (`error_code` · `code` · `error.code`) — thứ tự đó suy từ mã nguồn
 * Mini App cũ, chưa từng đối chiếu với server. Test này khoá lại kết luận: thứ
 * tự đó đúng với phản hồi thật. Nếu server đổi envelope, test sẽ đỏ.
 *
 * ❗ Test này **không** gọi mạng. Nó chỉ chạy fixture đã thu qua tầng phân tích.
 */

/**
 * `@react-native/typescript-config` đặt `types: ["jest"]`, nên type của Node không
 * được nạp và `__dirname` không tồn tại với `tsc`. Khai báo tại chỗ cho riêng tệp
 * này, thay vì nới `tsconfig.json` của cả dự án chỉ vì một test.
 */
declare const __dirname: string;

import { stripComments } from '../test-utils/sourceScan';

import {
  extractErrorCode,
  extractErrorMessage,
  messageForUser,
  AppError,
} from '../src/errors/AppError';
import { classifyFailure } from '../src/sync/syncEngine';

/**
 * Nguyên văn từ `GET /api/v1/mini-app/inbound-documents` không kèm token.
 * HTTP 401 · 334 byte.
 */
const REAL_401 = {
  success: false,
  message: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  error_code: 'UNAUTHENTICATED',
  errors: [],
  error: {
    code: 'UNAUTHENTICATED',
    details: [],
  },
  meta: {
    request_id: 'db4b7ad6-7ba1-4276-9806-0c4517b23dde',
    timestamp: '2026-09-05T17:09:13+07:00',
  },
};

/**
 * Nguyên văn từ `GET /api/v1/public/config`. HTTP 200 · 950 byte.
 * Đã rút gọn phần `data` cho gọn; các trường bao ngoài giữ nguyên.
 */
const REAL_200 = {
  success: true,
  message: null,
  error_code: null,
  errors: null,
  data: { contract_version: 1 },
  meta: { request_id: 'de945c45-72d4-423a-b09e-70260ca8b3ed' },
};

describe('envelope thật của WMS staging', () => {
  it('phản hồi lỗi mang CẢ error_code lẫn error.code', () => {
    // Đây là lý do `extractErrorCode` phải chịu được nhiều dạng.
    expect(REAL_401.error_code).toBe('UNAUTHENTICATED');
    expect(REAL_401.error.code).toBe('UNAUTHENTICATED');
  });

  it('đọc đúng mã lỗi từ phản hồi thật', () => {
    expect(extractErrorCode(REAL_401)).toBe('UNAUTHENTICATED');
  });

  it('đọc đúng thông điệp tiếng Việt của server', () => {
    expect(extractErrorMessage(REAL_401)).toBe(
      'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
    );
  });

  it('phản hồi thành công có error_code = null, không làm hàm đọc mã hiểu nhầm', () => {
    // `null` không phải string nên phải trả undefined, không được trả 'null'.
    expect(extractErrorCode(REAL_200)).toBeUndefined();
  });

  it('phản hồi thành công có message = null, không dựng thông điệp rỗng', () => {
    expect(extractErrorMessage(REAL_200)).toBeUndefined();
  });

  it('mọi phản hồi đều mang meta.request_id — dùng được để tra cứu khi hỗ trợ', () => {
    expect(REAL_401.meta.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(REAL_200.meta.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('401 thật đi hết đường xử lý của app', () => {
  /** Dựng đúng `AppError` mà `api/client.ts` sẽ tạo cho phản hồi này. */
  const error = new AppError({
    kind: 'auth',
    status: 401,
    code: extractErrorCode(REAL_401),
    message: extractErrorMessage(REAL_401) ?? 'HTTP 401',
  });

  it('phân loại thành kind "auth"', () => {
    expect(error.kind).toBe('auth');
    expect(error.code).toBe('UNAUTHENTICATED');
  });

  it('sinh thông điệp tiếng Việt cho thủ kho, không lộ chi tiết kỹ thuật', () => {
    const shown = messageForUser(error);
    expect(shown).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    expect(shown).not.toContain('UNAUTHENTICATED');
    expect(shown).not.toContain('401');
  });

  it('hàng đợi đánh dấu "failed", KHÔNG phải "unknown" — server đã trả lời rõ', () => {
    // 401 nghĩa là server từ chối và chắc chắn không ghi gì.
    const { state } = classifyFailure(error);
    expect(state).toBe('failed');
  });
});

/**
 * ⚠️ Fixture dưới đây thu ngày 2026-09-05 từ lần chạy contract test **CÓ TOKEN**
 * do NGƯỜI DÙNG tự chạy (`wms-contract-auth.py`). 11/11 endpoint GET trả HTTP 200.
 * Phần `data` đã lược bỏ nội dung nghiệp vụ — chỉ giữ nguyên các trường bao ngoài,
 * vốn là thứ tầng phân tích của app đọc tới.
 */
const REAL_200_PAGINATED = {
  success: true,
  data: [{ id: 1 }],
  links: { first: '…', last: '…', prev: null, next: null },
  meta: {
    current_page: 1,
    per_page: 1,
    request_id: 'aa2f0919-a2cf-4dbb-80da-517217b23dde',
  },
};

/** `GET /api/v1/auth/me` — không phân trang nên KHÔNG có `links`. */
const REAL_200_SINGLE = {
  success: true,
  data: { id: 1 },
  meta: { request_id: 'bb2f0919-a2cf-4dbb-80da-517217b23dde' },
};

describe('envelope THÀNH CÔNG có token — hai biến thể (2026-09-05)', () => {
  it('có phân trang thì thêm khoá "links"', () => {
    expect(Object.keys(REAL_200_PAGINATED).sort()).toEqual([
      'data',
      'links',
      'meta',
      'success',
    ]);
  });

  it('không phân trang thì KHÔNG có "links"', () => {
    expect(Object.keys(REAL_200_SINGLE).sort()).toEqual([
      'data',
      'meta',
      'success',
    ]);
    expect('links' in REAL_200_SINGLE).toBe(false);
  });

  it('cả hai đều THIẾU error_code — khác /public/config vốn trả error_code: null', () => {
    // Đây là lý do extractErrorCode phải chịu được cả "thiếu trường" lẫn "trường null".
    expect('error_code' in REAL_200_PAGINATED).toBe(false);
    expect('error_code' in REAL_200_SINGLE).toBe(false);
    expect(REAL_200.error_code).toBeNull(); // /public/config thì có, và bằng null
  });

  it('thiếu trường error_code vẫn cho undefined, không ném lỗi', () => {
    expect(extractErrorCode(REAL_200_PAGINATED)).toBeUndefined();
    expect(extractErrorCode(REAL_200_SINGLE)).toBeUndefined();
  });

  it('thiếu trường message vẫn cho undefined, không dựng thông điệp rỗng', () => {
    expect(extractErrorMessage(REAL_200_PAGINATED)).toBeUndefined();
    expect(extractErrorMessage(REAL_200_SINGLE)).toBeUndefined();
  });

  it('mọi biến thể vẫn mang meta.request_id', () => {
    expect(REAL_200_PAGINATED.meta.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(REAL_200_SINGLE.meta.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/**
 * `If-Match` — nguồn của `version`.
 *
 * Bản trước của khối này khẳng định "CHƯA XÁC ĐỊNH" và tự ghi rằng phải viết lại
 * khi câu hỏi được trả lời. Ngày 2026-09-05 người dùng chạy `wms-version-probe.py`
 * trên staging và câu trả lời là: **`data.version`**, không phải header `ETag`.
 *
 * Fixture dưới đây là **tên trường** thu được từ phản hồi thật (giá trị nghiệp vụ
 * đã lược bỏ, chỉ giữ `version` vì đó chính là thứ cần khoá).
 */
const REAL_INBOUND_KEYS = [
  'agency_id',
  'create_idempotency_key',
  'doc_no',
  'expected_total_qty',
  'id',
  'lines',
  'mini_app_status',
  'progress_percent',
  'ready_for_post',
  'remaining_qty',
  'scanned_total_qty',
  'status',
  'updated_at',
  'version',
] as const;

/** Bản ghi bảo hành — KHÔNG có `id`. */
const REAL_WARRANTY_KEYS = [
  'legal_hold_flag',
  'pii_masked',
  'retention_until',
  'status',
  'version',
  'warranty_case_code',
  'warranty_case_id',
] as const;

describe('If-Match — version lấy từ data.version (2026-09-05)', () => {
  const REAL_DETAIL_HEADERS = {
    Vary: 'Accept-Encoding',
    'Cache-Control': 'no-store, private',
    'X-Request-ID': '1f7aa525-0ee1-44ac-bd5b-d45130f44f03',
  };

  it('GET chi tiết cũng KHÔNG trả ETag — thân phản hồi là nguồn duy nhất', () => {
    expect('ETag' in REAL_DETAIL_HEADERS).toBe(false);
    expect('etag' in REAL_DETAIL_HEADERS).toBe(false);
  });

  it('tài liệu nhập/xuất mang trường version', () => {
    expect(REAL_INBOUND_KEYS).toContain('version');
  });

  it('hồ sơ bảo hành cũng mang version', () => {
    expect(REAL_WARRANTY_KEYS).toContain('version');
  });

  it('X-Request-ID đọc được từ header, không phụ thuộc thân phản hồi', () => {
    expect(REAL_DETAIL_HEADERS['X-Request-ID']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('🔒 If-Match chỉ được GỬI từ ba tệp tầng ghi', () => {
    // 🔧 Đổi khung 2026-09-06 (`GATE_WMS §2f`). Trước đây test này đòi **không
    // tệp nào** nhắc tới If-Match, vì chưa thao tác nào được gửi nó. Nay
    // `post-receipt` đã duyệt và bắt buộc phải có header ấy.
    //
    // Nhưng nới không có nghĩa là bỏ canh. Danh sách dưới đây khoá **phạm vi**:
    // chỉ ba tệp tầng ghi được gửi header này, và mỗi tệp chỉ gửi cho đúng
    // thao tác của luồng mình. Ngày ai đó gắn If-Match vào một endpoint khác,
    // test này đỏ.
    //
    // Chốt thật nằm ở `allowsIfMatch` (kiểm lúc chạy, theo đường dẫn); test này
    // là chốt thứ hai, canh ở tầng "tệp nào được phép nhắc tới nó".
    //
    // Bộ lọc chú thích vẫn giữ: nhắc tên một lệnh cấm ngược lại với vi phạm nó.
    // Chuẩn hoá dấu phân cách trước khi so — `path.join` trên Windows trả về
    // `\`, còn danh sách này viết bằng `/` cho dễ đọc.
    const ALLOWED = [
      'src/services/wms/inboundWrite.ts',
      'src/services/wms/outboundWrite.ts',
      'src/services/wms/warrantyWrite.ts',
    ];

    const fs = require('fs');

    const path = require('path');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const code = stripComments(fs.readFileSync(full, 'utf8'));
          const unixPath = full.split(path.sep).join('/');
          if (
            code.includes('If-Match') &&
            !ALLOWED.some(allowed => unixPath.endsWith(allowed))
          ) {
            found.push(unixPath);
          }
        }
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    expect(found).toEqual([]);
  });

  it('bộ lọc chú thích phân biệt được "nhắc tên" với "sử dụng"', () => {
    // Nếu bộ lọc hỏng, test trên sẽ xanh giả mà không ai biết. Khoá nó lại.
    expect(stripComments('/* cấm gửi If-Match */')).not.toContain('If-Match');
    expect(stripComments('// header If-Match bị cấm')).not.toContain('If-Match');
    expect(stripComments("headers['If-Match'] = String(v);")).toContain(
      'If-Match',
    );
  });
});

describe('bẫy hình dạng dữ liệu phát hiện 2026-09-05', () => {
  it('bảo hành KHÔNG có "id" — không viết được getId() dùng chung', () => {
    expect(REAL_WARRANTY_KEYS).not.toContain('id');
    expect(REAL_WARRANTY_KEYS).toContain('warranty_case_id');
    // Ngược lại, phiếu nhập thì có.
    expect(REAL_INBOUND_KEYS).toContain('id');
  });

  it('server tự tính tiến độ — client không được cộng lại từ danh sách scan', () => {
    for (const f of [
      'expected_total_qty',
      'scanned_total_qty',
      'remaining_qty',
      'progress_percent',
      'ready_for_post',
    ] as const) {
      expect(REAL_INBOUND_KEYS).toContain(f);
    }
  });

  it('mini_app_status TÁCH RIÊNG khỏi status canonical — là hai trường khác nhau', () => {
    expect(REAL_INBOUND_KEYS).toContain('status');
    expect(REAL_INBOUND_KEYS).toContain('mini_app_status');
  });

  it('server lưu idempotency key lên chính tài liệu', () => {
    // Spec nhắc create_idempotency_key 0 lần, nhưng server có trả.
    expect(REAL_INBOUND_KEYS).toContain('create_idempotency_key');
  });

  it('hồ sơ bảo hành có hạn lưu trữ và cờ giữ pháp lý — chi phối chính sách dọn dữ liệu local', () => {
    expect(REAL_WARRANTY_KEYS).toContain('retention_until');
    expect(REAL_WARRANTY_KEYS).toContain('legal_hold_flag');
  });
});

describe('5xx — spec cam kết rollback, app vẫn giữ unknown', () => {
  it('HTTP_5XX_POLICY vẫn là "unknown", chưa đổi theo tài liệu', () => {
    // 339/339 operation khai 500 đều ghi "giao dịch đã được rollback".
    // Nhưng tài liệu ≠ kiểm chứng, và lời hứa đó không phủ timeout/502/503/504.
    // Đổi giá trị này là quyết định nghiệp vụ của người dùng, không phải của code.

    const { HTTP_5XX_POLICY } = require('../src/sync/syncEngine');
    expect(HTTP_5XX_POLICY).toBe('unknown');
  });

  it('timeout vẫn là unknown kể cả khi 5xx sau này đổi thành failed', () => {
    const { state } = classifyFailure(
      new AppError({ kind: 'timeout', message: 'hết giờ' }),
    );
    expect(state).toBe('unknown');
  });
});
