/**
 * Hook quyền camera, có kiểm tra lại theo vòng đời.
 *
 * Prompt 3 §A: "Mất quyền sau khi đã cấp." Người dùng có thể vào Cài đặt thu
 * hồi quyền trong lúc app đang chạy nền. Vì vậy hook **kiểm tra lại mỗi khi
 * app quay lại tiền cảnh**, không tin vào kết quả đã lưu.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import {
  checkCameraPermission,
  requestCameraPermission,
  type AndroidPermissionResult,
  type CameraPermissionState,
  type PermissionBackend,
} from './cameraPermission';

/** Backend thật, bọc `PermissionsAndroid`. */
export const androidCameraPermissionBackend: PermissionBackend = {
  check: async () => {
    if (Platform.OS !== 'android') {
      throw new Error('Chỉ hỗ trợ Android — GATE_01 Q2.');
    }
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  },
  request: async () => {
    if (Platform.OS !== 'android') {
      throw new Error('Chỉ hỗ trợ Android — GATE_01 Q2.');
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Quyền camera',
        message: 'Ứng dụng cần camera để quét mã vạch trên hàng hoá.',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Từ chối',
      },
    );
    return result as AndroidPermissionResult;
  },
};

export interface CameraPermissionView {
  readonly state: CameraPermissionState;
  request(): Promise<void>;
  recheck(): Promise<void>;
}

export function useCameraPermission(
  backend: PermissionBackend = androidCameraPermissionBackend,
): CameraPermissionView {
  const [state, setState] = useState<CameraPermissionState>('checking');
  const mounted = useRef(true);

  const recheck = useCallback(async () => {
    const next = await checkCameraPermission(backend);
    if (mounted.current) {
      // Đã bị chặn vĩnh viễn thì `check()` vẫn trả `denied`; giữ nguyên
      // `blocked` để UI không đổi sang nút "Xin quyền" vô tác dụng.
      setState(current =>
        current === 'blocked' && next === 'denied' ? 'blocked' : next,
      );
    }
  }, [backend]);

  const request = useCallback(async () => {
    const next = await requestCameraPermission(backend);
    if (mounted.current) {
      setState(next);
    }
  }, [backend]);

  useEffect(() => {
    mounted.current = true;
    recheck().catch(() => undefined);

    // Quyền có thể bị thu hồi khi app ở nền → kiểm tra lại lúc quay lại.
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') {
        recheck().catch(() => undefined);
      }
    });

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [recheck]);

  return { state, request, recheck };
}

export type { CameraPermissionState };
