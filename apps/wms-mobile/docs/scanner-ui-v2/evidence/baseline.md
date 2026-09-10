# Baseline evidence — 2026-09-10

Môi trường: Windows PowerShell; `apps/wms-mobile`; source revision `7f4d4006608009c400a4d6652200db030677db86`. Không chạy auto-deploy trong Gate này.

| Command | Exit | Kết quả có thể kết luận |
| --- | ---: | --- |
| `npm run typecheck` | 0 | TypeScript không báo lỗi. |
| `npm test -- --runInBand` | 0 | 31 suites, 856 tests pass. Output vẫn có React `act(...)` warnings; warning không đổi exit code. |
| `npm run lint` | 1 | 65 errors, 10,968 warnings. Baseline lint fail; không tự `--fix`. |
| `npm run build:web` | 0 | Vite build thành công, 930 modules. Có warning bundle >500 kB sau minify. |

Raw command output được chạy trong phiên Gate; bảng này chỉ ghi đúng exit code/tóm tắt, không thay thế log CI. SHA-256 của evidence file này được ghi ở GATE_01 sau khi tạo.
