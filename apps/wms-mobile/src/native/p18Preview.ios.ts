import { NativeModules, Platform } from 'react-native';

export interface P18Preview {
  id: string;
  mime: string;
  pages: number;
  width: number;
  height: number;
  uri?: string;
  bytes: number;
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
  if (Platform.OS !== 'ios' || !value)
    throw new Error('Bộ xem trong app chưa sẵn sàng trên thiết bị này.');
  return value;
};
const dimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const privateUri = (value: unknown, id: string): value is string => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('file:///') ||
    /[?#\\\u0000-\u001f]/.test(value) ||
    /%2f|%5c/i.test(value)
  )
    return false;
  try {
    const path = decodeURIComponent(value.slice(7));
    if (/[\\\u0000-\u001f]/.test(path)) return false;
    const parts = path.split('/');
    return (
      !parts.some(part => part === '.' || part === '..') &&
      parts[parts.length - 3] === 'p18-previews' &&
      parts[parts.length - 2] === id &&
      Boolean(parts[parts.length - 1])
    );
  } catch {
    return false;
  }
};
const entries = new Map<string, P18Preview>();

export async function openP18Preview(
  blob: Blob,
  mime: string,
  signal?: AbortSignal,
): Promise<P18Preview> {
  if (
    !Number.isSafeInteger(blob.size) ||
    blob.size <= 0 ||
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
    const clean = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      clean();
      reader.abort();
      reject(new Error('Đã đóng lượt xem.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.onerror = () => {
      clean();
      reject(new Error('Không đọc được bytes tài liệu.'));
    };
    reader.onload = () => {
      clean();
      const value = reader.result;
      if (typeof value !== 'string' || !value.includes(','))
        reject(new Error('Bytes tài liệu chưa hợp lệ.'));
      else resolve(value.slice(value.indexOf(',') + 1));
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
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      result.id,
    ) ||
    result.mime !== mime ||
    result.bytes !== blob.size ||
    !dimension(result.pages) ||
    result.pages > 10000 ||
    !dimension(result.width) ||
    !dimension(result.height) ||
    (mime !== 'application/pdf' &&
      (!privateUri(result.uri, result.id) ||
        result.pages !== 1 ||
        result.width * result.height > 40_000_000))
  ) {
    if (typeof result.id === 'string') api.close(result.id);
    throw new Error('Bộ xem chưa xác minh đúng tệp nguồn.');
  }
  entries.set(result.id, result);
  return result;
}

export async function renderP18Page(
  preview: P18Preview,
  page: number,
  width: number,
): Promise<P18Page> {
  if (entries.get(preview.id) !== preview) throw new Error('Đã đóng lượt xem.');
  if (!Number.isInteger(page) || page < 1 || page > preview.pages)
    throw new Error('Trang ngoài phạm vi tài liệu.');
  if (!Number.isFinite(width)) throw new Error('Kích thước trang chưa hợp lệ.');
  if (preview.uri)
    return { uri: preview.uri, width: preview.width, height: preview.height };
  const result = await bridge().render(
    preview.id,
    page,
    Math.max(200, Math.min(1800, Math.round(width))),
  );
  if (entries.get(preview.id) !== preview) throw new Error('Đã đóng lượt xem.');
  if (
    !privateUri(result.uri, preview.id) ||
    !dimension(result.width) ||
    !dimension(result.height) ||
    result.width * result.height > 4_000_000 ||
    result.height > 4096 ||
    result.width > 1800
  )
    throw new Error('Trang xem chưa khớp tài liệu được cấp.');
  return result;
}

export const closeP18Preview = (id: string) => {
  entries.delete(id);
  (NativeModules.P18Preview as Bridge | undefined)?.close(id);
};
