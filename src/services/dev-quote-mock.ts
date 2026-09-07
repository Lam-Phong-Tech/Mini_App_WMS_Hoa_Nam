import { createSafeFailure } from "@/services/api-client";
import {
  ApiEnvelope,
  ApiMeta,
  QuoteAcceptedDto,
  QuoteRequestInput,
} from "@/types/public-api";

/**
 * DEV/TEST-only persistence contract. This is never wired to UAT/Production and
 * stores exactly the G0 quote columns; it has no lifecycle/status/downstream fields.
 */
export interface DevQuoteRecord {
  id: string;
  request_id: string;
  idempotency_key: string;
  product_id: string;
  variant_id: string | null;
  full_name: string;
  phone_normalized: string;
  province_code: string | null;
  note: string | null;
  consent_at: string;
  privacy_version: string;
  source: "ZALO_MINI_APP";
  created_at: string;
  updated_at: string;
}

type EligibilityCheck = (productId: string, variantId: string | null) => boolean;

const accepted = (requestId: string, meta: ApiMeta = {}): ApiEnvelope<QuoteAcceptedDto> => ({
  success: true,
  message: "Yêu cầu đã được tiếp nhận.",
  data: { request_id: requestId, status: "RECEIVED" },
  meta,
  error_code: null,
  errors: null,
});

export class DevQuotePersistenceMock {
  private readonly records = new Map<string, DevQuoteRecord>();
  private readonly fingerprints = new Map<string, string>();
  private sequence = 0;

  constructor(private readonly isEligible: EligibilityCheck) {}

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  submit(
    input: QuoteRequestInput,
    idempotencyKey: string,
  ): ApiEnvelope<QuoteAcceptedDto> {
    if (!this.isEligible(input.product_id, input.variant_id ?? null)) {
      return createSafeFailure("PRODUCT_NOT_AVAILABLE");
    }

    const normalized = {
      ...input,
      product_id: input.product_id.trim(),
      variant_id: input.variant_id?.trim() || null,
      full_name: input.full_name.trim(),
      phone: input.phone.trim().startsWith("0") ? `+84${input.phone.trim().slice(1)}` : input.phone.trim(),
      province_code: input.province_code?.trim().toUpperCase() || null,
      note: input.note?.trim() || null,
    };
    const fingerprint = JSON.stringify(normalized);
    const previousFingerprint = this.fingerprints.get(idempotencyKey);
    if (previousFingerprint && previousFingerprint !== fingerprint) return createSafeFailure("IDEMPOTENCY_CONFLICT");
    if (previousFingerprint) {
      const existing = this.records.get(idempotencyKey);
      return accepted(existing?.request_id ?? "", { idempotent_replay: true });
    }

    const now = new Date().toISOString();
    const record: DevQuoteRecord = {
      id: this.nextId("dev-record"),
      request_id: this.nextId("dev-request"),
      idempotency_key: idempotencyKey,
      product_id: normalized.product_id,
      variant_id: normalized.variant_id,
      full_name: normalized.full_name,
      phone_normalized: normalized.phone,
      province_code: normalized.province_code,
      note: normalized.note,
      consent_at: now,
      privacy_version: normalized.privacy_version,
      source: "ZALO_MINI_APP",
      created_at: now,
      updated_at: now,
    };
    this.records.set(idempotencyKey, record);
    this.fingerprints.set(idempotencyKey, fingerprint);
    return accepted(record.request_id, { request_id: record.request_id });
  }

  getRecordCount(): number {
    return this.records.size;
  }
}
