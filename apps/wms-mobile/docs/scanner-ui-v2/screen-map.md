# Screen map — Gate 01

Nguồn board, SHA và canvas nằm trong `source-manifest.json`. Một board có nhiều state; không suy ra mỗi cột là một route tuần tự. Trạng thái ở cột cuối chỉ là kết quả kiểm kê code/contract ở revision `7f4d400…`, không phải chứng nhận UI hoặc phần cứng.

| Board | State/control cần truy vết | Điểm vào và implementation hiện có | Kết luận Gate 01 |
| --- | --- | --- | --- |
| L01 | Đăng nhập; xác nhận phiên | `features/auth/LoginScreen.tsx`, `app/AppShell.tsx`, `auth/session.ts` | Có tuyến đăng nhập. Ảnh khóa chưa có thông số font/crop/layout để chứng minh fidelity. |
| L02 | Home; CTA; bottom navigation | `features/home/HomeScreen.tsx`, `ui/BottomNav.tsx`, `app/AppShell.tsx` | Quy tắc V3 có trong code: nhãn **Chờ Web duyệt**, `Xem tất cả` mở History. Fidelity chưa kiểm chứng. |
| U01 | Sheet quét; phiếu dở; xác nhận bỏ | `ui/Sheet.tsx`, `app/AppShell.tsx` | Component có mặt; animation, copy và từng nhánh draft chưa có đặc tả chốt. |
| U02 | Tạo/scan/review/kết quả nhập | `features/inbound/InboundFlow.tsx`, `features/scan/BusinessScanScreen.tsx` | Có flow. Cần xác minh contract “gửi Web duyệt”, cảnh báo lỗi và QA camera. |
| U03 | Tạo/scan/review/kết quả xuất | `features/outbound/OutboundFlow.tsx`, `features/scan/BusinessScanScreen.tsx` | Có flow. Không được chuyển 7/10 thành thành công; cần scenario E2E và visual QA. |
| U04 | Danh sách, chi tiết, tồn vị trí, giao dịch | `features/lookup/LookupScreen.tsx`, `services/wms/inventoryLookup.ts` | Có điểm vào. Contract dữ liệu vị trí/lịch sử chưa được chứng minh trong Gate này. |
| U05 | List/read/verify/confirm NFC | `features/nfc/*`, `services/wms/nfc.ts` | Có pipeline, nhưng thiết bị NFC/PDA và quyền native chưa được kiểm chứng. |
| U06 | Danh sách, detail, phiên quét, hoạt động ngày | `features/history/HistoryScreen.tsx`, storage/sync | Lịch sử có route; phạm vi event/session/activity từ WMS chưa được chứng minh. |
| U07 | Hồ sơ, tiếp nhận, sửa chữa, xuất linh kiện | `features/warranty/*`, `services/wms/warrantyComponent*.ts` | Tạo → scan → Post trực tiếp có code. R1–R4 chặn nghiệm thu tiếp tục phiếu, khóa kho và phân trang lịch sử. |
| U08 | Cá nhân, sửa profile, việc/quyền, bảo mật | `features/profile/ProfileScreen.tsx` | Màn chính có; API edit profile/quyền chưa chốt. |
| U09 | Đổi mật khẩu, lỗi/success, phiên thiết bị | `features/auth/*`, auth services | Không có bằng chứng contract mới cho password/device session. |
| U10 | List/detail/doc lines/tạo chứng từ | `features/documents/DocumentDetailScreen.tsx`, `features/history/*` | Detail có; phạm vi tạo và viewer tài liệu phải đối chiếu contract. |
| N11 | Thông báo và duyệt/từ chối/Post | `features/approvals/ApprovalsScreen.tsx` còn trong source nhưng không nằm trong `AppShell` navigation | **Loại khỏi Scanner theo V3.** Web WMS chịu trách nhiệm duyệt/Post nhập-xuất thường. Không được đánh dấu implemented. |
| N12 | Khôi phục, ca làm việc, tổng kết | auth/session, sync | Thiếu contract, thuộc D03. |
| N13 | Offline/hết phiên/quyền/camera/NFC | `features/auth/StatusScreen.tsx`, connectivity, camera/native NFC | Có một phần UI/guard; cần test thiết bị/quyền thật. |
| N14 | Loading/empty/error | `ui/EmptyState.tsx`, `ui/Banner.tsx` | Primitive có mặt; coverage tất cả data screens chưa kiểm kê E2E. |
| N15 | Mã sai, không xuất được, thẻ liên kết, gửi không rõ kết quả | scan guards, NFC write, sync | Có guard/service tham chiếu; phải có scenario API và thiết bị trước khi PASS. |
| N16 | Đính kèm, viewer, bàn giao, vị trí linh kiện | warranty attachment modules | Attachment bảo hành có code; contract viewer/bàn giao/vị trí chưa chốt. |

## Điều hướng xác minh được từ AppShell

`Trang chủ → Chứng từ → Quét mã → Lịch sử → Cá nhân` là bộ tab chính. Các flow toàn màn gồm nhập, xuất, tra cứu, NFC và bảo hành; flow bảo hành lại gồm quét thiết bị/tiếp nhận và xuất linh kiện. `ApprovalsScreen` không được render trong `AppShell` tại revision này.

## Cắt vùng và baseline ảnh

Mỗi board được giữ byte nguyên gốc ở design repo và được pin SHA. Canvas board là ảnh trình bày nhiều state; không có toạ độ crop vùng ứng dụng, viewport/DPR, font scale hoặc mask do Designer cấp. Vì vậy Gate không tạo crop giả hay dùng công thức chia cột để kết luận fidelity. Những thông số này là blocker D04, không phải lỗi có thể tự suy diễn.
