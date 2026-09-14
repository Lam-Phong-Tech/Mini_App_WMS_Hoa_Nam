import {
  AUTH_TOKEN_TRANSPORT,
  usesBodyTokenTransport,
  usesCookieTokenTransport,
} from '../src/auth/tokenTransport.web';

describe('Web auth token transport', () => {
  it('dùng cookie HttpOnly, không yêu cầu refresh token trong JSON', () => {
    expect(AUTH_TOKEN_TRANSPORT).toBe('cookie');
    expect(usesCookieTokenTransport).toBe(true);
    expect(usesBodyTokenTransport).toBe(false);
  });
});
