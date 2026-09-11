# Decisions — Prompt 00

Thời điểm ghi: 2026-09-11. Trích dẫn dưới đây là quyết định thật của người dùng trong phiên này, không dùng approval ID giả.

| ID | Quyết định đã chốt | Ảnh hưởng triển khai |
| --- | --- | --- |
| D01 | “Web dùng các thư viện phù hợp theo vai trò cụ thể; Android/PDA giữ React Native và FlashList. Không ép cả sáu thư viện chạy trên Android.” | Không import SmoothUI/Motion/GSAP/Lenis/Locomotive/TanStack Virtual vào native bundle. Native tiếp tục RN UI/Animated và FlashList. Web chỉ thêm thư viện khi có call-site trong motion registry. |
| D02 | Nhập/xuất Scanner ghi nhận/gửi và chờ Web duyệt/Post; xuất linh kiện bảo hành tiếp tục Post trực tiếp. | Không khôi phục `ApprovalsScreen` hay UI duyệt/từ chối/Post chứng từ nhập/xuất thường trong `AppShell`. |
| D03 | “Chỉ đấu chức năng thật khi BE xác nhận endpoint, dữ liệu và quyền. Màn thiếu API phải ghi rõ chưa hoạt động; không báo thành công giả.” | Contract map tách BE-CONFIRMED và BA-BLOCKED. Các nút ca, giao việc, bàn giao, khôi phục không được nối giả. |
| D04 | “So sánh theo viewport/thiết bị, font, icon, màu và motion đã chốt… không tự tuyên bố trùng từng pixel với ảnh mockup.” | Mục tiêu là đạt tiêu chí nghiệm thu đã thống nhất; `pixel-perfect` không được ghi PASS nếu thiếu profile/crop/diff. |
| D05 | “Test trên môi trường DEV với tài khoản, quyền và kho test; kiểm tra camera/NFC trên thiết bị thật.” | Web unit/build không thay thế Android/PDA/hardware test. Không có thiết bị/account test thì check là NOT_RUN/BLOCKED. |

## D03: phản hồi BE đã được chốt phạm vi

BE xác nhận các contract: sửa profile, đổi mật khẩu, session thiết bị, notifications, attachment chứng từ, warranty events có phân trang, NFC audit events và scan events theo `scan_batch_id`. Các contract này được ghi tại `source-contract-map.md`; chúng cho phép lập kế hoạch integration, không có nghĩa UI hiện tại đã đấu hoặc đã kiểm thử E2E.

BE/BA chưa có mô hình nghiệp vụ cho ca làm, công việc được giao và bàn giao bảo hành. Các mục đó giữ `BA-BLOCKED`; không gọi là “thiếu một endpoint đơn lẻ”.

## D06 — Chạy từng phần không phụ thuộc

Người dùng xác nhận bảng phạm vi ngày 2026-09-11:

1. Giữ **4 tab** hiện có: Trang chủ, Quét mã, Lịch sử, Cá nhân. Chứng từ đi từ Home/Lịch sử; không thêm tab Chứng từ.
2. Preview Web dùng `390×844` CSS px, `vi-VN`, `Asia/Ho_Chi_Minh` và fixture có giờ cố định. Board 01–18 chỉ review font/icon/màu/layout, không tuyên bố pixel-perfect.
3. Dựng UI và unit test không chờ thiết bị/DEV; camera, NFC, quyền và API thật chỉ nghiệm thu sau khi có thiết bị và account DEV.
4. Không làm chức năng ca, giao việc, bàn giao hoặc khôi phục; các nơi xuất hiện chúng phải ẩn hoặc ghi “Chưa áp dụng”.
5. Đợt đầu không cài motion/scroll library; dùng UI tĩnh và motion React Native hiện có. Registry Web được chốt sau cho đúng màn cần animation/virtual list.
6. Commit Designer `90b003…` là baseline local; không khẳng định GitHub Pages byte-for-byte khớp commit.
7. Không sửa lint toàn dự án trong đợt UI. Mỗi thay đổi phải typecheck, test liên quan, build Web và lint riêng file đã đổi; lint tổng tiếp tục là nợ kỹ thuật Gate tổng.

Hệ quả: **Gate 00 tổng vẫn BLOCKED**, nhưng các prompt/màn không lệ thuộc các nghiệp vụ hoãn có thể nhận một `sub-gate` riêng khi người dùng giao rõ. Đây không phải quyền tự chạy Prompt 01; Prompt 01 vẫn chỉ chạy khi có yêu cầu riêng.

## D07 — Điều kiện đóng Gate 00

Người dùng chốt ngày 2026-09-11:

1. Lint chỉ chạy trên `src` và `__tests__`; `web-dist/**` là output build. PASS khi source mới/sửa không có ESLint error. Warning cũ giữ baseline riêng và không được phát sinh warning mới.
2. Visual diff chạy bằng Chromium đã khóa trong dự án, viewport `390×844` CSS px, DPR `3`, `vi-VN`, `Asia/Ho_Chi_Minh`, safe-area `0`, không dùng device frame. Crop đúng vùng app và bỏ browser chrome. Sai khác tối đa `0,5%` pixel, ngưỡng lệch màu `≤ 8`.
3. Credential DEV chỉ cấp qua kênh bảo mật, không ghi vào source/tài liệu. Camera/NFC chỉ được kết luận sau test Android/PDA thật; khi chưa có thiết bị, đó là dependency của bên cấp thiết bị, không được gọi là đã kiểm chứng.
4. Ca làm, Công việc được giao, Bàn giao bảo hành và Khôi phục tài khoản là **“Chưa áp dụng”**: không có API/nghiệp vụ và không là màn chức năng thật của Prompt 00.
5. Không thêm motion hoặc virtual-list package trong đợt này; chỉ dùng React Native/dependency hiện có. Package mới cần duyệt riêng.
6. Designer phải công bố SHA/commit nối bản GitHub Pages với source; chỉ SHA đó được dùng để đối chiếu deploy.

Gate 00 chỉ chuyển PASS sau khi có: lint source sạch error, bằng chứng visual diff đạt ngưỡng D07 và SHA deploy của Designer. Quyết định bốn tab D06 vẫn giữ nguyên; năm nghiệp vụ là các lối vào từ Trang chủ, không phải tab thứ năm.

## Xung đột còn hiệu lực

1. **Xác nhận phiên/bắt đầu ca**: board Login có CTA “Bắt đầu ca làm việc”, trong khi shift BA-BLOCKED. Màn này phải ẩn/ghi “Chưa áp dụng”, không làm action thật.
2. **Board 13**: gallery giữ hình duyệt/từ chối cũ, nhưng D02 cấm workflow đó trong Scanner.
3. **D04 profile**: prototype 17–22 có `390×844`; 01–18 dùng profile partial review, không làm pixel-diff claim. Đây vẫn chặn visual acceptance tuyệt đối, không chặn UI sub-gate.
4. **Theme**: App hiện dùng token Vuexy tím trong `src/theme/tokens.ts`; prototype 17–22 dùng blue Public Sans. Chưa tự thay theme vì đó là thay shared foundation, làm invalid evidence của tất cả màn hiện hữu.

## Không được tự suy ra

- Không thêm OTP, 2FA, recovery channel, user assignment, auto end-shift, stock adjustment, NFC overwrite hoặc API backend giả.
- Không nới validation metadata nhập/xuất chỉ bằng UI; contract `record`/Web completion phải được BE/BA xác nhận riêng.
- Không gắn asset/fonthay đổi dependency ở Prompt 00; đây là khảo sát và cổng điều kiện.
