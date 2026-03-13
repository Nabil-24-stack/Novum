import type { TokenState, SemanticColorName, SemanticColorValue } from "./types";
import { generateColorScale } from "./color-scale";

/**
 * Default Token State — Monochrome
 * Minimal, clean, modern. Monochrome surfaces with restrained blue focus cues.
 */
export const defaultTokenState: TokenState = {
  version: "2.0",
  activePresetId: "monochrome",
  primitives: {
    colors: {
      brand: generateColorScale("#111111"),
      neutral: generateColorScale("#71717A"),
      success: generateColorScale("#16A34A"),
      warning: generateColorScale("#D97706"),
      error: generateColorScale("#DC2626"),
      info: generateColorScale("#2563EB"),
    },
    baseColors: {
      brand: "#111111",
      neutral: "#71717A",
      success: "#16A34A",
      warning: "#D97706",
      error: "#DC2626",
      info: "#2563EB",
    },
  },
  semantics: {
    colors: {
      background: { light: "neutral-50", dark: "neutral-950" },
      foreground: { light: "neutral-950", dark: "neutral-50" },
      card: { light: "neutral-50", dark: "neutral-900" },
      "card-foreground": { light: "neutral-950", dark: "neutral-50" },
      popover: { light: "neutral-50", dark: "neutral-900" },
      "popover-foreground": { light: "neutral-950", dark: "neutral-50" },
      primary: { light: "brand-500", dark: "brand-50" },
      "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
      secondary: { light: "neutral-100", dark: "neutral-900" },
      "secondary-foreground": { light: "neutral-900", dark: "neutral-100" },
      muted: { light: "neutral-100", dark: "neutral-900" },
      "muted-foreground": { light: "neutral-500", dark: "neutral-400" },
      accent: { light: "neutral-100", dark: "neutral-900" },
      "accent-foreground": { light: "neutral-900", dark: "neutral-100" },
      success: { light: "success-500", dark: "success-400" },
      "success-foreground": { light: "neutral-50", dark: "neutral-950" },
      warning: { light: "warning-500", dark: "warning-400" },
      "warning-foreground": { light: "neutral-950", dark: "neutral-950" },
      info: { light: "info-500", dark: "info-400" },
      "info-foreground": { light: "neutral-50", dark: "neutral-950" },
      destructive: { light: "error-500", dark: "error-400" },
      "destructive-foreground": { light: "neutral-50", dark: "neutral-950" },
      border: { light: "neutral-200", dark: "neutral-800" },
      input: { light: "neutral-200", dark: "neutral-800" },
      ring: { light: "info-500", dark: "info-400" },
    } as Record<SemanticColorName, SemanticColorValue>,
  },
  components: {
    button: { radius: "md", border: 1, shadow: "none" },
    card: { radius: "lg", border: 1, shadow: "none" },
    input: { radius: "md", border: 1, shadow: "none" },
    badge: { radius: "full", border: 1, shadow: "none" },
    select: { radius: "md", border: 1, shadow: "none" },
    textarea: { radius: "md", border: 1, shadow: "none" },
    dialog: { radius: "lg", border: 1, shadow: "md" },
    tabs: { radius: "md", border: 1, shadow: "none" },
    alert: { radius: "lg", border: 1, shadow: "none" },
    popover: { radius: "lg", border: 1, shadow: "md" },
    tooltip: { radius: "md", border: 1, shadow: "md" },
    toast: { radius: "lg", border: 1, shadow: "md" },
    "date-picker": { radius: "lg", border: 1, shadow: "md" },
    toggle: { radius: "md", border: 1, shadow: "none" },
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
      fontSans: "'Geist', 'Inter', sans-serif",
      fontMono: "'Geist Mono', 'JetBrains Mono', monospace",
      baseSize: 14,
      scaleRatio: 1.2,
      weightRegular: 400,
      weightBold: 600,
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
  brand: "#111111",
  neutral: "#71717A",
  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",
  info: "#2563EB",
};
