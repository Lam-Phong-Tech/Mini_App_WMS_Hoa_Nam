/** A scanned value is an opaque GET search term, never a route or command. */
export function documentScanQuery(
  raw: unknown,
): { value: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Chưa đọc được mã chứng từ.' };
  const value = raw.trim();
  if (
    !value ||
    value.length > 1200 ||
    Array.from(value).some(
      c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    Array.from(value).length > 600 ||
    Array.from(value.normalize('NFC').toLowerCase()).length > 200
  )
    return { error: 'Mã chứng từ phải có từ 1 đến 200 ký tự hợp lệ.' };
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|javascript:|data:|file:)/i.test(value))
    return {
      error:
        'QR chứa liên kết chưa được hỗ trợ. Hãy quét mã chứng từ, không phải URL.',
    };
  return { value };
}
