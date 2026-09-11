# State inventory — Prompt 00

Inventory này mô tả state quan sát được, điểm vào/ra và giới hạn contract. Nó không biến panel đứng cạnh nhau thành một chuỗi nếu Designer không khẳng định điều đó.

## 01–18: trạng thái theo board ảnh

| Prompt | State/panel | Điểm vào → CTA/Back → điểm ra | Dữ liệu và điều kiện | API/side effect được phép |
| --- | --- | --- | --- | --- |
| 01 | Login | Chưa có session → Đăng nhập → xác nhận token; Quên mật khẩu là link thiết kế | Email/tài khoản, mật khẩu; lỗi 401/403 | `POST /auth/login`, refresh/logout có source; recovery chưa có nghiệp vụ. |
| 01 | Xác nhận phiên | Login thành công → Bắt đầu ca/Đăng xuất | Nhân viên, kho, trạng thái ca | Không có API ca; không triển khai nút bắt đầu ca thật. |
| 02 | Home | Session hợp lệ → task/cards/tab → flow/tab | KPI, chứng từ gần đây, badge thông báo | Chỉ metric có nguồn đọc thật; 5-tab ảnh vs 4-tab source là xung đột mở. |
| 03 | Sheet tác vụ | Quét tổng quát → chọn nghiệp vụ/cancel | Phiếu dở, trạng thái kho | Chọn route nội bộ; “kho tạm dừng” cần server state. |
| 03 | Resume/bỏ phiếu | Có phiếu dở → tiếp tục/lưu nháp/bỏ/cancel | Draft local và server checkpoint | Hủy/xóa không được suy ra chỉ từ UI; cần policy từng flow. |
| 04–05 | Tạo phiếu | Home → điền → quét → review → gửi → kết quả | Kho, metadata, mã/serial, duplicate, số lượng | `record` tạo chờ Web; thành công không có nghĩa POSTED. |
| 06 | Lookup/product/location/transaction | Search/quét → product → location hoặc lịch sử → Back | Code, SKU, stock/location/movement | Read endpoint phải trả schema vị trí/lịch sử; không tự tính tồn. |
| 07 | NFC list/assign | List/search → resolve code → prepare → đọc chip → confirm → result | Item, NFC UID, reservation token, permission | Chỉ `prepare → confirm` sau đọc lại; không dùng generic physical-code. |
| 08 | History/scan session/day | Tab lịch sử → row → detail/session/day → Back | Filter ngày/loại/trạng thái | `/scan/events` cần `inventory.view`; `scan_batch_id` là session. |
| 09 | Warranty intake/detail/repair result | List → scan/manual → create → detail/status → result | Case state, defect/note, attachment, optimistic version | Warranty status dùng `If-Match` + idempotency; component issue tách riêng. |
| 10–11 | Profile/security/session | Tab profile → edit/password/sessions → save/revoke/back | `user_id`, display name, phone, permissions, version | Contract BE xác nhận; write chưa nằm write gate source hiện tại. |
| 12 | Document list/detail/lines/create | List → detail tab/file → back; Home flow tạo record | Document state, lines, attachment | Attachment endpoints do BE xác nhận; normal Post ở Web. |
| 13 | Notifications | Badge/list → detail → mark read/deep link | event key, subject type/id, read state | `/api/v1/notifications`; no approval/Post action App. |
| 14 | Recovery/shift | Login/Profile → request/end shift/summary | Recovery identity, active shift, unfinished docs | BLOCKED BA: không có luật/aggregate ca hoặc recovery. |
| 15 | Offline/auth/RBAC/hardware | Network/auth/403/permission error → retry/back/login/settings | Runtime error, device permission | Không báo success giả; camera/NFC only hardware verification. |
| 16 | Loading/empty/not-found/error | Read request → skeleton/empty/error/retry | Request generation, query/filter | Lỗi phải giữ dữ liệu tốt đang hiển thị khi applicable. |
| 17 | Scan exceptions | Scan → classification/error/retry/manual/verify | code eligibility, duplicate, document checkpoint | Không resend mù request mơ hồ; error code quyết định CTA. |
| 18 | Attachment/viewer/handover/location | Document/case → file download/view; handover/location action | attachment id; assignee; bin/location | Attachment có contract; handover/assignment và location write chưa có luật/schema. |

## 19–24: scene graph có source prototype

```text
19 scan ──[box]──> quantity ──[valid qty]──> review ──[Post confirmed]──> success
   │                                      │
   └──[serial item]───────────────────────┘

20 history ──[more]──> history-loading ──[page]──> history
    └──[page error]──> history-error ──[retry]──> history-loading
    └──[zero posted]──> empty

21 drafts ──> resume ──> scan/review
                 ├──[unknown scan]──> reconcile
                 └──[post result unknown]──> post-check

22 history-hub ─> nfc ─> nfc-detail
     ├──────────> events-unavailable
     └──────────> warranty ─> warranty-detail / sessions ─> session-detail
```

| Prompt | Scene | Entry / exit | Guard and real side effect |
| --- | --- | --- | --- |
| 19 | `scan` | Case in `CHECKING`/`REPAIRING` → scan/manual → list/review | Resolve code validates case/code; first verified code locks warehouse. |
| 19 | `quantity` | Eligible container → quantity modal → confirm/cancel | Positive integer, not greater than server available; this is not stock mutation. |
| 19 | `review` | Draft lines → confirm/return scan | Create document, scan lines, then Post; headers/version required by component document contract. |
| 19 | `success` | Only after Post confirmed → case history | Stock has changed; summary derives from posted document. |
| 20 | `history*` | Warranty detail → paged POSTED component issues | Stable IDs, no duplicates; old response must not merge after refresh/case change. |
| 21 | `drafts/resume` | Stored session → same server document | Persist document id before detail reload; codes already server-recorded cannot be arbitrarily removed. |
| 21 | `reconcile/post-check` | Unknown response/checkpoint → Web/server check | No new Create or blind re-scan until outcome is known. |
| 22 | `nfc*` | Hub → NFC event list/detail | BE endpoint is read-only history; map server machine action to Vietnamese copy. |
| 23 | `warranty*` | Hub → case list/event detail | Reuse warranty case/event source; do not create a second history store. |
| 23 | `sessions*` | Hub → scan batch list/detail | Filter own events with `mine=1`; `scan_batch_id` is session identity. |
| 24 | `quantity-invalid`, `scan-error`, `waiting-web`, `closed` | Branches from active flow | Invalid code/quantity blocks progression; normal record awaits Web; closed warranty is read-only. |

## Bounds and typography status

The 17–22 CSS records exact design metrics for the prototype (for example phone `390×844`, header padding, card radius, line heights, 48px primary control). Individual component bounds/copy for 01–18 can be read visually but have no approved viewport crop. They remain `UNMEASURED`, not guessed. `baseline.json` contains source dimensions/hash and `motion-spec.md` isolates the known timing values.
