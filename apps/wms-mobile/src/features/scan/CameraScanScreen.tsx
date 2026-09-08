/**
 * Màn quét mã bằng camera — Prompt 3 §A.
 *
 * Đây là màn **kiểm chứng nguồn quét camera**, không phải màn nghiệp vụ. Nó tồn
 * tại để chứng minh 10 yêu cầu §A chạy được trên thiết bị thật; luồng nhập/xuất
 * kho thuộc Prompt 4.
 *
 * Ba điều KHÔNG làm, có chủ đích:
 *  - **Không gọi `capture()`** ở bất kỳ đâu → không sinh ra ảnh nào.
 *    §A: "Không lưu ảnh camera nếu nghiệp vụ không yêu cầu."
 *  - **Không xin quyền micro** — chỉ đọc mã, không quay tiếng.
 *  - **Không tự gửi mã đi đâu** — mã dừng lại ở màn này.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraType } from 'react-native-camera-kit';

import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { tokens } from '../../theme/tokens';
import { logger } from '../../logging/logger';
import {
  allowedCameraKitFormats,
  fromCameraKitFormat,
} from '../../scanner/cameraFormats';
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
import { displayLabel, parseScanPayload } from '../../scanner/scanPayload';
import type { ParsedScanPayload } from '../../scanner/scanPayload';
import type { ScanDetectedResult } from '../../scanner/types';

/** Kết quả kèm payload đã phân tích, để hiển thị SKU và ITEM riêng. */
interface ScanRow extends ScanDetectedResult {
  readonly parsed: ParsedScanPayload;
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    // Khung xem cao hẳn: mã vạch trên thùng carton dài ngang, cần đủ chỗ để
    // MLKit thấy trọn mã. Khung nhỏ buộc thủ kho lùi xa → mã bé đi → khó đọc.
    height: 460,
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box row gap="md" justify="space-between" align="center">
      <Text tone="muted">{label}</Text>
      <Text tone="strong" style={styles.rowValue}>
        {value}
      </Text>
    </Box>
  );
}

/**
 * ⚠️ Đây là màn **chẩn đoán** của Prompt 3, KHÔNG phải màn nghiệp vụ.
 *
 * Nó cố tình là `Page` nền sáng liệt kê trạng thái quyền, định dạng và danh sách
 * kết quả — hợp cho việc kiểm chứng phần cứng khi hỗ trợ từ xa.
 *
 * Màn quét cho thủ kho là `BusinessScanScreen`: toàn màn tối, khung ngắm, thanh
 * hành động dưới. Ngày 2026-09-06 tôi từng tái dùng màn này cho luồng nghiệp vụ
 * và người dùng chạy thật rồi chỉ ra ngay là sai thiết kế — đã tách hẳn hai màn.
 */
