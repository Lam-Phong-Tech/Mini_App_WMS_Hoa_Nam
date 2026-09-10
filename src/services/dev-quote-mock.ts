import { createSafeFailure } from "@/services/api-client";
import {
  ApiEnvelope,
  ApiMeta,
  QuoteAcceptedDto,
  QuoteRequestInput,
  QuoteRequestItemInput,
} from "@/types/public-api";
import { getQuoteFingerprint, normalizeVietnamesePhone } from "@/services/quote-service";

/**
 * DEV/TEST-only persistence contract. This is never wired to UAT/Production and
 * stores exactly the G0 quote columns; it has no lifecycle/status/downstream fields.
 */
export interface DevQuoteRecord {
  id: string;
  request_id: string;
  idempotency_key: string;
  items: QuoteRequestItemInput[];
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
    if (!input.items.length || input.items.some((item) => !this.isEligible(item.product_id, item.variant_id ?? null))) {
      return createSafeFailure("PRODUCT_NOT_AVAILABLE");
    }

    const normalized = {
      ...input,
      items: input.items
        .map((item) => ({ product_id: item.product_id.trim(), variant_id: item.variant_id?.trim() || null, quantity: item.quantity ?? null }))
        .sort((left, right) => `${left.product_id}\u0000${left.variant_id ?? ""}`.localeCompare(`${right.product_id}\u0000${right.variant_id ?? ""}`)),
      full_name: input.full_name.trim(),
      phone: normalizeVietnamesePhone(input.phone),
      note: input.note?.trim() || null,
    };
    const fingerprint = getQuoteFingerprint(normalized);
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
      items: normalized.items,
      full_name: normalized.full_name,
      phone_normalized: normalized.phone,
      province_code: null,
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
