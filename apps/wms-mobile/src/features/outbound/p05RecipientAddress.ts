// Snapshot display/data mapping only. Never infer v2 ward codes from legacy text.
export function p05RecipientAddress(raw: string): {
  detail: string;
  province?: string;
  ward?: string;
} {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const a = v as Record<string, unknown>,
        code = (x: unknown) =>
          typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
            ? String(x)
            : typeof x === 'string' && /^\d+$/.test(x)
            ? x
            : undefined;
      if (
        typeof a.detail === 'string' &&
        code(a.province_code) &&
        code(a.ward_code)
      )
        return {
          detail: a.detail,
          province: code(a.province_code),
          ward: code(a.ward_code),
        };
    }
  } catch {
    /* TEXT addresses stay exact. */
  }
  return { detail: raw };
}
