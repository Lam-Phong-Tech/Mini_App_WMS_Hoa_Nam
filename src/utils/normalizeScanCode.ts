export function normalizeScanCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}
