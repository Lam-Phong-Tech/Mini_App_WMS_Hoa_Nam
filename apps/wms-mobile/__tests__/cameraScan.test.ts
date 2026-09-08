/**
 * Kiểm chứng §A của Prompt 3 — phần tự động hoá được.
 *
 * Ba mảng: ánh xạ định dạng, chống callback trùng, máy trạng thái quyền.
 * Bản thân khung xem camera cần phần cứng, không test tự động được —
 * xem 03-device-test-matrix.md.
 */

import {
  allowedCameraKitFormats,
  fromCameraKitFormat,
} from '../src/scanner/cameraFormats';
import {
  DEFAULT_SCAN_GUARD_CONFIG,
  createScanGuard,
} from '../src/scanner/cameraScanGuard';
import {
  canRequestAgain,
  checkCameraPermission,
  interpretRequestResult,
  isCameraUsable,
  permissionMessage,
  requestCameraPermission,
  type AndroidPermissionResult,
  type CameraPermissionState,
  type PermissionBackend,
} from '../src/scanner/cameraPermission';
import {
  displayLabel,
  normalizeScanCode,
  parseScanPayload,
} from '../src/scanner/scanPayload';
import { SUPPORTED_BARCODE_FORMATS } from '../src/scanner/types';

describe('ánh xạ định dạng mã', () => {
  it('map được toàn bộ 8 định dạng Mini App cũ hỗ trợ', () => {
    const mapped = allowedCameraKitFormats();

    expect(mapped).toHaveLength(SUPPORTED_BARCODE_FORMATS.length);
    expect(mapped).toEqual([
      'qr',
      'code-128',
      'code-39',
      'code-93',
      'ean-13',
      'ean-8',
      'upc-a',
      'upc-e',
    ]);
  });

  it('không bật thêm định dạng nào ngoài danh sách', () => {
    // Quét càng nhiều định dạng càng dễ đọc nhầm mã.
    expect(allowedCameraKitFormats()).not.toContain('codabar');
    expect(allowedCameraKitFormats()).not.toContain('pdf-417');
  });

  it('lọc được danh sách hẹp hơn khi cần', () => {
    expect(allowedCameraKitFormats(['QR_CODE', 'CODE_128'])).toEqual([
      'qr',
      'code-128',
    ]);
  });

  it('đọc ngược định dạng camera-kit trả về', () => {
    expect(fromCameraKitFormat('qr')).toBe('QR_CODE');
    expect(fromCameraKitFormat('ean-13')).toBe('EAN_13');
    expect(fromCameraKitFormat('upc-a')).toBe('UPC_A');
  });

  it('giá trị lạ trả undefined thay vì ném lỗi', () => {
    // Mã vẫn dùng được, chỉ là không biết định dạng.
    expect(fromCameraKitFormat('unknown')).toBeUndefined();
    expect(fromCameraKitFormat('itf-14')).toBeUndefined();
    expect(fromCameraKitFormat('')).toBeUndefined();
  });

  it('map hai chiều nhất quán cho mọi định dạng', () => {
    for (const format of SUPPORTED_BARCODE_FORMATS) {
      const [theirs] = allowedCameraKitFormats([format]);
      expect(fromCameraKitFormat(theirs)).toBe(format);
    }
  });
});

