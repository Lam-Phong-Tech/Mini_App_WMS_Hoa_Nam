import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { PublicImage } from "@/components/catalogue/public-image";
import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { getAvailabilityLabel, getPublicProducts, isPreorderAvailability, visibleText } from "@/catalogue/catalogue-utils";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useProductLibrary } from "@/state/product-library-context";
import { useQuoteWorkflow } from "@/state/quote-workflow-context";
import { getSystemStateForFailure } from "@/state/system-state";
import { useLibraryProducts } from "@/hooks/use-library-products";
import { ApiFailure, ProductCardDto, isApiSuccess } from "@/types/public-api";

const route = getFoundationRoute("selection");

const ProductSelectionPage = () => {
  const navigate = useNavigate();
  const { api, home } = useAppContext();
  const { savedIds, reconcileMissing } = useProductLibrary();
  const { selectedItems, setSelectedItems, rememberSelectedProducts } = useQuoteWorkflow();
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [products, setProducts] = useState<ProductCardDto[]>([]);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const savedProducts = useLibraryProducts(api, onlySaved ? savedIds : [], reconcileMissing);

  useEffect(() => {
    let active = true;
    if (onlySaved) {
      setProducts([]);
      setFailure(null);
      setPhase("ready");
      return () => { active = false; };
    }
    setPhase("loading");
    setFailure(null);
    const timer = window.setTimeout(() => {
      void api.getProducts({ q: query.trim() || undefined, limit: 50 }).then((response) => {
        if (!active) return;
        setProducts(isApiSuccess(response) ? response.data : []);
        setFailure(isApiSuccess(response) ? null : response);
        setPhase("ready");
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, onlySaved, query, reloadToken]);

  const selectedIds = useMemo(() => new Set(selectedItems.map((item) => item.product_id)), [selectedItems]);
  const homeProducts = useMemo(() => {
    const seen = new Set<string>();
    return (home?.sections ?? []).reduce<ProductCardDto[]>((all, section) => {
      const sectionProducts = getPublicProducts(section.items.filter((item): item is ProductCardDto => "product_id" in item));
      sectionProducts.forEach((product) => {
        if (seen.has(product.product_id)) return;
        seen.add(product.product_id);
        all.push(product);
      });
      return all;
    }, []);
  }, [home]);
  // A list row without the required public domain is deliberately rejected by
  // the adapter. Keep selection usable with the current, valid Home records;
  // never infer a domain from a category code or use fixture data.
  const usesHomeFallback = !onlySaved && phase === "ready" && !failure && !products.length && Boolean(homeProducts.length);
  const catalogueProducts = products.length ? products : homeProducts;
  const visibleProducts = onlySaved
    ? savedProducts.products.filter((product) => `${product.name} ${product.model ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : catalogueProducts.filter((product) => `${product.name} ${product.model ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const toggle = (product: ProductCardDto, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, { product_id: product.product_id, variant_id: null, quantity: null }]);
      rememberSelectedProducts([{ product_id: product.product_id, name: product.name, model: product.model ?? null }]);
    }
    else setSelectedItems(selectedItems.filter((item) => item.product_id !== product.product_id));
  };

  return (
    <AppShell route={route}>
      <section className="selection-heading">
        <p className="info-card__eyebrow">YÊU CẦU TƯ VẤN</p>
        <h2>Chọn sản phẩm quan tâm</h2>
        <p>Chọn từ 1 đến 20 sản phẩm để gửi trong cùng một yêu cầu.</p>
      </section>
      <label className="selection-search">
        <UiIcon name="search" size={19} />
        <span className="sr-only">Tìm sản phẩm để thêm vào yêu cầu</span>
        <input value={query} type="search" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Tìm tên hoặc model" />
      </label>
      <div className="selection-toolbar">
        <button type="button" className={onlySaved ? "is-active" : ""} aria-pressed={onlySaved} onClick={() => setOnlySaved((current) => !current)}><UiIcon name="bookmark" size={16} />Chỉ sản phẩm đã lưu</button>
        <output>{selectedItems.length}/20 đã chọn</output>
      </div>
      {phase === "loading" ? <CatalogueSkeleton cards={2} /> : null}
      {failure ? <SystemStatePanel state={getSystemStateForFailure(failure)} onRetry={() => setReloadToken((current) => current + 1)} /> : null}
      {onlySaved && savedProducts.failure ? <SystemStatePanel state={getSystemStateForFailure(savedProducts.failure)} onRetry={savedProducts.reload} /> : null}
      {usesHomeFallback ? <p className="library-storage-note"><UiIcon name="info" size={16} />Danh sách đang dùng các sản phẩm có nhóm hợp lệ từ Catalogue công khai.</p> : null}
      {!failure && !savedProducts.failure && phase === "ready" && savedProducts.phase !== "loading" && !visibleProducts.length ? <EmptyCatalogue title={onlySaved ? "Chưa có sản phẩm đã lưu" : "Không tìm thấy sản phẩm"} message={onlySaved ? "Lưu sản phẩm trước rồi quay lại để chọn." : "Thử tên hoặc model khác."} /> : null}
      <div className="selection-list" aria-label="Danh sách chọn sản phẩm">
        {visibleProducts.map((product) => {
          const checked = selectedIds.has(product.product_id);
          const preorder = isPreorderAvailability(product.availability);
          return <label key={product.product_id} className={`selection-product${checked ? " is-selected" : ""}`}>
            <PublicImage media={product.cover_media} alt={product.name} />
            <span>
              <strong>{visibleText(product.model) ?? visibleText(product.name)}</strong>
              <small>{visibleText(product.name)}</small>
              <em className={preorder ? "is-preorder" : ""}>{getAvailabilityLabel(product.availability)}</em>
            </span>
            <input type="checkbox" checked={checked} disabled={!checked && selectedItems.length >= 20} onChange={(event) => toggle(product, event.target.checked)} aria-label={`Chọn ${product.name}`} />
          </label>;
        })}
      </div>
      <section className="selection-summary" aria-live="polite">
        <strong>Danh sách yêu cầu: {selectedItems.length} sản phẩm</strong>
        <p>Bạn có thể quay lại chỉnh sửa danh sách trước khi gửi.</p>
        <button type="button" disabled={!selectedItems.length} onClick={() => navigate("/quote", { animate: false })}>Tiếp tục</button>
      </section>
    </AppShell>
  );
};

export default ProductSelectionPage;
