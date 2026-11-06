import {UI_KIT_COLORS} from '../../theme/uiKitV3';
import {HN_UI} from '../../theme/uiKitV3';
import {P04ScanFooter} from '../inbound/P04ScanFooter';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
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
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';

import { Text } from '../../ui/Text';
import { AppIcon } from '../../ui/AppIcon';
import { CodeInput } from '../../ui/CodeInput';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Dialog } from '../../ui/Dialog';
import { P04Action, P04Info, p04 as p04Styles } from '../inbound/P04Frame';
import { P04Icon } from '../inbound/P04Icon';
import {P04_ASSET,p04Asset} from '../inbound/P04AssetTheme';
import { P04ScanPresentation } from '../inbound/P04ScanPresentation';
import type { P04ViewState } from '../inbound/p04View';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Banner } from '../../ui/Banner';
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
import { useP15ScannerDeviceGuide } from '../system/P15ScannerDeviceGuide';
import { parseScanPayload, type ScanSource } from '../../scanner/scanPayload';
import { useIsScreenFocused } from '../../navigation/useIsScreenFocused';
import {
  decodeQrImage,
  pickQrImage,
  supportsImageQrScan,
} from './imageQrScanner';
import { useDeploymentTier } from '../../services/wms/useDeploymentTier';
import { ScanBeam } from './ScanBeam';
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
    backgroundColor: HN_UI.shell,
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
    backgroundColor: UI_KIT_COLORS['nav.hover'],
  },
  headerTitle: {
    color: HN_UI.onBrand,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: UI_KIT_COLORS['nav.muted'],
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countText: {
    color: HN_UI.onBrand,
    fontWeight: '700',
  },
  countBadgePrimary: { backgroundColor: tokens.colors.primary },
  countBadgeStep: { backgroundColor: 'transparent' },
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
    borderColor: HN_UI.surface,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  hint: {
    color: HN_UI.onBrand,
    textAlign: 'center',
    fontWeight: '600',
  },
  hintSub: {
    color: UI_KIT_COLORS['nav.muted'],
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
    backgroundColor: UI_KIT_COLORS['nav.hover'],
  },
  floatingButtonDisabled: {
    opacity: 0.45,
  },
  floatingGlyph: {
    fontSize: 20,
    color: HN_UI.onBrand,
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
  boardCameraFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
  },
  boardCamera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  boardFrame: {
    position: 'absolute',
    top: '17%',
    left: '18%',
    right: '18%',
    bottom: '17%',
  },
  boardFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardTools: { flexDirection: 'row' },
  boardTool: { flex: 1 },
  boardStats: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  boardStat: { flex: 1 },
  boardStatDivider: { borderLeftWidth: 1 },
  boardHeaderStep: { color: HN_UI.onBrand, fontWeight: '600' },
  p04Tool: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 8,
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
  },
  p04ToolLabel: {
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  p04ToolLabelWhite: {
    color: HN_UI.onBrand,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  p04Manual: {
    padding: 10,
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    gap: 8,
  },
  p04ManualHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  p04ManualTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  p04Collapse: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  p04CodeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  p04CodeField: { flex: 1, minWidth: 0 },
  p04CheckCode: {
    minHeight: 52,
    width: 112,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: HN_UI.primary,
  },
  p04CodeError: { color: HN_UI.danger },
  p04FooterActions: { flexDirection: 'row', gap: 8 },
  p04Half: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
});

export interface BusinessScanScreenProps {
  /** Locked P04 presentation; omitted by all other scanner owners. */
  p04Context?: {
    documentRef?: string;
    typeLabel?: string;
    warehouseName?: string;
    supplierName?: string;
    processing?: boolean;
    ownerNotice?: boolean;
    viewState?: P04ViewState;
    onViewChange?: (patch: P04ViewState) => void;
    codes: readonly {
      raw: string;
      sku?: string;
      quantity: number;
      at: number;
    }[];
    attempts: readonly {
      raw: string;
      at: number;
      kind: 'valid' | 'duplicate' | 'invalid';
      reason?: string;
      timeLabel?: string;
    }[];
  };
  p05Context?: BusinessScanScreenProps['p04Context'] & {
    planned: number;
    documentNumber?: string | null;
    snapshotSaved?: boolean;
    notices?: React.ReactNode;
  };
  /** Tiêu đề, ví dụ *"Quét hàng nhập"* / *"Quét hàng xuất"*. */
  title: string;
  /** Phụ đề — bộ ảnh dùng **tên phiếu**. */
  documentName: string;
  /** Nhãn bước của riêng luồng 3 màn (ví dụ “Bước 2/3”). */
  stepLabel?: string;
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
  /** Bố cục card camera theo board Nhập/Xuất kho. */
  layout?: 'immersive' | 'board';
  /** Optional caller route with its own NFC permission/context guard. */
  onOpenNfcDeviceGuide?: (isCurrent: () => boolean) => void | Promise<void>;
}