describe('chống callback trùng của camera', () => {
  it('nhận mã đầu tiên', () => {
    const guard = createScanGuard();
    expect(guard.accept('ABC', 1000)).toBe(true);
    expect(guard.lastAccepted()).toBe('ABC');
  });

  it('chặn cùng một mã trong cửa sổ chống trùng', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1500, maxTrackedCodes: 64 });

    expect(guard.accept('ABC', 1000)).toBe(true);
    expect(guard.accept('ABC', 1100)).toBe(false);
    expect(guard.accept('ABC', 2400)).toBe(false);
  });

  it('cho qua lại sau khi hết cửa sổ', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1500, maxTrackedCodes: 64 });

    expect(guard.accept('ABC', 1000)).toBe(true);
    expect(guard.accept('ABC', 2500)).toBe(true);
  });

  it('mã nằm yên trong khung hình KHÔNG bị chặn vĩnh viễn', () => {
    // Camera bắn callback liên tục. Nếu mỗi lần bị chặn lại dời mốc thời gian
    // thì cửa sổ không bao giờ hết hạn.
    const guard = createScanGuard({ dedupeWindowMs: 1000, maxTrackedCodes: 64 });

    expect(guard.accept('ABC', 0)).toBe(true);
    for (let t = 100; t < 1000; t += 100) {
      expect(guard.accept('ABC', t)).toBe(false);
    }
    expect(guard.accept('ABC', 1000)).toBe(true);
  });

  it('mã khác được nhận ngay, không phải chờ hết cửa sổ', () => {
    // Thủ kho quét liên tiếp nhiều thùng khác nhau không được bị chặn.
    const guard = createScanGuard({ dedupeWindowMs: 5000, maxTrackedCodes: 64 });

    expect(guard.accept('THUNG-1', 1000)).toBe(true);
    expect(guard.accept('THUNG-2', 1050)).toBe(true);
    expect(guard.accept('THUNG-3', 1100)).toBe(true);
  });

  it('🔴 hồi quy: tem lỗi bị khoá riêng, mã kế tiếp vẫn được nhận ngay', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1500, maxTrackedCodes: 64 });
    const failed = parseScanPayload('HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-LOI');
    const next = parseScanPayload('HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-DUNG');

    expect(guard.accept(failed.dedupeKey, 1000, failed.dedupeScope)).toBe(true);
    guard.reject(failed.dedupeKey);

    // Camera vẫn thấy tem lỗi trong khung: không gọi WMS lặp vô hạn, kể cả
    // sau cửa sổ debounce thông thường đã hết.
    expect(guard.accept(failed.dedupeKey, 1200, failed.dedupeScope)).toBe(false);
    expect(guard.accept(failed.dedupeKey, 10_000, failed.dedupeScope)).toBe(false);
    // Thủ kho đưa tem khác vào là phải nhận ngay, không chờ timeout của tem lỗi.
    expect(guard.accept(next.dedupeKey, 1200, next.dedupeScope)).toBe(true);
    // Rời/bắt đầu lại phiên quét thì nhả mọi khoá, gồm cả tem lỗi.
    guard.reset();
    expect(guard.accept(failed.dedupeKey, 10_100, failed.dedupeScope)).toBe(true);
  });

  it('🔴 hồi quy: chuỗi xen kẽ A B A B KHÔNG được lọt lưới', () => {
    // Bản đầu của guard chỉ nhớ MỘT mã cuối cùng nên chuỗi xen kẽ vô hiệu hoá
    // hoàn toàn cơ chế chống trùng. Người dùng phát hiện trên máy thật
    // 2026-09-05: "số lượng nhảy hơi loạn và có trùng".
    const guard = createScanGuard({ dedupeWindowMs: 5000, maxTrackedCodes: 64 });

    expect(guard.accept('A', 1000)).toBe(true);
    expect(guard.accept('B', 1100)).toBe(true);
    // Hai dòng dưới đây TRƯỚC KIA trả về `true` — đó chính là lỗi.
    expect(guard.accept('A', 1200)).toBe(false);
    expect(guard.accept('B', 1300)).toBe(false);
    expect(guard.accept('A', 1400)).toBe(false);
  });

  it('hai mã cùng nằm trong khung hình, mỗi mã chỉ tính một lần', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1500, maxTrackedCodes: 64 });
    let accepted = 0;

    // Camera bắn xen kẽ hai mã trong suốt 1 giây, 10 lần mỗi mã.
    for (let t = 0; t < 1000; t += 50) {
      if (guard.accept(t % 100 === 0 ? 'THUNG-1' : 'THUNG-2', t)) {
        accepted += 1;
      }
    }

    expect(accepted).toBe(2);
  });

  it('E2E: một tem đã quét không gọi WMS lặp, tem kế tiếp đi hết luồng', async () => {
    const guard = createScanGuard();
    const sendToWms = jest.fn(async (raw: string) => ({ raw }));
    const itemA = 'HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-001';
    const itemB = 'HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-002';

    const onCameraRead = async (raw: string): Promise<void> => {
      const parsed = parseScanPayload(raw);
      if (!guard.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)) {
        return;
      }
      await sendToWms(raw);
    };

    // Detector có thể gửi lại cùng QR ở hàng chục frame. Chỉ frame đầu tiên
    // được phép đi qua API; không có vòng lặp request hay tăng số lượng lặp.
    await onCameraRead(itemA);
    await onCameraRead(itemA);
    await onCameraRead(itemA);

    // Đưa tem khác vào khung là phải đi tiếp bình thường, không bị khoá theo
    // tem trước đó.
    await onCameraRead(itemB);

    expect(sendToWms).toHaveBeenCalledTimes(2);
    expect(sendToWms).toHaveBeenNthCalledWith(1, itemA);
    expect(sendToWms).toHaveBeenNthCalledWith(2, itemB);
  });

  it('mỗi mã có cửa sổ riêng, không dùng chung', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1000, maxTrackedCodes: 64 });

    expect(guard.accept('A', 0)).toBe(true);
    expect(guard.accept('B', 900)).toBe(true);
    // A đã hết cửa sổ ở mốc 1000 dù B mới nhận lúc 900.
    expect(guard.accept('A', 1000)).toBe(true);
    expect(guard.accept('B', 1000)).toBe(false);
  });

  it('giới hạn số mã theo dõi để Map không phình vô hạn', () => {
    const guard = createScanGuard({ dedupeWindowMs: 60_000, maxTrackedCodes: 5 });

    for (let i = 0; i < 20; i += 1) {
      guard.accept('MA-' + String(i), 1000 + i);
    }

    expect(guard.trackedCount()).toBeLessThanOrEqual(5);
  });

  it('mã hết cửa sổ bị dọn khỏi bộ nhớ theo dõi', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1000, maxTrackedCodes: 64 });

    guard.accept('A', 0);
    guard.accept('B', 10);
    expect(guard.trackedCount()).toBe(2);

    // Quét mã thứ ba sau khi hai mã kia đã hết hạn.
    guard.accept('C', 5000);
    expect(guard.trackedCount()).toBe(1);
  });

  it('reset xoá sạch trạng thái', () => {
    const guard = createScanGuard({ dedupeWindowMs: 5000, maxTrackedCodes: 64 });

    guard.accept('ABC', 1000);
    guard.reset();

    expect(guard.lastAccepted()).toBeUndefined();
    expect(guard.accept('ABC', 1100)).toBe(true);
  });

  it('mặc định BẬT chống trùng — ngược với đầu quét wedge', () => {
    // Wedge chỉ bắn một lần mỗi khi bóp cò nên mặc định tắt;
    // camera đọc liên tục nên bắt buộc bật.
    expect(DEFAULT_SCAN_GUARD_CONFIG.dedupeWindowMs).toBeGreaterThan(0);
  });
});

