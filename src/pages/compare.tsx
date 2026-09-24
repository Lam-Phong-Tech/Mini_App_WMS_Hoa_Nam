import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import { getAvailabilityLabel, isPreorderAvailability, visibleText } from "@/catalogue/catalogue-utils";
import { AppShell } from "@/components/app-shell";
import { CatalogueSkeleton } from "@/components/catalogue/catalogue-feedback";
import { PublicImage } from "@/components/catalogue/public-image";
import { SystemStatePanel } from "@/components/system-state-panel";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useCompare } from "@/state/compare-context";
import { useQuoteWorkflow } from "@/state/quote-workflow-context";
import { getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure, ProductDetailDto, isApiSuccess } from "@/types/public-api";

const route = getFoundationRoute("compare");

type CompareUsage = {
  productId: string;
  modelLabel: string;
  usage: string | null;
  features: string[];
};

type CompareSpecRow = {
  key: string;
  label: string;
  values: Map<string, string>;
};

type CompareSpecGroup = {
  key: string;
  label: string;
  rows: CompareSpecRow[];
};

const getCompareModelLabel = (product: ProductDetailDto): string =>
  // `model` may describe an entire product series (for example "DongCheng
  // sê-ri DCPL") shared by several selected products. Prefer the public
  // primary code so that each column/row remains an identifiable model.
  visibleText(product.primary_code) ?? visibleText(product.model) ?? visibleText(product.name) ?? "Model sản phẩm";

const getComparisonUsages = (products: ProductDetailDto[]): CompareUsage[] =>
  products.map((product) => {
    const featureLabels = (product.features ?? [])
      .map((feature) => visibleText(feature.label))
      .filter((label): label is string => Boolean(label));

    return {
      productId: product.product_id,
      modelLabel: getCompareModelLabel(product),
      // `usage` is dedicated public catalogue copy. The public description is
      // a safe fallback for catalogues which have not populated it yet.
      usage: visibleText(product.usage) ?? visibleText(product.description),
      features: Array.from(new Set(featureLabels)),
    };
  });

const getComparisonSpecGroups = (products: ProductDetailDto[]): CompareSpecGroup[] => {
  const groups = new Map<string, CompareSpecGroup>();

  products.forEach((product) => {
    (product.spec_groups ?? []).forEach((group, groupIndex) => {
      const groupLabel = visibleText(group.label) ?? "Thông số kỹ thuật";
      const groupKey = visibleText(group.code)?.toLocaleLowerCase() ?? `${groupLabel.toLocaleLowerCase()}-${groupIndex}`;
      let comparedGroup = groups.get(groupKey);
      if (!comparedGroup) {
        comparedGroup = { key: groupKey, label: groupLabel, rows: [] };
        groups.set(groupKey, comparedGroup);
      }

      (group.items ?? []).forEach((item, itemIndex) => {
        const label = visibleText(item.label);
        const value = visibleText(item.value);
        if (!label || !value) return;

        const unit = visibleText(item.unit);
        const rowKey = visibleText(item.code)?.toLocaleLowerCase() ?? `${label.toLocaleLowerCase()}-${itemIndex}`;
        let row = comparedGroup.rows.find((candidate) => candidate.key === rowKey);
        if (!row) {
          row = { key: rowKey, label, values: new Map<string, string>() };
          comparedGroup.rows.push(row);
        }
        row.values.set(product.product_id, unit ? `${value} ${unit}` : value);
      });
    });
  });

  return Array.from(groups.values()).filter((group) => group.rows.length > 0);
};

