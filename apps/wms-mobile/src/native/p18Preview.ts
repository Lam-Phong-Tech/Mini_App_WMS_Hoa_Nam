import { NativeModules, Platform } from 'react-native';
export interface P18Preview {
  id: string;
  mime: string;
  pages: number;
  width: number;
  height: number;
  uri?: string;
  bytes: number;
  /** Web-only optional text reader; no native capability is inferred. */
  getText?: (page: number) => Promise<string>;
}
export interface P18Page {
  uri: string;
  width: number;
  height: number;
}
interface Bridge {
  open(base64: string, mime: string): Promise<P18Preview>;
  render(id: string, page: number, width: number): Promise<P18Page>;
  close(id: string): void;
}
const bridge = () => {
  const value = NativeModules.P18Preview as Bridge | undefined;
  if (Platform.OS !== 'android' || !value)
    throw new Error('Bộ xem trong app chưa sẵn sàng trên thiết bị này.');
  return value;
};
const dimension = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const localUri = (uri: unknown, id: string): uri is string =>
  typeof uri === 'string' &&
  uri.startsWith('file:///') &&
  uri.includes('/p18-previews/' + id + '/') &&
  !/[?#]/.test(uri);
export async function openP18Preview(
  blob: Blob,
  mime: string,
  signal?: AbortSignal,
): Promise<P18Preview> {
  if (
    !blob.size ||
    blob.size > 20 * 1024 * 1024 ||
    !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
      mime,
    ) ||
    (blob.type && blob.type.split(';')[0] !== mime)
  )
    throw new Error(
      'Bộ xem hỗ trợ PDF/ảnh tối đa 20 MiB. Tệp gốc vẫn có thể tải xuống.',
    );
  const api = bridge();
  if (signal?.aborted) throw new Error('Đã đóng lượt xem.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(new Error('Đã đóng lượt xem.'));
    };
    const clean = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    reader.onerror = () => {
      clean();
      reject(new Error('Không đọc được bytes tài liệu.'));
    };
    reader.onload = () => {
      clean();
      if (typeof reader.result !== 'string' || !reader.result.includes(','))
        reject(new Error('Bytes tài liệu chưa hợp lệ.'));
      else resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  if (signal?.aborted) throw new Error('Đã đóng lượt xem.');
  const result = await api.open(base64, mime);
  if (signal?.aborted) {
    api.close(result.id);
    throw new Error('Đã đóng lượt xem.');
  }
  if (
    !/^[a-f0-9-]{36}$/i.test(result.id) ||
    result.mime !== mime ||
    result.bytes !== blob.size ||
    !dimension(result.pages) ||
    result.pages > 10000 ||
    !dimension(result.width) ||
    !dimension(result.height) ||
    (mime !== 'application/pdf' &&
      (!localUri(result.uri, result.id) || result.pages !== 1))
  ) {
    if (typeof result.id === 'string') api.close(result.id);
    throw new Error('Bộ xem chưa xác minh đúng tệp nguồn.');
  }
  return result;
}
export async function renderP18Page(
  preview: P18Preview,
  page: number,
  width: number,
): Promise<P18Page> {
  if (!Number.isInteger(page) || page < 1 || page > preview.pages)
    throw new Error('Trang ngoài phạm vi tài liệu.');
  const result = await bridge().render(
    preview.id,
    page,
    Math.max(200, Math.min(1800, Math.round(width))),
  );
  if (
    !localUri(result.uri, preview.id) ||
    !dimension(result.width) ||
    !dimension(result.height)
  )
    throw new Error('Trang xem chưa khớp tài liệu được cấp.');
  return result;
}
export const closeP18Preview = (id: string) =>
  (NativeModules.P18Preview as Bridge | undefined)?.close(id);
