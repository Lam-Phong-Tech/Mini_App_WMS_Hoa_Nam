/**
 * Màn quét **nghiệp vụ** — dùng trong luồng Nhập kho và Xuất kho.
 *
 * 🎨 Nguồn: ảnh **19, 28** của bộ 47 ảnh, và ba ảnh chụp thật người dùng gửi
 * ngày 2026-09-06.
 *
 * ## 🔧 Vì sao có tệp này
 *
 * Bản đầu của tôi tái dùng `CameraScanScreen` — **màn chẩn đoán của Prompt 3** —
 * rồi gắn thêm một thẻ đếm lên trên. Người dùng chạy thật và chỉ ra ngay: giao
 * diện không giống Mini App chút nào.
 *
 * Họ đúng. Màn chẩn đoán là `Page` nền sáng với các thẻ liệt kê trạng thái
 * quyền, định dạng, danh sách kết quả — hợp cho việc kiểm chứng phần cứng, **sai
 * hoàn toàn** cho thủ kho đang cầm hàng. Màn nghiệp vụ phải là **toàn màn tối**
 * để khung ngắm nổi bật và mắt không bị chói khi quét trong kho.
 *
 * Hai màn nay tách bạch:
 * - `CameraScanScreen` — chẩn đoán, giữ nguyên, vẫn là bằng chứng của Prompt 3
 * - `BusinessScanScreen` — màn này, bám đúng thiết kế
 *
 * ## Bố cục, đọc từ trên xuống theo ảnh
 *
 * | Phần | Chi tiết |
 * |---|---|
 * | Header | nút ‹ · tiêu đề *"Quét hàng nhập"* · phụ đề = tên phiếu · badge **`N MÃ`** |
 * | Khung ngắm | bốn góc trắng, giữa màn |
 * | Khi **chưa cấp quyền** | thẻ trắng đè giữa: *"Sẵn sàng quét mã"* + nút *Bật camera để quét* + liên kết *Nhập mã thủ công* |
 * | Khi **đang quét** | chữ giữa khung: *"Giữ thiết bị ổn định"* / *"Đã quét N sản phẩm"* |
 * | Nút nổi bên phải | ⚡ đèn pin · 🖼 chọn ảnh |
 * | Thanh dưới | *"Phiên quét nhập kho"* / *"{tên} · đã quét N mã"* + *Nhập tay* + *Kiểm tra phiếu* |
 *
 * Nút *Kiểm tra phiếu* **mờ khi chưa quét mã nào** — đúng ảnh 1 người dùng gửi.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';

import { Text } from '../../ui/Text';
import { AppIcon } from '../../ui/AppIcon';
import { CodeInput } from '../../ui/CodeInput';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { tokens } from '../../theme/tokens';
import { logger } from '../../logging/logger';
import { allowedCameraKitFormats } from '../../scanner/cameraFormats';
import {
  DEFAULT_SCAN_GUARD_CONFIG,
  createScanGuard,
} from '../../scanner/cameraScanGuard';
import {
  canRequestAgain,
  isCameraUsable,
  permissionMessage,
} from '../../scanner/cameraPermission';
import { useCameraPermission } from '../../scanner/useCameraPermission';
import { parseScanPayload, type ScanSource } from '../../scanner/scanPayload';
import { useIsScreenFocused } from '../../navigation/useIsScreenFocused';
import {
  decodeQrImage,
  pickQrImage,
  supportsImageQrScan,
} from './imageQrScanner';
import { useDeploymentTier } from '../../services/wms/useDeploymentTier';
import {
  MESSAGE_WRONG_ENVIRONMENT,
  type TierCheckResult,
} from '../../services/wms/tierCheck';

/**
 * Câu giải thích khi sai môi trường.
 *
 * Nói **việc cần làm**, không chỉ nói hỏng: thủ kho không sửa được bản dựng,
 * nên câu chữ phải hướng họ tới người sửa được.
 */
