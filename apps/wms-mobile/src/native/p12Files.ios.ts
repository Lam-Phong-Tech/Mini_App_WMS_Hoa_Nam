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
  const value = NativeModules.P12Documents as DocumentsModule | undefined;
  if (Platform.OS !== 'ios' || !value)
    throw new Error('Chưa có trình lưu chứng từ trên thiết bị này.');
  return value;
};
const supported = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const saved = new Set<string>();
let generation = 0;
const local = (uri: unknown): uri is string =>
  typeof uri === 'string' &&
  uri.startsWith('file:///') &&
  !/[?#\\\u0000-\u001f]/.test(uri);

export async function saveP12Binary(
  blob: Blob,
  name: string,
  mime: string,
): Promise<{ uri: string; bytes: number }> {
  const api = module(),
    owner = generation;
  if (
    !Number.isSafeInteger(blob.size) ||
    blob.size <= 0 ||
    blob.size > 300 * 1024 * 1024 ||
    !supported.includes(mime) ||
    (blob.type && blob.type.split(';')[0] !== mime)
  )
    throw new Error('Bytes hoặc định dạng tệp chưa hợp lệ.');
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
  if (owner !== generation) throw new Error('Đã đóng lượt lưu chứng từ.');
  const result = await api.save(base64, name, mime);
  if (owner !== generation) throw new Error('Đã đóng lượt lưu chứng từ.');
  if (result.bytes !== blob.size)
    throw new Error('Số bytes đã lưu không khớp tệp nguồn.');
  if (!local(result.uri)) throw new Error('Vị trí lưu chưa được xác minh.');
  saved.add(result.uri);
  return result;
}

export async function openP12File(uri: string): Promise<boolean> {
  if (!saved.has(uri) || !local(uri))
    throw new Error('Tệp chưa được xác minh trong lượt lưu này.');
  return module().open(uri);
}

export async function hashNativeFile(
  uri: string,
): Promise<{ sha256: string; bytes: number }> {
  if (!local(uri))
    throw new Error('Chưa xác minh được hash/bytes của tệp nguồn.');
  const result = await module().hashFile(uri);
  if (
    !/^[a-f0-9]{64}$/.test(result.sha256) ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes <= 0 ||
    result.bytes > 300 * 1024 * 1024
  )
    throw new Error('Chưa xác minh được hash/bytes của tệp nguồn.');
  return result;
}

export const cancelP12Save = () => {
  generation++;
  saved.clear();
  (NativeModules.P12Documents as DocumentsModule | undefined)?.cancel();
};
