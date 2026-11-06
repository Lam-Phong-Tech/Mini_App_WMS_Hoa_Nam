import {HN_UI} from '../theme/uiKitV3';
/** Shared business UI paints. Status and operation colors retain separate semantics. */
export const SCANNER_COLORS={
  primary:HN_UI.primary,primaryLight:HN_UI.primaryHover,secondary:HN_UI.secondary,secondaryBorder:HN_UI.primary,
  metadata:HN_UI.primary,metadataSoft:HN_UI.selected,scan:HN_UI.primary,onBrand:HN_UI.onBrand,
  productPlaceholder:HN_UI.surfaceSunken,
} as const;
