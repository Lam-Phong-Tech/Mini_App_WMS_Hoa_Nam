/**
 * Kênh phiên của bản native.
 *
 * Android nhận refresh token trong JSON, nên token được giữ trong Android
 * Keystore và gửi lại trong body. Bản Web có file `.web.ts` cùng tên: backend
 * dùng cookie HttpOnly ở đó, vì JavaScript không được đọc refresh token.
 */

export type AuthTokenTransport = 'body' | 'cookie';

export const AUTH_TOKEN_TRANSPORT: AuthTokenTransport = 'body';

export const usesBodyTokenTransport = true;
export const usesCookieTokenTransport = false;
