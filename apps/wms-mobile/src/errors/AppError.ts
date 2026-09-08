/**
 * Chuẩn hoá lỗi cho toàn ứng dụng.
 *
 * Nguồn của `error_code` / `code` / `error.code`: docs/migration/01-api-inventory.md —
 * client hiện đọc cả ba dạng. Đây là `CLIENT_EXPECTED_CONTRACT` (GATE_01 §4),
 * KHÔNG phải contract đã được chủ sở hữu WMS xác nhận.
 */

export type AppErrorKind =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'http'
  | 'parse'
  | 'auth'
  | 'blocked_by_gate'
  /**
   * Bị **lớp biên** (Cloudflare) chặn, chưa tới ứng dụng. Tách khỏi `auth` vì
   * với thủ kho hai thứ này trông giống hệt nhau — "không vào được" — nhưng
   * cách xử lý khác hẳn: cái này phải gọi quản trị hạ tầng, không phải đăng
   * nhập lại. Xem `docs/migration/03-api-contract-delta.md` §4c.
   */
  | 'blocked_by_edge'
  /**
   * Máy chủ khai **tier khác** với tier bản dựng này nhắm tới, hoặc không khai
   * gì cả.
   *
   * Tách khỏi `blocked_by_gate` vì cách xử lý ngược nhau: `blocked_by_gate` là
   * "chưa được duyệt, duyệt xong sẽ gửi được" ⇒ giữ lại chờ. Còn cái này là
   * "bản dựng này đang nói chuyện với sai stack" ⇒ gửi lại bao nhiêu lần cũng
   * sai y như vậy. Người dùng chốt 2026-09-06 mục 4: *"khóa thao tác ghi và báo
   * 'Sai môi trường', không retry."*
   */
  | 'wrong_environment'
  | 'config'
  | 'unknown';

export interface AppErrorInit {
  kind: AppErrorKind;
  message: string;
  /** HTTP status khi kind === 'http'. */
  status?: number;
  /** Mã lỗi nghiệp vụ do server trả về, nếu đọc được. */
  code?: string;
  /** Route API đã trả lỗi, không kèm dữ liệu nhạy cảm trong request. */
  route?: string;
  /** X-Request-ID hoặc request_id từ phản hồi WMS, nếu có. */
  requestId?: string;
  /** Vân tay một chiều của lô mã, chỉ gắn cho conflict inbound/record. */
  scanFingerprint?: string;
  /** Số mã trong lô tạo ra scanFingerprint. */
  scanCount?: number;
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly route?: string;
  readonly requestId?: string;
  readonly scanFingerprint?: string;
  readonly scanCount?: number;
  readonly cause?: unknown;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.name = 'AppError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.route = init.route;
    this.requestId = init.requestId;
    this.scanFingerprint = init.scanFingerprint;
    this.scanCount = init.scanCount;
    this.cause = init.cause;
  }
}

/** Đọc mã lỗi nghiệp vụ theo cả ba dạng mà client đang gặp. */
export function extractErrorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.error_code === 'string') {
    return record.error_code;
  }
  if (typeof record.code === 'string') {
    return record.code;
  }
  const nested = record.error;
  if (typeof nested === 'object' && nested !== null) {
    const nestedCode = (nested as Record<string, unknown>).code;
    if (typeof nestedCode === 'string') {
      return nestedCode;
    }
  }
  return undefined;
}

/** Đọc thông điệp lỗi do server trả về, nếu có. */
export function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.length > 0) {
    return record.message;
  }
  const nested = record.error;
  if (typeof nested === 'object' && nested !== null) {
    const nestedMessage = (nested as Record<string, unknown>).message;
    if (typeof nestedMessage === 'string' && nestedMessage.length > 0) {
      return nestedMessage;
    }
  }
  if (typeof record.error === 'string' && record.error.length > 0) {
    return record.error;
  }
  return undefined;
}

/**
 * Request ID là chìa khoá đối chiếu đúng một request trong log WMS. Backend có
 * thể trả nó bằng header hoặc đặt trong envelope; đọc cả các shape không gây
 * đoán nhầm dữ liệu nghiệp vụ.
 */
