/** Browser delivery of bytes already authorized/fetched by the P12 owner. */
const privateUrls = new Set<string>();
export async function hashNativeFile(
  _uri: string,
): Promise<{ sha256: string; bytes: number }> {
  throw new Error('Native file hashing không dùng trên trình duyệt.');
}
interface DownloadLink {
  href: string;
  download?: string;
  target?: string;
  rel: string;
  style: { display?: string };
  click(): void;
  remove(): void;
}
interface BrowserDocument {
  createElement(tag: 'a'): DownloadLink;
  body: { appendChild(link: DownloadLink): unknown };
}
function browserDocument(): BrowserDocument {
  const doc = (globalThis as unknown as { document?: BrowserDocument })
    .document;
  if (!doc?.body) throw new Error('Trình duyệt chưa sẵn sàng để tải tệp.');
  return doc;
}
const supported = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const p12SaveTitle = 'Đã gửi tải xuống';
export const p12SaveMessage =
  'Đã gửi tệp tới trình tải xuống của trình duyệt. Kiểm tra thư mục tải xuống; ứng dụng không xác nhận được việc lưu trên ổ đĩa.';

export async function saveP12Binary(
  blob: Blob,
  name: string,
  mime: string,
): Promise<{ uri: string; bytes: number }> {
  if (
    !blob.size ||
    !supported.has(mime) ||
    (blob.type && blob.type.split(';')[0] !== mime)
  )
    throw new Error('Bytes hoặc định dạng tệp chưa hợp lệ.');
  const doc = browserDocument();
  cancelP12Save();
  const uri = URL.createObjectURL(blob);
  privateUrls.add(uri);
  const anchor = doc.createElement('a');
  anchor.href = uri;
  anchor.download =
    Array.from(name)
      .map(ch => {
        const point = ch.codePointAt(0)!;
        return point < 32 || point === 127 || ch === '/' || ch === '\\'
          ? '_'
          : ch;
      })
      .join('') || 'document';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (error) {
    cancelP12Save();
    throw error;
  } finally {
    anchor.remove();
  }
  // size is the fetched Blob's size, NOT evidence of a completed disk write.
  return { uri, bytes: blob.size };
}

export async function openP12File(uri: string): Promise<boolean> {
  if (!privateUrls.has(uri))
    throw new Error('Tệp tạm đã đóng hoặc ngữ cảnh đã thay đổi.');
  const doc = browserDocument();
  const anchor = doc.createElement('a');
  anchor.href = uri;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
  // Dispatch only: the browser may block a new tab; no opened/saved toast.
  return true;
}

export function cancelP12Save(): void {
  for (const uri of privateUrls) URL.revokeObjectURL(uri);
  privateUrls.clear();
}
