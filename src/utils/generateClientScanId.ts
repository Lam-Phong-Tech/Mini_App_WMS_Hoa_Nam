export function generateClientScanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
