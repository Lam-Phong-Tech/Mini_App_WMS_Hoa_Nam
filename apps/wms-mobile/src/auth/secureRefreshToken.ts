/**
 * Refresh token is persisted only by the Android Keystore-backed native module.
 * The access/session metadata stays in MMKV so scan handlers can read it
 * synchronously; the long-lived credential never does.
 */

import { NativeModules, Platform } from 'react-native';

import { AppError } from '../errors/AppError';

interface NativeSecureSessionModule {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

/** Test/non-Android fallback is volatile only: never persisted to disk. */
let volatileToken: string | undefined;

function nativeModule(): NativeSecureSessionModule | undefined {
  return NativeModules.WmsSecureSession as
    | NativeSecureSessionModule
    | undefined;
}

function requireNative(): NativeSecureSessionModule | undefined {
  const module = nativeModule();
  if (module !== undefined) return module;
  // Jest and the web implementation do not have an Android bridge. Do not
  // silently downgrade a real Android installation to plaintext storage.
  if (Platform.OS === 'android') {
    throw new AppError({
      kind: 'config',
      code: 'SECURE_SESSION_MODULE_UNAVAILABLE',
      message:
        'Bản cài thiếu kho bảo mật phiên. Cập nhật ứng dụng rồi đăng nhập lại.',
    });
  }
  return undefined;
}

export async function readSecureRefreshToken(): Promise<string | undefined> {
  const module = requireNative();
  if (module === undefined) return volatileToken;
  const token = await module.getRefreshToken();
  const normalized = token?.trim();
  return normalized === undefined || normalized === '' ? undefined : normalized;
}

async function writeToken(token: string): Promise<void> {
  const normalized = token.trim();
  if (normalized === '') {
    throw new AppError({ kind: 'auth', message: 'Refresh token trống.' });
  }
  const module = requireNative();
  if (module === undefined) {
    volatileToken = normalized;
    return;
  }
  await module.setRefreshToken(normalized);
}

async function clearToken(): Promise<void> {
  const module = requireNative();
  volatileToken = undefined;
  if (module !== undefined) await module.clearRefreshToken();
}

// Serialize native credential mutations: an old clear must finish before a new login writes.
let credentialQueue: Promise<void> = Promise.resolve();
function enqueueCredential(operation: () => Promise<void>): Promise<void> {
  const next = credentialQueue.then(operation, operation);
  credentialQueue = next.catch(() => undefined);
  return next;
}
export function writeSecureRefreshToken(
  token: string,
  accepts: () => boolean = () => true,
): Promise<void> {
  return enqueueCredential(async () => {
    if (!accepts()) return;
    await writeToken(token);
    // Clear a superseded write before the queue permits a newer login write.
    if (!accepts()) await clearToken();
  });
}
export function clearSecureRefreshToken(
  accepts: () => boolean = () => true,
): Promise<void> {
  return enqueueCredential(async () => {
    if (accepts()) await clearToken();
  });
}
