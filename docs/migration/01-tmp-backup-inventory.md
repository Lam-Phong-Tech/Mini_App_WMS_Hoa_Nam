# 01 — Inventory `.tmp/bachhoa-portable-*`

**Commit:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** chỉ lập inventory theo chỉ thị mục 8. **Không xoá, không sửa, không di chuyển, không đưa vào commit.**

---

## 1. Tổng quan

| Hạng mục | Giá trị |
|---|---|
| Tổng dung lượng `.tmp/` | **90 MB** |
| Số mục | 2 |
| Trạng thái Git | **Untracked** — 🔧 `git ls-files .tmp/` → **0 file** |
| Bị ignore | ✅ **Có** — 🔧 `git check-ignore -v .tmp` → `.gitignore:42:.tmp/` |
| Có xuất hiện trong `git status` | ❌ Không (đã bị ignore) |
| Nguy cơ vô tình commit | 🟢 **Thấp** — được `.gitignore` bảo vệ |

---

## 2. Chi tiết từng mục

| # | Đường dẫn | Dung lượng | Loại |
|:--:|---|---:|---|
| 1 | `.tmp/bachhoa-portable-20260821-032642/` | **88 MB** | Thư mục — bản sao portable đã giải nén |
| 2 | `.tmp/bachhoa-portable-clean-20260821-032829.zip` | **1.8 MB** | Tệp nén — bản "clean" |

Dấu thời gian trong tên: **2026-08-21**, tức khoảng **2 tuần trước** commit khảo sát.

---

## 3. Nội dung cấp cao — `bachhoa-portable-20260821-032642/`

**Tổng: 8 838 file.**

```
app-config.json          package.json             tsconfig.json
backend/                 package-lock.json        vite.config.mts
CLAUDE.md                postcss.config.js        www/
docs/                    qr-zdev-9103f770.svg     zmp-cli.json
index.html               qr-zdev-9909cfcf.svg
README.md                RUN_ON_OTHER_MACHINE.md
src/                     tailwind.config.js
```

### 3.1 Đặc điểm đã xác minh

| Đặc điểm | Kết quả | Ý nghĩa |
|---|---|---|
| `app-config.json` → title | `"Quản lý kho"` — **giống hệt HEAD** | Đã là bản WMS, không phải bản Bistro cũ |
| Có `src/app/routes.tsx`? | ✅ **Có** | Đã có WMS router — snapshot tương đối gần đây |
| Có `www/`? | ✅ **Có** | Chứa **build frontend sẵn** (khớp mô tả trong `RUN_ON_OTHER_MACHINE.md`) |
| Có `backend/vendor/`? | ✅ **Có** | **Đây là phần chiếm phần lớn 88 MB** — thư viện Composer |
| Có `docs/design/`? | ✅ Có | Bản sao của thư mục đã bị xoá khỏi repo chính ngày 2026-09-04 |
| Có `.env` thật? | ❌ **KHÔNG** | 🔧 Chỉ tìm thấy `.env.example` và `backend/.env.example` |

### 3.2 🔒 Đánh giá an toàn

> ✅ **Không phát hiện rò rỉ secret.** Bản portable **không chứa** `.env` thật, khớp với mô tả trong [RUN_ON_OTHER_MACHINE.md:9](../../RUN_ON_OTHER_MACHINE.md): *"Không kèm các file secret thật như `.env`, `backend/.env`, `node_modules`, `backend/vendor`"*.
>
> 📌 Lưu ý: mô tả đó nói không kèm `backend/vendor`, nhưng thư mục giải nén **có** `backend/vendor/`. Nhiều khả năng `vendor/` được cài thêm sau khi giải nén, hoặc bản `.zip` "clean" (1.8 MB) mới là bản đúng mô tả — dung lượng 1.8 MB phù hợp với một bản không có `vendor/` và `node_modules/`.

---

## 4. Nguồn gốc suy ra

Đây là **gói bàn giao portable** để chạy dự án trên máy khác, đúng như quy trình mô tả tại [RUN_ON_OTHER_MACHINE.md](../../RUN_ON_OTHER_MACHINE.md) — gồm frontend + backend + build sẵn trong `www/`.

Hai biến thể cùng thời điểm (cách nhau ~2 phút: `032642` → `032829`) gợi ý: tạo bản đầy đủ trước, sau đó tạo bản "clean" nén lại.

---

## 5. Quan hệ với phạm vi migration

| Câu hỏi | Trả lời |
|---|---|
| Có thuộc phạm vi migration không? | ❌ **Không** — đã loại trừ theo chỉ thị mục 8 |
| Có ảnh hưởng build/test/typecheck không? | ❌ Không — 🔧 `npx tsc --noEmit` exit 0; `tsconfig.json` chỉ `include: ["src"]` |
| Có được git theo dõi không? | ❌ Không — untracked + ignored |
| Có chứa nội dung độc nhất (không có ở HEAD) không? | ❓ **Chưa đối chiếu từng file** — chỉ kiểm tra ở mức cấp cao |

> ⚠️ Vì chưa đối chiếu chi tiết, **không khẳng định** bản backup hoàn toàn dư thừa. Nếu cần chắc chắn trước khi dọn, nên chạy so sánh cây thư mục với `HEAD` trong một phạm vi riêng.

---

## 6. Tuân thủ chỉ thị mục 8

| Chỉ thị | Tuân thủ |
|---|:--:|
| Chưa được phép xoá | ✅ **Không xoá** — 90 MB còn nguyên |
| Không chỉnh sửa | ✅ Chỉ đọc (`du`, `ls`, `find`, `grep`) |
| Không di chuyển | ✅ |
| Không đưa vào commit | ✅ Đã ignored bởi `.gitignore:42`; không commit gì trong phiên này |
| Lập inventory ngắn (dung lượng, tracked/untracked, nội dung cấp cao) | ✅ Tài liệu này |
| Tiếp tục loại khỏi phạm vi migration | ✅ Đã ghi nhận |

---

## 7. Khuyến nghị (chờ lệnh riêng của bạn — **không tự thực hiện**)

| # | Khuyến nghị |
|:--:|---|
| 1 | Trước khi dọn, đối chiếu cây thư mục bản portable với `HEAD` để chắc chắn không mất nội dung độc nhất |
| 2 | Nếu chỉ cần giữ một bản, `.zip` (1.8 MB) tiết kiệm hơn thư mục giải nén (88 MB) rất nhiều |
| 3 | Phần lớn 88 MB là `backend/vendor/` — có thể tái tạo bằng `composer install`, không cần lưu |
