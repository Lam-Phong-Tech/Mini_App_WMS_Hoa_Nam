# 2. Sitemap & User flow

## 2.1 Sitemap

5 mục Bottom Navigation là gốc của toàn bộ cây điều hướng; các luồng phụ (checkout, đặt theo yêu cầu, chi tiết đơn) mở dạng full-screen từ những gốc này chứ không nằm trong bottom nav.

```mermaid
flowchart TD
  Root(("Bottom Navigation"))
  Root --> Home["Trang chủ"]
  Root --> Cat["Danh mục"]
  Root --> Cart["Giỏ hàng"]
  Root --> Orders["Đơn hàng"]
  Root --> Profile["Cá nhân"]

  Home --> Search["Tìm kiếm"]
  Home --> PD["Chi tiết sản phẩm"]
  Home --> Custom["Đặt hoa theo yêu cầu"]

  Cat --> ProdList["Danh sách sản phẩm theo danh mục / dịp / loại hoa / người nhận"]
  ProdList --> PD

  PD --> Cart
  PD --> Checkout["Checkout"]

  Cart --> Checkout
  Checkout --> Success["Xác nhận đặt hàng thành công"]
  Success --> OrderDetail["Chi tiết đơn hàng"]

  Orders --> OrderDetail
  OrderDetail --> Custom

  Profile --> AddrBook["Sổ địa chỉ"]
  Profile --> Favorites["Yêu thích"]
  Profile --> CustomList["Yêu cầu thiết kế riêng"]
  Profile --> Support["Trung tâm hỗ trợ / Chính sách"]
  Profile --> Orders
```

## 2.2 User flow — mua hoa

Luồng "mua ngay" và "thêm vào giỏ" hội tụ tại checkout; ba điểm rẽ vận hành thực tế (hết hàng, ngoài khu vực giao, từ chối cấp số điện thoại) được xử lý tại chỗ thay vì để rơi vào lỗi chung chung.

```mermaid
flowchart TD
  A["Trang chủ / Danh mục / Tìm kiếm"] --> B["Chi tiết sản phẩm"]
  B --> C{"Còn hàng & hỗ trợ giao khu vực?"}
  C -- Không --> C1["Hiện trạng thái + gợi ý sản phẩm thay thế"]
  C -- Có --> D["Chọn biến thể: size, màu, giấy gói, ruy băng, phụ kiện"]
  D --> E["Nhập nội dung thiệp + chọn ngày/khung giờ giao"]
  E --> F{"Thêm vào giỏ hay Mua ngay?"}
  F -- Thêm vào giỏ --> G["Giỏ hàng"]
  F -- Mua ngay --> H["Checkout"]
  G --> G1["Áp voucher, kiểm tra lại tồn kho/giá"] --> H
  H --> I["Người đặt, người nhận, thời gian giao, thiệp"]
  I --> J{"Cần số điện thoại xác nhận giao hàng"}
  J -- Từ chối cấp quyền --> J1["Cho nhập số thủ công, không chặn checkout"]
  J -- Đồng ý --> K["Chọn phương thức thanh toán: COD / Chuyển khoản"]
  J1 --> K
  K --> L["Xác nhận đơn hàng"]
  L --> M["Tạo đơn (Idempotency-Key)"]
  M --> N["Màn hình thành công + theo dõi trạng thái qua OA"]
```
