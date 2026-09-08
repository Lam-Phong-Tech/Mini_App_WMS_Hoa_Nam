/**
 * Tầng đọc WMS — **chỉ GET, cưỡng chế bằng code**.
 *
 * 🔓 Được phép tồn tại nhờ Change Control `GATE_WMS §2d` (người dùng duyệt
 * phương án A, 2026-09-06): *cho đấu endpoint nghiệp vụ **chỉ với method an
 * toàn**; mọi endpoint **ghi** vẫn cấm nguyên vẹn.*
 *
 * ## Vì sao có tệp này thay vì gọi thẳng `apiClient`
 *
 * `apiClient` đã chặn ghi ở tầng dưới (`SAFE_METHODS` + `wmsGateApproved`).
 * Nhưng chốt chặn đó nằm **xa** chỗ viết màn hình. Tệp này là chốt **thứ hai**,
 * đặt ngay tại nơi tầng nghiệp vụ gọi, để một lập trình viên mở tệp bất kỳ ở
 * `services/wms/` cũng thấy ngay rằng ở đây không có đường nào ghi dữ liệu.
 *
 * Hai chốt độc lập, cùng một quy tắc: hỏng một cái thì cái kia vẫn giữ.
 *
 * ## Cái này KHÔNG làm
 *
 * - Không gửi `Idempotency-Key` — `GATE_01 §11` #6.
 * - Không gửi `If-Match` — mục 12 Gate WMS chưa kiểm chứng.
 * - Không tự retry: `apiClient` không có cơ chế retry nào, và gửi lại request
 *   đọc thì vô hại nhưng gửi lại theo vòng lặp ngầm thì che mất sự cố mạng.
 */

import { AppError } from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import type { ApiEnvelope, Page } from './types';

/**
 * Chỉ phần `get` của API client.
 *
 * Cố ý **hẹp đúng một method**: một bên gọi cầm `ReadClient` không có cách nào
 * gửi POST/PATCH/DELETE, kể cả khi muốn. Đây là chốt chặn ở tầng **kiểu dữ
 * liệu**, cộng thêm vào chốt lúc chạy của `assertReadOnlyPath` và chốt trong
 * `apiClient`.
 *
 * Tiêm được để test không phải mock module — đúng quy ước `ApiClientDeps` mà
 * `api/client.ts` đã dùng từ Prompt 2.
 */
export interface ReadClient {
  get<T>(
    path: string,
    options?: Omit<RequestOptions, 'path' | 'method'>,
  ): Promise<ApiResponse<T>>;
}

/**
 * Đường dẫn tuyệt đối bị cấm với **mọi** method, kể cả GET.
 *
 * `auth/logout` là POST nên đã bị `SAFE_METHODS` chặn; liệt kê ở đây là để
 * người đọc thấy rõ tầng này không đụng vào phiên đăng nhập — việc đó thuộc
 * `auth/tokenRefresh.ts`.
 */
const FORBIDDEN_PREFIXES: readonly string[] = ['/api/v1/auth/logout'];

/**
 * Từ khoá cho thấy đường dẫn là một **hành động**, không phải phép đọc.
 *
 * ⚠️ Chỉ xét **đoạn CUỐI** đường dẫn. Spec WMS luôn đặt hành động ở cuối
 * (`/{id}/post-receipt`, `/{id}/scan`, `/{id}/cancel`…), còn cùng chữ ấy đứng
 * giữa lại là **không gian tên đọc được**.
 *
 * Ví dụ phân biệt hai chiều — cả hai đều có chữ `scan`:
 *
 * | Đường dẫn | Đoạn cuối | Kết luận |
 * |---|---|---|
 * | `/api/v1/scan/events` | `events` | ✅ đọc — đã kiểm chứng trả **200** (§4e.2) |
 * | `/api/v1/inbound-documents/{id}/scan` | `scan` | ❌ hành động — chặn |
 *
 * Bản đầu của hàm này xét **mọi** đoạn nên chặn nhầm `/scan/events`. Sai kiểu
 * đó nguy hiểm kín đáo: nó không làm hỏng gì ngay, chỉ khiến một màn hình lặng
 * lẽ không bao giờ có dữ liệu.
 */
const ACTION_SEGMENTS: readonly string[] = [
  'post-receipt',
  'post-issue',
  'reversals',
  'cancel',
  'approve',
  'reject',
  'submit',
  'scan',
  'close',
  'purge',
];

export function assertReadOnlyPath(path: string): void {
  const lower = path.toLowerCase();

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (lower.startsWith(prefix)) {
      throw new AppError({
        kind: 'blocked_by_gate',
        message:
          'Đường dẫn "' + path + '" không thuộc tầng đọc (GATE_WMS §2d).',
      });
    }
  }

  // Bỏ query trước khi tách — `?status=cancel` là bộ lọc, không phải lệnh huỷ.
  const segments = (lower.split('?')[0] ?? '').split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? '';

  if (ACTION_SEGMENTS.includes(lastSegment)) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message:
        'Đường dẫn "' +
        path +
        '" kết thúc bằng đoạn hành động "' +
        lastSegment +
        '". Tầng đọc chỉ được truy vấn, không kích hoạt nghiệp vụ ' +
        '(GATE_WMS §2d.4).',
    });
  }
}

export type ReadOptions = Pick<
  RequestOptions,
  'query' | 'signal' | 'timeoutMs'
>;

/**
 * Gọi một endpoint đọc và bóc envelope.
 *
 * Không nhận tham số `method` — **không có đường nào** để bên gọi yêu cầu ghi.
 * Đó là điểm khác biệt so với dùng thẳng `apiClient.request`.
 */
export async function readOne<T>(
  path: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<T> {
  assertReadOnlyPath(path);
  const response = await client.get<ApiEnvelope<T>>(path, options);
  const body = response.data;
  if (body === undefined || body === null || !('data' in body)) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi không có trường "data".',
      status: response.status,
    });
  }
  return body.data;
}

/**
 * Gọi một endpoint danh sách và bóc thành `Page`.
 *
 * Chịu được **cả hai biến thể envelope** (§4e.3): có `links` khi phân trang,
 * không có khi trả một đối tượng đơn.
 */
export async function readPage<T>(
  path: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<Page<T>> {
  assertReadOnlyPath(path);
  const response = await client.get<ApiEnvelope<readonly T[]>>(path, options);
  const body = response.data;
  const data = body?.data;
  if (!Array.isArray(data)) {
    throw new AppError({
      kind: 'parse',
      message: 'Endpoint danh sách trả về "data" không phải mảng.',
      status: response.status,
    });
  }
  return { items: data, meta: body?.meta, links: body?.links };
}
