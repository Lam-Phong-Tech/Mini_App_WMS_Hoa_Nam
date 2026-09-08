/** Cầu nối TypeScript cho NFC Android. Không có fallback giả lập trên thiết bị không NFC. */

import { NativeModules } from 'react-native';
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

interface WmsNfcModule {
  getStatus(): Promise<{ status: NfcAvailability }>;
  readTag(): Promise<NativeNfcTag>;
  writeNdefText(payload: string): Promise<WrittenNfcTag>;
  cancel(): void;
}

function module(): WmsNfcModule {
  const native = NativeModules.WmsNfc as WmsNfcModule | undefined;
  if (native === undefined) {
    throw new AppError({
      kind: 'config',
      code: 'NFC_MODULE_UNAVAILABLE',
      message: 'Bản cài này chưa có mô-đun NFC. Cập nhật ứng dụng rồi thử lại.',
    });
  }
  return native;
}

function rethrowNative(error: unknown): never {
  if (error instanceof AppError) throw error;
  const value = error as { message?: unknown; code?: unknown } | undefined;
  throw new AppError({
    kind: 'unknown',
    code: typeof value?.code === 'string' ? value.code : undefined,
    message: typeof value?.message === 'string' ? value.message : 'Không thể dùng NFC trên thiết bị này.',
    cause: error,
  });
}

export async function getNfcAvailability(): Promise<NfcAvailability> {
  try {
    return (await module().getStatus()).status;
  } catch (error) {
    return rethrowNative(error);
  }
}

export async function readNfcTag(): Promise<NativeNfcTag> {
  try {
    return await module().readTag();
  } catch (error) {
    return rethrowNative(error);
  }
}

export async function writeNfcText(payload: string): Promise<WrittenNfcTag> {
  try {
    return await module().writeNdefText(payload);
  } catch (error) {
    return rethrowNative(error);
  }
}

export function cancelNfc(): void {
  try {
    module().cancel();
  } catch {
    // Màn hình đang rời đi; native module không có cũng không còn thao tác chờ để huỷ.
  }
}
