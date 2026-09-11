# Checks — Prompt 01

All commands use `apps/wms-mobile` as the working directory unless noted.

| Check | Status | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` exited 0. |
| Relevant lint | PASS | `npx eslint src/features/auth/LoginScreen.tsx src/features/auth/SessionConfirmationScreen.tsx src/app/AppShell.tsx src/services/wms/queries.ts src/services/wms/types.ts __tests__/authFlow.test.tsx` exited 0 after local style cleanup. |
| Relevant tests | PASS | `npm test -- --runInBand __tests__/authFlow.test.tsx`: 1 suite / 22 tests passed. |
| Full test suite | PASS | `npm test -- --runInBand --silent`: 32 suites / 863 tests passed. |
| Web production build | PASS | `npm run build:web` exited 0; Vite reports its existing >500 kB bundle-size warning. |
| Web manual UI | PASS (scoped) | In-app browser opened production preview at `390×844`; login screen showed dark surface, white card, green CTA. Empty submit showed two field errors; show/hide changed its accessible label from `Hiện mật khẩu` to `Ẩn mật khẩu`. |
| Web dev server | FAIL (non-release) | `npm run web` fails while Vite prebundles React Native Flow source (`codegenNativeComponent.js: Expected from but found {`). Production build and `vite preview` work; not changed in this Prompt. |
| Authenticated DEV API | NOT_RUN | No DEV account/role was supplied. No credentials were typed or sent. |
| Android/PDA keyboard, Back, camera/NFC | NOT_RUN | No physical device was supplied; only source/unit coverage and web preview were checked. |
| Pixel/motion diff | NOT_RUN | Board 01 has no approved crop/DPR/safe-area or native motion call-site. D06 forbids a pixel-perfect claim. |

The preview used the built app, not a data fixture. It intentionally remained
at the login screen; no login, logout or write request was sent during manual
browser verification.
