# User confirmation — UIUX-G1 revalidation — 2026-09-09

> Tôi xác nhận revalidate UIUX-G1 và cho phép mở UIUX-G2 khi gate G1 PASS.
>
> 1. Idempotency: thứ tự hiển thị sản phẩm không làm thay đổi nội dung. FE phải chuẩn hoá và sắp xếp `items[]` theo quy tắc cố định trước khi tạo fingerprint, tạo `Idempotency-Key` và gửi API. Cùng nội dung thì dùng lại key; đổi sản phẩm, variant, quantity, tên, điện thoại chuẩn hoá, ghi chú, consent hoặc privacy version thì tạo key mới.
>
> 2. Consent chính thức:
>
> “Tôi đồng ý để Hoa Nam sử dụng họ tên, số điện thoại, sản phẩm quan tâm và ghi chú tôi cung cấp nhằm tiếp nhận yêu cầu và liên hệ tư vấn theo Chính sách sử dụng thông tin.”
>
> `province_code` không thu thập và không gửi trong đợt này. `privacy_version` và URL chính sách luôn lấy từ public config; thiếu một trong hai thì chặn gửi và giữ draft.
>
> 3. Tôi xác nhận public API, config và media đang phục vụ tại Green/DEV-TEST `https://khohoanamdev.lptech.info.vn` được phép dùng cho UI integration test. Chỉ dùng dữ liệu Green; không dùng fixture, ảnh, hotline, OA hoặc nội dung từ Designer làm dữ liệu runtime. Chưa áp dụng xác nhận này cho Customer/Production.
>
> 4. Cho phép G1 revalidation ghi nhận các thay đổi quote/config hiện có, kết quả test Green `201 → 200 replay → 409 conflict`, cùng typecheck/lint/test/build mới.
>
> 5. D06–D08 là điều kiện bắt buộc của G2/G5 và nghiệm thu cuối, không phải lý do chặn G1: G2 phải đo scroll owner/compatibility và visual baseline; G5 phải test Zalo trên ít nhất một Android và một iPhone thật. Không được tuyên bố hoàn thiện hoặc pixel match trước khi các bằng chứng đó PASS.
>
> 6. Sau mỗi gate chỉ tiếp tục bước kế tiếp khi gate hiện tại PASS. Không merge, push Customer/Production hoặc deploy Production. Sau G5 PASS, báo lại để tôi cho phép deploy bản testing Green.
