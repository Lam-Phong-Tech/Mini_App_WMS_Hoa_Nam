# User/BE handoff — G4 product-ID lookup

**Recorded:** 2026-09-10T11:27:41.5831816+07:00

> BE bàn giao: tra sản phẩm theo id cho màn "đã lưu" (PV-13/PV-14)
>
> Endpoint: `GET /api/v1/public/products?ids[]=<uuid-1>&ids[]=<uuid-2>`.
> Không phải route mới. Đây là chế độ mới trên endpoint list sẵn có.
>
> Thứ tự trả về = đúng thứ tự id gửi lên. Không theo sort của catalog.
>
> `IN_STOCK` hiện bình thường. `PREORDER` hiện kèm nhãn "Hết hàng / Đặt
> trước" và giữ trong danh sách. `missing_ids` là sản phẩm đã gỡ khỏi App;
> chỉ những ID này mới xoá khỏi danh sách đã lưu. Lỗi mạng giữ nguyên ID để
> thử lại.
>
> `ids[]` tối đa 50, UUID hợp lệ, mục trùng tự loại giữ vị trí đầu tiên.
> Không dùng chung với `q`, `domain`, `category`, `power_source`, `feature`,
> `spec.*`, `sort`, `cursor`, `limit`; trộn tham số trả `400 INVALID_QUERY`.
> UUID sai hoặc `ids[]` rỗng cũng trả `400` và không được gộp vào
> `missing_ids`.

This preserves the implementation-critical portion of the user's supplied BE
handoff. The full message remains in this conversation as the authoritative
source.
