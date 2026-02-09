import type { TokenState, SemanticColorName, SemanticColorValue } from "./types";
import { generateColorScale } from "./color-scale";

/**
 * Default Token State — Arctic Glass
 * Cool, clean, technical calm. Teal brand with slate neutrals.
 */
export const defaultTokenState: TokenState = {
  version: "1.0",
  primitives: {
    colors: {
      brand: generateColorScale("#0E7490"),
      neutral: generateColorScale("#64748B"),
      success: generateColorScale("#0F766E"),
      warning: generateColorScale("#D97706"),
      error: generateColorScale("#DC2626"),
      info: generateColorScale("#2563EB"),
    },
    baseColors: {
      brand: "#0E7490",
      neutral: "#64748B",
      success: "#0F766E",
      warning: "#D97706",
      error: "#DC2626",
      info: "#2563EB",
    },
  },
  semantics: {
    colors: {
      background: { light: "neutral-50", dark: "neutral-950" },
      foreground: { light: "neutral-900", dark: "neutral-100" },
      card: { light: "neutral-50", dark: "neutral-900" },
      "card-foreground": { light: "neutral-900", dark: "neutral-100" },
      popover: { light: "neutral-50", dark: "neutral-900" },
      "popover-foreground": { light: "neutral-900", dark: "neutral-100" },
      primary: { light: "brand-600", dark: "brand-400" },
      "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
      secondary: { light: "info-100", dark: "info-900" },
      "secondary-foreground": { light: "info-700", dark: "info-200" },
      muted: { light: "neutral-100", dark: "neutral-800" },
      "muted-foreground": { light: "neutral-600", dark: "neutral-400" },
      accent: { light: "brand-100", dark: "brand-900" },
      "accent-foreground": { light: "brand-800", dark: "brand-200" },
      destructive: { light: "error-500", dark: "error-400" },
      "destructive-foreground": { light: "neutral-50", dark: "neutral-950" },
      border: { light: "neutral-200", dark: "neutral-700" },
      input: { light: "neutral-200", dark: "neutral-700" },
      ring: { light: "brand-500", dark: "brand-400" },
    } as Record<SemanticColorName, SemanticColorValue>,
  },
  components: {
    button: { radius: "md", border: 1, shadow: "sm" },
    card: { radius: "lg", border: 1, shadow: "sm" },
    input: { radius: "md", border: 1, shadow: "none" },
    badge: { radius: "md", border: 1, shadow: "none" },
    dialog: { radius: "lg", border: 1, shadow: "md" },
    tabs: { radius: "md", border: 1, shadow: "none" },
  },
  globals: {
    radius: {
      none: "0",
      sm: "0.25rem",
      md: "0.5rem",
      lg: "0.75rem",
      xl: "1rem",
      full: "9999px",
    },
    typography: {
      fontSans: "'Space Grotesk', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      baseSize: 16,
      scaleRatio: 1.25,
      weightRegular: 400,
      weightBold: 700,
    },
    spacing: {
      baseUnit: 4,
    },
  },
};

/**
 * Base colors for each default palette
 * Used when regenerating scales from a color picker
 */
export const defaultBaseColors: Record<string, string> = {
  brand: "#0E7490",
  neutral: "#64748B",
  success: "#0F766E",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2563EB",
};
