import { NativeModules, Platform } from 'react-native';
export const p12SaveTitle = 'Đã lưu chứng từ';
export const p12SaveMessage = 'Đã lưu chứng từ về vị trí bạn chọn.';
interface DocumentsModule {
  save(
    base64: string,
    name: string,
    mime: string,
  ): Promise<{ uri: string; bytes: number }>;
  open(uri: string): Promise<boolean>;
  hashFile(uri: string): Promise<{ sha256: string; bytes: number }>;
  cancel(): void;
}
const module = () => {
  const m = NativeModules.P12Documents as DocumentsModule | undefined;
  if (Platform.OS !== 'android' || !m)
    throw new Error('Chưa có trình lưu chứng từ trên thiết bị này.');
  return m;
};
export async function saveP12Binary(blob: Blob, name: string, mime: string) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được bytes tài liệu.'));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== 'string' || !value.includes(',')) {
        reject(new Error('Bytes tài liệu chưa hợp lệ.'));
        return;
      }
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  const result = await module().save(base64, name, mime);
  if (result.bytes !== blob.size)
    throw new Error('Số bytes đã lưu không khớp tệp nguồn.');
  return result;
}
export const openP12File = (uri: string) => module().open(uri);
export async function hashNativeFile(uri: string) {
  const result = await module().hashFile(uri);
  if (
    !/^[a-f0-9]{64}$/.test(result.sha256) ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes <= 0
  )
    throw new Error('Chưa xác minh được hash/bytes của tệp nguồn.');
  return result;
}
export const cancelP12Save = () => {
  const m = NativeModules.P12Documents as DocumentsModule | undefined;
  m?.cancel();
};
