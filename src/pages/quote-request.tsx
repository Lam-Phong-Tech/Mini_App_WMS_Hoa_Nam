import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "zmp-ui";

import { getSafeReturnPath, getVisibleVariants, isEligiblePublicProduct, visibleText } from "@/catalogue/catalogue-utils";
import { CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { useProductDetail } from "@/hooks/use-product-detail";
import { useLibraryProducts } from "@/hooks/use-library-products";
import { getFoundationRoute } from "@/routes";
import { createQuoteIdempotencyKeyTracker, createQuoteSubmissionGuard, getVietnamesePhoneValidationError, QuoteDraftInput, validateQuoteDraft } from "@/services/quote-service";
import { useAppContext } from "@/state/app-context";
import { QuoteRamDraft, useQuoteWorkflow } from "@/state/quote-workflow-context";
import { createLoadingState, getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure, VariantDto, isApiSuccess } from "@/types/public-api";

const route = getFoundationRoute("quote-request");
const inputError = (errors: Record<string, string[]>, field: string): string | null => errors[field]?.[0] ?? null;

const QuoteRequestPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { api, config, phase, systemState, refresh } = useAppContext();
  const detail = useProductDetail(api, slug);
  const {
    selectedItems,
    selectedProductSnapshots,
    addSelectedItem,
    removeSelectedItem,
    rememberSelectedProducts,
    draft: savedDraft,
    setDraft,
    addReceipt,
  } = useQuoteWorkflow();
  const [form, setForm] = useState<QuoteRamDraft>(savedDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [responseFailure, setResponseFailure] = useState<ApiFailure | null>(null);
  const [acceptedRequestId, setAcceptedRequestId] = useState<string | null>(null);
  const idempotencyKeys = useRef(createQuoteIdempotencyKeyTracker());
  const guard = useRef(createQuoteSubmissionGuard());
  const returnPath = getSafeReturnPath(location.search) ?? (slug ? `/products/${slug}` : "/selection");
  const selectedVariantId = new URLSearchParams(location.search).get("variant_id");
  const variants = useMemo(() => getVisibleVariants(detail.product?.variants), [detail.product?.variants]);
  const selectedVariant: VariantDto | null = variants.find((variant) => variant.variant_id === selectedVariantId) ?? variants[0] ?? null;
  // Quote selection is RAM-only. A successful missing_ids result must not
  // mutate it silently; the customer explicitly removes an unavailable item.
  const ignoreMissingSelectionIds = useCallback(() => undefined, []);
  const selectedProducts = useLibraryProducts(api, selectedItems.map((item) => item.product_id), ignoreMissingSelectionIds);
  const directSelectionPending = Boolean(
    slug
    && detail.product
    && isEligiblePublicProduct(detail.product)
    && !selectedItems.some((item) => item.product_id === detail.product?.product_id),
  );

  useEffect(() => setForm(savedDraft), [savedDraft]);

  useEffect(() => {
    if (!slug || !detail.product || !isEligiblePublicProduct(detail.product)) return;
    addSelectedItem({ product_id: detail.product.product_id, variant_id: selectedVariant?.variant_id ?? null, quantity: null });
    rememberSelectedProducts([{ product_id: detail.product.product_id, name: detail.product.name, model: detail.product.model ?? null }]);
  }, [addSelectedItem, detail.product, rememberSelectedProducts, selectedVariant?.variant_id, slug]);

  const update = (field: keyof QuoteRamDraft, value: string | boolean) => {
    const next = { ...form, [field]: value } as QuoteRamDraft;
    setForm(next);
    setDraft(next);
    setFieldErrors((current) => ({ ...current, [field]: [] }));
    setResponseFailure(null);
  };

  const draft: QuoteDraftInput = {
    items: selectedItems,
    full_name: form.full_name,
    phone: form.phone,
    note: form.note,
    consent: form.consent,
    privacy_version: config?.privacy_version ?? "",
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || acceptedRequestId) return;
    const validation = validateQuoteDraft(draft);
    setFieldErrors(validation.errors);
    if (!validation.valid || !validation.value || !config?.privacy_policy_url || !selectedProductsReady) return;
    setSubmitting(true);
    setResponseFailure(null);
    const response = await guard.current.submit(api, draft, idempotencyKeys.current.getKey(validation.value));
    setSubmitting(false);
    if (isApiSuccess(response) && response.data.status === "RECEIVED" && response.data.request_id) {
      addReceipt({
        request_id: response.data.request_id,
        status: response.data.status,
        items: validation.value.items,
        products: selectedItems.map((item) => {
          const product = selectedProducts.products.find((candidate) => candidate.product_id === item.product_id)
            ?? selectedProductSnapshots.find((candidate) => candidate.product_id === item.product_id);
          return { product_id: item.product_id, name: product?.name ?? "Sản phẩm đã chọn", model: product?.model ?? null };
        }),
      });
      setAcceptedRequestId(response.data.request_id);
      return;
    }
    if (!isApiSuccess(response)) {
      if (response.errors) setFieldErrors(response.errors);
      setResponseFailure(response);
    }
  };

  if (phase === "loading") return <AppShell route={route}><SystemStatePanel state={createLoadingState()} /></AppShell>;
  if (systemState) return <AppShell route={route}><SystemStatePanel state={systemState} onRetry={() => void refresh()} /></AppShell>;
  if (slug && detail.phase === "loading") return <AppShell route={route}><CatalogueSkeleton cards={1} /></AppShell>;
  if (slug && (!detail.product || detail.failure || !isEligiblePublicProduct(detail.product))) {
    return <AppShell route={route}><SystemStatePanel state={detail.failure ? getSystemStateForFailure(detail.failure) : { kind: "unavailable", title: "Sản phẩm hiện không khả dụng", message: "Không thể tạo yêu cầu cho sản phẩm này." }} onRetry={() => void detail.reload()} /></AppShell>;
  }

  if (acceptedRequestId) {
    return <AppShell route={route}>
      <section className="quote-success" aria-live="polite">
        <span className="quote-success__icon"><UiIcon name="check" size={27} strokeWidth={2.5} /></span>
        <h2>Đã tiếp nhận yêu cầu tư vấn</h2>
        <p>Mã yêu cầu: <strong>{acceptedRequestId}</strong></p>
        <p>Thông tin chỉ được lưu trong lần mở app này. Xóa khỏi màn hình không hủy yêu cầu đã tiếp nhận.</p>
        <button type="button" className="quote-submit" onClick={() => navigate("/requests", { animate: false })}>Xem yêu cầu đã gửi</button>
      </section>
    </AppShell>;
  }

  if (!selectedItems.length && directSelectionPending) {
    return <AppShell route={route}><CatalogueSkeleton cards={1} /></AppShell>;
  }

  if (!selectedItems.length) {
    return <AppShell route={route}><SystemStatePanel state={{ kind: "empty", title: "Chưa chọn sản phẩm", message: "Chọn ít nhất một sản phẩm trước khi gửi yêu cầu tư vấn." }} /><button className="quote-submit" type="button" onClick={() => navigate("/selection", { animate: false })}>Chọn sản phẩm</button></AppShell>;
  }

  const responseState = responseFailure ? getSystemStateForFailure(responseFailure) : null;
  const privacyReady = Boolean(config?.privacy_version && config?.privacy_policy_url);
  const snapshotsCoverSelection = selectedItems.every((item) => selectedProductSnapshots.some((product) => product.product_id === item.product_id));
  const selectedProductsUnavailable = selectedProducts.phase === "ready"
    && !selectedProducts.failure
    && selectedProducts.products.length !== selectedItems.length;
  // A successful ID lookup is authoritative: missing records must still be
  // removed by the customer. Snapshots only bridge transient transport errors
  // after Compare, never make an unavailable product appear valid.
  const selectedProductsReady = selectedProducts.phase === "ready"
    && !selectedProductsUnavailable
    && (selectedProducts.products.length === selectedItems.length || Boolean(selectedProducts.failure && snapshotsCoverSelection));
  return <AppShell route={route}>
    <section className="quote-screen" aria-labelledby="quote-screen-title">
      <button type="button" className="quote-screen__back" onClick={() => navigate(returnPath, { animate: false })}><UiIcon name="arrowLeft" size={19} />Quay lại</button>
      <header className="quote-screen__heading">
        <span>TRAO ĐỔI NHU CẦU CỦA BẠN</span>
        <h1 id="quote-screen-title">Gửi yêu cầu tư vấn</h1>
        <p>Chọn sản phẩm và để lại thông tin để nhân viên Hoa Nam hỗ trợ bạn.</p>
      </header>
      <div className="quote-screen__layout">
      <aside className="quote-context">
      <h2>Sản phẩm của bạn</h2>
      <p className="quote-context__count">{selectedItems.length} sản phẩm đã chọn</p>
      <ul className="quote-selected-items">
        {selectedItems.map((item) => {
          const product = selectedProducts.products.find((candidate) => candidate.product_id === item.product_id);
          const snapshot = selectedProductSnapshots.find((candidate) => candidate.product_id === item.product_id);
          const label = product
            ? (visibleText(product.model) ?? visibleText(product.name) ?? "Sản phẩm đã chọn")
            : snapshot
              ? (visibleText(snapshot.model) ?? visibleText(snapshot.name) ?? "Sản phẩm đã chọn")
            : selectedProducts.phase === "loading"
              ? "Đang kiểm tra sản phẩm…"
              : "Sản phẩm không còn khả dụng";
          return <li key={item.product_id}><span>{label}</span><button type="button" disabled={submitting} onClick={() => removeSelectedItem(item.product_id)} aria-label={`Bỏ sản phẩm ${label}`}>Bỏ</button></li>;
        })}
      </ul>
      <button type="button" className="quote-edit-selection" disabled={submitting} onClick={() => navigate("/selection", { animate: false })}>Sửa danh sách sản phẩm</button>
      {config?.privacy_policy_url ? <a className="privacy-link" href={config.privacy_policy_url}>Xem Chính sách sử dụng thông tin</a> : null}
      </aside>
    {responseState ? <SystemStatePanel state={responseState} onRetry={() => setResponseFailure(null)} /> : null}
    {selectedProducts.failure && !snapshotsCoverSelection ? <SystemStatePanel state={getSystemStateForFailure(selectedProducts.failure)} onRetry={selectedProducts.reload} /> : null}
    {selectedProducts.failure && snapshotsCoverSelection ? <div className="quote-selection-note" role="status"><UiIcon name="info" size={16} /><span>Chưa thể kiểm tra lại sản phẩm vừa chọn. Thông tin hiện có vẫn được giữ để bạn tiếp tục gửi yêu cầu.</span><button type="button" onClick={() => void selectedProducts.reload()}>Thử lại</button></div> : null}
    <form className="quote-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="quote-form__heading"><h2>Thông tin liên hệ</h2><p>Các trường có dấu * cần được điền.</p></div>
      <label>Họ và tên <span className="required-mark" aria-hidden="true">*</span><input value={form.full_name} onChange={(event) => update("full_name", event.target.value)} maxLength={100} autoComplete="name" disabled={submitting} aria-invalid={Boolean(inputError(fieldErrors, "full_name"))} placeholder="Nhập họ và tên của bạn" />{inputError(fieldErrors, "full_name") ? <span className="field-error">{inputError(fieldErrors, "full_name")}</span> : null}</label>
      <label><span className="field-label">Số điện thoại <span className="required-mark" aria-hidden="true">*</span></span><input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value.slice(0, 30))} onBlur={(event) => { const error = getVietnamesePhoneValidationError(event.target.value); setFieldErrors((current) => ({ ...current, phone: error ? [error] : [] })); }} inputMode="tel" autoComplete="tel" maxLength={30} required disabled={submitting} aria-required="true" aria-invalid={Boolean(inputError(fieldErrors, "phone"))} />{inputError(fieldErrors, "phone") ? <span className="field-error">{inputError(fieldErrors, "phone")}</span> : null}</label>
      <label>Ghi chú (không bắt buộc)<textarea value={form.note} onChange={(event) => update("note", event.target.value)} maxLength={1000} rows={4} disabled={submitting} /><span className="field-hint">{form.note.length}/1000</span>{inputError(fieldErrors, "note") ? <span className="field-error">{inputError(fieldErrors, "note")}</span> : null}</label>
      <label className="consent-field"><input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} disabled={submitting} aria-invalid={Boolean(inputError(fieldErrors, "consent"))} /><span>Tôi đồng ý để Hoa Nam sử dụng họ tên, số điện thoại, sản phẩm quan tâm và ghi chú tôi cung cấp nhằm tiếp nhận yêu cầu và liên hệ tư vấn theo Chính sách sử dụng thông tin.</span>{inputError(fieldErrors, "consent") ? <span className="field-error">{inputError(fieldErrors, "consent")}</span> : null}</label>
      {!privacyReady ? <p className="field-error">Chính sách dữ liệu chưa sẵn sàng. Nội dung bạn nhập vẫn được giữ trên màn hình.</p> : null}
      {inputError(fieldErrors, "privacy_version") ? <p className="field-error">{inputError(fieldErrors, "privacy_version")}</p> : null}
      <p className="privacy-version">Phiên bản chính sách: {config?.privacy_version ?? "Chưa được cấu hình"}</p>
      {selectedProducts.phase === "loading" ? <p className="field-hint">Đang kiểm tra sản phẩm đã chọn…</p> : null}
      {selectedProductsUnavailable ? <p className="field-error" role="alert">Một hoặc nhiều sản phẩm đã chọn không còn khả dụng. Hãy sửa danh sách trước khi gửi yêu cầu.</p> : null}
      <button className="quote-submit" type="submit" disabled={submitting || !privacyReady || !selectedProductsReady} aria-busy={submitting}>{submitting ? "Đang gửi yêu cầu…" : "Gửi yêu cầu tư vấn"}</button>
    </form>
      </div>
    </section>
  </AppShell>;
};

export default QuoteRequestPage;
