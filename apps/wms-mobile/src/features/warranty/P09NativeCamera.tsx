// Existing P03 camera/permission/guard stack, embedded in the locked P09 card.
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { useCameraPermission } from '../../scanner/useCameraPermission';
import {
  isCameraUsable,
  canRequestAgain,
} from '../../scanner/cameraPermission';
import {
  createScanGuard,
  DEFAULT_SCAN_GUARD_CONFIG,
} from '../../scanner/cameraScanGuard';
import { parseScanPayload } from '../../scanner/scanPayload';
import { useIsScreenFocused } from '../../navigation/useIsScreenFocused';
import { useDeploymentTier } from '../../services/wms/useDeploymentTier';

export function P09NativeCamera({
  manual,
  disabled,
  onRead,
  renderSurface,
  autoStart = true,
}: {
  manual: boolean;
  disabled: boolean;
  onRead(raw: string): void;
  autoStart?: boolean;
  renderSurface(state: {
    caption: string;
    activationLabel?: string;
    onActivate?: () => void;
    torch: boolean;
    onTorch?: () => void;
    camera?: React.ReactNode;
  }): React.ReactElement;
}) {
  const permission = useCameraPermission(),
    focused = useIsScreenFocused(),
    tier = useDeploymentTier();
  const [enabled, setEnabled] = useState(autoStart),
    [torch, setTorch] = useState(false),
    [error, setError] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const guard = useRef(createScanGuard(DEFAULT_SCAN_GUARD_CONFIG)),
    reading = useRef(false);
  const mounted = useRef(true),
    activeRef = useRef(false);
  const active =
    enabled &&
    !manual &&
    !disabled &&
    focused &&
    foreground &&
    isCameraUsable(permission.state) &&
    tier.allowed &&
    !error;
  activeRef.current = active;
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') activeRef.current = false;
      setForeground(state === 'active');
    });
    const currentGuard = guard.current;
    return () => {
      mounted.current = false;
      activeRef.current = false;
      currentGuard.reset();
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (!active) {
      setTorch(false);
      guard.current.reset();
    }
  }, [active]);
  async function activate() {
    if (disabled || manual || !tier.allowed || !focused || !foreground) return;
    if (permission.state === 'checking') {
      await permission.recheck();
      return;
    }
    setError(false);
    reading.current = false;
    if (!isCameraUsable(permission.state) && canRequestAgain(permission.state))
      await permission.request();
    if (mounted.current) setEnabled(true);
  }
  const canRecheckTier =
    !tier.allowed &&
    (tier.status === 'unreachable' || tier.status === 'unchecked');
  const caption = !tier.allowed
    ? tier.checking
      ? 'Đang kiểm tra môi trường quét…'
      : canRecheckTier
      ? 'Chưa kết nối được máy chủ · Chạm để kiểm tra lại'
      : 'Sai môi trường · Camera đang khóa'
    : error
    ? 'Camera gặp lỗi · Chạm để thử lại'
    : active
    ? 'Giữ serial trong khung quét'
    : permission.state === 'blocked'
    ? 'Camera chưa được cấp quyền · Mở Cài đặt để cấp quyền'
    : permission.state === 'checking'
    ? 'Đang kiểm tra quyền camera…'
    : permission.state === 'unavailable'
    ? 'Thiết bị không hỗ trợ camera quét'
    : 'Camera chưa kết nối';
  return renderSurface({
    caption,
    activationLabel: canRecheckTier
      ? 'Kiểm tra lại môi trường quét'
      : permission.state === 'blocked'
      ? 'Mở Cài đặt để cấp quyền camera'
      : undefined,
    onActivate:
      manual ||
      disabled ||
      !focused ||
      !foreground ||
      tier.checking ||
      permission.state === 'unavailable'
        ? undefined
        : permission.state === 'blocked'
        ? () => {
            Linking.openSettings().catch(() => undefined);
          }
        : canRecheckTier
        ? tier.recheck
        : !tier.allowed
        ? undefined
        : () => {
            activate().catch(() => setError(true));
          },
    torch,
    onTorch: active ? () => setTorch(v => !v) : undefined,
    camera: active ? (
      <Camera
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        cameraType={CameraType.Back}
        scanBarcode
        showFrame={false}
        scanThrottleDelay={140}
        focusMode="on"
        torchMode={torch ? 'on' : 'off'}
        onError={() => setError(true)}
        onReadCode={event => {
          const raw = event.nativeEvent.codeStringValue?.trim();
          if (!mounted.current || !activeRef.current || reading.current || !raw)
            return;
          const parsed = parseScanPayload(raw);
          if (
            !guard.current.accept(
              parsed.dedupeKey,
              undefined,
              parsed.dedupeScope,
            )
          )
            return;
          reading.current = true;
          setEnabled(false);
          onRead(raw);
        }}
      />
    ) : undefined,
  });
}