function wrongEnvironmentBody(tier: TierCheckResult): string {
  if (tier.status === 'unreachable') {
    return 'Chưa gọi được máy chủ để xác định môi trường. Kiểm tra mạng rồi thử lại.';
  }
  if (tier.status === 'mismatched') {
    return (
      'Máy chủ khai môi trường "' +
      String(tier.reported) +
      '" nhưng bản cài này dành cho "' +
      tier.expected +
      '". Báo bộ phận kỹ thuật để cài đúng bản — không quét ở đây.'
    );
  }
  return 'Không xác định được đang kết nối tới môi trường nào. Báo bộ phận kỹ thuật trước khi quét.';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#221f35',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBody: {
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerTitle: {
    color: '#ffffff',
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.66)',
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  /** Vùng giữa chứa khung ngắm. */
  viewfinderArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 200,
  },
  corner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: '#ffffff',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  hint: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: '600',
  },
  hintSub: {
    color: 'rgba(255,255,255,0.66)',
    textAlign: 'center',
  },
  /** Thẻ trắng đè giữa khi chưa cấp quyền. */
  permissionCard: {
    position: 'absolute',
    top: '38%',
    left: 24,
    right: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  permissionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: {
    fontWeight: '700',
  },
  permissionBody: {
    textAlign: 'center',
  },
  manualLink: {
    fontWeight: '600',
  },
  /** Nút tròn nổi bên phải. */
  floatingColumn: {
    position: 'absolute',
    top: '45%',
    right: 16,
    alignItems: 'center',
  },
  floatingButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  floatingGlyph: {
    fontSize: 20,
    color: '#ffffff',
  },
  /** Thanh hành động dưới cùng. */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bottomBody: {
    flex: 1,
  },
  bottomActions: {
    flexDirection: 'row',
  },
  errorBar: {
    borderRadius: 12,
  },
  /**
   * Toast nổi, không phủ khung camera. Phản hồi cho từng mã vẫn rõ nhưng stream
   * và bộ giải mã không bị dừng/mở lại nên quét hàng liên tục không khựng.
   */
  scanResultLayer: {
    position: 'absolute',
    top: 112,
    left: 16,
    right: 16,
    zIndex: 10,
    alignItems: 'center',
  },
  scanResultCard: {
    width: '100%',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanResultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanResultCopy: { flex: 1 },
  scanResultTitle: {
    fontWeight: '700',
  },
});

export interface BusinessScanScreenProps {
  /** Tiêu đề, ví dụ *"Quét hàng nhập"* / *"Quét hàng xuất"*. */
  title: string;
  /** Phụ đề — bộ ảnh dùng **tên phiếu**. */
  documentName: string;
  /** Nhãn phiên ở thanh dưới, ví dụ *"Phiên quét nhập kho"*. */
  sessionLabel: string;
  /** Số mã luồng nghiệp vụ đang giữ. Badge và thanh dưới đều đọc số này. */
  scannedCount: number;
  /** Chuỗi tiến độ nếu có mốc, ví dụ `"2/5"`. Bỏ trống thì hiện `N MÃ`. */
  progressLabel?: string;
  /** Tạm ngừng máy quét khi luồng cha đang yêu cầu xác nhận nghiệp vụ. */
  scanPaused?: boolean;
  /**
   * Mã vừa nhận. `source` cho biết máy đọc được hay thủ kho gõ tay —
   * contract `inbound/record` bắt buộc trường `scan_source`, và màn này là nơi
   * **duy nhất** còn biết sự khác biệt đó.
   */
  onScan: (
    raw: string,
    source: ScanSource,
  ) => void | ScanFeedback | Promise<void | ScanFeedback>;
  onBack: () => void;
  onDone: () => void;
  /** Nhãn nút kết thúc. Bộ ảnh dùng *"Kiểm tra phiếu"*. */
  doneLabel?: string;
}

/** Kết quả ngắn gọn để luồng nghiệp vụ báo lại ngay tại màn camera. */
export interface ScanFeedback {
  /** `false` giữ mã ngoài danh sách, ví dụ WMS không resolve được SKU. */
  readonly accepted?: boolean;
  /**
   * Mã chưa được thêm vào danh sách vì luồng cha cần hỏi thêm dữ liệu (loại
   * hàng hoặc số kiểm đếm hộp). Đây không phải lỗi quét; màn nhập mã thủ công
   * phải đóng để hộp xác nhận nghiệp vụ hiện lên phía trước.
   */
  readonly requiresInput?: boolean;
  readonly message?: string;
}

