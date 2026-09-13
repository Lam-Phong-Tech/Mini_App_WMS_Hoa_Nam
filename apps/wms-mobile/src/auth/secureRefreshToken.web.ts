/** Browser preview has no Android Keystore. Keep the refresh token in memory
 * only, so closing/reloading the browser never writes it to localStorage. */

let volatileToken: string | undefined;

export async function readSecureRefreshToken(): Promise<string | undefined> {
  return volatileToken;
}

export async function writeSecureRefreshToken(token: string): Promise<void> {
  const normalized = token.trim();
  if (normalized === '') throw new Error('Refresh token trống.');
  volatileToken = normalized;
}

export async function clearSecureRefreshToken(): Promise<void> {
  volatileToken = undefined;
}
