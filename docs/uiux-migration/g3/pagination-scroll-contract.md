# UIUX-G3 pagination and scroll contract

**Recorded:** 2026-09-09T18:31:00+07:00

## Server versus client state

The public products API remains opaque cursor pagination. `useProductResults`
now keeps these distinct values:

| Value | Meaning |
| --- | --- |
| `loadedProducts` / `loadedCount` | unique, eligible records returned by completed Green cursor pages |
| `products` / `renderedCount` | leading subset intentionally mounted in the current progressive grid |
| `nextCursor` | opaque server cursor only; never inferred from a count |

The first Green page loads 20 records; the UI starts at a four-card batch and
reveals four further cards. The sentinel may immediately reveal the second
four-card batch when it is already in the viewport; it does not issue a second
server page until the 20 loaded cards have been exposed. At append failure the
previous cards, cursor and retry control remain mounted.

Each query-key generation invalidates first-page and append responses. A later
query cannot receive a response that was started for an older key. Duplicate
`product_id`/slug records and non-public availability remain removed by the
existing public mapper utility.

## Scroll ownership

The measured target owner remains ZaUI `.hn-page`; `window.scrollY` stays zero.

- `InfiniteLoadTrigger` uses that element as its `IntersectionObserver` root.
- `use-scroll-restoration` records/restores `.hn-page.scrollTop` after data
  readiness, not `window.scrollY`.
- Filter open locks `.hn-page`; Escape restores it.
- TanStack receives `.hn-page` through `getScrollElement`. It owns only virtual
  row placement; GSAP never transforms virtual rows.

## Virtualization and motion

- Threshold: `loadedEligibleCount >= 80` **and** `renderedEligibleCount >= 80`.
- Mobile renders 2 columns, desktop 4. Resize triggers `virtualizer.measure()`;
  focused rows are retained by the range extractor.
- Browser Green evidence reached exactly 80 loaded/rendered records from four
  20-record cursor pages, observed 12 mounted mobile cards, and retained focus
  after deep scroll. The same virtual list changed to four columns on resize.
- `@tanstack/react-virtual@3.14.10` and `gsap@3.15.0` were added. GSAP is a
  lazy optional import for new non-virtual cards only (`.5 → 1`, `y: 6 → 0`,
  `.18s`, `.025s`, `power1.out`, cleanup via `context.revert`). Reduced motion
  skips it; module failure leaves content visible.

The 79/80/81 threshold utility assertions pass. There is not yet an approved
controlled runtime dataset for the exact 79 and 81 interactive cases; see the
G3 gate blocker.
