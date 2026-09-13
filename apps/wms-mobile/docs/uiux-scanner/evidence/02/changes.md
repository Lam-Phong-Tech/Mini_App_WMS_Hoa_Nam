# Changes — Prompt 02 Home

- Home uses five visual/product tabs: Trang chủ, Chứng từ, Quét mã, Lịch sử,
  Cá nhân. The user superseded the earlier four-tab decision by requesting the
  Home to match the supplied five-tab reference.
- Rebuilt the Home hierarchy for the reviewed `390×844` viewport: warehouse
  hero, KPI rail, two-column task grid, scan CTA, recent documents, floating
  scan dock and fixed bottom navigation.
- Corrected React Native Web rounding that caused the four task cards to wrap
  into one column at the reference width.
- Added semantic application icon names and applied the approved mapping in
  `HomeScreen` and `BottomNav`; no icon font or DOM-only library was added.
- Removed the non-functional hardcoded unread-notification badge. The bell is
  decorative/unavailable until a notification read contract and destination
  are wired.
- Home summary preserves a prior good snapshot after reload failure and rejects
  stale responses; covered by existing regression tests.
