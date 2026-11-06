import {HN_UI} from '../../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../../ui/ScannerNativeText';
import React, { useEffect, useRef, useState } from 'react';
import {AppState, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType } from 'react-native-camera-kit';
import { useCameraPermission } from '../../../scanner/useCameraPermission';
import { allowedCameraKitFormats } from '../../../scanner/cameraFormats';
import {
  canRequestAgain,
  isCameraUsable,
  permissionMessage,
} from '../../../scanner/cameraPermission';
import { useIsScreenFocused } from '../../../navigation/useIsScreenFocused';
import { useDeploymentTier } from '../../../services/wms/useDeploymentTier';
import { Button } from '../../../ui/Button';
import { P04Icon } from '../../inbound/P04Icon';
import { documentScanQuery } from './scannedQuery';

export interface DocumentSearchCameraProps {
  disabled: boolean;
  /** true means transferred for GET search, NOT server success. */
  onRead(raw: string): boolean;
  onCancel(): void;
  onManual(): void;
}

/** One-shot, read-only camera. No capture, upload, resolver or owner command. */
export function DocumentSearchCamera({
  disabled,
  onRead,
  onCancel,
  onManual,
}: DocumentSearchCameraProps) {
  const permission = useCameraPermission(),
    focused = useIsScreenFocused(),
    tier = useDeploymentTier();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [enabled, setEnabled] = useState(false),
    [captured, setCaptured] = useState(false);
  const [cameraError, setCameraError] = useState(false),
    [inputError, setInputError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const mounted = useRef(true),
    activeRef = useRef(false),
    reading = useRef(false),
    requestingRef = useRef(false);
  const permissionRef = useRef(permission);
  permissionRef.current = permission;
  const active =
    !disabled &&
    enabled &&
    !captured &&
    !cameraError &&
    focused &&
    foreground &&
    tier.allowed &&
    isCameraUsable(permission.state);
  const epoch = useRef(0),
    wasActive = useRef(false);
  if (wasActive.current !== active) {
    epoch.current++;
    wasActive.current = active;
  }
  const frameEpoch = epoch.current;
  const latestActive = useRef(active);
  latestActive.current = active;
  activeRef.current = active;
  useEffect(() => {
    let lifecycleSequence = 0;
    mounted.current = true;
    activeRef.current = latestActive.current;
    const sub = AppState.addEventListener('change', state => {
      activeRef.current = false;
      epoch.current++;
      setForeground(false);
      const sequence = ++lifecycleSequence;
      if (state === 'active') {
        permissionRef.current
          .recheck()
          .then(() => {
            if (mounted.current && sequence === lifecycleSequence)
              setForeground(true);
          })
          .catch(() => undefined);
      }
    });
    return () => {
      mounted.current = false;
      activeRef.current = false;
      lifecycleSequence++;
      sub.remove();
    };
  }, []);
  const leave = (action: () => void) => {
    activeRef.current = false;
    epoch.current++;
    reading.current = true;
    setEnabled(false);
    action();
  };
  const activate = async () => {
    if (
      disabled ||
      !tier.allowed ||
      !focused ||
      !foreground ||
      requestingRef.current
    )
      return;
    requestingRef.current = true;
    setRequesting(true);
    try {
      if (
        !isCameraUsable(permission.state) &&
        canRequestAgain(permission.state)
      )
        await permission.request();
      if (mounted.current) {
        setCameraError(false);
        setInputError('');
        setEnabled(true);
      }
    } finally {
      requestingRef.current = false;
      if (mounted.current) setRequesting(false);
    }
  };
  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'bottom']}
      testID="P12.DOCUMENT_CAMERA"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại chứng từ"
          style={styles.back}
          onPress={() => leave(onCancel)}
        >
          <P04Icon name="back" color={HN_UI.onBrand} size={26} />
        </Pressable>
        <Text style={styles.title}>Quét tìm chứng từ</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <Text style={styles.caption}>
          Đưa mã QR hoặc mã vạch chứng từ vào khung
        </Text>
        <View style={styles.frame}>
          {active ? (
            <Camera
              style={StyleSheet.absoluteFill}
              cameraType={CameraType.Back}
              scanBarcode
              showFrame={false}
              allowedBarcodeTypes={allowedCameraKitFormats()}
              scanThrottleDelay={140}
              focusMode="on"
              torchMode="off"
              onError={() => {
                if (
                  !mounted.current ||
                  !activeRef.current ||
                  frameEpoch !== epoch.current
                )
                  return;
                activeRef.current = false;
                epoch.current++;
                setCameraError(true);
              }}
              onReadCode={event => {
                if (
                  !mounted.current ||
                  !activeRef.current ||
                  reading.current ||
                  frameEpoch !== epoch.current
                )
                  return;
                const query = documentScanQuery(
                  event.nativeEvent.codeStringValue,
                );
                if ('error' in query) {
                  setInputError(query.error);
                  return;
                }
                // Synchronous latch: consecutive native frames cannot dispatch twice.
                reading.current = true;
                activeRef.current = false;
                epoch.current++;
                setCaptured(true);
                try {
                  if (!onRead(query.value))
                    setInputError(
                      'Phiên hoặc kho đã thay đổi. Quay lại danh sách để kiểm tra.',
                    );
                } catch {
                  setInputError(
                    'Chưa chuyển được mã sang tìm kiếm. Quay lại để thử lại.',
                  );
                }
              }}
            />
          ) : (
            <View style={styles.placeholder}>
              <P04Icon name="scan" color={HN_UI.selected} size={64} />
              <Text style={styles.caption}>
                {captured
                  ? 'Đã nhận mã, đang chuyển sang tìm kiếm…'
                  : cameraError
                  ? 'Không mở được camera. Có thể thử lại hoặc nhập mã.'
                  : !tier.allowed
                  ? 'Chưa xác minh được môi trường quét.'
                  : permissionMessage(permission.state)}
              </Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.guide} />
        </View>
        {inputError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {inputError}
          </Text>
        ) : null}
        <Text style={styles.notice}>
          Chỉ gửi mã để tìm bằng GET. Không tải ảnh/video lên máy chủ, không tạo
          hoặc ghi phiếu.
        </Text>
        {!active &&
        !captured &&
        tier.allowed &&
        (isCameraUsable(permission.state) ||
          canRequestAgain(permission.state)) ? (
          <Button
            label={
              isCameraUsable(permission.state)
                ? cameraError
                  ? 'Thử lại camera'
                  : 'Bật camera'
                : 'Xin quyền camera'
            }
            disabled={
              disabled ||
              !focused ||
              !foreground ||
              permission.state === 'checking' ||
              requesting
            }
            onPress={() => {
              activate().catch(() => {
                if (mounted.current) setCameraError(true);
              });
            }}
          />
        ) : null}
        {!tier.allowed ? (
          <Button label="Kiểm tra lại môi trường" onPress={tier.recheck} />
        ) : null}
        <Button
          label="Dùng đầu đọc / nhập tay"
          variant="secondary"
          onPress={() => leave(onManual)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HN_UI.shell },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  back: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 19, fontWeight: '600', color: HN_UI.onBrand, flex: 1 },
  scroll: { flex: 1, minHeight: 0 },
  body: { flexGrow: 1, padding: 16, gap: 16 },
  caption: {
    fontSize: 15,
    lineHeight: 22,
    color: HN_UI.selected,
    textAlign: 'center',
  },
  frame: {
    flex: 1,
    minHeight: 200,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: { padding: 24, alignItems: 'center', gap: 24 },
  guide: {
    position: 'absolute',
    width: '76%',
    height: '62%',
    borderColor: HN_UI.border,
    borderWidth: 2,
    borderRadius: 16,
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    color: HN_UI.selected,
    textAlign: 'center',
  },
  error: { fontSize: 14, lineHeight: 21, color: HN_UI.dangerSoft },
});