describe('máy trạng thái quyền camera', () => {
  function backendOf(
    check: boolean | Error,
    request?: AndroidPermissionResult | Error,
  ): PermissionBackend {
    return {
      check: async () => {
        if (check instanceof Error) {
          throw check;
        }
        return check;
      },
      request: async () => {
        if (request instanceof Error) {
          throw request;
        }
        return request ?? 'denied';
      },
    };
  }

  it('diễn giải đúng ba kết quả của Android', () => {
    expect(interpretRequestResult('granted')).toBe('granted');
    expect(interpretRequestResult('denied')).toBe('denied');
    // Hỏi nữa vô ích: hệ thống trả về ngay, không hiện hộp thoại.
    expect(interpretRequestResult('never_ask_again')).toBe('blocked');
  });

  it('chỉ granted mới được bật camera', () => {
    const states: CameraPermissionState[] = [
      'checking',
      'denied',
      'blocked',
      'unavailable',
    ];
    expect(isCameraUsable('granted')).toBe(true);
    for (const state of states) {
      expect(isCameraUsable(state)).toBe(false);
    }
  });

  it('chỉ hiện nút xin quyền khi còn xin lại được', () => {
    expect(canRequestAgain('denied')).toBe(true);
    expect(canRequestAgain('checking')).toBe(true);
    // Bấm cũng vô ích nên không được hiện nút.
    expect(canRequestAgain('blocked')).toBe(false);
    expect(canRequestAgain('granted')).toBe(false);
    expect(canRequestAgain('unavailable')).toBe(false);
  });

  it('check trả granted/denied', async () => {
    expect(await checkCameraPermission(backendOf(true))).toBe('granted');
    expect(await checkCameraPermission(backendOf(false))).toBe('denied');
  });

  it('backend ném lỗi → unavailable, không làm sập app', async () => {
    expect(
      await checkCameraPermission(backendOf(new Error('không có camera'))),
    ).toBe('unavailable');
    expect(
      await requestCameraPermission(backendOf(false, new Error('lỗi'))),
    ).toBe('unavailable');
  });

  it('request map đủ ba nhánh', async () => {
    expect(await requestCameraPermission(backendOf(false, 'granted'))).toBe(
      'granted',
    );
    expect(await requestCameraPermission(backendOf(false, 'denied'))).toBe(
      'denied',
    );
    expect(
      await requestCameraPermission(backendOf(false, 'never_ask_again')),
    ).toBe('blocked');
  });

  it('mỗi trạng thái có thông điệp tiếng Việt riêng', () => {
    const states: CameraPermissionState[] = [
      'checking',
      'granted',
      'denied',
      'blocked',
      'unavailable',
    ];
    const messages = states.map(permissionMessage);

    expect(new Set(messages).size).toBe(states.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    // Bị chặn thì phải chỉ đường vào Cài đặt, không chỉ báo "từ chối".
    expect(permissionMessage('blocked')).toMatch(/Cài đặt/);
  });
});

describe('phân tích payload HN1|SKU=…|ITEM=…', () => {
  // Dữ liệu thật từ docs/inventory-qr-export-2026-08-23/payloads.txt
  const SEED = 'HN1|SKU=HN-PRD-SEED-001|ITEM=SN-HN-SEED-0001';

  it('tách được SKU và ITEM', () => {
    const parsed = parseScanPayload(SEED);

    expect(parsed.sku).toBe('HN-PRD-SEED-001');
    expect(parsed.item).toBe('SN-HN-SEED-0001');
    expect(parsed.isComposite).toBe(true);
  });

  it('có ITEM → khoá chống trùng là ITEM, phạm vi cả phiên', () => {
    const parsed = parseScanPayload(SEED);

    expect(parsed.dedupeKey).toBe('SN-HN-SEED-0001');
    expect(parsed.dedupeScope).toBe('session');
  });

  it('không có ITEM → khoá là chuỗi chuẩn hoá, chỉ chặn theo cửa sổ', () => {
    // Nếu chặn cả phiên thì kiện thứ hai cùng loại sẽ bị nuốt mất.
    const parsed = parseScanPayload('DCPL04-5');

    expect(parsed.item).toBeUndefined();
    expect(parsed.dedupeKey).toBe('DCPL04-5');
    expect(parsed.dedupeScope).toBe('window');
  });

  it('chuẩn hoá đúng như Mini App cũ: bỏ khoảng trắng, viết hoa', () => {
    expect(normalizeScanCode('  dcpl 04-5 ')).toBe('DCPL04-5');
  });

  it('nhãn hiển thị ưu tiên ITEM vì đó là định danh kiện', () => {
    expect(displayLabel(parseScanPayload(SEED))).toBe('SN-HN-SEED-0001');
    expect(displayLabel(parseScanPayload('DCPL04-5'))).toBe('DCPL04-5');
  });

  it('payload rác không làm ném lỗi', () => {
    const parsed = parseScanPayload('rác|||');
    expect(parsed.sku).toBeUndefined();
    expect(parsed.item).toBeUndefined();
    expect(parsed.dedupeScope).toBe('window');
  });
});

describe('🎯 câu hỏi người dùng: 1 SKU có 4-5 ITEM thì đếm thế nào', () => {
  // Bốn ITEM thật của cùng một SKU, lấy nguyên từ
  // docs/inventory-qr-export-2026-08-23/payloads.txt
  const FOUR_ITEMS_SAME_SKU = [
    'HN1|SKU=HN-PRD-SEED-001|ITEM=HN-PRD-SEED-001-123-234',
    'HN1|SKU=HN-PRD-SEED-001|ITEM=SN-HN-SEED-0003',
    'HN1|SKU=HN-PRD-SEED-001|ITEM=SN-HN-SEED-0002',
    'HN1|SKU=HN-PRD-SEED-001|ITEM=SN-HN-SEED-0001',
  ];

  it('4 kiện cùng SKU được đếm ĐỦ 4, KHÔNG báo trùng', () => {
    const guard = createScanGuard();
    let accepted = 0;

    for (const raw of FOUR_ITEMS_SAME_SKU) {
      const parsed = parseScanPayload(raw);
      if (guard.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)) {
        accepted += 1;
      }
    }

    expect(accepted).toBe(4);
    expect(guard.sessionCount()).toBe(4);
  });

  it('quét lại CÙNG một kiện thì bị chặn, dù rê máy qua lại bao lâu', () => {
    const guard = createScanGuard();
    const parsed = parseScanPayload(FOUR_ITEMS_SAME_SKU[0]);

    expect(
      guard.accept(parsed.dedupeKey, 1000, parsed.dedupeScope),
    ).toBe(true);
    // Cách 10 phút vẫn chặn: một kiện chỉ đếm một lần trong phiên.
    expect(
      guard.accept(parsed.dedupeKey, 1000 + 600_000, parsed.dedupeScope),
    ).toBe(false);
  });

  it('rê máy qua lại giữa 4 kiện: mỗi kiện vẫn chỉ đúng 1 dòng', () => {
    const guard = createScanGuard();
    let accepted = 0;

    // Camera bắn xen kẽ 4 mã, 10 vòng — giống lúc rê máy trên tờ QR.
    for (let round = 0; round < 10; round += 1) {
      for (const raw of FOUR_ITEMS_SAME_SKU) {
        const parsed = parseScanPayload(raw);
        if (guard.accept(parsed.dedupeKey, round * 5000, parsed.dedupeScope)) {
          accepted += 1;
        }
      }
    }

    expect(accepted).toBe(4);
  });

  it('mã SKU trần vẫn quét lại được sau cửa sổ — không nuốt kiện', () => {
    const guard = createScanGuard({ dedupeWindowMs: 1500, maxTrackedCodes: 64 });
    const parsed = parseScanPayload('DCPL04-5');

    expect(guard.accept(parsed.dedupeKey, 0, parsed.dedupeScope)).toBe(true);
    expect(guard.accept(parsed.dedupeKey, 500, parsed.dedupeScope)).toBe(false);
    // Kiện thứ hai cùng loại, quét sau 2 giây.
    expect(guard.accept(parsed.dedupeKey, 2000, parsed.dedupeScope)).toBe(true);
  });

  it('reset cho phép quét lại cả kiện đã khoá', () => {
    const guard = createScanGuard();
    const parsed = parseScanPayload(FOUR_ITEMS_SAME_SKU[0]);

    guard.accept(parsed.dedupeKey, undefined, parsed.dedupeScope);
    guard.reset();

    expect(guard.sessionCount()).toBe(0);
    expect(
      guard.accept(parsed.dedupeKey, undefined, parsed.dedupeScope),
    ).toBe(true);
  });
});