type ScanResultTone = 'success' | 'failure';

interface ScanResultNotice {
  readonly tone: ScanResultTone;
  readonly message: string;
}

interface CameraReadEvent {
  readonly nativeEvent: {
    readonly codeStringValue: string;
    readonly codeFormat: string;
  };
}

const SUCCESS_NOTICE_DURATION_MS = 1400;
const FAILURE_NOTICE_DURATION_MS = 2600;
// Mini App giữ khoá callback 520ms sau một kết quả. Không giữ nhịp này, stream
// đang nhìn một cụm tem sẽ nhận ngay QR nằm kế bên vừa khi request trước xong,
// làm card kết quả đổi liên tục dù camera không hề lỗi. Web App giữ stream mở
// (không stop/start camera), chỉ chặn *đầu vào* trong đúng nhịp đã kiểm chứng.
const POST_SCAN_SETTLE_MS = 520;

export function BusinessScanScreen({
  title,
  documentName,
  sessionLabel,
  scannedCount,
  progressLabel,
  scanPaused = false,
  onScan,
  onBack,
  onDone,
  doneLabel = 'Kiểm tra phiếu',
}: BusinessScanScreenProps): React.ReactElement {
  const permission = useCameraPermission();
  // Không dùng `useIsFocused()` của react-navigation: nó ném lỗi khi màn được
  // render ngoài navigator. Xem `navigation/useIsScreenFocused.ts`.
  const isFocused = useIsScreenFocused();

  const [appActive, setAppActive] = useState(
    () => AppState.currentState === 'active',
  );
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | undefined>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultNotice>();
  // State React cập nhật theo render; callback camera có thể bắn nhiều frame
  // trước render kế tiếp. Ref này khoá đồng bộ request hiện tại để không gửi
  // cùng lúc hai mã, nhưng không hề tắt preview camera.
  const processingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Chống callback trùng. `useRef` để không dựng lại mỗi lần render — dựng lại
  // là mất trạng thái chống trùng và mã sẽ lọt qua.
  const guard = useRef(createScanGuard(DEFAULT_SCAN_GUARD_CONFIG));
  const allowedTypes = useMemo(() => allowedCameraKitFormats(), []);

  /**
   * Camera chỉ bật khi hội đủ CẢ BA điều kiện — giữ nguyên quy tắc đã kiểm
   * chứng trên máy thật ở Prompt 3. Không render `<Camera>` là thật sự nhả phần
   * cứng, không chỉ ẩn đi.
   */
  // 🔒 Mục 2 (2026-09-06): chỉ bật quét khi máy chủ khai đúng tier. Sai stack
  // mà vẫn cho quét là để thủ kho quét cả lô rồi mới biết không gửi được — mất
  // công ở đúng chỗ tốn công nhất.
  const tier = useDeploymentTier();

  const cameraCanRun =
    isCameraUsable(permission.state) &&
    isFocused &&
    appActive &&
    tier.allowed &&
    !scanPaused;

  /**
   * Thông báo và request không được tắt Camera. Tháo component Camera sau mỗi
   * mã khiến trình duyệt phải xin/open MediaStream lại, tạo đúng hiện tượng
   * preview đen/chớp và "đang tải" mà thủ kho vừa phản ánh.
   */
  // Mini App dừng stream đúng lúc bộ chọn ảnh mở để camera không giữ phần cứng
  // sau hộp chọn tệp. Xong việc, render lại Camera và tiếp tục phiên quét.
  const cameraActive = cameraCanRun && !imagePickerOpen && !isDecodingImage;

  const isScanResultVisible =
    isProcessing || isDecodingImage || scanResult !== undefined;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      setAppActive(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== undefined) {
        clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    // Chỉ reset khi phiên quét bị dừng hẳn (rời màn, app nền, modal nghiệp vụ),
    // không reset khi vừa quét thành công. Nếu không, cùng một tem có thể lọt
    // qua guard ngay sau khi camera tự bật lại.
    if (!cameraCanRun) {
      guard.current.reset();
      setTorchOn(false);
    }
  }, [cameraCanRun]);

  /**
   * Kết quả chỉ nằm trên camera trong một nhịp ngắn, sau đó phiên mới tự mở
   * lại. Kết quả thất bại giữ lâu hơn để thủ kho kịp đọc lý do từ WMS.
   */
  useEffect(() => {
    if (scanResult === undefined) {
      return undefined;
    }
    const timeout = setTimeout(
      () => {
        setScanResult(undefined);
      },
      scanResult.tone === 'success'
        ? SUCCESS_NOTICE_DURATION_MS
        : FAILURE_NOTICE_DURATION_MS,
    );
    return () => clearTimeout(timeout);
  }, [scanResult]);

  const showScanResult = useCallback(
    (tone: ScanResultTone, message: string) => {
      setScanResult({ tone, message });
    },
    [],
  );

  const releaseScanInputAfterResult = useCallback(() => {
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(() => {
      processingRef.current = false;
      settleTimerRef.current = undefined;
    }, POST_SCAN_SETTLE_MS);
  }, []);

  const submitAcceptedCode = useCallback(
    async (code: string, source: ScanSource): Promise<boolean> => {
      if (processingRef.current || scanPaused) {
        return false;
      }
      processingRef.current = true;
      setIsProcessing(true);
      setTorchOn(false);
      try {
        const feedback = await onScan(code, source);
        if (feedback?.accepted === false) {
          const message =
            feedback.message ??
            'Mã này đã được quét. Vui lòng quét sản phẩm khác.';
          // Với lỗi WMS, khoá riêng tem này tới hết phiên quét. Nếu chỉ chờ
          // vài giây rồi nhả, camera vẫn đang nhìn cùng tem sẽ gửi nó lại và
          // thay phiên card “đang kiểm tra”/“lỗi” liên tục. Mã khác không bị
          // ảnh hưởng, nên đưa tem kế tiếp vào là quét được ngay.
          if (!feedback.requiresInput) {
            guard.current.reject(parseScanPayload(code).dedupeKey);
          }
          // `requiresInput` là nhánh có chủ đích: mã BOX đã được nhận diện,
          // nhưng chưa thể thêm trước khi thủ kho nhập số lượng. Trả true chỉ
          // để đóng sheet *Nhập mã thủ công*; không có nghĩa là đã tăng số mã.
          // Nhánh này đã mở sheet chọn loại/nhập số lượng ở luồng cha; không
          // phủ nó bằng popup kết quả chung.
          if (!feedback.requiresInput) {
            showScanResult('failure', message);
          }
          return feedback.requiresInput === true;
        }
        showScanResult(
          'success',
          feedback?.message ??
            'Quét thành công · Tổng ' + String(scannedCount + 1) + ' mã',
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Không kiểm tra được mã.';
        guard.current.reject(parseScanPayload(code).dedupeKey);
        showScanResult('failure', message);
        return false;
      } finally {
        setIsProcessing(false);
        // Không nhả callback ngay khi request kết thúc. Nhờ vậy một tem lỗi
        // hoặc QR nằm sát bên không lập tức thay thế thông báo đang hiển thị;
        // camera vẫn chạy, sẵn sàng nhận mã kế tiếp sau 520ms như Mini App.
        releaseScanInputAfterResult();
      }
    },
    [
      onScan,
      releaseScanInputAfterResult,
      scannedCount,
      scanPaused,
      showScanResult,
    ],
  );

  const handleReadCode = useCallback(
    (event: CameraReadEvent) => {
      const raw = event.nativeEvent.codeStringValue;
      const code = typeof raw === 'string' ? raw.trim() : '';
      if (code.length === 0 || processingRef.current || scanPaused) {
        return;
      }
      const parsed = parseScanPayload(code);
      if (
        !guard.current.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)
      ) {
        return;
      }
      submitAcceptedCode(code, 'CAMERA').then(() => undefined);
    },
    [scanPaused, submitAcceptedCode],
  );

  /**
   * Luồng ảnh đi qua cùng parser, guard và `onScan` với camera. Chỉ khác chỗ
   * lấy `code`; vì thế quét ảnh cũng tăng hàng/kiểm tra trùng đúng như quét cam.
   */
  const selectImageAndScan = useCallback(async () => {
    if (
      !supportsImageQrScan ||
      imagePickerOpen ||
      isDecodingImage ||
      processingRef.current ||
      scanPaused ||
      !tier.allowed
    ) {
      return;
    }

    setImagePickerOpen(true);
    let image: unknown;
    try {
      image = await pickQrImage();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không mở được bộ chọn ảnh.';
      showScanResult('failure', message);
      return;
    } finally {
      setImagePickerOpen(false);
    }

    if (image === undefined) return;

    setIsDecodingImage(true);
    try {
      const detected = await decodeQrImage(image);
      const code = detected.code.trim();
      if (code === '') {
        throw new Error('Không tìm thấy QR/Barcode trong ảnh.');
      }
      const parsed = parseScanPayload(code);
      if (
        !guard.current.accept(
          parsed.dedupeKey,
          undefined,
          parsed.dedupeScope,
        )
      ) {
        showScanResult(
          'failure',
          'Mã này đã được quét. Vui lòng quét sản phẩm khác.',
        );
        return;
      }
      await submitAcceptedCode(code, 'CAMERA');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Không tìm thấy QR/Barcode trong ảnh.';
      showScanResult('failure', message);
    } finally {
      setIsDecodingImage(false);
    }
  }, [
    imagePickerOpen,
    isDecodingImage,
    scanPaused,
    showScanResult,
    submitAcceptedCode,
    tier.allowed,
  ]);

  const handleError = useCallback(
    (event: { nativeEvent: { errorMessage: string } }) => {
      const message = event.nativeEvent.errorMessage;
      logger.error('Camera lỗi', { message });
      setCameraError(message);
    },
    [],
  );

  const submitManual = useCallback(() => {
    const code = manualCode.trim();
    if (code === '' || processingRef.current || scanPaused) {
      return;
    }
    const parsed = parseScanPayload(code);
    // Mã nhập tay đi qua **cùng** bộ chống trùng với mã quét — đúng như câu ghi
    // trong ảnh: *"Mã nhập tay cũng kiểm tra trùng và tồn tại trên WMS"*.
    if (guard.current.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)) {
      submitAcceptedCode(code, 'MANUAL').then(accepted => {
        if (accepted) {
          setManualCode('');
          setManualOpen(false);
        }
      });
    }
  }, [manualCode, scanPaused, submitAcceptedCode]);

  const badgeText = progressLabel ?? String(scannedCount) + ' MÃ';

  return (
    <View style={styles.root}>
      {cameraActive ? (
        <Camera
          style={styles.camera}
          cameraType={CameraType.Back}
          scanBarcode
          // `showFrame` TẮT có chủ đích: bật lên thì camera-kit chỉ nhận mã nằm
          // trong khung của **thư viện**, còn khung ở đây là do ta tự vẽ. Đây là
          // lỗi đã sửa ở Prompt 3 sau khi người dùng báo "quét rất lâu".
          showFrame={false}
          // Không dùng 0: adapter web từng hiểu 0 là one-shot và stop stream.
          // 140ms đủ nhạy khi rê mã liên tục; guard phía JS chặn callback dội.
          scanThrottleDelay={140}
          focusMode="on"
          torchMode={torchOn ? 'on' : 'off'}
          onReadCode={handleReadCode}
          onError={handleError}
          {...(allowedTypes.length > 0 ? { barcodeFrameSize: undefined } : {})}
        />
      ) : null}

      {/* --- Header --- */}
      <View
        style={[
          styles.header,
          {
            paddingTop: tokens.spacing.xxl,
            paddingHorizontal: tokens.spacing.lg,
            paddingBottom: tokens.spacing.md,
            gap: tokens.spacing.md,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={onBack}
          style={styles.backButton}
        >
          <AppIcon name="chevron-left" color="#ffffff" size={22} />
        </Pressable>

        <View style={styles.headerBody}>
          <Text variant="cardTitle" style={styles.headerTitle}>
            {title}
          </Text>
          <Text variant="caption" style={styles.headerSubtitle}>
            {documentName}
          </Text>
        </View>

        <View
          style={[
            styles.countBadge,
            { backgroundColor: tokens.colors.primary },
          ]}
        >
          <Text variant="caption" style={styles.countText}>
            {badgeText}
          </Text>
        </View>
      </View>

      {/* --- Khung ngắm --- */}
      <View style={styles.viewfinderArea}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {cameraActive ? (
          <View style={{ marginTop: tokens.spacing.xl }}>
            <Text variant="body" style={styles.hint}>
            {isProcessing ? 'Đã nhận diện mã' : 'Giữ thiết bị ổn định'}
            </Text>
            <Text variant="caption" style={styles.hintSub}>
              {isProcessing
                ? 'Đang kiểm tra để tránh quét trùng'
                : 'Đã quét ' + String(scannedCount) + ' sản phẩm'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* --- Thẻ xin quyền, đè giữa màn --- */}
      {cameraActive || isScanResultVisible || scanPaused || imagePickerOpen ? null : (
        <View
          style={[
            styles.permissionCard,
            {
              backgroundColor: tokens.colors.surface,
              padding: tokens.spacing.xl,
              gap: tokens.spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.permissionIcon,
              { backgroundColor: tokens.colors.primarySoft },
            ]}
          >
            <AppIcon name="camera" color={tokens.colors.primary} />
          </View>

          <Text
            variant="cardTitle"
            tone="strong"
            style={styles.permissionTitle}
          >
            {tier.allowed ? 'Sẵn sàng quét mã' : MESSAGE_WRONG_ENVIRONMENT}
          </Text>
          <Text variant="caption" tone="muted" style={styles.permissionBody}>
            {!tier.allowed
              ? wrongEnvironmentBody(tier)
              : permission.state === 'granted'
              ? 'Bấm bật camera để cấp quyền và bắt đầu quét.'
              : permissionMessage(permission.state)}
          </Text>

          {!tier.allowed ? (
            <Button
              label="Kiểm tra lại môi trường"
              variant="secondary"
              onPress={tier.recheck}
            />
          ) : canRequestAgain(permission.state) ? (
            <Button
              label="Bật camera để quét"
              onPress={() => {
                permission.request().catch(() => undefined);
              }}
            />
          ) : null}

          {/* Sai môi trường thì KHÔNG mở lối nhập tay: mã gõ tay cũng đi cùng
              một đường lên máy chủ, nên nó không cứu được gì mà chỉ khiến thủ
              kho nhập cả lô rồi mới biết hỏng. */}
          {tier.allowed && !scanPaused ? (
            <>
              {supportsImageQrScan ? (
                <Button
                  label="Chọn ảnh để quét QR"
                  variant="secondary"
                  onPress={() => {
                    selectImageAndScan().catch(() => undefined);
                  }}
                  disabled={imagePickerOpen || isDecodingImage || isProcessing}
                />
              ) : null}
              <Text
                variant="caption"
                accessibilityRole="button"
                onPress={() => setManualOpen(true)}
                style={[styles.manualLink, { color: tokens.colors.primary }]}
              >
                Nhập mã thủ công
              </Text>
            </>
          ) : null}
        </View>
      )}

      {/* --- Nút nổi: đèn pin và chọn ảnh --- */}
      {cameraActive ? (
        <View style={[styles.floatingColumn, { gap: tokens.spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torchOn ? 'Tắt đèn pin' : 'Bật đèn pin'}
            accessibilityState={{ selected: torchOn }}
            onPress={() => setTorchOn(current => !current)}
            style={styles.floatingButton}
          >
            <AppIcon name="flash" color="#ffffff" />
          </Pressable>

          {supportsImageQrScan ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chọn ảnh để quét QR"
              disabled={imagePickerOpen || isDecodingImage || isProcessing}
              onPress={() => {
                selectImageAndScan().catch(() => undefined);
              }}
              style={[
                styles.floatingButton,
                imagePickerOpen || isDecodingImage || isProcessing
                  ? { opacity: 0.45 }
                  : undefined,
              ]}
            >
              <AppIcon name="image" color="#ffffff" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {cameraError === undefined ? null : (
        <View
          style={[
            styles.errorBar,
            {
              marginHorizontal: tokens.spacing.lg,
              marginBottom: tokens.spacing.md,
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.dangerSoft,
            },
          ]}
        >
          <Text variant="caption" style={{ color: tokens.colors.dangerText }}>
            {cameraError}
          </Text>
        </View>
      )}

      {isScanResultVisible ? (
        <View
          pointerEvents="none"
          style={[
            styles.scanResultLayer,
          ]}
        >
          <View
            style={[
              styles.scanResultCard,
              {
                backgroundColor: tokens.colors.surface,
                padding: tokens.spacing.md,
                gap: tokens.spacing.md,
              },
            ]}
          >
            {isProcessing || isDecodingImage ? (
              <View
                style={[
                  styles.scanResultIcon,
                  { backgroundColor: tokens.colors.primarySoft },
                ]}
              >
                <AppIcon name="scan" color={tokens.colors.primary} size={22} />
              </View>
            ) : (
              <View
                style={[
                  styles.scanResultIcon,
                  {
                    backgroundColor:
                      scanResult?.tone === 'success'
                        ? tokens.colors.successSoft
                        : tokens.colors.dangerSoft,
                  },
                ]}
              >
                <AppIcon
                  name={
                    scanResult?.tone === 'success' ? 'check-circle' : 'alert'
                  }
                  color={
                    scanResult?.tone === 'success'
                      ? tokens.colors.success
                      : tokens.colors.danger
                  }
                  size={24}
                />
              </View>
            )}
            <View style={styles.scanResultCopy}>
              <Text
                variant="body"
                tone="strong"
                style={styles.scanResultTitle}
              >
                {isDecodingImage
                  ? 'Đang đọc mã từ ảnh…'
                  : isProcessing
                  ? 'Đang kiểm tra mã…'
                  : scanResult?.tone === 'success'
                  ? 'Quét thành công'
                  : 'Không thể thêm mã'}
              </Text>
              <Text variant="caption" tone="muted">
                {isDecodingImage
                  ? 'Ảnh được đọc ngay trên thiết bị, không tải lên máy chủ.'
                  : isProcessing
                  ? 'Camera vẫn sẵn sàng cho mã tiếp theo.'
                  : scanResult?.message}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* --- Thanh hành động dưới --- */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: tokens.colors.surface,
            padding: tokens.spacing.lg,
            gap: tokens.spacing.md,
          },
        ]}
      >
        <View style={styles.bottomBody}>
          <Text variant="body" tone="strong">
            {sessionLabel}
          </Text>
          <Text variant="caption" tone="muted">
            {documentName + ' · đã quét ' + String(scannedCount) + ' mã'}
          </Text>
        </View>

        <View style={[styles.bottomActions, { gap: tokens.spacing.sm }]}>
          <Button
            label="Nhập tay"
            variant="secondary"
            onPress={() => setManualOpen(true)}
            disabled={scanPaused}
          />
          <Button
            label={doneLabel}
            onPress={onDone}
            // Mờ khi chưa quét mã nào — đúng ảnh người dùng gửi.
            disabled={
              scannedCount === 0 ||
              isProcessing ||
              isDecodingImage ||
              scanPaused
            }
          />
        </View>
      </View>

      {/* --- Hộp nhập mã thủ công --- */}
      <Sheet
        visible={manualOpen}
        onDismiss={() => setManualOpen(false)}
        title="Nhập mã thủ công"
        message="Mã nhập tay cũng kiểm tra trùng và tồn tại trên WMS"
      >
        <CodeInput
          label="Mã sản phẩm / mã tem"
          placeholder="Nhập QR, barcode hoặc serial"
          value={manualCode}
          onChangeText={setManualCode}
          returnKeyType="done"
          onSubmitEditing={submitManual}
        />
        <Button
          label="Kiểm tra mã"
          onPress={submitManual}
          loading={isProcessing}
          disabled={manualCode.trim() === '' || isProcessing}
        />
        <Button
          label="Huỷ"
          variant="secondary"
          onPress={() => setManualOpen(false)}
        />
      </Sheet>
    </View>
  );
}
