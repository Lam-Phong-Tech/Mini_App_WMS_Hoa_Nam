import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { UiIcon } from "@/components/ui-icon";
import { getFoundationRoute } from "@/routes";

const route = getFoundationRoute("help");

const questions = [
  ["Tôi có cần đăng nhập để xem và gửi yêu cầu không?", "Bạn có thể xem danh mục, tìm sản phẩm và gửi yêu cầu tư vấn mà không cần tạo tài khoản hoặc đăng nhập."],
  ["“Sẵn hàng” và “Đặt trước” khác nhau thế nào?", "“Sẵn hàng” là sản phẩm được giới thiệu ở trạng thái có sẵn. “Đặt trước” cho phép bạn để lại nhu cầu để được tư vấn khả năng cung cấp."],
  ["Làm thế nào để gửi yêu cầu cho nhiều sản phẩm?", "Mở “Yêu cầu nhiều sản phẩm”, chọn các model quan tâm rồi bấm “Tiếp tục”. Kiểm tra danh sách, nhập họ tên, số điện thoại và ghi chú nếu cần trước khi gửi."],
  ["Gửi yêu cầu có nghĩa là đã chốt đơn hàng chưa?", "Yêu cầu giúp Hoa Nam tiếp nhận nhu cầu và liên hệ tư vấn. Đây không phải xác nhận đơn hàng."],
  ["Tôi chưa gửi được yêu cầu, nên làm gì?", "Giữ trang đang mở để không mất nội dung đã nhập. Kiểm tra thông tin, thử gửi lại hoặc gọi hotline để được hỗ trợ."],
  ["Tôi có thể xem lại sản phẩm đã lưu ở thiết bị khác không?", "Danh sách đã xem và đã lưu nằm trong trình duyệt trên thiết bị bạn đang dùng. Danh sách không đồng bộ sang thiết bị khác và sẽ mất khi bạn xóa dữ liệu trình duyệt."],
  ["Thông tin liên hệ của tôi được dùng để làm gì?", "Họ tên, số điện thoại, sản phẩm và ghi chú được dùng để tiếp nhận nhu cầu và liên hệ tư vấn sản phẩm. Chỉ cung cấp những thông tin cần thiết cho việc tư vấn."],
] as const;

const HelpPage = () => {
  const navigate = useNavigate();
  return <AppShell route={route}>
    <section className="help-heading"><p className="info-card__eyebrow">HỖ TRỢ</p><h2>Hướng dẫn & câu hỏi thường gặp</h2><p>Tìm sản phẩm, gửi nhu cầu và kết nối với Hoa Nam.</p></section>
    <ol className="help-steps"><li><span>1</span>Tìm sản phẩm phù hợp</li><li><span>2</span>Chọn sản phẩm quan tâm</li><li><span>3</span>Gửi thông tin cần tư vấn</li></ol>
    <section className="faq-list">{questions.map(([title, text]) => <details key={title}><summary>{title}<UiIcon name="chevronRight" size={19} /></summary><p>{text}</p></details>)}</section>
    <button type="button" className="quote-submit" onClick={() => navigate("/selection", { animate: false })}>Chọn sản phẩm</button>
  </AppShell>;
};

export default HelpPage;
