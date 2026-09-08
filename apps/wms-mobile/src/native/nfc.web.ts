import { AppError } from '../errors/AppError';

export type NfcAvailability = 'available' | 'disabled' | 'unsupported' | 'unavailable';

export interface NativeNfcTag {
  readonly hardwareUid: string;
  readonly rawCode?: string;
}

export interface WrittenNfcTag {
  readonly hardwareUid: string;
  readonly writtenPayload: string;
}

interface ReadingEventLike extends Event {
  serialNumber?: string;
}

interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: unknown): Promise<void>;
  addEventListener(type: 'reading', listener: (event: ReadingEventLike) => void, options?: { once?: boolean }): void;
}

type NdefReaderConstructor = new () => NdefReaderLike;
let activeAbort: AbortController | undefined;

function ndefReader(): NdefReaderLike {
  const Reader = (globalThis as unknown as { NDEFReader?: NdefReaderConstructor }).NDEFReader;
  if (Reader === undefined) {
    throw new AppError({ kind: 'config', code: 'NFC_UNSUPPORTED', message: 'Trình duyệt này không hỗ trợ Web NFC. Dùng APK Android để chạm/ghi thẻ NFC.' });
  }
  return new Reader();
}

async function scan(reader: NdefReaderLike): Promise<string> {
  activeAbort?.abort();
  const controller = new AbortController();
  activeAbort = controller;
  await reader.scan({ signal: controller.signal });
  return await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new AppError({ kind: 'timeout', code: 'NFC_SCAN_TIMEOUT', message: 'Chưa nhận được thẻ NFC. Chạm thẻ rồi thử lại.' })), 30000);
    reader.addEventListener('reading', event => {
      window.clearTimeout(timeout);
      const uid = event.serialNumber?.trim();
      if (uid === undefined || uid === '') {
        reject(new AppError({ kind: 'unknown', code: 'NFC_UID_UNAVAILABLE', message: 'Trình duyệt không trả UID phần cứng của thẻ NFC.' }));
      } else {
        resolve(uid);
      }
    }, { once: true });
  });
}

export async function getNfcAvailability(): Promise<NfcAvailability> {
  return (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader === undefined ? 'unsupported' : 'available';
}

export async function readNfcTag(): Promise<NativeNfcTag> {
  const reader = ndefReader();
  return { hardwareUid: await scan(reader) };
}

export async function writeNfcText(payload: string): Promise<WrittenNfcTag> {
  const reader = ndefReader();
  const hardwareUid = await scan(reader);
  await reader.write({ records: [{ recordType: 'text', data: payload }] });
  return { hardwareUid, writtenPayload: payload };
}

export function cancelNfc(): void {
  activeAbort?.abort();
  activeAbort = undefined;
}