export function extractRequestId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  for (const candidate of [record.request_id, record.requestId]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  const meta = record.meta;
  if (typeof meta === 'object' && meta !== null) {
    const metaRecord = meta as Record<string, unknown>;
    for (const candidate of [metaRecord.request_id, metaRecord.requestId]) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

export function toAppError(value: unknown): AppError {
  if (value instanceof AppError) {
    return value;
  }
  if (value instanceof Error) {
    if (value.name === 'AbortError') {
      return new AppError({
        kind: 'cancelled',
        message: 'Yêu cầu đã bị huỷ.',
        cause: value,
      });
    }
    return new AppError({
      kind: 'unknown',
      message: value.message,
      cause: value,
    });
  }
  return new AppError({
    kind: 'unknown',
    message: 'Lỗi không xác định.',
    cause: value,
  });
}

/** Thông điệp cho người dùng kho — tiếng Việt, không lộ chi tiết kỹ thuật. */
export function messageForUser(error: AppError): string {
  switch (error.kind) {
    case 'network':
      return 'Không có kết nối mạng. Kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.';
    case 'timeout':
      return 'Máy chủ phản hồi quá lâu. Thử lại sau giây lát.';
    case 'cancelled':
      return 'Yêu cầu đã bị huỷ.';
    case 'auth':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'blocked_by_gate':
      return error.message;
    case 'blocked_by_edge':
      // Cố ý KHÔNG nói "đăng nhập lại": thủ kho có đăng nhập mười lần cũng
      // không qua được, vì request chưa từng tới ứng dụng.
      return (
        'Máy chủ chặn ứng dụng ở lớp bảo vệ mạng. Đăng nhập lại không giải ' +
        'quyết được — báo quản trị hệ thống kèm mã yêu cầu hiển thị bên dưới.'
      );
    case 'config':
      return 'Ứng dụng chưa được cấu hình máy chủ. Liên hệ quản trị.';
    case 'parse':
      return 'Máy chủ trả về dữ liệu không đọc được.';
    case 'http':
      if (error.status === 409) {
        const detail = error.message.trim();
        return detail === ''
          ? 'Dữ liệu đã xung đột trên WMS. Tải lại phiếu trước khi thao tác tiếp.'
          : detail;
      }
      if (error.status === 413) {
        // 🔴 Đo thật 2026-09-06: nginx trả 413 với thân HTML, KHÔNG có
        // `X-Request-ID` — request chưa từng tới Laravel. Ngưỡng đo được là
        // **1 MB** (`client_max_body_size` mặc định, chưa ai đặt).
        //
        // Câu "Yêu cầu không hợp lệ" ở đây là vô dụng: người dùng chọn một ảnh
        // hợp lệ, app đã kiểm nó dưới 10MB, rồi máy chủ từ chối vì một lý do
        // không ai nhìn thấy được. Phải nói đúng nguyên nhân và chỉ đúng người
        // sửa được — thủ kho không tự nâng giới hạn nginx.
        return (
          'Tệp vượt giới hạn dung lượng của máy chủ (khoảng 1MB). Ảnh chụp ' +
          'bằng điện thoại thường lớn hơn mức này — báo quản trị hạ tầng nâng ' +
          'giới hạn tải lên.'
        );
      }
      if (error.status === 412 || error.status === 428) {
        // Optimistic locking. Bấm lại KHÔNG giải quyết — phải mở lại bản ghi
        // để lấy phiên bản mới.
        return (
          'Dữ liệu trên WMS đã thay đổi từ lúc bạn mở. Mở lại rồi thao tác ' +
          'tiếp — bấm lại ngay sẽ bị từ chối tương tự.'
        );
      }
      return error.status !== undefined && error.status >= 500
        ? 'Máy chủ đang gặp sự cố. Thử lại sau.'
        : 'Yêu cầu không hợp lệ.';
    default:
      return 'Đã xảy ra lỗi. Thử lại hoặc báo quản trị.';
  }
}

/**
 * Máy chủ đã **trả lời** hay app **chưa hỏi được**?
 *
 * 🔴 Ranh giới này bị nhầm hai lần trong cùng một tuần — ở luồng bảo hành rồi
 * lại ở luồng xuất kho — nên tách thành một hàm dùng chung thay vì viết lại
 * điều kiện ở mỗi chỗ.
 *
 * | Loại lỗi | Nghĩa | Nói với người dùng |
 * |---|---|---|
 * | 4xx | máy chủ **kết luận** về dữ liệu | *"WMS không nhận ra mã …"* |
 * | 5xx, mất mạng, hết giờ, bị chặn biên | máy chủ **chưa kết luận gì** | *"Chưa hỏi được WMS …"* |
 *
 * Vì sao quan trọng: gộp hai thứ lại thì thủ kho đi kiểm tra mạng trong khi vấn
 * đề nằm ở cái tem — hoặc ngược lại, họ bỏ một kiện hàng tốt ra vì tưởng mã
 * hỏng, trong khi thật ra chỉ là rớt sóng.
 *
 * ⚠️ 5xx cố ý xếp vào *"chưa hỏi được"*: máy chủ lỗi thì nó **chưa hề đánh giá**
 * dữ liệu, nên kết luận gì về mã cũng là bịa.
 */
export function serverAnswered(error: AppError): boolean {
  return (
    error.kind === 'http' &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500
  );
}

/**
 * Câu giải thích khi một phép `resolve-code` thất bại.
 *
 * @param subject "mã" hoặc thứ đang được hỏi, để ghép vào câu.
 */
export function resolveFailureReason(
  error: AppError,
  rawCode: string,
): string {
  if (serverAnswered(error)) {
    return (
      'WMS không nhận ra mã "' +
      rawCode +
      '"' +
      (error.code === undefined ? '' : ' (' + error.code + ')') +
      '.'
    );
  }
  return (
    'Chưa hỏi được WMS về mã "' +
    rawCode +
    '": ' +
    messageForUser(error) +
    ' Quét lại khi có mạng.'
  );
}
