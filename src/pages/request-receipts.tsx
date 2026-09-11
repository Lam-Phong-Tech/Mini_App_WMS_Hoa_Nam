import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { EmptyCatalogue } from "@/components/catalogue/catalogue-feedback";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";
import { useQuoteWorkflow } from "@/state/quote-workflow-context";

const route = getFoundationRoute("requests");

const RequestReceiptsPage = () => {
  const navigate = useNavigate();
  const { receipts, removeReceipt } = useQuoteWorkflow();
  return <AppShell route={route}>
    <section className="library-heading"><div><p className="info-card__eyebrow">YÊU CẦU TƯ VẤN</p><h2>Yêu cầu đã gửi</h2></div></section>
    <p className="library-storage-note"><UiIcon name="info" size={16} />Để bảo vệ riêng tư, thông tin này chỉ giữ trong lần mở app hiện tại. Tải lại hoặc đóng app sẽ không còn hiển thị.</p>
    {!receipts.length ? <EmptyCatalogue title="Chưa có yêu cầu để xem lại" message="Yêu cầu chỉ xuất hiện sau khi backend xác nhận đã tiếp nhận trong lần mở app này." /> : <section className="receipt-list">{receipts.map((receipt) => <article key={receipt.request_id}><span><UiIcon name="check" size={19} /></span><div><strong>{receipt.request_id}</strong><small>{receipt.products.map((product) => product.model ?? product.name).join(" · ") || `${receipt.items.length} sản phẩm`}</small><small>Đã tiếp nhận · {receipt.items.length} sản phẩm</small></div><button type="button" onClick={() => removeReceipt(receipt.request_id)}>Xóa khỏi màn hình</button></article>)}</section>}
    <button type="button" className="quote-submit" onClick={() => navigate("/selection", { animate: false })}>Chọn sản phẩm để gửi yêu cầu</button>
  </AppShell>;
};

export default RequestReceiptsPage;