/** Kết quả ngắn gọn để luồng nghiệp vụ báo lại ngay tại màn camera. */
export interface ScanFeedback {
  /** `false` giữ mã ngoài danh sách, ví dụ WMS không resolve được SKU. */
  readonly accepted?: boolean;
  /** Valid local code retained while its SAVE is not yet confirmed. */
  readonly retained?: boolean;
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
// Mini App giữ khoá callback 520ms sau một kết quả. Không giữ nhịp này, stream
// đang nhìn một cụm tem sẽ nhận ngay QR nằm kế bên vừa khi request trước xong,
// làm card kết quả đổi liên tục dù camera không hề lỗi. Web App giữ stream mở
// (không stop/start camera), chỉ chặn *đầu vào* trong đúng nhịp đã kiểm chứng.
const POST_SCAN_SETTLE_MS = 520;

export function BusinessScanScreen({
  p04Context: inboundContext,
  p05Context,
  title,
  documentName,
  stepLabel,
  sessionLabel,
  scannedCount,
  progressLabel,
  scanPaused = false,
  onScan,
  onBack,
  onDone,
  doneLabel = 'Kiểm tra phiếu',
  layout = 'immersive',
  onOpenNfcDeviceGuide,
}: BusinessScanScreenProps): React.ReactElement {
  const p04Context = inboundContext ?? p05Context;
  const permission = useCameraPermission();
  const [p04CameraEnabled, setP04CameraEnabled] = useState(false);
  const [p04Filter, setP04Filter] = useState<
    'all' | 'valid' | 'duplicate' | 'invalid'
  >(p04Context?.viewState?.filter ?? 'all');
  const [p04All, setP04All] = useState(p04Context?.viewState?.all ?? false);
  const [p04ContextOpen, setP04ContextOpen] = useState(false);
  // Không dùng `useIsFocused()` của react-navigation: nó ném lỗi khi màn được
  // render ngoài navigator. Xem `navigation/useIsScreenFocused.ts`.
  const isFocused = useIsScreenFocused();

  const [appActive, setAppActive] = useState(
    () => AppState.currentState === 'active',
  );
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | undefined>();
  const [manualOpen, setManualOpen] = useState(
    p04Context?.viewState?.manual ?? false,
  );
  const [manualCode, setManualCode] = useState(
    p04Context?.viewState?.rawInput ?? '',
  );
  const viewChangeRef = useRef(p04Context?.onViewChange);
  viewChangeRef.current = p04Context?.onViewChange;
  useEffect(() => {
    viewChangeRef.current?.({
      filter: p04Filter,
      all: p04All,
      manual: manualOpen,
      rawInput: manualCode,
    });
  }, [p04Filter, p04All, manualOpen, manualCode]);
  const manualValueRef = useRef(manualCode);
  manualValueRef.current = manualCode;
  const retainedManualRef = useRef<string | undefined>(undefined);
  const rejectedCameraRaw = useRef<string | undefined>(undefined);
  // Toast kết quả nằm sau Sheet nhập tay. Giữ lỗi riêng trong Sheet để thủ kho
  // thấy ngay kết luận WMS, thay vì tưởng app không phản hồi.
  const [manualError, setManualError] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  useEffect(() => {
    const raw = retainedManualRef.current;
    if (
      p05Context?.snapshotSaved &&
      raw &&
      manualCode.trim() === raw.trim() &&
      p05Context.codes.some(c => c.raw === raw.trim())
    ) {
      retainedManualRef.current = undefined;
      setManualCode('');
      setManualError(undefined);
    }
  }, [p05Context, manualCode]);
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
  const imageWorkRef = useRef(false);
  const deviceGuide = useP15ScannerDeviceGuide({
    permission,
    // Owner actions entered manually remain valid while this mounted screen is
    // foregrounded, even when no navigator supplies a focus context. Camera
    // decoding is still separately gated by `isFocused` in `cameraCanRun`.
    active: appActive,
    busy: () => processingRef.current || isProcessing || imageWorkRef.current ||
      imagePickerOpen || isDecodingImage || scanPaused ||
      p04Context?.processing === true || p04Context?.ownerNotice === true ||
      p04ContextOpen || (!p04Context && manualOpen) ||
      (!!p04Context && !!scanResult && !manualOpen),
    onOpenNfc: onOpenNfcDeviceGuide,
  });
  const scannerReadEpoch = deviceGuide.epoch;
  const deviceGuideHelp = ['denied', 'blocked', 'unavailable'].includes(permission.state) || cameraError
    ? <Button label="Hướng dẫn Camera và NFC" variant="secondary"
        disabled={isProcessing || scanPaused || p04Context?.processing === true ||
          p04Context?.ownerNotice === true || imagePickerOpen || isDecodingImage}
        onPress={deviceGuide.open} />
    : null;
  const deviceGuideModal = deviceGuide.visible ? <Modal testID="p15-scanner-device-guide"
    visible animationType="none" presentationStyle="fullScreen"
    onRequestClose={deviceGuide.close}>{deviceGuide.screen}</Modal> : null;

  const cameraCanRun =
    isCameraUsable(permission.state) &&
    isFocused &&
    appActive &&
    tier.allowed &&
    !cameraError &&
    !scanPaused &&
    (!p04Context || (p04CameraEnabled && !manualOpen));

  /**
   * Thông báo và request không được tắt Camera. Tháo component Camera sau mỗi
   * mã khiến trình duyệt phải xin/open MediaStream lại, tạo đúng hiện tượng
   * preview đen/chớp và "đang tải" mà thủ kho vừa phản ánh.
   */
  // Mini App dừng stream đúng lúc bộ chọn ảnh mở để camera không giữ phần cứng
  // sau hộp chọn tệp. Xong việc, render lại Camera và tiếp tục phiên quét.
  const cameraActive = cameraCanRun && !deviceGuide.cameraSuspended && !imagePickerOpen && !isDecodingImage;

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
    if (scanResult === undefined || scanResult.tone === 'failure') {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setScanResult(undefined);
    }, SUCCESS_NOTICE_DURATION_MS);
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
    async (code: string, source: ScanSource, fromImage = false): Promise<boolean> => {
      const ownerCurrent = () =>
        source === 'MANUAL'
          ? deviceGuide.isOwnerCurrent(scannerReadEpoch)
          : deviceGuide.canRunOwner(scannerReadEpoch);
      if (
        processingRef.current ||
        !ownerCurrent() ||
        (source !== 'MANUAL' && !fromImage && !deviceGuide.canUseCamera(scannerReadEpoch)) ||
        scanPaused ||
        (source !== 'MANUAL' && scanResult?.tone === 'failure')
      ) {
        return false;
      }
      processingRef.current = true;
      setIsProcessing(true);
      setTorchOn(false);
      try {
        const feedback = await onScan(code, source);
        if (!ownerCurrent()) return false;
        if (source === 'MANUAL') {
          setManualError(undefined);
        }
        if (feedback?.accepted === false) {
          const message =
            feedback.message ??
            'Mã này đã được quét. Vui lòng quét sản phẩm khác.';
          // Với lỗi WMS, khoá riêng tem này tới hết phiên quét. Nếu chỉ chờ
          // vài giây rồi nhả, camera vẫn đang nhìn cùng tem sẽ gửi nó lại và
          // thay phiên card “đang kiểm tra”/“lỗi” liên tục. Mã khác không bị
          // ảnh hưởng, nên đưa tem kế tiếp vào là quét được ngay.
          if (!feedback.requiresInput && source !== 'MANUAL') {
            guard.current.reject(parseScanPayload(code).dedupeKey);
          }
          // `requiresInput` là nhánh có chủ đích: mã BOX đã được nhận diện,
          // nhưng chưa thể thêm trước khi thủ kho nhập số lượng. Trả true chỉ
          // để đóng sheet *Nhập mã thủ công*; không có nghĩa là đã tăng số mã.
          // Nhánh này đã mở sheet chọn loại/nhập số lượng ở luồng cha; không
          // phủ nó bằng popup kết quả chung.
          if (!feedback.requiresInput) {
            if (source !== 'MANUAL') rejectedCameraRaw.current = code;
            showScanResult('failure', message);
          }
          if (source === 'MANUAL' && feedback.retained)
            retainedManualRef.current = code;
          if (source === 'MANUAL' && !feedback.requiresInput) {
            setManualError(message);
          }
          if (feedback.requiresInput && p04Context) setManualOpen(false);
          return feedback.requiresInput === true;
        }
        showScanResult(
          'success',
          feedback?.message ??
            'Quét thành công · Tổng ' + String(scannedCount + 1) + ' mã',
        );
        return true;
      } catch (error) {
        if (!ownerCurrent()) return false;
        const message =
          error instanceof Error ? error.message : 'Không kiểm tra được mã.';
        if (source !== 'MANUAL')
          guard.current.reject(parseScanPayload(code).dedupeKey);
        if (source !== 'MANUAL') rejectedCameraRaw.current = code;
        showScanResult('failure', message);
        if (source === 'MANUAL') {
          setManualError(message);
        }
        return false;
      } finally {
        if (!deviceGuide.isOwnerCurrent(scannerReadEpoch)) {
          processingRef.current = false;
        } else {
          setIsProcessing(false);
        // Không nhả callback ngay khi request kết thúc. Nhờ vậy một tem lỗi
        // hoặc QR nằm sát bên không lập tức thay thế thông báo đang hiển thị;
        // camera vẫn chạy, sẵn sàng nhận mã kế tiếp sau 520ms như Mini App.
          if (source === 'MANUAL') processingRef.current = false;
          else releaseScanInputAfterResult();
        }
      }
    },
    [
      onScan,
      deviceGuide,
      scannerReadEpoch,
      releaseScanInputAfterResult,
      scannedCount,
      scanPaused,
      scanResult,
      showScanResult,
      p04Context,
    ],
  );

  const handleReadCode = useCallback(
    (event: CameraReadEvent) => {
      const raw = event.nativeEvent.codeStringValue;
      const code =
        typeof raw === 'string' ? (p04Context ? raw : raw.trim()) : '';
      if (!deviceGuide.canUseCamera(scannerReadEpoch) || code.trim().length === 0 || processingRef.current || scanPaused) {
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
    [p04Context, scanPaused, submitAcceptedCode, deviceGuide, scannerReadEpoch],
  );

  /**
   * Luồng ảnh đi qua cùng parser, guard và `onScan` với camera. Chỉ khác chỗ
   * lấy `code`; vì thế quét ảnh cũng tăng hàng/kiểm tra trùng đúng như quét cam.
   */
  const selectImageAndScan = useCallback(async () => {
    if (
      !supportsImageQrScan ||
      !deviceGuide.canRunOwner(scannerReadEpoch) ||
      imageWorkRef.current ||
      imagePickerOpen ||
      isDecodingImage ||
      processingRef.current ||
      scanPaused ||
      !tier.allowed
    ) {
      return;
    }

    imageWorkRef.current = true;
    setImagePickerOpen(true);
    let image: unknown;
    try {
      image = await pickQrImage();
      if (!deviceGuide.canRunOwner(scannerReadEpoch)) { imageWorkRef.current = false; return; }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không mở được bộ chọn ảnh.';
      imageWorkRef.current = false;
      if (!deviceGuide.canRunOwner(scannerReadEpoch)) return;
      showScanResult('failure', message);
      return;
    } finally {
      if (deviceGuide.isOwnerCurrent(scannerReadEpoch)) setImagePickerOpen(false);
    }

    if (image === undefined) { imageWorkRef.current = false; return; }

    setIsDecodingImage(true);
    try {
      const detected = await decodeQrImage(image);
      if (!deviceGuide.canRunOwner(scannerReadEpoch)) return;
      const code = detected.code.trim();
      if (code === '') {
        throw new Error('Không tìm thấy QR/Barcode trong ảnh.');
      }
      const parsed = parseScanPayload(code);
      if (
        !guard.current.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)
      ) {
        showScanResult(
          'failure',
          'Mã này đã được quét. Vui lòng quét sản phẩm khác.',
        );
        return;
      }
      await submitAcceptedCode(code, 'CAMERA', true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Không tìm thấy QR/Barcode trong ảnh.';
      if (deviceGuide.canRunOwner(scannerReadEpoch)) showScanResult('failure', message);
    } finally {
      imageWorkRef.current = false;
      if (deviceGuide.isOwnerCurrent(scannerReadEpoch)) setIsDecodingImage(false);
    }
  }, [
    deviceGuide,
    scannerReadEpoch,
    imagePickerOpen,
    isDecodingImage,
    scanPaused,
    showScanResult,
    submitAcceptedCode,
    tier.allowed,
  ]);

  const handleError = useCallback(
    (event: { nativeEvent: { errorMessage: string } }) => {
      if (!deviceGuide.canDecode(scannerReadEpoch)) return;
      const message = event.nativeEvent.errorMessage;
      logger.error('Camera lỗi', { message });
      setCameraError(message);
    },
    [deviceGuide, scannerReadEpoch],
  );

  const openManual = useCallback(() => {
    if (isProcessing || scanPaused) return;
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
      processingRef.current = false;
    }
    setTorchOn(false);
    setScanResult(undefined);
    if (rejectedCameraRaw.current !== undefined) {
      setManualCode(rejectedCameraRaw.current);
      rejectedCameraRaw.current = undefined;
    }
    setManualError(undefined);
    setManualOpen(true);
  }, [isProcessing, scanPaused]);
  const resumeP05Camera = () => {
    if (isProcessing || scanPaused || p04Context?.processing===true || !tier.allowed || !deviceGuide.resume()) return;
    setManualOpen(false);
    setManualError(undefined);
    setScanResult(undefined);
    setTorchOn(false);
    setCameraError(undefined);
    setP04CameraEnabled(true);
    if (canRequestAgain(permission.state))
      permission.request().catch(() => undefined);
  };

  const submitManual = useCallback(() => {
    if (!tier.allowed) {
      setManualError(wrongEnvironmentBody(tier));
      return;
    }
    const code = p04Context ? manualCode : manualCode.trim();
    if (p05Context && code.length > 512) {
      setManualError('Mã không được vượt quá 512 ký tự.');
      return;
    }
    if (!deviceGuide.isOwnerCurrent(scannerReadEpoch) || code.trim() === '' || processingRef.current || scanPaused) {
      return;
    }
    // Manual attempts always reach the owner. A resolver rejection must remain
    // retryable; the camera dedupe guard cannot silently suppress typed input.
    const submittedValue = manualCode;
    submitAcceptedCode(code, 'MANUAL').then(accepted => {
      if (accepted && manualValueRef.current === submittedValue) {
        setManualCode('');
        if (!p04Context) setManualOpen(false);
      }
    });
  }, [
    p04Context,
    p05Context,
    deviceGuide,
    scannerReadEpoch,
    manualCode,
    scanPaused,
    submitAcceptedCode,
    tier,
  ]);

  const badgeText = progressLabel ?? String(scannedCount) + ' MÃ';

  if (layout === 'board' && p04Context) {
    const busy = isProcessing || p04Context.processing === true || scanPaused;
    return (
      <P04ScanPresentation
        operation={p05Context ? 'outbound' : 'inbound'}
        planned={p05Context?.planned}
        documentRef={p04Context.documentRef}
        typeLabel={p04Context.typeLabel}
        supplierName={p04Context.supplierName}
        attempts={p04Context.attempts}
        codeCount={p04Context.codes.length}
        quantity={p04Context.codes.reduce(
          (sum, code) => sum + code.quantity,
          0,
        )}
        manual={manualOpen}
        filter={p04Filter}
        all={p04All}
        busy={busy}
        showContext={!p05Context}
        viewState={p04Context.viewState}
        onViewChange={p04Context.onViewChange}
        onBack={onBack}
        onFilter={kind => {
          setP04Filter(kind);
          setP04All(false);
        }}
        onAll={() => setP04All(value => !value)}
        onContext={() => setP04ContextOpen(true)}
        cameraLabel={cameraActive ? undefined : 'Camera chưa bật'}
        camera={
          cameraActive ? (
            <Camera
              style={styles.boardCamera}
              cameraType={CameraType.Back}
              scanBarcode
              showFrame={false}
              scanThrottleDelay={140}
              focusMode="on"
              torchMode={torchOn ? 'on' : 'off'}
              onReadCode={handleReadCode}
              onError={handleError}
            />
          ) : undefined
        }
        tools={<>
          <View style={[styles.boardTools, { gap: 12 }]}>
            <Button
              label={
                cameraActive ? (torchOn ? 'Tắt đèn' : 'Bật đèn') : 'Bật camera'
              }
              leading={<P04Icon name="torch" assetPack color={P04_ASSET.primary} size={20} />}
              variant="secondary"
              style={[styles.p04Tool,p04Asset.tool]}
              labelStyle={[styles.p04ToolLabel,p04Asset.toolLabel]}
              disabled={!tier.allowed || busy}
              onPress={() => {
                if (cameraActive) setTorchOn(value => !value);
                else {
                  if (!deviceGuide.resume()) return;
                  setManualOpen(false);
                  setCameraError(undefined);
                  setTorchOn(false);
                  setP04CameraEnabled(true);
                  if (canRequestAgain(permission.state))
                    permission.request().catch(() => undefined);
                }
              }}
            />
            <Button
              label="Nhập tay"
              leading={<P04Icon name="keyboard" assetPack color={P04_ASSET.primary} size={20} />}
              variant="secondary"
              style={[styles.p04Tool,p04Asset.tool]}
              labelStyle={[styles.p04ToolLabel,p04Asset.toolLabel]}
              disabled={busy}
              onPress={openManual}
            />
          </View>
        </>}
        manualForm={
          <View style={styles.p04Manual}>
            <View style={styles.p04ManualHeading}>
              <View style={styles.p04ManualTitle}>
                <P04Icon name="keyboard" size={20} />
                <Text
                  style={[
                    p04Styles.rowValue,
                    !p05Context && {
                      fontSize: 15,
                      fontFamily: SCANNER_ARIAL_FAMILY,
                    },
                  ]}
                >
                  Nhập mã sản phẩm
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thu gọn nhập tay"
                disabled={busy}
                onPress={() => setManualOpen(false)}
                style={styles.p04Collapse}
              >
                <Text style={p04Styles.small}>Thu gọn</Text>
              </Pressable>
            </View>
            <View style={styles.p04CodeRow}>
              <CodeInput
                label="Mã QR/Serial/SKU"
                accessibilityLabel="Mã QR/Serial/SKU"
                fieldHeight={!p05Context ? 52 : undefined}
                labelStyle={
                  !p05Context
                    ? {
                        fontFamily: SCANNER_ARIAL_FAMILY,
                        fontSize: 13,
                        lineHeight: 18,
                      }
                    : undefined
                }
                inputStyle={
                  !p05Context
                    ? {
                        fontFamily: SCANNER_ARIAL_FAMILY,
                        fontSize: 16,
                        lineHeight: 24,
                      }
                    : undefined
                }
                preserveCase={!!p05Context}
                placeholder={
                  p05Context ? 'Nhập mã trên sản phẩm' : 'Ví dụ: HN12345'
                }
                containerStyle={styles.p04CodeField}
                value={manualCode}
                editable={!busy}
                onChangeText={value => {
                  manualValueRef.current = value;
                  retainedManualRef.current = undefined;
                  setManualCode(value);
                  setManualError(undefined);
                }}
                returnKeyType="done"
                submitBehavior={p05Context ? 'submit' : undefined}
                blurOnSubmit={p05Context ? false : undefined}
                onSubmitEditing={submitManual}
              />
              <Button
                label="Kiểm tra mã"
                onPress={submitManual}
                style={[styles.p04CheckCode, !p05Context && { width: 126,backgroundColor:P04_ASSET.primary,backgroundImage:'none' }]}
                labelStyle={styles.p04ToolLabelWhite}
                disabled={!manualCode.trim() || busy}
                loading={isProcessing}
              />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                p04Styles.small,
                !p05Context && {
                  minHeight: 40,
                  fontFamily: SCANNER_ARIAL_FAMILY,
                },
                manualError && styles.p04CodeError,
              ]}
            >
              {manualError ?? 'Nhập từng mã, rồi nhấn Enter hoặc Kiểm tra mã.'}
            </Text>
          </View>
        }
        footer={
          <P04ScanFooter operation={p05Context?'outbound':'inbound'} busy={busy} canReview={scannedCount>0} onReview={onDone} onContinue={resumeP05Camera}/>
        }
        notices={
          <>
            {deviceGuideModal}
            {deviceGuideHelp}
            {p05Context?.notices}
            {!tier.allowed && (
              <P04Info title={MESSAGE_WRONG_ENVIRONMENT}>
                {wrongEnvironmentBody(tier)}
              </P04Info>
            )}
            {!!cameraError && (
              <P04Info title="Camera gặp lỗi">{cameraError}</P04Info>
            )}
            <Dialog
              visible={p04ContextOpen && !deviceGuide.visible}
              title={p05Context ? 'Phiếu đang xuất' : 'Phiếu đang nhập'}
              message={`Mã phiếu: ${
                p05Context
                  ? p05Context.documentNumber || 'Chưa được cấp'
                  : p04Context.documentRef ?? 'Chưa xác minh'
              }\nTên phiếu: ${documentName}\n${
                p05Context ? 'Loại phiếu' : 'Loại nhập'
              }: ${p04Context.typeLabel ?? 'Chưa xác minh'}\nKho: ${
                p04Context.warehouseName ?? 'Chưa xác minh'
              }\n${p05Context ? 'Người nhận' : 'Nhà cung cấp'}: ${
                p04Context.supplierName ?? 'Không chọn'
              }\n${p04Context.codes.length} mã hợp lệ`}
              onDismiss={() => setP04ContextOpen(false)}
            >
              <P04Action
                label="Đóng"
                onPress={() => setP04ContextOpen(false)}
              />
            </Dialog>
            <Dialog
              visible={
                scanResult !== undefined &&
                !deviceGuide.visible &&
                !manualOpen &&
                !scanPaused &&
                !p04Context.ownerNotice
              }
              title={
                scanResult?.tone === 'success'
                  ? 'Đã thêm mã'
                  : 'Không thể thêm mã'
              }
              message={scanResult?.message}
              dismissOnBackdrop={false}
              onDismiss={() => setScanResult(undefined)}
            >
              <P04Action
                label="Đã hiểu"
                onPress={() => setScanResult(undefined)}
              />
            </Dialog>
          </>
        }
      />
    );
  }
  if (layout === 'board') {
    return (
      <Page
        title={title}
        onBack={onBack}
        scroll
        headerVariant="brand"
        headerRight={
          <Text variant="caption" style={styles.boardHeaderStep}>
            {stepLabel ?? 'Bước 2/3'}
          </Text>
        }
      >
        <Box card padding="lg" gap="md">
          <View style={[styles.header, { gap: tokens.spacing.md }]}>
            <View
              style={[
                styles.permissionIcon,
                { backgroundColor: tokens.colors.primarySoft },
              ]}
            >
              <AppIcon name="scan" color={tokens.colors.primary} size={24} />
            </View>
            <View style={styles.headerBody}>
              <Text variant="cardTitle" tone="strong">
                {title === 'Nhập kho'
                  ? 'Quét hàng nhập vào'
                  : 'Quét hàng xuất kho'}
              </Text>
              <Text variant="caption" tone="muted">
                Hướng camera vào mã QR/Serial/SKU
              </Text>
            </View>
          </View>

          <View style={styles.boardCameraFrame}>
            {cameraActive ? (
              <Camera
                style={styles.boardCamera}
                cameraType={CameraType.Back}
                scanBarcode
                showFrame={false}
                scanThrottleDelay={140}
                focusMode="on"
                torchMode={torchOn ? 'on' : 'off'}
                onReadCode={handleReadCode}
                onError={handleError}
                {...(allowedTypes.length > 0
                  ? { barcodeFrameSize: undefined }
                  : {})}
              />
            ) : (
              <View style={styles.boardFallback}>
                <AppIcon name="camera" color={HN_UI.onBrand} size={34} />
              </View>
            )}
            <View style={styles.boardFrame}>
              <ScanBeam active={cameraActive} paused={scanPaused} />
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>

          {cameraActive ? null : (
            <Banner
              tone="info"
              title={
                tier.allowed ? 'Sẵn sàng quét mã' : MESSAGE_WRONG_ENVIRONMENT
              }
              message={
                !tier.allowed
                  ? wrongEnvironmentBody(tier)
                  : permission.state === 'granted'
                  ? 'Bấm bật camera để quét mã.'
                  : permissionMessage(permission.state)
              }
            />
          )}

          <View style={[styles.boardTools, { gap: tokens.spacing.md }]}>
            {cameraActive ? (
              <Button
                label={torchOn ? 'Tắt đèn' : 'Bật đèn'}
                variant="secondary"
                style={styles.boardTool}
                onPress={() => setTorchOn(current => !current)}
              />
            ) : (canRequestAgain(permission.state) || (deviceGuide.cameraSuspended && isCameraUsable(permission.state))) && tier.allowed ? (
              <Button
                label="Bật camera"
                style={styles.boardTool}
                onPress={() => {
                  if (!deviceGuide.resume()) return;
                  if (canRequestAgain(permission.state)) permission.request().catch(() => undefined);
                }}
              />
            ) : (
              <Button
                label="Kiểm tra môi trường"
                variant="secondary"
                style={styles.boardTool}
                onPress={tier.recheck}
              />
            )}
            <Button
              label="Nhập tay"
              variant="secondary"
              style={styles.boardTool}
              disabled={scanPaused}
              onPress={openManual}
            />
          </View>
          {deviceGuideHelp}

          <View
            style={[
              styles.boardStats,
              {
                borderColor: tokens.colors.divider,
                backgroundColor: tokens.colors.surface,
              },
            ]}
          >
            <View
              style={[
                styles.boardStat,
                { padding: tokens.spacing.md, gap: tokens.spacing.xs },
              ]}
            >
              <Text variant="caption" tone="muted">
                Tổng đã quét
              </Text>
              <Text variant="metric" tone="strong">
                {String(scannedCount)}
              </Text>
              <Text variant="caption" tone="muted">
                lượt quét
              </Text>
            </View>
            <View
              style={[
                styles.boardStat,
                styles.boardStatDivider,
                {
                  padding: tokens.spacing.md,
                  gap: tokens.spacing.xs,
                  borderLeftColor: tokens.colors.divider,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                Mã hợp lệ
              </Text>
              <Text variant="metric" style={{ color: tokens.colors.success }}>
                {String(scannedCount)}
              </Text>
              <Text variant="caption" tone="muted">
                đã xác minh
              </Text>
            </View>
          </View>
        </Box>

        {cameraError === undefined ? null : (
          <Banner tone="danger" title="Camera gặp lỗi" message={cameraError} />
        )}
        {isScanResultVisible && scanResult !== undefined ? (
          <Banner
            tone={scanResult.tone === 'success' ? 'success' : 'danger'}
            title={
              scanResult.tone === 'success'
                ? 'Quét thành công'
                : 'Không thể thêm mã'
            }
            message={scanResult.message}
          />
        ) : null}

        <Button
          label={doneLabel}
          onPress={onDone}
          disabled={
            scannedCount === 0 || isProcessing || isDecodingImage || scanPaused
          }
        />

        {deviceGuideModal}
        <Sheet
          visible={manualOpen && !deviceGuide.visible}
          onDismiss={() => {
            setManualError(undefined);
            setManualOpen(false);
          }}
          title="Nhập mã thủ công"
          message="Mã nhập tay cũng kiểm tra trùng và tồn tại trên WMS"
        >
          <CodeInput
            label="Mã sản phẩm / mã tem"
            placeholder="Nhập QR, barcode hoặc serial"
            value={manualCode}
            onChangeText={value => {
              setManualCode(value);
              setManualError(undefined);
            }}
            returnKeyType="done"
            onSubmitEditing={submitManual}
          />
          {manualError === undefined ? null : (
            <Text variant="caption" style={{ color: tokens.colors.dangerText }}>
              {manualError}
            </Text>
          )}
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
      </Page>
    );
  }

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
          <AppIcon name="chevron-left" color={HN_UI.onBrand} size={22} />
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
            stepLabel === undefined
              ? styles.countBadgePrimary
              : styles.countBadgeStep,
          ]}
        >
          <Text variant="caption" style={styles.countText}>
            {stepLabel ?? badgeText}
          </Text>
        </View>
      </View>

      {/* --- Khung ngắm --- */}
      <View style={styles.viewfinderArea}>
        <View style={styles.frame}>
          <ScanBeam active={cameraActive} paused={scanPaused} />
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
      {cameraActive ||
      isScanResultVisible ||
      scanPaused ||
      imagePickerOpen ? null : (
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
          ) : (canRequestAgain(permission.state) || (deviceGuide.cameraSuspended && isCameraUsable(permission.state))) ? (
            <Button
              label="Bật camera để quét"
              onPress={() => {
                if (!deviceGuide.resume()) return;
                if (canRequestAgain(permission.state)) permission.request().catch(() => undefined);
              }}
            />
          ) : null}

          {deviceGuideHelp}
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
                onPress={() => {
                  setManualError(undefined);
                  setManualOpen(true);
                }}
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
            <AppIcon name="flash" color={HN_UI.onBrand} />
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
                  ? styles.floatingButtonDisabled
                  : undefined,
              ]}
            >
              <AppIcon name="image" color={HN_UI.onBrand} />
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
        <View pointerEvents="none" style={[styles.scanResultLayer]}>
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
              <Text variant="body" tone="strong" style={styles.scanResultTitle}>
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
            onPress={() => {
              setManualError(undefined);
              setManualOpen(true);
            }}
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

      {deviceGuideModal}
      {/* --- Hộp nhập mã thủ công --- */}
      <Sheet
        visible={manualOpen && !deviceGuide.visible}
        onDismiss={() => {
          setManualError(undefined);
          setManualOpen(false);
        }}
        title="Nhập mã thủ công"
        message="Mã nhập tay cũng kiểm tra trùng và tồn tại trên WMS"
      >
        <CodeInput
          label="Mã sản phẩm / mã tem"
          placeholder="Nhập QR, barcode hoặc serial"
          value={manualCode}
          onChangeText={value => {
            setManualCode(value);
            setManualError(undefined);
          }}
          returnKeyType="done"
          onSubmitEditing={submitManual}
        />
        {manualError === undefined ? null : (
          <Text variant="caption" style={{ color: tokens.colors.dangerText }}>
            {manualError}
          </Text>
        )}
        <Button
          label="Kiểm tra mã"
          onPress={submitManual}
          loading={isProcessing}
          disabled={manualCode.trim() === '' || isProcessing}
        />
        <Button
          label="Huỷ"
          variant="secondary"
          onPress={() => {
            setManualError(undefined);
            setManualOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
