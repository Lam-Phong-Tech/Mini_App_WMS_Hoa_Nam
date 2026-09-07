import { describe, expect, it } from "vitest";

import { DevQuotePersistenceMock } from "@/services/dev-quote-mock";
import { isApiSuccess } from "@/types/public-api";

const input = {
  product_id: "product-1",
  variant_id: "variant-1",
  full_name: "Nguyễn Văn A",
  phone: "+84912345678",
  province_code: "HCM",
  note: "Xin tư vấn",
  consent: true as const,
  privacy_version: "2026-08",
};

describe("DEV quote persistence contract", () => {
  it("accepts eligible products and replays the same request id", () => {
    const mock = new DevQuotePersistenceMock(() => true);
    const first = mock.submit(input, "dev-idempotency-key-001");
    const replay = mock.submit({ ...input, phone: "0912345678" }, "dev-idempotency-key-001");
    expect(isApiSuccess(first)).toBe(true);
    expect(isApiSuccess(replay)).toBe(true);
    if (isApiSuccess(first) && isApiSuccess(replay)) {
      expect(first.data).toEqual(replay.data);
      expect(replay.meta.idempotent_replay).toBe(true);
    }
    expect(mock.getRecordCount()).toBe(1);
  });

  it("rejects the same key with a different payload as a conflict", () => {
    const mock = new DevQuotePersistenceMock(() => true);
    mock.submit(input, "dev-idempotency-key-002");
    const conflict = mock.submit({ ...input, note: "Nội dung khác" }, "dev-idempotency-key-002");
    expect(isApiSuccess(conflict) ? null : conflict.error_code).toBe("IDEMPOTENCY_CONFLICT");
    expect(mock.getRecordCount()).toBe(1);
  });

  it("returns PRODUCT_NOT_AVAILABLE when product or variant is no longer eligible", () => {
    const mock = new DevQuotePersistenceMock(() => false);
    const result = mock.submit(input, "dev-idempotency-key-003");
    expect(isApiSuccess(result) ? null : result.error_code).toBe("PRODUCT_NOT_AVAILABLE");
    expect(mock.getRecordCount()).toBe(0);
  });
});
