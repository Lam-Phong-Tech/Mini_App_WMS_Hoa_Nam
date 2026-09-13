# Checks — Prompt 01

All commands use `apps/wms-mobile` as the working directory unless noted.

| Check | Status | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` exited 0 at 2026-09-11 17:04 ICT. |
| Lint source/test | PASS | `npm run lint` exited 0: 0 errors, 9 baseline warnings; no warning comes from Prompt 01 files. |
| Focused auth fixtures | PASS | `npm test -- --runInBand __tests__/authFlow.test.tsx __tests__/tokenRefresh.test.ts`: 2 suites / 51 tests. Includes 401 refresh rejection, interrupted refresh, different-user replacement, same-frame double submit and password selection. |
| Full test suite | PASS | `npm test -- --runInBand --silent`: 32 suites / 866 tests passed. |
| Web production build | PASS | `npm run build:web` exited 0 at 2026-09-11 17:05 ICT; Vite reports its existing >500 kB bundle-size warning only. |
| Login visual | PASS | Gate 00 fixture `../00/login-d07-390x844-dpr3.png` is the user-approved Login baseline (Chromium `390×844`, DPR 3, `vi-VN`, `Asia/Ho_Chi_Minh`, safe-area 0). Current local preview rendered the same anonymous Login controls; this Prompt's new code changes event/state handling only, not Login text/style/layout. |
| Web dev server | PASS | `npm run web` serves the Login screen. `optimizeDeps.exclude` keeps React Native and Safe Area Context out of esbuild prebundling, allowing Vite to resolve their `.web` files instead of native Flow sources. |
| Authenticated DEV API | PASS | On Xiaomi 2206122SC / Android 13, the user-supplied DEV account completed Login → session confirmation. Backend data rendered as **Quản lý kho 01**, role **Quản lý kho**, warehouse scope **Theo phạm vi phân quyền**. |
| Real Android logout / re-login | PASS | Home → Cá nhân → Đăng xuất → confirmation → Login → re-login → session confirmation → Home. No scan, stock or document write action was taken. |
| Android/PDA camera/NFC | OUT OF SCOPE | Prompt 01 is authentication. Hardware scan/NFC acceptance belongs to the assigned flow gates. |
| Static motion | PASS | User explicitly approved static React Native motion for Prompt 01. No motion package or `Animated`/`LayoutAnimation` call-site exists in Login, session confirmation or AppShell. |

The web preview used the app with an empty local profile, not a data fixture.
Real-device auth evidence does not include passwords or access tokens;
controlled auth fixtures use fake identities/tokens only.
