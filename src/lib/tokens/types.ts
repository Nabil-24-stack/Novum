/**
 * Token Studio Type Definitions
 * Three-tier token architecture: Primitives → Semantics → Components
 */

// Color scale steps (Tailwind-style 50-950)
export type ColorStep =
  | "50" | "100" | "200" | "300" | "400"
  | "500" | "600" | "700" | "800" | "900" | "950";

export const COLOR_STEPS: ColorStep[] = [
  "50", "100", "200", "300", "400", "500",
  "600", "700", "800", "900", "950"
];

// HSL string format: "h s% l%" (without parentheses)
export type HSLString = string;

// A complete color scale from 50 to 950
export type ColorScale = Record<ColorStep, HSLString>;

// Default palette names
export type DefaultPaletteName = "brand" | "neutral" | "success" | "warning" | "error" | "info";

// Semantic color token names
export type SemanticColorName =
  | "background" | "foreground"
  | "card" | "card-foreground"
  | "popover" | "popover-foreground"
  | "primary" | "primary-foreground"
  | "secondary" | "secondary-foreground"
  | "muted" | "muted-foreground"
  | "accent" | "accent-foreground"
  | "destructive" | "destructive-foreground"
  | "border" | "input" | "ring";

// Semantic token with light/dark mode values
// Values are references to primitives: "brand-600" or "neutral-50"
export interface SemanticColorValue {
  light: string;
  dark: string;
}

// Radius preset names
export type RadiusPreset = "none" | "sm" | "md" | "lg" | "xl" | "full";

// Component spec names
export type ComponentName = "button" | "card" | "input" | "badge" | "dialog" | "tabs";

// Component-level customization
export interface ComponentSpec {
  radius?: RadiusPreset;
  border?: number;
  shadow?: "none" | "sm" | "md" | "lg";
}

// Global settings
export interface GlobalSettings {
  radius: Record<RadiusPreset, string>;
  typography: {
    fontSans: string;
    fontMono: string;
    baseSize: number;      // px (14-20), body text size
    scaleRatio: number;    // 1.1-1.5, modular scale factor
    weightRegular: number; // e.g. 400
    weightBold: number;    // e.g. 700
  };
  spacing: {
    baseUnit: number;      // px (2-8), the multiplier base
  };
}

/**
 * Complete Token State
 * This is the main data structure stored in /tokens.json
 */
export interface TokenState {
  version: "1.0";
  primitives: {
    colors: Record<string, ColorScale>;
    // Stores the original hex color used to generate each palette
    baseColors?: Record<string, string>;
  };
  semantics: {
    colors: Record<SemanticColorName, SemanticColorValue>;
  };
  components: Record<ComponentName, ComponentSpec>;
  globals: GlobalSettings;
}

// Preview mode for design system
export type PreviewMode = "light" | "dark";
