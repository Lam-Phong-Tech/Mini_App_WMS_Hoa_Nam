/**
 * Chọn ảnh/video cho hồ sơ bảo hành — ảnh **46**.
 *
 * 🔓 Change Control `GATE_01 §11` #2: người dùng duyệt thêm module native
 * `react-native-image-picker@8.2.1` ngày 2026-09-06.
 *
 * Bộ test này canh phần **thuần** — đổi shape và lọc giới hạn. Hai hàm gọi
 * module native đều nhận `PickerDeps` để tiêm bản giả; không test nào chạm vào
 * native thật (mock ở `jest.setup.js` ném lỗi nếu bị gọi).
 */

import {
  captureAttachment,
  filterByLimits,
  pickFromLibrary,
  toOutcome,
  toPicked,
  type PickedAttachment,
} from '../src/features/warranty/attachmentPicker';
import { ATTACHMENT_LIMITS } from '../src/features/warranty/warrantyPolicy';
import { AppError, messageForUser } from '../src/errors/AppError';

const NONE = { images: 0, videos: 0 };

const image = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///a.jpg',
  fileName: 'a.jpg',
  type: 'image/jpeg',
  fileSize: 1024,
  ...over,
});

const video = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///v.mp4',
  fileName: 'v.mp4',
  type: 'video/mp4',
  fileSize: 1024,
  duration: 30,
  ...over,
});

// ---------------------------------------------------------------------------

