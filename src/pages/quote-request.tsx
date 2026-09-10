import { FormEvent, useMemo, useRef, useState } from "react";
import { Button, useLocation, useNavigate, useParams } from "zmp-ui";

import { getAvailabilityLabel, getSafeReturnPath, getVisibleVariants, isEligiblePublicProduct, isPreorderAvailability, visibleText } from "@/catalogue/catalogue-utils";
import { CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { ContactActions } from "@/components/catalogue/contact-actions";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useProductDetail } from "@/hooks/use-product-detail";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createQuoteIdempotencyKeyTracker, createQuoteSubmissionGuard, getVietnamesePhoneValidationError, QuoteDraftInput, validateQuoteDraft } from "@/services/quote-service";
import { createLoadingState, getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure, VariantDto, isApiSuccess } from "@/types/public-api";

const quoteRoute = getFoundationRoute("quote-request");

interface QuoteFormState {
  full_name: string;
  phone: string;
  note: string;
  consent: boolean;
}

const EMPTY_FORM: QuoteFormState = { full_name: "", phone: "", note: "", consent: false };

const inputError = (errors: Record<string, string[]>, field: string): string | null => errors[field]?.[0] ?? null;

const QuoteRequestPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { api, config, phase, systemState, refresh } = useAppContext();
  const detail = useProductDetail(api, slug);
  const [form, setForm] = useState<QuoteFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [responseFailure, setResponseFailure] = useState<ApiFailure | null>(null);
  const [acceptedRequestId, setAcceptedRequestId] = useState<string | null>(null);
  const idempotencyKeys = useRef(createQuoteIdempotencyKeyTracker());
  const guard = useRef(createQuoteSubmissionGuard());
  const returnPath = getSafeReturnPath(location.search) ?? (slug ? `/products/${slug}` : "/products");
  const selectedVariantId = new URLSearchParams(location.search).get("variant_id");
  const variants = useMemo(() => getVisibleVariants(detail.product?.variants), [detail.product?.variants]);
  const selectedVariant: VariantDto | null = variants.find((variant) => variant.variant_id === selectedVariantId) ?? variants[0] ?? null;
  const privacyVersion = config?.privacy_version ?? "";

  if (phase === "loading") return <AppShell route={quoteRoute}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  if (systemState) return <AppShell route={quoteRoute}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  if (detail.phase === "loading") return <AppShell route={quoteRoute}><CatalogueSkeleton cards={1} /></AppShell>;
  if (!detail.product || detail.failure || !isEligiblePublicProduct(detail.product)) {
    return <AppShell route={quoteRoute}><SystemStatePanel state={detail.failure ? getSystemStateForFailure(detail.failure) : { kind: "unavailable", title: "Sản phẩm hiện không khả dụng", message: "Không thể tạo yêu cầu cho sản phẩm này." }} onRetry={() => void detail.reload()} /><ContactActions config={config} /></AppShell>;
  }

  const product = detail.product;
  const isPreorder = isPreorderAvailability(product.availability);
  const requestLabel = isPreorder ? "đặt trước" : "tư vấn";
  const draft: QuoteDraftInput = {
    items: [{
      product_id: product.product_id,
      variant_id: selectedVariant?.variant_id ?? null,
      quantity: null,
    }],
    full_name: form.full_name,
    phone: form.phone,
    note: form.note,
    consent: form.consent,
    privacy_version: privacyVersion,
  };

  const update = (field: keyof QuoteFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
    setResponseFailure(null);
  };

  const validatePhoneField = (phone: string) => {
    const error = getVietnamesePhoneValidationError(phone);
    setFieldErrors((current) => ({ ...current, phone: error ? [error] : [] }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || acceptedRequestId) return;
    const validation = validateQuoteDraft(draft);
    setFieldErrors(validation.errors);
    if (!validation.valid || !validation.value) return;

    setSubmitting(true);
    setResponseFailure(null);
    const response = await guard.current.submit(api, draft, idempotencyKeys.current.getKey(validation.value));
    setSubmitting(false);
    if (isApiSuccess(response)) setAcceptedRequestId(response.data.request_id);
    else {
      if (response.errors) {
        setFieldErrors(response.errors);
      }
      setResponseFailure(response);
    }
  };

  if (acceptedRequestId) {
    return (
      <AppShell route={quoteRoute}>
        <section className="quote-success" aria-live="polite">
          <span className="quote-success__icon"><UiIcon name="check" size={27} strokeWidth={2.5} /></span>
          <h2>Đã tiếp nhận yêu cầu {requestLabel}</h2>
          <p>Mã yêu cầu: <strong>{acceptedRequestId}</strong></p>
          <p>Bộ phận kinh doanh Hoa Nam sẽ sử dụng thông tin bạn cung cấp để liên hệ.</p>
          <Button variant="primary" onClick={() => navigate(returnPath, { animate: false })}>Quay lại sản phẩm</Button>
        </section>
      </AppShell>
    );
  }

  if (responseFailure?.error_code === "PRODUCT_NOT_AVAILABLE") {
    return (
      <AppShell route={quoteRoute}>
        <SystemStatePanel state={getSystemStateForFailure(responseFailure)} onRetry={() => { setResponseFailure(null); void detail.reload(); }} />
        <ContactActions config={config} />
      </AppShell>
    );
  }

  const responseState = responseFailure ? getSystemStateForFailure(responseFailure) : null;

  return (
    <AppShell route={quoteRoute}>
      <button type="button" className="back-link" onClick={() => navigate(returnPath, { animate: false })}>Quay lại sản phẩm</button>
      <section className="quote-context">
        <p className="info-card__eyebrow">SẢN PHẨM CẦN {isPreorder ? "ĐẶT TRƯỚC" : "TƯ VẤN"}</p>
        <h2>{visibleText(product.name)}</h2>
        {visibleText(product.model) ? <p>Model: <strong>{visibleText(product.model)}</strong></p> : null}
        {selectedVariant ? <p>Phiên bản: <strong>{visibleText(selectedVariant.variant_name)}</strong></p> : null}
        <p className="quote-readonly">Tình trạng: <strong>{getAvailabilityLabel(product.availability)}</strong>. Thông tin sản phẩm được giữ nguyên trong yêu cầu.</p>
        {config?.privacy_policy_url ? <a className="privacy-link" href={config.privacy_policy_url}>Xem chính sách dữ liệu</a> : null}
      </section>
      {responseState ? <SystemStatePanel state={responseState} onRetry={() => setResponseFailure(null)} /> : null}
      <form className="quote-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label>
          Họ và tên
          <input value={form.full_name} onChange={(event) => update("full_name", event.target.value)} maxLength={100} autoComplete="name" disabled={submitting} aria-invalid={Boolean(inputError(fieldErrors, "full_name"))} />
          {inputError(fieldErrors, "full_name") ? <span className="field-error">{inputError(fieldErrors, "full_name")}</span> : null}
        </label>
        <label>
          <span className="field-label">Số điện thoại <span className="required-mark" aria-hidden="true">*</span></span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
            onBlur={(event) => validatePhoneField(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel"
            maxLength={10}
            required
            aria-required="true"
            disabled={submitting}
            aria-invalid={Boolean(inputError(fieldErrors, "phone"))}
            aria-describedby={inputError(fieldErrors, "phone") ? "quote-phone-error" : undefined}
          />
          {inputError(fieldErrors, "phone") ? <span id="quote-phone-error" className="field-error">{inputError(fieldErrors, "phone")}</span> : null}
        </label>
        <label>
          Ghi chú (không bắt buộc)
          <textarea value={form.note} onChange={(event) => update("note", event.target.value)} maxLength={1000} rows={4} disabled={submitting} />
          <span className="field-hint">{form.note.length}/1000</span>
          {inputError(fieldErrors, "note") ? <span className="field-error">{inputError(fieldErrors, "note")}</span> : null}
        </label>
        <label className="consent-field">
          <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} disabled={submitting} aria-invalid={Boolean(inputError(fieldErrors, "consent"))} />
          <span>Tôi đồng ý để Hoa Nam sử dụng họ tên, số điện thoại, sản phẩm quan tâm và ghi chú tôi cung cấp nhằm tiếp nhận yêu cầu và liên hệ tư vấn theo Chính sách sử dụng thông tin.</span>
          {inputError(fieldErrors, "consent") ? <span className="field-error">{inputError(fieldErrors, "consent")}</span> : null}
        </label>
        {inputError(fieldErrors, "privacy_version") ? <p className="field-error">{inputError(fieldErrors, "privacy_version")}</p> : null}
        <p className="privacy-version">Phiên bản chính sách: {privacyVersion || "Chưa được cấu hình"}</p>
        <button className="quote-submit" type="submit" disabled={submitting}>
          {submitting ? "Đang gửi yêu cầu…" : isPreorder ? "Gửi yêu cầu đặt trước" : "Gửi yêu cầu tư vấn"}
        </button>
      </form>
    </AppShell>
  );
};

export default QuoteRequestPage;
