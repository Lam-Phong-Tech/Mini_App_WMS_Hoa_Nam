import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { CatalogueSkeleton, EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { PublicImage } from "@/components/catalogue/public-image";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { useCompare } from "@/state/compare-context";
import { useQuoteWorkflow } from "@/state/quote-workflow-context";
import { getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure, ProductDetailDto, SpecItemDto, isApiSuccess } from "@/types/public-api";

const route = getFoundationRoute("compare");
const getSpecs = (product: ProductDetailDto) => (product.spec_groups ?? []).reduce<SpecItemDto[]>((all, group) => all.concat(group.items), []);

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
    if (!items.length) { setProducts([]); setFailure(null); setPhase("ready"); return () => { active = false; }; }
    setPhase("loading");
    setFailure(null);
    void Promise.all(items.map((item) => api.getProduct(item.slug))).then((responses) => {
      if (!active) return;
      setProducts(responses.reduce<ProductDetailDto[]>((all, response) => isApiSuccess(response) ? all.concat(response.data) : all, []));
      setFailure(responses.find((response): response is ApiFailure => !isApiSuccess(response)) ?? null);
      setPhase("ready");
    });
    return () => { active = false; };
  }, [api, items, reloadToken]);

  const labels = useMemo(() => Array.from(new Set(products.reduce<string[]>((all, product) => all.concat((product.spec_groups ?? []).reduce<string[]>((specs, group) => specs.concat(group.items.map((item) => item.label)), [])), []))), [products]);
  return <AppShell route={route}>
    <section className="compare-heading"><p className="info-card__eyebrow">THƯ VIỆN SẢN PHẨM</p><h2>So sánh sản phẩm</h2><p>Chọn 2–3 sản phẩm cùng nhóm và danh mục để đối chiếu.</p></section>
    <div className="compare-toolbar"><output>{items.length}/3 sản phẩm đã chọn</output>{items.length ? <button type="button" onClick={clear}>Xóa lựa chọn</button> : null}</div>
    {phase === "loading" ? <CatalogueSkeleton cards={2} /> : null}
    {failure ? <SystemStatePanel state={getSystemStateForFailure(failure)} onRetry={() => setReloadToken((current) => current + 1)} /> : null}
    {!items.length ? <EmptyCatalogue title="Chưa chọn sản phẩm để so sánh" message="Thêm sản phẩm từ thẻ hoặc trang chi tiết." /> : null}
    {items.length === 1 ? <p className="library-storage-note"><UiIcon name="info" size={16} />Chọn thêm một sản phẩm cùng danh mục để bắt đầu đối chiếu.</p> : null}
    {products.length ? <>
      <div className="compare-roster">{products.map((product) => <article key={product.product_id}><PublicImage media={product.cover_media} alt={product.name} /><strong>{product.model ?? product.name}</strong><small>{product.name}</small><button type="button" onClick={() => toggle(product)} aria-label={`Bỏ ${product.name} khỏi so sánh`}>Bỏ</button></article>)}</div>
      {products.length >= 2 ? <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>Thông số</th>{products.map((product) => <th key={product.product_id}>{product.model ?? product.name}</th>)}</tr></thead><tbody>{labels.length ? labels.map((label) => <tr key={label}><th>{label}</th>{products.map((product) => { const item = getSpecs(product).find((spec) => spec.label === label); return <td key={product.product_id}>{item ? `${item.value}${item.unit ? ` ${item.unit}` : ""}` : "Chưa có thông tin"}</td>; })}</tr>) : <tr><th>Thông số</th>{products.map((product) => <td key={product.product_id}>Chưa có thông tin</td>)}</tr>}</tbody></table></div> : null}
      {products.length === items.length ? <button type="button" className="quote-submit" onClick={() => {
        setSelectedItems(products.map((product) => ({ product_id: product.product_id, variant_id: null, quantity: null })));
        rememberSelectedProducts(products.map((product) => ({ product_id: product.product_id, name: product.name, model: product.model ?? null })));
        navigate("/quote", { animate: false });
      }}>Gửi yêu cầu cho các sản phẩm này</button> : null}
    </> : null}
  </AppShell>;
};

export default ComparePage;