describe('đổi shape asset', () => {
  it('lấy đủ uri, tên và kiểu', () => {
    const picked = toPicked(image() as never);
    expect(picked?.file).toEqual({
      uri: 'file:///a.jpg',
      name: 'a.jpg',
      type: 'image/jpeg',
    });
    expect(picked?.isVideo).toBe(false);
  });

  it('nhận diện video', () => {
    expect(toPicked(video() as never)?.isVideo).toBe(true);
  });

  it('🔒 thiếu uri ⇒ bỏ hẳn, không đẩy bản ghi rỗng vào danh sách', () => {
    // Không có đường dẫn thì không tải lên được; một dòng rỗng chỉ làm người
    // dùng tưởng đã chọn xong.
    expect(toPicked({ fileName: 'a.jpg' } as never)).toBeUndefined();
    expect(toPicked({ uri: '', fileName: 'a.jpg' } as never)).toBeUndefined();
  });

  it('thiếu tên tệp thì tự đặt, KHÔNG để undefined', () => {
    // `undefined` sẽ thành chuỗi "undefined" trong multipart.
    const picked = toPicked({ uri: 'file:///x', type: 'image/jpeg' } as never);
    expect(picked?.file.name).toContain('attachment-');
    expect(picked?.file.name).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------

describe('lọc theo giới hạn ảnh 46', () => {
  const asPicked = (over: Record<string, unknown> = {}): PickedAttachment =>
    toPicked({ ...image(), ...over } as never) as PickedAttachment;

  it('ảnh hợp lệ thì nhận', () => {
    const result = filterByLimits([asPicked()], NONE);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it('ảnh quá 10MB bị từ chối, kèm tên tệp trong câu lỗi', () => {
    const result = filterByLimits(
      [asPicked({ fileSize: ATTACHMENT_LIMITS.imageBytes + 1 })],
      NONE,
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]).toContain('a.jpg');
    expect(result.rejected[0]).toContain('10MB');
  });

  it('kiểu tệp lạ bị từ chối', () => {
    const result = filterByLimits(
      [asPicked({ type: 'application/pdf', fileName: 'x.pdf' })],
      NONE,
    );
    expect(result.rejected[0]).toContain('x.pdf');
  });

  it('🔒 CỘNG DỒN trong cùng một lần chọn', () => {
    // Chỗ dễ bỏ sót: đã có 8 ảnh, chọn thêm 3 thì hai ảnh đầu hợp lệ, ảnh thứ
    // ba vượt trần 10. Kiểm từng ảnh với cùng `counts` ban đầu sẽ cho cả ba qua.
    const three = [asPicked(), asPicked(), asPicked()];
    const result = filterByLimits(three, { images: 8, videos: 0 });
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain('10 ảnh');
  });

  it('ảnh và video đếm riêng, không lẫn hạn mức', () => {
    const items = [asPicked(), toPicked(video() as never) as PickedAttachment];
    // Đủ 10 ảnh nhưng chưa có video nào ⇒ ảnh bị từ chối, video vẫn qua.
    const result = filterByLimits(items, { images: 10, videos: 0 });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.isVideo).toBe(true);
  });

  it('giữ lại phần HỢP LỆ, không bỏ hết vì một tệp hỏng', () => {
    // Chọn 5 ảnh mà 1 quá nặng thì 4 ảnh kia vẫn dùng được — bắt chọn lại từ
    // đầu là phạt người dùng vì lỗi của một tệp.
    const items = [
      asPicked(),
      asPicked({ fileSize: ATTACHMENT_LIMITS.imageBytes + 1 }),
      asPicked(),
    ];
    const result = filterByLimits(items, NONE);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('đổi phản hồi thư viện thành kết quả', () => {
  it('người dùng đóng hộp chọn ⇒ cancelled, KHÔNG phải lỗi', () => {
    // Đóng hộp chọn là hành động bình thường; hiện thông báo lỗi ở đây là
    // trách người dùng vì đã đổi ý.
    expect(toOutcome({ didCancel: true }, NONE).kind).toBe('cancelled');
  });

  it('không chọn tệp nào cũng là cancelled', () => {
    expect(toOutcome({ assets: [] }, NONE).kind).toBe('cancelled');
  });

  it('lỗi của thư viện được chuyển nguyên văn', () => {
    const outcome = toOutcome(
      { errorCode: 'permission', errorMessage: 'Không có quyền' },
      NONE,
    );
    expect(outcome.kind).toBe('error');
    expect(outcome.kind === 'error' ? outcome.message : '').toBe(
      'Không có quyền',
    );
  });

  it('thiếu errorMessage thì vẫn ra câu đọc được kèm mã lỗi', () => {
    const outcome = toOutcome({ errorCode: 'others' }, NONE);
    expect(outcome.kind === 'error' ? outcome.message : '').toContain('others');
  });

  it('tất cả hợp lệ ⇒ picked', () => {
    const outcome = toOutcome({ assets: [image()] } as never, NONE);
    expect(outcome.kind).toBe('picked');
  });

  it('có tệp hỏng ⇒ partial, kèm danh sách bị từ chối', () => {
    const outcome = toOutcome(
      {
        assets: [
          image(),
          image({
            fileSize: ATTACHMENT_LIMITS.imageBytes + 1,
            fileName: 'to.jpg',
          }),
        ],
      } as never,
      NONE,
    );
    expect(outcome.kind).toBe('partial');
    if (outcome.kind === 'partial') {
      expect(outcome.items).toHaveLength(1);
      expect(outcome.rejected[0]).toContain('to.jpg');
    }
  });
});

// ---------------------------------------------------------------------------

describe('gọi thư viện', () => {
  it('🔒 KHÔNG lấy base64 — video 300MB sẽ ăn hết bộ nhớ', async () => {
    let options: Record<string, unknown> = {};
    await pickFromLibrary(NONE, {
      fromLibrary: (async (opts: Record<string, unknown>) => {
        options = opts;
        return { didCancel: true };
      }) as never,
    });
    expect(options.includeBase64).toBe(false);
  });

  it('giới hạn số tệp theo phần còn TRỐNG của hạn mức', async () => {
    let options: Record<string, unknown> = {};
    await pickFromLibrary(
      { images: 9, videos: 2 },
      {
        fromLibrary: (async (opts: Record<string, unknown>) => {
          options = opts;
          return { didCancel: true };
        }) as never,
      },
    );
    // Còn 1 ảnh, 0 video ⇒ cho chọn tối đa 1.
    expect(options.selectionLimit).toBe(1);
  });

  it('đã đủ hạn mức thì KHÔNG mở hộp chọn', async () => {
    let called = false;
    const outcome = await pickFromLibrary(
      { images: 10, videos: 2 },
      {
        fromLibrary: (async () => {
          called = true;
          return { didCancel: true };
        }) as never,
      },
    );
    expect(called).toBe(false);
    expect(outcome.kind).toBe('error');
  });

  it('🔒 chụp ảnh KHÔNG lưu vào thư viện ảnh của máy', async () => {
    // Ảnh hiện trạng hàng hoá là dữ liệu nghiệp vụ, không phải ảnh cá nhân.
    let options: Record<string, unknown> = {};
    await captureAttachment(NONE, {
      fromCamera: (async (opts: Record<string, unknown>) => {
        options = opts;
        return { didCancel: true };
      }) as never,
    });
    expect(options.saveToPhotos).toBe(false);
  });

  it('thư viện ném lỗi thì thành kết quả error, không vỡ app', async () => {
    const outcome = await pickFromLibrary(NONE, {
      fromLibrary: (() => {
        throw new Error('native vỡ');
      }) as never,
    });
    expect(outcome.kind).toBe('error');
  });
});

// ---------------------------------------------------------------------------

describe('🔒 quyền — không thêm quyền nào vào manifest', () => {
  it('manifest vẫn GỠ hai quyền storage cũ', () => {
    // Ghi chú trong manifest lường trước rằng sẽ phải bỏ hai dòng này khi
    // nghiệp vụ cần ảnh. Hoá ra không phải: photo picker của Android (API 33+)
    // không đòi quyền nào. Khôi phục "cho chắc" là thêm quyền thừa.
    const fs = require('fs');
    const path = require('path');
    const manifest = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'android',
        'app',
        'src',
        'main',
        'AndroidManifest.xml',
      ),
      'utf8',
    );
    expect(manifest).toContain('READ_EXTERNAL_STORAGE');
    expect(manifest).toContain('tools:node="remove"');
    // Không có quyền media mới nào được thêm vào.
    expect(manifest).not.toContain('READ_MEDIA_IMAGES');
    expect(manifest).not.toContain('READ_MEDIA_VIDEO');
  });

  it('thư viện KHÔNG tự khai quyền nào qua manifest merge', () => {
    const fs = require('fs');
    const path = require('path');
    const libManifest = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'node_modules',
        'react-native-image-picker',
        'android',
        'src',
        'main',
        'AndroidManifest.xml',
      ),
      'utf8',
    );
    expect(libManifest).not.toContain('uses-permission');
  });
});

// `types: ["jest"]` không kéo theo kiểu Node.
declare const __dirname: string;

// ---------------------------------------------------------------------------
// 🔴 413 — đo thật trên máy 2026-09-06
// ---------------------------------------------------------------------------

describe('🔴 máy chủ từ chối tệp quá lớn (413)', () => {
  it('nói ĐÚNG nguyên nhân và chỉ đúng người sửa được', () => {
    // Đo thật: nginx trả 413 với thân HTML, không `X-Request-ID` — request
    // chưa từng tới Laravel. Ngưỡng 1MB (`client_max_body_size` mặc định).
    //
    // Câu "Yêu cầu không hợp lệ" ở đây vô dụng: người dùng chọn ảnh hợp lệ,
    // app đã kiểm dưới 10MB, rồi bị từ chối vì lý do không ai nhìn thấy.
    const message = messageForUser(
      new AppError({ kind: 'http', status: 413, message: 'HTTP 413' }),
    );
    expect(message).toContain('1MB');
    expect(message).toContain('quản trị hạ tầng');
    expect(message).not.toBe('Yêu cầu không hợp lệ.');
  });

  it('412/428 nói rõ bấm lại KHÔNG giải quyết', () => {
    for (const status of [412, 428]) {
      const message = messageForUser(
        new AppError({ kind: 'http', status, message: '' }),
      );
      expect(message).toContain('đã thay đổi');
      expect(message).toContain('Mở lại');
    }
  });

  it('4xx khác vẫn giữ câu chung', () => {
    expect(
      messageForUser(new AppError({ kind: 'http', status: 400, message: '' })),
    ).toBe('Yêu cầu không hợp lệ.');
  });
});
