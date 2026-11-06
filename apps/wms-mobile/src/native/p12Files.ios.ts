import { NativeModules } from 'react-native';

export const p12SaveTitle = 'Đã lưu chứng từ';
export const p12SaveMessage = 'Đã lưu chứng từ về vị trí bạn chọn.';

// Contract stubs for the initial iOS RED run; no simulated save/hash result.
export async function saveP12Binary(
  _blob: Blob,
  _name: string,
  _mime: string,
): Promise<{ uri: string; bytes: number }> {
  throw new Error('Chưa có trình lưu chứng từ trên thiết bị này.');
}

export async function openP12File(_uri: string): Promise<boolean> {
  throw new Error('Chưa có trình lưu chứng từ trên thiết bị này.');
}

export async function hashNativeFile(
  _uri: string,
): Promise<{ sha256: string; bytes: number }> {
  throw new Error('Chưa có trình lưu chứng từ trên thiết bị này.');
}

export const cancelP12Save = () => NativeModules.P12Documents?.cancel();
