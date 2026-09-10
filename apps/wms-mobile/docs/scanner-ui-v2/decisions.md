# Quyết định và điểm cần xác nhận — Gate 01

## Đã xác nhận

### D02 — Phê duyệt và Post

Nhập/xuất thông thường trên Scanner chờ Web duyệt; không khôi phục UI Duyệt/Từ chối/Ghi sổ. Bằng chứng source tại `7f4d400…`: `AppShell.tsx` không render `ApprovalsScreen`; `HomeScreen.tsx` hiển thị “Chờ Web duyệt” và callback `onSeeAll` vào History.

Xuất linh kiện bảo hành vẫn Post trực tiếp trên Scanner. Đây không phải quyền Post toàn cục; service linh kiện được giữ làm ngoại lệ nghiệp vụ.

## Cần người dùng/BA xác nhận

| ID | Câu hỏi cần quyết định | Lý do Gate bị chặn |
| --- | --- | --- |
| D01 | “Toàn hệ thống” với sáu thư viện nghĩa là UX chung + adapter theo Web/Android/PDA, hay bắt buộc từng thư viện chạy trực tiếp trên mọi platform? | Không thể chọn/cài adapter hay thay FlashList bằng suy đoán. |
| D03 | Với khôi phục tài khoản, bắt đầu/kết thúc ca, sửa profile/mật khẩu, phiên thiết bị, notification, bàn giao, vị trí và document attachment: chức năng nào đã có API/được triển khai trong scope Scanner? | Board chỉ là mockup, không chứng minh contract ghi hay quyền. |
| D04 | Cung cấp handoff/font/icon/spec motion/viewport hoặc phê duyệt quy trình đo raster, mask và ngưỡng visual. | Không thể tuyên bố 100% visual/pixel fidelity từ ảnh gallery. |
| D05 | Cung cấp môi trường, account/quyền test, thiết bị camera/NFC/PDA và ngưỡng performance. | Không thể xác nhận camera/NFC/permission/E2E hoặc performance. |

## Quyết định không được tự suy ra

Không tự chọn API backend, dữ liệu fixture production, OTP/2FA, ghi sổ, đổi quyền, chốt ca, bàn giao hoặc liên kết NFC. Nếu D01–D05 chưa có câu trả lời thì giữ Gate BLOCKED.
