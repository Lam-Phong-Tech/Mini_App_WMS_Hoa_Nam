/** Display-only wording for the confirmed SKU_INACTIVE business error. */
export function skuInactiveMessage(
  code: string | undefined | null,
  fallback: string,
  skuCode?: string | null,
): string {
  if (code !== 'SKU_INACTIVE') return fallback;
  const label = skuCode?.trim();
  return `Sản phẩm${
    label ? ` ${label}` : ' này'
  } đang ngừng hoạt động. Liên hệ quản trị để kiểm tra.`;
}

/** Read the authoritative identifier, never an API field label or status label. */
export function skuCodeFromErrorBody(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error;
  const nested =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>).details
      : undefined;
  for (const details of [nested, record.errors]) {
    if (typeof details !== 'object' || details === null) continue;
    const skuCode = (details as Record<string, unknown>).sku_code;
    if (typeof skuCode === 'string' && skuCode.trim()) return skuCode;
  }
  return undefined;
}
