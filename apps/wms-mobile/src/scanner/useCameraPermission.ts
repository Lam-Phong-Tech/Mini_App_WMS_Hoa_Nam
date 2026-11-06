/**
 * Hook quyền camera, có kiểm tra lại theo vòng đời.
 *
 * Prompt 3 §A: "Mất quyền sau khi đã cấp." Người dùng có thể vào Cài đặt thu
 * hồi quyền trong lúc app đang chạy nền. Vì vậy hook **kiểm tra lại mỗi khi
 * app quay lại tiền cảnh**, không tin vào kết quả đã lưu.
 */

import {useCameraPermissionBase,type CameraPermissionView} from './useCameraPermissionBase';
import { PermissionsAndroid, Platform } from 'react-native';

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

export function useCameraPermission(backend:PermissionBackend=androidCameraPermissionBackend):CameraPermissionView{return useCameraPermissionBase(backend);}
export type {CameraPermissionView};
export type {CameraPermissionState};
