# Motion and scroll registry — Prompt 00

## Platform boundary (D01)

| Runtime | Allowed direction | Not allowed |
| --- | --- | --- |
| Web preview | SmoothUI, one Motion engine, GSAP, Lenis/Locomotive and TanStack Virtual are candidates only at an approved call-site. | Cài tất cả chỉ để “đủ sáu thư viện”; hai scroll controller / hai animation engine cùng property/node. |
| Android/PDA | React Native presentation, existing scanner APIs and `@shopify/flash-list`. React Native Animated/Reanimated-equivalent only if separately approved. | DOM, `window`, `document`, Lenis, Locomotive, web Motion runtime, web virtualizer. |

Không dependency nào trong sáu candidate được cài ở Prompt 00. `apps/wms-mobile/package.json` hiện chưa có SmoothUI, Motion/Framer Motion, GSAP, Lenis, Locomotive Scroll hoặc TanStack Virtual. Không chọn version “latest” và không nâng React/RN nền trong gate.

## Bằng chứng motion hiện có của prototype 17–22

| Scene/component | Trigger/property | Timing/easing source | Reduced motion | Độ tin cậy |
| --- | --- | --- | --- | --- |
| Camera scan beam | loop `transform: translateY`, opacity | `2.6s ease-in-out infinite` | CSS tắt toàn bộ animation | Source `style.css` |
| Quantity sheet | sheet open, `translateY(12px→0)`, opacity | `0.2s ease-out` | CSS tắt animation | Source `style.css` |
| Loading skeleton | background-position | `1.7s linear infinite` | CSS tắt animation | Source `style.css` |

Prototype `@media (prefers-reduced-motion: reduce)` đặt `animation: none`, `transition: none`, `scroll-behavior: auto`. Đây là quy tắc mang sang adapter, không phải bằng chứng App native đã có parity.

## Registry đề xuất, chưa được chấp thuận để cài

| Candidate | Call-site cụ thể nếu được duyệt | Owner/runtime | Giới hạn cleanup/accessibility | Trạng thái |
| --- | --- | --- | --- | --- |
| SmoothUI | Web preview controls cho sheet/dialog/feedback, tokenized | Web | Không thay wholesale RN UI/Tailwind template | NEEDS_VERSION_AND_COMPONENT_SELECTION |
| Motion for React **hoặc** Framer Motion | Sheet/dialog enter-exit, success feedback | Web | Một engine duy nhất; stop/unmount cleanup; reduced motion | NEEDS_PACKAGE_SELECTION |
| GSAP | Scan beam không cùng node/property với Motion | Web | Kill timeline khi exit; không chạy trên camera native | NEEDS_CALLSITE_APPROVAL |
| Lenis | Một scroll root trang web preview, nếu scroll native browser không đạt acceptance | Web | Một RAF/controller; keyboard, modal/focus must work | NEEDS_ACCEPTANCE_EVIDENCE |
| Locomotive Scroll | In-view/scene frame only nếu implementation chọn không trùng Lenis | Web | Phải xác minh version có hay không dùng Lenis bên trong | NEEDS_IMPLEMENTATION_DECISION |
| TanStack Virtual | Lịch sử dài web (`history`, NFC/scan events) | Web | stable ID, measured rows, scroll restore; không animate positioning wrapper | NEEDS_DATA_VOLUME_AND_VERSION |

## Acceptance cần chạy ở từng motion call-site

1. no-preference và reduced motion;
2. tap/click, keyboard focus, Escape/Back và modal focus return;
3. loading/pending/error/cancel/unmount cleanup;
4. 360/390/430 CSS px khi áp dụng prototype 17–22;
5. Android/PDA adapter độc lập, không import DOM runtime;
6. screen recording hoặc video, không dùng ảnh tĩnh để kết luận motion PASS.

## Gate conclusion

Motion matrix có source cho ba animation prototype, nhưng chưa có package/version/call-site được duyệt cho App Web. Vì vậy motion integration là `BLOCKED`, không phải đã cài hoặc đã pass.