const ComparePage = () => {
  const navigate = useNavigate();
  const { api } = useAppContext();
  const { items, clear, toggle } = useCompare();
  const { setSelectedItems, rememberSelectedProducts } = useQuoteWorkflow();
  const [phase, setPhase] = useState<"loading" | "ready">("ready");
  const [products, setProducts] = useState<ProductDetailDto[]>([]);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    if (!items.length) {
      setProducts([]);
      setFailure(null);
      setPhase("ready");
      return () => { active = false; };
    }

    setPhase("loading");
    setFailure(null);
    void Promise.all(items.map((item) => api.getProduct(item.slug))).then((responses) => {
      if (!active) return;
      setProducts(responses.reduce<ProductDetailDto[]>(
        (all, response) => isApiSuccess(response) ? all.concat(response.data) : all,
        [],
      ));
      setFailure(responses.find((response): response is ApiFailure => !isApiSuccess(response)) ?? null);
      setPhase("ready");
    });
    return () => { active = false; };
  }, [api, items, reloadToken]);

  const categoryName = useMemo(
    () => visibleText(products[0]?.category.display_name) ?? "Danh mục sản phẩm",
    [products],
  );
  const comparisonUsages = useMemo(() => getComparisonUsages(products), [products]);
  const comparisonSpecGroups = useMemo(() => getComparisonSpecGroups(products), [products]);
  const hasComparisonUsage = comparisonUsages.some((item) => item.usage || item.features.length);
  const addModelPath = items.length
    ? `/products?domain=${encodeURIComponent(items[0].domain)}&category=${encodeURIComponent(items[0].category_code)}`
    : "/products";

  const requestConsultation = (chosenProducts: ProductDetailDto[]) => {
    setSelectedItems(chosenProducts.map((product) => ({ product_id: product.product_id, variant_id: null, quantity: null })));
    rememberSelectedProducts(chosenProducts.map((product) => ({
      product_id: product.product_id,
      name: product.name,
      model: product.model ?? null,
    })));
    navigate("/quote", { animate: false });
  };

  return (
    <AppShell route={route}>
      <section className="compare-screen" aria-labelledby="compare-heading">
        <button className="compare-back" type="button" onClick={() => navigate("/home", { animate: false })}>
          <UiIcon name="arrowLeft" size={19} /> Trang chủ
        </button>

        <header className="compare-heading">
          <h1 id="compare-heading">So sánh sản phẩm</h1>
          <p>Chọn 2–3 model cùng danh mục. Xem từng tiêu chí để tìm sản phẩm phù hợp.</p>
        </header>

        <div className="compare-toolbar">
          <output aria-live="polite">{items.length}/3 sản phẩm đã chọn</output>
          {items.length ? (
            <button type="button" onClick={clear}>
              <UiIcon name="trash" size={20} /> Xóa lựa chọn
            </button>
          ) : null}
        </div>

        {phase === "loading" ? <CatalogueSkeleton cards={2} /> : null}
        {failure ? <SystemStatePanel state={getSystemStateForFailure(failure)} onRetry={() => setReloadToken((current) => current + 1)} /> : null}

        {!items.length ? (
          <section className="compare-empty" aria-label="Chưa chọn sản phẩm để so sánh">
            <UiIcon name="info" size={22} />
            <strong>Chưa chọn sản phẩm để so sánh</strong>
            <p>Thêm sản phẩm từ thẻ hoặc trang chi tiết.</p>
          </section>
        ) : null}

        {items.length === 1 && phase === "ready" ? (
          <p className="compare-selection-note"><UiIcon name="info" size={16} /> Chọn thêm một model cùng danh mục để bắt đầu đối chiếu.</p>
        ) : null}

        {products.length ? (
          <>
            <p className="compare-category-name">{categoryName}</p>
            <div className="compare-roster" aria-label="Sản phẩm đang so sánh">
              {products.map((product) => {
                const preorder = isPreorderAvailability(product.availability);
                return (
                  <article className="compare-card" key={product.product_id}>
                    <button
                      className="compare-open"
                      type="button"
                      onClick={() => navigate(`/products/${encodeURIComponent(product.slug)}`, { animate: false })}
                      aria-label={`Xem chi tiết ${product.name}`}
                    >
                      <PublicImage media={product.cover_media} alt={product.name} />
                      <span className="compare-card-copy">
                        <strong>{visibleText(product.model) ?? product.name}</strong>
                        <span>{product.name}</span>
                        <span className={`compare-stock${preorder ? " is-preorder" : ""}`}>
                          <UiIcon name={preorder ? "clock" : "checkCircle"} size={14} />
                          {getAvailabilityLabel(product.availability)}
                        </span>
                      </span>
                    </button>
                    <button className="compare-remove" type="button" onClick={() => toggle(product)} aria-label={`Bỏ ${product.name} khỏi so sánh`}>
                      <UiIcon name="x" size={22} />
                    </button>
                    <button className="compare-one-request" type="button" onClick={() => requestConsultation([product])}>
                      Tư vấn model này <UiIcon name="arrowRight" size={18} />
                    </button>
                  </article>
                );
              })}
            </div>

            {items.length < 3 ? (
              <button className="compare-add" type="button" onClick={() => navigate(addModelPath, { animate: false })}>
                <UiIcon name="sliders" size={20} /> Thêm model thứ ba
              </button>
            ) : null}

            <div className="compare-features">
              <section className="compare-feature" aria-labelledby="compare-use-heading">
                <h2 id="compare-use-heading">Công dụng &amp; đặc điểm</h2>
                {hasComparisonUsage ? (
                  <div className="compare-model-facts" aria-label="Công dụng và đặc điểm theo từng model">
                    {comparisonUsages.map((item) => (
                      <article className="compare-model-fact" key={item.productId}>
                        <h3>{item.modelLabel}</h3>
                        {item.usage ? <p>{item.usage}</p> : <p className="compare-empty-value">—</p>}
                        {item.features.length ? (
                          <ul className="compare-feature-list">
                            {item.features.map((feature) => <li key={feature}>{feature}</li>)}
                          </ul>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : <p>Chưa có thông tin công dụng để đối chiếu. Hoa Nam sẽ tư vấn theo nhu cầu của bạn.</p>}
              </section>
              <section className="compare-feature" aria-labelledby="compare-spec-heading">
                <h2 id="compare-spec-heading">Thông số kỹ thuật</h2>
                {comparisonSpecGroups.length ? (
                  <div className="compare-spec-groups" aria-label="Thông số kỹ thuật theo từng model">
                    {comparisonSpecGroups.map((group) => (
                      <section className="compare-spec-group" key={group.key} aria-label={group.label}>
                        {comparisonSpecGroups.length > 1 ? <h3>{group.label}</h3> : null}
                        {group.rows.map((row) => (
                          <div className="compare-spec-row" key={row.key}>
                            <strong>{row.label}</strong>
                            <div className="compare-spec-values">
                              {products.map((product) => (
                                <div key={product.product_id}>
                                  <span>{getCompareModelLabel(product)}</span>
                                  <b>{row.values.get(product.product_id) ?? "—"}</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : <p>Chưa có thông số để đối chiếu giữa các model. Gửi yêu cầu để được tư vấn chi tiết.</p>}
              </section>
            </div>

            {products.length >= 2 ? (
              <div className="compare-actions">
                <button type="button" onClick={() => requestConsultation(products)}>
                  Tư vấn {products.length} sản phẩm <UiIcon name="arrowRight" size={20} />
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
};

export default ComparePage;