export function CameraScanScreen(): React.ReactElement {
  const permission = useCameraPermission();
  const isFocused = useIsFocused();

  const [appActive, setAppActive] = useState(
    () => AppState.currentState === 'active',
  );
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | undefined>();
  const [results, setResults] = useState<ScanRow[]>([]);
  const [duplicatesBlocked, setDuplicatesBlocked] = useState(0);

  // Chống callback trùng. `useRef` để không bị dựng lại mỗi lần render —
  // dựng lại là mất trạng thái chống trùng và mã sẽ lọt qua.
  const guard = useRef(createScanGuard(DEFAULT_SCAN_GUARD_CONFIG));

  const allowedTypes = useMemo(() => allowedCameraKitFormats(), []);

  /** Số kiện đã bị khoá cả phiên — chỉ mã có ITEM mới vào nhóm này. */
  const sessionLocked = results.filter(
    result => result.parsed.dedupeScope === 'session',
  ).length;

  /**
   * Camera chỉ bật khi hội đủ CẢ BA điều kiện.
   * §A: "Pause/resume theo vòng đời màn hình" và "Dừng camera khi rời màn hình".
   * Không render `<Camera>` là thật sự nhả phần cứng, không chỉ ẩn đi.
   */
  const cameraActive = isCameraUsable(permission.state) && isFocused && appActive;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      setAppActive(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!cameraActive) {
      // Rời màn/ra nền: xoá trạng thái chống trùng và tắt đèn để không hao pin.
      guard.current.reset();
      setTorchOn(false);
    }
  }, [cameraActive]);

  const handleReadCode = useCallback(
    (event: { nativeEvent: { codeStringValue: string; codeFormat: string } }) => {
      const raw = event.nativeEvent.codeStringValue;
      const code = typeof raw === 'string' ? raw.trim() : '';
      if (code.length === 0) {
        return;
      }

      // Mã production luôn có dạng `HN1|SKU=…|ITEM=…` (người dùng xác nhận
      // 2026-09-05). `ITEM` là định danh của MỘT kiện hàng vật lý, nên khoá
      // chống trùng là ITEM chứ không phải SKU — 4 kiện cùng SKU mang 4 ITEM
      // khác nhau và phải được đếm đủ 4.
      const parsed = parseScanPayload(code);

      if (!guard.current.accept(parsed.dedupeKey, undefined, parsed.dedupeScope)) {
        setDuplicatesBlocked(count => count + 1);
        return;
      }

      const result: ScanRow = {
        code,
        format: fromCameraKitFormat(event.nativeEvent.codeFormat),
        detectedAt: new Date().toISOString(),
        // Nguồn thật, không phải nhãn mặc định — spec scanner §4 mục 1.
        source: 'CAMERA',
        parsed,
      };
      setResults(previous => [result, ...previous].slice(0, 50));
    },
    [],
  );

  const handleError = useCallback(
    (event: { nativeEvent: { errorMessage: string } }) => {
      const message = event.nativeEvent.errorMessage;
      logger.error('Camera lỗi', { message });
      setCameraError(message);
    },
    [],
  );

  return (
    <Page
      title="Quét bằng camera"
      subtitle="Màn kiểm chứng nguồn quét camera — không phải màn nghiệp vụ"
    >
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Quyền camera
        </Text>
        <Row label="Trạng thái" value={permission.state} />
        <Text tone="muted">{permissionMessage(permission.state)}</Text>

        {canRequestAgain(permission.state) ? (
          <Button
            label="Xin quyền camera"
            onPress={() => {
              permission.request().catch(() => undefined);
            }}
          />
        ) : null}

        {permission.state === 'blocked' ? (
          <Button
            label="Kiểm tra lại sau khi bật trong Cài đặt"
            variant="secondary"
            onPress={() => {
              permission.recheck().catch(() => undefined);
            }}
          />
        ) : null}
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Khung xem
        </Text>
        <Row label="Camera đang bật" value={cameraActive ? 'có' : 'không'} />
        <Row label="Màn đang hiển thị" value={isFocused ? 'có' : 'không'} />
        <Row label="App ở tiền cảnh" value={appActive ? 'có' : 'không'} />

        <View style={styles.preview}>
          {cameraActive ? (
            <Camera
              style={styles.camera}
              cameraType={CameraType.Back}
              scanBarcode
              /*
               * ❌ KHÔNG bật `showFrame`.
               *
               * Nhìn thì tưởng nó chỉ vẽ khung ngắm, nhưng đọc `CKCamera.kt`
               * thấy nó **lọc bỏ mọi mã nằm ngoài ô khung**:
               *
               *   if (barcodeFrame == null) { onBarcodeRead(filteredByType); return }
               *   ...
               *   val filteredBarcodes = filteredByType.filter { ...frameRect... }
               *
               * MLKit đã đọc ra mã rồi vẫn bị vứt nếu lệch khung → thủ kho phải
               * căn rất chính xác, quét lâu. Tắt đi thì quét toàn khung hình.
               */
              /*
               * Mặc định của thư viện là 2000 ms — mỗi lần quét phải chờ 2 giây.
               * Hạ xuống 150 ms để bắt mã nhanh; việc chống trùng đã có
               * `createScanGuard` ở tầng JS lo, và nó phân biệt được mã khác
               * nhau nên không chặn nhầm khi quét liên tiếp nhiều thùng.
               */
              scanThrottleDelay={150}
              allowedBarcodeTypes={allowedTypes}
              // Lấy nét liên tục: mã vạch trên thùng carton thường ở cự ly gần,
              // không lấy nét thì ảnh mờ và MLKit không giải mã được.
              focusMode="on"
              resetFocusWhenMotionDetected
              // Cho phép chụm tay phóng to khi mã in nhỏ.
              zoomMode="on"
              // Lấp đầy khung xem thay vì để viền đen.
              resizeMode="cover"
              torchMode={torchOn ? 'on' : 'off'}
              onReadCode={handleReadCode}
              onError={handleError}
            />
          ) : (
            <Box padding="lg" gap="sm" align="center" justify="center" flex={1}>
              <Text tone="muted">
                {isCameraUsable(permission.state)
                  ? 'Camera đã tắt để nhả phần cứng.'
                  : 'Chưa bật được camera — xem phần quyền ở trên.'}
              </Text>
            </Box>
          )}
        </View>

        <Button
          label={torchOn ? 'Tắt đèn' : 'Bật đèn'}
          variant="secondary"
          disabled={!cameraActive}
          onPress={() => setTorchOn(on => !on)}
        />

        {cameraError === undefined ? null : (
          <Text tone="danger">Lỗi camera: {cameraError}</Text>
        )}
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Kết quả
        </Text>
        <Row label="Đã nhận" value={String(results.length)} />
        <Row label="Chặn trùng" value={String(duplicatesBlocked)} />
        <Row
          label="Kiện đã khoá cả phiên"
          value={String(sessionLocked)}
        />
        <Row
          label="Mã không có ITEM"
          value={String(results.filter(r => r.parsed.item === undefined).length)}
        />
        <Row
          label="Định dạng bật"
          value={String(allowedTypes.length) + ' loại'}
        />

        {results.length === 0 ? (
          <Text tone="muted">Chưa quét được mã nào.</Text>
        ) : (
          results.map(result => (
            <Row
              key={result.detectedAt + result.code}
              label={
                new Date(result.detectedAt).toLocaleTimeString('vi-VN') +
                (result.parsed.sku === undefined
                  ? ''
                  : '  ' + result.parsed.sku)
              }
              value={displayLabel(result.parsed)}
            />
          ))
        )}

        <Button
          label="Xoá kết quả"
          variant="secondary"
          onPress={() => {
            setResults([]);
            setDuplicatesBlocked(0);
            guard.current.reset();
          }}
        />
      </Box>
    </Page>
  );
}
