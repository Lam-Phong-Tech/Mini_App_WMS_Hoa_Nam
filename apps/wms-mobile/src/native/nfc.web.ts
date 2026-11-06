import { AppError } from '../errors/AppError';

export type NfcAvailability =
  | 'available'
  | 'disabled'
  | 'unsupported'
  | 'unavailable';

export interface NativeNfcTag {
  readonly hardwareUid: string;
  readonly rawCode?: string;
  readonly hasNdefData?: boolean;
}

export interface WrittenNfcTag {
  readonly hardwareUid: string;
  readonly writtenPayload: string;
}

interface ReadingEventLike extends Event {
  serialNumber?: string;
  message?: { records?: unknown };
}

interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: unknown): Promise<void>;
  addEventListener(
    type: 'reading' | 'readingerror',
    listener: (event: ReadingEventLike) => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(
    type: 'reading' | 'readingerror',
    listener: (event: ReadingEventLike) => void,
  ): void;
}

type NdefReaderConstructor = new () => NdefReaderLike;
let activeRead: { cancel(): void } | undefined;

function assertReadableContext(): void {
  if (!globalThis.isSecureContext || window.top !== window.self)
    throw new AppError({
      kind: 'config',
      code: 'NFC_CONTEXT_UNSUPPORTED',
      message: 'Mở NFC bằng HTTPS trong tab Chrome Android độc lập.',
    });
  if (document.visibilityState !== 'visible')
    throw new AppError({
      kind: 'cancelled',
      code: 'NFC_PAGE_HIDDEN',
      message: 'Đưa trang NFC ra phía trước để đọc thẻ.',
    });
}

function ndefReader(): NdefReaderLike {
  const Reader = (
    globalThis as unknown as { NDEFReader?: NdefReaderConstructor }
  ).NDEFReader;
  if (Reader === undefined) {
    throw new AppError({
      kind: 'config',
      code: 'NFC_UNSUPPORTED',
      message:
        'Trình duyệt này không hỗ trợ Web NFC. Dùng APK Android để chạm/ghi thẻ NFC.',
    });
  }
  return new Reader();
}

/** Missing NDEF evidence is unknown, never a fabricated empty tag. */
function readMessage(
  event: ReadingEventLike,
  hardwareUid: string,
): NativeNfcTag {
  const records = event.message?.records;
  if (!Array.isArray(records)) return { hardwareUid };
  const hasNdefData = records.some(
    record =>
      !record ||
      record.recordType !== 'empty' ||
      (record.data !== undefined && record.data?.byteLength !== 0),
  );
  let rawCode: string | undefined;
  if (records.length === 1 && records[0]?.recordType === 'text') {
    const record = records[0];
    try {
      if (record.data instanceof DataView) {
        rawCode = new TextDecoder(record.encoding || 'utf-8', {
          fatal: true,
        }).decode(record.data);
      }
    } catch {
      // An undecodable record is still populated; do not accept it as blank.
    }
  }
  return {
    hardwareUid,
    hasNdefData,
    ...(rawCode === undefined ? {} : { rawCode }),
  };
}

function scan(reader: NdefReaderLike): Promise<NativeNfcTag> {
  assertReadableContext();
  if (activeRead)
    return Promise.reject(
      new AppError({
        kind: 'blocked_by_gate',
        code: 'NFC_READ_BUSY',
        message: 'Đang chờ một lượt đọc NFC. Dừng lượt cũ trước khi thử lại.',
      }),
    );
  return new Promise<NativeNfcTag>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timeout: number | undefined;
    const finish = (error?: AppError, tag?: NativeNfcTag) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reader.removeEventListener('reading', onReading);
      reader.removeEventListener('readingerror', onReadError);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      activeRead = undefined;
      controller.abort();
      if (error) reject(error);
      else resolve(tag!);
    };
    const onReading = (event: ReadingEventLike) => {
      const uid =
        typeof event.serialNumber === 'string' ? event.serialNumber.trim() : '';
      if (!uid)
        finish(
          new AppError({
            kind: 'unknown',
            code: 'NFC_UID_UNAVAILABLE',
            message: 'Trình duyệt không trả UID phần cứng của thẻ NFC.',
          }),
        );
      else finish(undefined, readMessage(event, uid));
    };
    const onReadError = () =>
      finish(
        new AppError({
          kind: 'unknown',
          code: 'NFC_TAG_READ_ERROR',
          message: 'Chưa đọc được thẻ NFC. Không có thao tác gán hoặc ghi.',
        }),
      );
    const onPageHide = () =>
      finish(
        new AppError({
          kind: 'cancelled',
          code: 'NFC_READ_CANCELED',
          message: 'Đã dừng đọc NFC.',
        }),
      );
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') onPageHide();
    };
    activeRead = { cancel: onPageHide };
    reader.addEventListener('reading', onReading);
    reader.addEventListener('readingerror', onReadError);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    timeout = window.setTimeout(
      () =>
        finish(
          new AppError({
            kind: 'timeout',
            code: 'NFC_SCAN_TIMEOUT',
            message: 'Chưa nhận được thẻ NFC. Chạm thẻ rồi thử lại.',
          }),
        ),
      30000,
    );
    // Register listeners before scan: the first reading can arrive immediately.
    try {
      Promise.resolve(reader.scan({ signal: controller.signal })).catch(error =>
        finish(
          new AppError({
            kind: 'unknown',
            code:
              error?.name === 'NotAllowedError'
                ? 'NFC_PERMISSION_NOT_GRANTED'
                : 'NFC_READ_UNAVAILABLE',
            message:
              error?.name === 'NotAllowedError'
                ? 'Chưa được cấp quyền NFC.'
                : 'Chưa khởi động được đọc NFC.',
          }),
        ),
      );
    } catch {
      finish(
        new AppError({
          kind: 'unknown',
          code: 'NFC_READ_UNAVAILABLE',
          message: 'Chưa khởi động được đọc NFC.',
        }),
      );
    }
  });
}

export async function getNfcAvailability(): Promise<NfcAvailability> {
  return (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader ===
    undefined
    ? 'unsupported'
    : 'available';
}

export async function readNfcTag(): Promise<NativeNfcTag> {
  const reader = ndefReader();
  return scan(reader);
}

export async function writeNfcText(payload: string): Promise<WrittenNfcTag> {
  const reader = ndefReader();
  const { hardwareUid } = await scan(reader);
  await reader.write({ records: [{ recordType: 'text', data: payload }] });
  return { hardwareUid, writtenPayload: payload };
}

export function cancelNfc(): void {
  activeRead?.cancel();
}

/** Browser must not claim a native UID-bound, physically verified write. */
export async function assertNfcAssignmentWritable(): Promise<void> {
  throw new AppError({
    kind: 'config',
    code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
    message:
      'Bản web chưa hỗ trợ ghi NFC ràng buộc UID. Dùng APK Android để gán thẻ; chưa giữ chỗ hoặc ghi chip.',
  });
}

export async function writeNfcTextToTag(
  _payload: string,
  _expectedUid: string,
  _remainingMs: number,
): Promise<WrittenNfcTag> {
  await assertNfcAssignmentWritable();
  // The capability assertion always rejects on Web. Never fall back to write().
  throw new AppError({
    kind: 'config',
    code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
    message: 'Cần APK để gán NFC có xác minh UID.',
  });
}

export async function copyNfcIdentifier(value: string): Promise<void> {
  if (!globalThis.navigator?.clipboard)
    throw new AppError({ kind: 'config', message: 'Không thể sao chép mã.' });
  await globalThis.navigator.clipboard.writeText(value);
}
