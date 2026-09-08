/**
 * Quyền camera.
 *
 * Prompt 3 §A đòi ba tình huống riêng biệt: **xin quyền**, **bị từ chối**, và
 * **mất quyền sau khi đã cấp**. Muốn phân biệt được thì phải biết người dùng
 * bấm "Từ chối" (còn hỏi lại được) hay "Đừng hỏi lại" (phải vào Cài đặt).
 *
 * `checkDeviceCameraAuthorizationStatus()` của camera-kit chỉ trả `boolean` nên
 * không tách được hai trường hợp đó. Vì vậy tầng này dùng `PermissionsAndroid`
 * có sẵn trong React Native — không thêm dependency nào.
 *
 * Logic tách khỏi React và nhận backend tiêm vào để test chạy được trên Node.
 */

export type CameraPermissionState =
  /** Đang hỏi hệ thống, chưa biết. */
  | 'checking'
  /** Đã có quyền. */
  | 'granted'
  /** Bị từ chối nhưng **còn xin lại được**. */
  | 'denied'
  /** Bị chặn vĩnh viễn — phải tự vào Cài đặt bật. */
  | 'blocked'
  /** Thiết bị/nền tảng không hỗ trợ. */
  | 'unavailable';

/** Kết quả thô của `PermissionsAndroid.request`. */
export type AndroidPermissionResult = 'granted' | 'denied' | 'never_ask_again';

/** Bề mặt tối thiểu tầng này dùng — cho phép test tiêm bản giả lập hệ thống. */
export interface PermissionBackend {
  check(): Promise<boolean>;
  request(): Promise<AndroidPermissionResult>;
}

/** Diễn giải kết quả `request()` thành trạng thái của ứng dụng. */
export function interpretRequestResult(
  result: AndroidPermissionResult,
): CameraPermissionState {
  switch (result) {
    case 'granted':
      return 'granted';
    case 'never_ask_again':
      // Hỏi nữa cũng vô ích: hệ thống sẽ trả về ngay mà không hiện hộp thoại.
      return 'blocked';
    default:
      return 'denied';
  }
}

/** Chỉ nên hiện nút "Xin quyền" khi còn xin lại được. */
export function canRequestAgain(state: CameraPermissionState): boolean {
  return state === 'denied' || state === 'checking';
}

/** Chỉ `granted` mới được bật camera. */
export function isCameraUsable(state: CameraPermissionState): boolean {
  return state === 'granted';
}

/** Thông điệp tiếng Việt cho người vận hành kho. */
export function permissionMessage(state: CameraPermissionState): string {
  switch (state) {
    case 'checking':
      return 'Đang kiểm tra quyền camera…';
    case 'granted':
      return 'Đã có quyền camera.';
    case 'denied':
      return 'Chưa có quyền camera. Bấm "Xin quyền camera" để cấp.';
    case 'blocked':
      return 'Quyền camera đã bị chặn. Vào Cài đặt → Ứng dụng → Quản lý kho → Quyền → Camera để bật lại.';
    case 'unavailable':
      return 'Thiết bị này không dùng được camera.';
  }
}

/**
 * Đọc trạng thái hiện tại.
 *
 * ⚠️ Chỉ phân biệt được `granted` với `denied`. Hệ thống **không** cho biết
 * "đã bị chặn vĩnh viễn" khi mới kiểm tra — chỉ khi `request()` trả
 * `never_ask_again`. Đó là giới hạn của Android, không phải thiếu sót ở đây.
 */
export async function checkCameraPermission(
  backend: PermissionBackend,
): Promise<CameraPermissionState> {
  try {
    return (await backend.check()) ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestCameraPermission(
  backend: PermissionBackend,
): Promise<CameraPermissionState> {
  try {
    return interpretRequestResult(await backend.request());
  } catch {
    return 'unavailable';
  }
}
