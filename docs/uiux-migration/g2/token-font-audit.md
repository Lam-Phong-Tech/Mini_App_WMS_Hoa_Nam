# UIUX-G2 token and font audit

**Updated:** 2026-09-09T16:28:39.3111985+07:00

## Source tokens

The locked Designer token source is `styles/hoa-nam-color-tokens.css` at
`Duc-Nguyen98/WMS_UIUX_HoaNamv2@86079f965f2fcb43a7e3efbbc9467d119b47921f`.
Its manifest hash is `09b20995285151835ddd3b44cfe3a97ea130f1818d600e9871d6d7416ff5e142`.
The target must use those values in a scoped target stylesheet; the current
target stylesheet still defines the former purple palette.

The locked values identified for the migration are:

| Token | Locked value |
| --- | --- |
| `--hn-primary` | `#0C6286` |
| `--hn-primary-dark` | `#0C5D7D` |
| `--hn-support-blue` | `#5E93A7` |
| `--hn-near-white` | `#FAFCFC` |
| `--hn-text-primary` | `#1D2939` |
| `--hn-text-secondary` | `#475467` |
| `--hn-text-muted` | `#667085` |
| `--hn-border` | `#E4ECEF` |
| `--hn-surface` | `#FFFFFF` |
| `--hn-success` | `#28C76F` |
| `--hn-warning` | `#FF9F43` |
| `--hn-danger` | `#EA5455` |
| `--hn-info` | `#00CFE8` |

## Initial font finding

The target's `src/css/app.scss` declares `"Public Sans"` in its font stack,
but the workspace contains no `.woff`, `.woff2`, `.ttf`, or `.otf` file.
No `@font-face`, Fontsource package, or approved external font host is present
in the target source. Consequently, the browser will fall back to a system font
unless an external environment happens to provide Public Sans; that cannot be
used as evidence that the baseline font is loaded.

The G2 prompt requires a real approved Public Sans asset/font source and a
load/weight check. D01–D08 authorize Green public API/config/media only; they
do not authorize a new external font host or the addition of a font binary.

## Resolved font source and load check

The user subsequently confirmed the Google Fonts Public Sans source and weights
400, 500, 600, 700 and 800 (D09). The target bundles the five static files under
`public/fonts` and declares `@font-face` in `src/css/hoa-nam-theme.scss`; no
runtime page needs to reach Google to render them.

| File | SHA-256 |
| --- | --- |
| `public-sans-400.ttf` | `d8a092f98db3ae7c7f01e73f8f23aaaec97f16c325765042ae5a052f4d8de546` |
| `public-sans-500.ttf` | `8a90dbaae19b05944cb94e15e82e7eddac6fb450131a697a524a332f1c923430` |
| `public-sans-600.ttf` | `b463fd85acc683d2bb5066f222c0a56152ceab1301e80051bcc65755db6872f0` |
| `public-sans-700.ttf` | `0daaf804b064cf37990f38ff9ba89fc8029e879f8e64260e7bfa6ef739569c3a` |
| `public-sans-800.ttf` | `93aa27b7c8c81dd71e4856a3535a44bfb014bdda9266cc9521b506d60ec34769` |

Chrome headless at the local Green adapter loaded every face and `document.fonts.check`
returned true for every approved weight. The generic `document.fonts.status`
remained `loading` only because the unrelated ZaUI icon face was not requested;
it does not affect the five Public Sans face results.

This is a target font-load PASS. It is not a pixel-match claim.
