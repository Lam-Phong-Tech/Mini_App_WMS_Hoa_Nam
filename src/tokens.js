const xTokens = {
  colors: {
    primary: "var(--wms-primary)",
    surface: "var(--wms-surface)",
    canvas: "var(--wms-surface-canvas)",
    ink: "var(--wms-text-strong)",
    muted: "var(--wms-text-muted)",
    divider: "var(--wms-divider)",
    success: "var(--wms-success)",
    danger: "var(--wms-danger)",
    warning: "var(--wms-warning)",
    info: "var(--wms-info)",
    // Compatibility aliases resolve to the same X palette while legacy pages retire.
    neutral100: "var(--wms-surface-subtle)",
    neutral300: "var(--wms-text-muted)",
    neutral500: "var(--wms-text-muted)",
    neutral900: "var(--wms-text-strong)",
  },
  fontFamily: {
    sans: [
      "Public Sans",
      "system-ui",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "sans-serif",
    ],
    system: ["Public Sans", "system-ui", "sans-serif"],
  },
  fontSize: {
    small: ["15px", { lineHeight: "22px" }],
    normal: ["15px", { lineHeight: "22px" }],
    large: ["16px", { lineHeight: "24px" }],
  },
  borderRadius: {
    card: "var(--wms-radius-card)",
    control: "var(--wms-radius-control)",
    sheet: "var(--wms-radius-sheet)",
  },
  boxShadow: {
    card: "var(--wms-shadow-card)",
    floating: "var(--wms-shadow-floating)",
  },
  transitionDuration: {
    fast: "140ms",
    normal: "220ms",
  },
  transitionTimingFunction: {
    wms: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    6: "24px",
    8: "32px",
  },
};

export default xTokens;
