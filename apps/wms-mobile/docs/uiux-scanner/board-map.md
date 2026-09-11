# Board map — Prompt 00

Nguồn thiết kế: `Duc-Nguyen98/ScannerHNApp@90b0032b970e4f40cf4ccc8a95407577f1ab720a`.
Catalog có đúng 24 board. Đường dẫn trong bảng là tương đối với `docs/design/01_Main/BOARDS/` của snapshot Designer đã kiểm tra. Hai ảnh khóa không bị sao chép, crop hay thay byte trong App.

| Prompt | Board / ảnh nguồn | Các panel hoặc scene đã xác định | Tương ứng source App hiện tại | Kết luận phạm vi |
| --- | --- | --- | --- | --- |
| 01 | `00_LOCKED_ORIGINALS/01_Dang_nhap_va_Xac_nhan_phien_ORIGINAL.jpg` | Đăng nhập; Xác nhận phiên/bắt đầu ca | `features/auth/LoginScreen.tsx`; không có flow ca | Login có thật; xác nhận/bắt đầu ca chờ BA. |
| 02 | `00_LOCKED_ORIGINALS/02_Trang_chu_ORIGINAL.jpg` | Trang chủ | `features/home/HomeScreen.tsx`, `app/AppShell.tsx` | Khóa ảnh; 5 tab trong ảnh khác 4 tab App. |
| 03 | `01_UPDATED_BOARDS/01_dialog_header_aligned_v2.png` | Chọn tác vụ; phiếu dở; kho tạm dừng; bỏ phiếu | Sheet/Dialog hiện có; còn state nghiệp vụ tùy flow | Không giả lập kho tạm dừng hoặc bỏ phiếu nếu chưa có state. |
| 04 | `01_UPDATED_BOARDS/02_nhap_kho.png` | Thông tin; quét; kiểm tra; đã gửi duyệt | `features/inbound/*` | Gửi record chờ Web; không Post trên App. |
| 05 | `01_UPDATED_BOARDS/03_xuat_kho.png` | Thông tin; quét; kiểm tra; đã gửi duyệt | `features/outbound/*` | Gửi record chờ Web; không Post trên App. |
| 06 | `01_UPDATED_BOARDS/04_tra_cuu.png` | Danh sách; chi tiết; tồn theo vị trí; lịch sử giao dịch | `features/lookup/*` | Tra cứu hiện có; vị trí/lịch sử cần contract schema thật. |
| 07 | `01_UPDATED_BOARDS/05_nfc.png` | Danh sách NFC; đọc; xác minh; hoàn tất | `features/nfc/*`, `services/wms/nfc.ts` | Gán NFC có thật; UI cần giữ prepare → read-back → confirm. |
| 08 | `01_UPDATED_BOARDS/06_lich_su.png` | Lịch sử; chi tiết; phiên quét; hoạt động ngày | `features/history/HistoryScreen.tsx`; `/scan/events` | Phiên quét/hoạt động dựa contract BE trả lời, chưa được đấu UI. |
| 09 | `01_UPDATED_BOARDS/07_bao_hanh.png` | Danh sách; tiếp nhận; hồ sơ; kết quả sửa chữa | `features/warranty/*` | Luồng bảo hành thật; panel linh kiện được ưu tiên theo 19–24. |
| 10 | `01_UPDATED_BOARDS/08_ca_nhan.png` | Cá nhân; sửa hồ sơ; công việc/quyền; bảo mật | `features/profile/ProfileScreen.tsx` | Sửa hồ sơ/bảo mật có contract BE; “công việc” còn chờ BA. |
| 11 | `01_UPDATED_BOARDS/09_bao_mat.png` | Đổi mật khẩu; lỗi xác nhận; thành công; phiên | Auth hiện chỉ login/logout | Contract BE đã có, chưa triển khai UI. |
| 12 | `01_UPDATED_BOARDS/10_chung_tu.png` | Danh sách; chi tiết; dòng; tạo | `features/documents/*`, inbound/outbound flows | Attachment đã có contract BE; không tự dựng chứng từ giả. |
| 13 | `02_NEW_BOARDS/11_thong_bao_phe_duyet.png` | Danh sách; chi tiết; chờ duyệt; duyệt/từ chối | Không render `ApprovalsScreen` trong `AppShell` | Hai panel duyệt/từ chối là tham chiếu cũ, cấm dùng cho nhập/xuất trên App. |
| 14 | `02_NEW_BOARDS/12_khoi_phuc_va_ca_fixed.png` | Khôi phục; đã nhận; kết thúc/tổng kết ca | Không có service ca/khôi phục | BLOCKED BA: chưa có khái niệm/luật ca và khôi phục. |
| 15 | `02_NEW_BOARDS/13_he_thong_fixed.png` | Offline; phiên hết hạn; thiếu quyền; quyền thiết bị | `features/auth/StatusScreen.tsx`, scanner permission | Một phần hiện có; camera/NFC phải test thiết bị thật. |
| 16 | `02_NEW_BOARDS/14_du_lieu_quyet_loi_fixed.png` | Loading; rỗng; không tìm thấy; lỗi | UI error/loading ở nhiều feature | Cần chuẩn hóa theo từng endpoint, không dùng fixture để báo success. |
| 17 | `02_NEW_BOARDS/15_ngoai_le_quet_fixed.png` | Mã sai; không thể xuất; NFC đã liên kết; kiểm tra gửi | Scan/NFC/Inbound Flow | Thông điệp và retry phải dựa error code / checkpoint thực. |
| 18 | `02_NEW_BOARDS/16_dinh_kem_ban_giao_fixed.png` | File; viewer; bàn giao; vị trí linh kiện | warranty attachment; document attachment contract | Viewer có contract; bàn giao/vị trí còn thiếu luật hoặc schema. |
| 19 | `02_NEW_BOARDS/17_xuat_linh_kien_bao_hanh.png` | `scan`, `quantity`, `review`, `success` | `WarrantyComponentIssueFlow.tsx` | Luồng trực tiếp Create → Scan → Post, có thay đổi tồn. |
| 20 | `02_NEW_BOARDS/18_lich_su_linh_kien.png` | `history`, `history-loading`, `history-error`, `empty` | `WarrantyDetailScreen.tsx`, `useWarrantyComponentHistory.ts` | Chỉ POSTED, tải thêm/chống trùng; lỗi giữ dữ liệu đã tải. |
| 21 | `02_NEW_BOARDS/19_tiep_tuc_phieu_linh_kien.png` | `drafts`, `resume`, `reconcile`, `post-check` | `warrantyComponentSession.ts`, flow xuất linh kiện | Tiếp tục đúng `documentId`; kết quả mơ hồ phải đối chiếu, không create lại. |
| 22 | `02_NEW_BOARDS/20_lich_su_thao_tac_nfc.png` | `history-hub`, `nfc`, `nfc-detail`, `events-unavailable` | NFC history endpoint do BE xác nhận | Không có event thật phải hiện unavailable, không dựng nhật ký giả. |
| 23 | `02_NEW_BOARDS/21_lich_su_bao_hanh_phien_quet.png` | `warranty`, `warranty-detail`, `sessions`, `session-detail` | Warranty events; `/scan/events` | `scan_batch_id` là session id theo BE; chưa có UI integration. |
| 24 | `02_NEW_BOARDS/22_trang_thai_scanner.png` | `quantity-invalid`, `scan-error`, `waiting-web`, `closed` | Component flow, normal record flows | Nhập/xuất chỉ chờ Web; linh kiện bảo hành mới Post trực tiếp. |

## Nguồn hiện hành ưu tiên khi xung đột

`README.md` và `HANDOFF.md` của bộ 17–22 nêu rõ: nhập/xuất chính trên Scanner chỉ gửi phiếu và chờ Web; linh kiện bảo hành Post trực tiếp. Vì vậy board 13 và mọi chữ “Duyệt/Từ chối/Post nhập-xuất trên App” chỉ được giữ để đối chiếu lịch sử thiết kế, không phải lệnh triển khai.

## Bằng chứng kích thước/crop

- Board 19–24: prototype tự khai panel `390 × 844` CSS px; trong ảnh board 2×, mỗi scene có bbox `780 × 1688`, top `228`, các left lần lượt `144`, `980`, `1816`, `2652`.
- Board 01–18: chỉ có ảnh composite. Không có metadata viewport/crop trong catalog. Chưa tách crop để làm pixel diff vì D04 chưa chốt DPR/browser/safe area và ảnh cũ có thiết bị/gallery chrome. Đây là blocker, không phải thông số bị bỏ qua.
