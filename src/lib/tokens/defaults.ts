import type { TokenState, ColorScale, SemanticColorValue, SemanticColorName } from "./types";

/**
 * Default color scales
 * These are pre-generated scales that serve as starting points
 */

const brandScale: ColorScale = {
  "50": "217 91% 97%",
  "100": "217 91% 94%",
  "200": "217 91% 86%",
  "300": "217 91% 74%",
  "400": "217 91% 60%",
  "500": "217 91% 51%",
  "600": "217 91% 45%",
  "700": "217 91% 38%",
  "800": "217 91% 30%",
  "900": "217 91% 22%",
  "950": "217 91% 12%",
};

const neutralScale: ColorScale = {
  "50": "0 0% 98%",
  "100": "0 0% 96%",
  "200": "0 0% 90%",
  "300": "0 0% 83%",
  "400": "0 0% 64%",
  "500": "0 0% 45%",
  "600": "0 0% 32%",
  "700": "0 0% 25%",
  "800": "0 0% 15%",
  "900": "0 0% 9%",
  "950": "0 0% 4%",
};

const successScale: ColorScale = {
  "50": "142 76% 97%",
  "100": "142 76% 93%",
  "200": "142 76% 83%",
  "300": "142 76% 68%",
  "400": "142 69% 49%",
  "500": "142 71% 40%",
  "600": "142 76% 33%",
  "700": "142 76% 27%",
  "800": "142 76% 21%",
  "900": "142 76% 16%",
  "950": "142 76% 9%",
};

const warningScale: ColorScale = {
  "50": "45 93% 97%",
  "100": "45 93% 93%",
  "200": "45 93% 82%",
  "300": "45 93% 68%",
  "400": "45 93% 52%",
  "500": "45 93% 44%",
  "600": "45 93% 36%",
  "700": "45 93% 29%",
  "800": "45 93% 22%",
  "900": "45 93% 16%",
  "950": "45 93% 9%",
};

const errorScale: ColorScale = {
  "50": "0 86% 97%",
  "100": "0 86% 94%",
  "200": "0 86% 87%",
  "300": "0 86% 76%",
  "400": "0 84% 63%",
  "500": "0 84% 53%",
  "600": "0 72% 46%",
  "700": "0 74% 38%",
  "800": "0 70% 31%",
  "900": "0 63% 25%",
  "950": "0 75% 14%",
};

const infoScale: ColorScale = {
  "50": "199 89% 97%",
  "100": "199 89% 93%",
  "200": "199 89% 84%",
  "300": "199 89% 72%",
  "400": "199 89% 57%",
  "500": "199 89% 48%",
  "600": "199 89% 40%",
  "700": "199 89% 33%",
  "800": "199 89% 26%",
  "900": "199 89% 19%",
  "950": "199 89% 11%",
};

/**
 * Default semantic color mappings
 * Each token maps to a primitive reference for both light and dark modes
 */
const defaultSemanticColors: Record<SemanticColorName, SemanticColorValue> = {
  background: { light: "neutral-50", dark: "neutral-950" },
  foreground: { light: "neutral-950", dark: "neutral-50" },

  card: { light: "neutral-50", dark: "neutral-900" },
  "card-foreground": { light: "neutral-950", dark: "neutral-50" },

  popover: { light: "neutral-50", dark: "neutral-900" },
  "popover-foreground": { light: "neutral-950", dark: "neutral-50" },

  primary: { light: "brand-600", dark: "brand-400" },
  "primary-foreground": { light: "neutral-50", dark: "neutral-950" },

  secondary: { light: "neutral-100", dark: "neutral-800" },
  "secondary-foreground": { light: "neutral-900", dark: "neutral-100" },

  muted: { light: "neutral-100", dark: "neutral-800" },
  "muted-foreground": { light: "neutral-500", dark: "neutral-400" },

  accent: { light: "neutral-100", dark: "neutral-800" },
  "accent-foreground": { light: "neutral-900", dark: "neutral-100" },

  destructive: { light: "error-500", dark: "error-400" },
  "destructive-foreground": { light: "neutral-50", dark: "neutral-950" },

  border: { light: "neutral-200", dark: "neutral-800" },
  input: { light: "neutral-200", dark: "neutral-800" },
  ring: { light: "brand-500", dark: "brand-400" },
};

/**
 * Default Token State
 * This is the complete initial state for a new project
 */
export const defaultTokenState: TokenState = {
  version: "1.0",
  primitives: {
    colors: {
      brand: brandScale,
      neutral: neutralScale,
      success: successScale,
      warning: warningScale,
      error: errorScale,
      info: infoScale,
    },
    baseColors: {
      brand: "#3b82f6",     // Blue
      neutral: "#737373",   // Gray
      success: "#22c55e",   // Green
      warning: "#eab308",   // Yellow
      error: "#ef4444",     // Red
      info: "#0ea5e9",      // Sky
    },
  },
  semantics: {
    colors: defaultSemanticColors,
  },
  components: {
    button: { radius: "md", border: 0, shadow: "none" },
    card: { radius: "lg", border: 1, shadow: "sm" },
    input: { radius: "md", border: 1, shadow: "none" },
    badge: { radius: "full", border: 0, shadow: "none" },
    dialog: { radius: "lg", border: 1, shadow: "lg" },
    tabs: { radius: "md", border: 0, shadow: "none" },
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
      fontSans: "'Inter', sans-serif",
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
 * Base colors for each default palette (the "500" color)
 * Used when regenerating scales from a color picker
 */
export const defaultBaseColors: Record<string, string> = {
  brand: "#3b82f6",     // Blue
  neutral: "#737373",   // Gray
  success: "#22c55e",   // Green
  warning: "#eab308",   // Yellow
  error: "#ef4444",     // Red
  info: "#0ea5e9",      // Sky
};
