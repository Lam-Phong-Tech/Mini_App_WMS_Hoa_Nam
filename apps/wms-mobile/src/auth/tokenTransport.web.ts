/**
 * Kênh phiên của Web preview.
 *
 * Backend DEV chỉ cho browser nhận refresh token bằng cookie HttpOnly. Không
 * được gửi `X-WMS-Token-Transport: body` từ Web: BE sẽ trả 403
 * `TOKEN_TRANSPORT_NOT_ALLOWED`. Cookie cùng origin được fetch tự gửi qua
 * Vite proxy; JavaScript không đọc, lưu hoặc đưa refresh token vào body.
 */

export type AuthTokenTransport = 'body' | 'cookie';

export const AUTH_TOKEN_TRANSPORT: AuthTokenTransport = 'cookie';

export const usesBodyTokenTransport = false;
export const usesCookieTokenTransport = true;
