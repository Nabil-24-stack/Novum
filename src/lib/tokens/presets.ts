/**
 * Token Studio Presets
 * Complete design system presets that can be applied with one click
 */

import type { TokenState, SemanticColorName, SemanticColorValue } from "./types";
import { generateColorScale, generateNeutralScale } from "./color-scale";

/**
 * Preset metadata and preview colors
 */
export interface PresetPreview {
  background: string;  // Background color (hex)
  primary: string;     // Primary/brand color (hex)
  accent: string;      // Accent/secondary color (hex)
  foreground: string;  // Text color (hex)
}

/**
 * Complete preset definition
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  preview: PresetPreview;
  tokens: TokenState;
}

/**
 * Helper to create semantic color mappings
 */
function createSemanticColors(
  overrides: Partial<Record<SemanticColorName, SemanticColorValue>>
): Record<SemanticColorName, SemanticColorValue> {
  const defaults: Record<SemanticColorName, SemanticColorValue> = {
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

  return { ...defaults, ...overrides };
}

// ============================================================================
// BRUTALIST PRESET
// Raw, bold, uncompromising. Sharp edges, heavy borders, monospace typography.
// ============================================================================

const brutalistPreset: Preset = {
  id: "brutalist",
  name: "Brutalist",
  description: "Raw, bold, uncompromising",
  preview: {
    background: "#FFFFFF",
    primary: "#FF0000",
    accent: "#000000",
    foreground: "#000000",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#FF0000"),     // Pure red
        neutral: generateNeutralScale(),          // True grays
        success: generateColorScale("#059669"),   // Bold emerald (was #00FF00 — too bright)
        warning: generateColorScale("#D97706"),   // Bold amber (was #FFFF00 — invisible on white)
        error: generateColorScale("#B91C1C"),     // Dark crimson (was #FF0000 — identical to brand)
        info: generateColorScale("#2563EB"),      // Bold blue (was #0000FF — slightly softened)
      },
      baseColors: {
        brand: "#FF0000",
        neutral: "#808080",
        success: "#059669",
        warning: "#D97706",
        error: "#B91C1C",
        info: "#2563EB",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-950", dark: "neutral-50" },
        primary: { light: "brand-500", dark: "brand-400" },
        "primary-foreground": { light: "neutral-50", dark: "neutral-50" },
        destructive: { light: "error-500", dark: "error-400" },
        "destructive-foreground": { light: "neutral-50", dark: "neutral-50" },
        border: { light: "neutral-950", dark: "neutral-50" },
        input: { light: "neutral-950", dark: "neutral-50" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "none", border: 1, shadow: "none" },
      card: { radius: "none", border: 1, shadow: "none" },
      input: { radius: "none", border: 1, shadow: "none" },
      badge: { radius: "none", border: 1, shadow: "none" },
      dialog: { radius: "none", border: 1, shadow: "none" },
      tabs: { radius: "none", border: 1, shadow: "none" },
    },
    globals: {
      radius: {
        none: "0",
        sm: "0",
        md: "0",
        lg: "0",
        xl: "0",
        full: "0",
      },
      typography: {
        fontSans: "'JetBrains Mono', monospace",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 15,
        scaleRatio: 1.333,
        weightRegular: 400,
        weightBold: 800,
      },
      spacing: {
        baseUnit: 3,
      },
    },
  },
};

// ============================================================================
// SOFT PRESET
// Gentle, warm, approachable. Large rounded corners, subtle shadows, pastels.
// ============================================================================

const softPreset: Preset = {
  id: "soft",
  name: "Soft",
  description: "Gentle, warm, approachable",
  preview: {
    background: "#FAF9F7",
    primary: "#8B5CF6",
    accent: "#F3E8FF",
    foreground: "#44403C",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#8B5CF6"),     // Soft violet
        neutral: generateColorScale("#78716C"),   // Warm stone grays (was #A8A29E — too light for muted text)
        success: generateColorScale("#10B981"),   // Soft emerald
        warning: generateColorScale("#F59E0B"),   // Warm amber
        error: generateColorScale("#F43F5E"),     // Soft rose
        info: generateColorScale("#6366F1"),      // Soft indigo
      },
      baseColors: {
        brand: "#8B5CF6",
        neutral: "#78716C",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#F43F5E",
        info: "#6366F1",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-800", dark: "neutral-100" },
        card: { light: "neutral-50", dark: "neutral-900" },
        "card-foreground": { light: "neutral-800", dark: "neutral-100" },
        primary: { light: "brand-500", dark: "brand-400" },
        "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
        secondary: { light: "brand-100", dark: "brand-900" },
        "secondary-foreground": { light: "brand-700", dark: "brand-200" },
        muted: { light: "neutral-100", dark: "neutral-800" },
        "muted-foreground": { light: "neutral-500", dark: "neutral-400" },
        accent: { light: "brand-50", dark: "brand-900" },
        "accent-foreground": { light: "brand-700", dark: "brand-200" },
        border: { light: "neutral-200", dark: "neutral-800" },
        input: { light: "neutral-200", dark: "neutral-700" },
        ring: { light: "brand-400", dark: "brand-500" },
      }),
    },
    components: {
      button: { radius: "lg", border: 0, shadow: "sm" },
      card: { radius: "xl", border: 0, shadow: "md" },
      input: { radius: "lg", border: 1, shadow: "none" },
      badge: { radius: "full", border: 0, shadow: "none" },
      dialog: { radius: "xl", border: 0, shadow: "lg" },
      tabs: { radius: "lg", border: 0, shadow: "none" },
    },
    globals: {
      radius: {
        none: "0",
        sm: "0.5rem",
        md: "1rem",
        lg: "1.5rem",
        xl: "2rem",
        full: "9999px",
      },
      typography: {
        fontSans: "'Plus Jakarta Sans', sans-serif",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 16,
        scaleRatio: 1.2,
        weightRegular: 400,
        weightBold: 600,
      },
      spacing: {
        baseUnit: 5,
      },
    },
  },
};

// ============================================================================
// NEON PRESET
// Vibrant, electric, futuristic. Dark backgrounds, glowing neon accents.
// ============================================================================

const neonPreset: Preset = {
  id: "neon",
  name: "Neon",
  description: "Vibrant, electric, futuristic",
  preview: {
    background: "#0F172A",
    primary: "#22D3EE",
    accent: "#A855F7",
    foreground: "#F1F5F9",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#22D3EE"),     // Electric cyan
        neutral: generateColorScale("#64748B"),   // Slate grays
        success: generateColorScale("#4ADE80"),   // Neon green
        warning: generateColorScale("#FBBF24"),   // Electric yellow
        error: generateColorScale("#FB7185"),     // Neon pink
        info: generateColorScale("#A855F7"),      // Electric purple
      },
      baseColors: {
        brand: "#22D3EE",
        neutral: "#64748B",
        success: "#4ADE80",
        warning: "#FBBF24",
        error: "#FB7185",
        info: "#A855F7",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-100", dark: "neutral-950" },
        foreground: { light: "neutral-900", dark: "neutral-100" },
        card: { light: "neutral-50", dark: "neutral-900" },
        "card-foreground": { light: "neutral-900", dark: "neutral-100" },
        primary: { light: "brand-500", dark: "brand-400" },
        "primary-foreground": { light: "neutral-950", dark: "neutral-950" },
        secondary: { light: "info-100", dark: "info-900" },
        "secondary-foreground": { light: "info-700", dark: "info-300" },
        muted: { light: "neutral-200", dark: "neutral-800" },
        "muted-foreground": { light: "neutral-700", dark: "neutral-300" },
        accent: { light: "brand-100", dark: "brand-900" },
        "accent-foreground": { light: "brand-700", dark: "brand-300" },
        border: { light: "neutral-300", dark: "neutral-700" },
        input: { light: "neutral-300", dark: "neutral-700" },
        ring: { light: "brand-400", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "md", border: 1, shadow: "sm" },
      card: { radius: "lg", border: 1, shadow: "md" },
      input: { radius: "md", border: 1, shadow: "none" },
      badge: { radius: "md", border: 1, shadow: "none" },
      dialog: { radius: "lg", border: 1, shadow: "lg" },
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
        fontSans: "'Outfit', sans-serif",
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
  },
};

// ============================================================================
// EDITORIAL PRESET
// Refined, typographic, high-contrast. Crisp surfaces and disciplined color.
// ============================================================================

const editorialPreset: Preset = {
  id: "editorial",
  name: "Editorial",
  description: "Refined, typographic, high-contrast",
  preview: {
    background: "#F8F6F1",
    primary: "#1E3A8A",
    accent: "#E7E1D6",
    foreground: "#1F2937",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#1E3A8A"),
        neutral: generateColorScale("#78716C"),
        success: generateColorScale("#15803D"),
        warning: generateColorScale("#B45309"),
        error: generateColorScale("#B91C1C"),
        info: generateColorScale("#0F766E"),
      },
      baseColors: {
        brand: "#1E3A8A",
        neutral: "#78716C",
        success: "#15803D",
        warning: "#B45309",
        error: "#B91C1C",
        info: "#0F766E",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-900", dark: "neutral-100" },
        card: { light: "neutral-50", dark: "neutral-900" },
        "card-foreground": { light: "neutral-900", dark: "neutral-100" },
        popover: { light: "neutral-50", dark: "neutral-900" },
        "popover-foreground": { light: "neutral-900", dark: "neutral-100" },
        primary: { light: "brand-600", dark: "brand-400" },
        "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
        secondary: { light: "neutral-100", dark: "neutral-800" },
        "secondary-foreground": { light: "neutral-800", dark: "neutral-100" },
        muted: { light: "neutral-100", dark: "neutral-800" },
        "muted-foreground": { light: "neutral-600", dark: "neutral-400" },
        accent: { light: "info-100", dark: "info-900" },
        "accent-foreground": { light: "info-800", dark: "info-200" },
        border: { light: "neutral-300", dark: "neutral-700" },
        input: { light: "neutral-300", dark: "neutral-700" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "sm", border: 1, shadow: "none" },
      card: { radius: "md", border: 1, shadow: "sm" },
      input: { radius: "sm", border: 1, shadow: "none" },
      badge: { radius: "sm", border: 1, shadow: "none" },
      dialog: { radius: "md", border: 1, shadow: "md" },
      tabs: { radius: "sm", border: 1, shadow: "none" },
    },
    globals: {
      radius: {
        none: "0",
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      typography: {
        fontSans: "'Playfair Display', serif",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 17,
        scaleRatio: 1.25,
        weightRegular: 400,
        weightBold: 700,
      },
      spacing: {
        baseUnit: 4,
      },
    },
  },
};

// ============================================================================
// TERRA PRESET
// Earthy, grounded, handcrafted. Organic warmth with soft forms.
// ============================================================================

const terraPreset: Preset = {
  id: "terra",
  name: "Terra",
  description: "Earthy, grounded, handcrafted",
  preview: {
    background: "#F6F1E8",
    primary: "#2F6B4F",
    accent: "#C48A5A",
    foreground: "#3F3A36",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#2F6B4F"),
        neutral: generateColorScale("#7A6E66"),
        success: generateColorScale("#3A7D44"),
        warning: generateColorScale("#C17A2C"),
        error: generateColorScale("#A63D40"),
        info: generateColorScale("#2C7A7B"),
      },
      baseColors: {
        brand: "#2F6B4F",
        neutral: "#7A6E66",
        success: "#3A7D44",
        warning: "#C17A2C",
        error: "#A63D40",
        info: "#2C7A7B",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-900", dark: "neutral-100" },
        card: { light: "neutral-50", dark: "neutral-900" },
        "card-foreground": { light: "neutral-900", dark: "neutral-100" },
        popover: { light: "neutral-50", dark: "neutral-900" },
        "popover-foreground": { light: "neutral-900", dark: "neutral-100" },
        primary: { light: "brand-600", dark: "brand-400" },
        "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
        secondary: { light: "warning-100", dark: "warning-900" },
        "secondary-foreground": { light: "warning-800", dark: "warning-200" },
        muted: { light: "neutral-100", dark: "neutral-800" },
        "muted-foreground": { light: "neutral-600", dark: "neutral-400" },
        accent: { light: "info-100", dark: "info-900" },
        "accent-foreground": { light: "info-800", dark: "info-200" },
        border: { light: "neutral-200", dark: "neutral-700" },
        input: { light: "neutral-200", dark: "neutral-700" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "lg", border: 0, shadow: "sm" },
      card: { radius: "xl", border: 0, shadow: "md" },
      input: { radius: "lg", border: 1, shadow: "none" },
      badge: { radius: "full", border: 0, shadow: "none" },
      dialog: { radius: "xl", border: 0, shadow: "lg" },
      tabs: { radius: "lg", border: 0, shadow: "none" },
    },
    globals: {
      radius: {
        none: "0",
        sm: "0.375rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      typography: {
        fontSans: "'Lora', serif",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 16,
        scaleRatio: 1.2,
        weightRegular: 400,
        weightBold: 600,
      },
      spacing: {
        baseUnit: 5,
      },
    },
  },
};

// ============================================================================
// ARCTIC GLASS PRESET
// Cool, clean, technical calm. Crisp cyan-blue system with balanced contrast.
// ============================================================================

const arcticPreset: Preset = {
  id: "arctic",
  name: "Arctic Glass",
  description: "Cool, clean, technical calm",
  preview: {
    background: "#EEF6FB",
    primary: "#0E7490",
    accent: "#CFFAFE",
    foreground: "#0F172A",
  },
  tokens: {
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
      colors: createSemanticColors({
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
        border: { light: "neutral-200", dark: "neutral-700" },
        input: { light: "neutral-200", dark: "neutral-700" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
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
  },
};

// ============================================================================
// SUNSET POP PRESET
// Warm, energetic, expressive. Orange-forward with vivid magenta accents.
// ============================================================================

const sunsetPopPreset: Preset = {
  id: "sunset-pop",
  name: "Sunset Pop",
  description: "Warm, energetic, expressive",
  preview: {
    background: "#FFF3E8",
    primary: "#EA580C",
    accent: "#F472B6",
    foreground: "#431407",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#EA580C"),
        neutral: generateColorScale("#9A6B5B"),
        success: generateColorScale("#16A34A"),
        warning: generateColorScale("#F59E0B"),
        error: generateColorScale("#E11D48"),
        info: generateColorScale("#DB2777"),
      },
      baseColors: {
        brand: "#EA580C",
        neutral: "#9A6B5B",
        success: "#16A34A",
        warning: "#F59E0B",
        error: "#E11D48",
        info: "#DB2777",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-900", dark: "neutral-100" },
        card: { light: "neutral-50", dark: "neutral-900" },
        "card-foreground": { light: "neutral-900", dark: "neutral-100" },
        popover: { light: "neutral-50", dark: "neutral-900" },
        "popover-foreground": { light: "neutral-900", dark: "neutral-100" },
        primary: { light: "brand-600", dark: "brand-400" },
        "primary-foreground": { light: "neutral-50", dark: "neutral-950" },
        secondary: { light: "info-100", dark: "info-900" },
        "secondary-foreground": { light: "info-800", dark: "info-200" },
        muted: { light: "neutral-100", dark: "neutral-800" },
        "muted-foreground": { light: "neutral-600", dark: "neutral-400" },
        accent: { light: "error-100", dark: "error-900" },
        "accent-foreground": { light: "error-800", dark: "error-200" },
        border: { light: "neutral-200", dark: "neutral-700" },
        input: { light: "neutral-200", dark: "neutral-700" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "md", border: 0, shadow: "md" },
      card: { radius: "lg", border: 0, shadow: "md" },
      input: { radius: "md", border: 1, shadow: "none" },
      badge: { radius: "full", border: 0, shadow: "none" },
      dialog: { radius: "lg", border: 0, shadow: "lg" },
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
        fontSans: "'Poppins', sans-serif",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 16,
        scaleRatio: 1.25,
        weightRegular: 400,
        weightBold: 700,
      },
      spacing: {
        baseUnit: 4.5,
      },
    },
  },
};

// ============================================================================
// NOIR LUXE PRESET
// Dark premium palette with metallic gold highlights and steel contrast.
// ============================================================================

const noirLuxePreset: Preset = {
  id: "noir-luxe",
  name: "Noir Luxe",
  description: "Dark premium, metallic contrast",
  preview: {
    background: "#0B1020",
    primary: "#D4A017",
    accent: "#334155",
    foreground: "#F8FAFC",
  },
  tokens: {
    version: "1.0",
    primitives: {
      colors: {
        brand: generateColorScale("#D4A017"),
        neutral: generateColorScale("#64748B"),
        success: generateColorScale("#22C55E"),
        warning: generateColorScale("#F59E0B"),
        error: generateColorScale("#F43F5E"),
        info: generateColorScale("#38BDF8"),
      },
      baseColors: {
        brand: "#D4A017",
        neutral: "#64748B",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#F43F5E",
        info: "#38BDF8",
      },
    },
    semantics: {
      colors: createSemanticColors({
        background: { light: "neutral-50", dark: "neutral-950" },
        foreground: { light: "neutral-900", dark: "neutral-50" },
        card: { light: "neutral-100", dark: "neutral-900" },
        "card-foreground": { light: "neutral-900", dark: "neutral-50" },
        popover: { light: "neutral-100", dark: "neutral-900" },
        "popover-foreground": { light: "neutral-900", dark: "neutral-50" },
        primary: { light: "brand-500", dark: "brand-400" },
        "primary-foreground": { light: "neutral-950", dark: "neutral-950" },
        secondary: { light: "neutral-200", dark: "neutral-800" },
        "secondary-foreground": { light: "neutral-800", dark: "neutral-100" },
        muted: { light: "neutral-100", dark: "neutral-900" },
        "muted-foreground": { light: "neutral-600", dark: "neutral-400" },
        accent: { light: "info-100", dark: "info-800" },
        "accent-foreground": { light: "info-800", dark: "info-100" },
        border: { light: "neutral-300", dark: "neutral-800" },
        input: { light: "neutral-300", dark: "neutral-800" },
        ring: { light: "brand-500", dark: "brand-400" },
      }),
    },
    components: {
      button: { radius: "sm", border: 1, shadow: "none" },
      card: { radius: "md", border: 1, shadow: "md" },
      input: { radius: "sm", border: 1, shadow: "none" },
      badge: { radius: "sm", border: 1, shadow: "none" },
      dialog: { radius: "md", border: 1, shadow: "lg" },
      tabs: { radius: "sm", border: 1, shadow: "none" },
    },
    globals: {
      radius: {
        none: "0",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.375rem",
        xl: "0.5rem",
        full: "9999px",
      },
      typography: {
        fontSans: "'Cormorant Garamond', serif",
        fontMono: "'JetBrains Mono', monospace",
        baseSize: 17,
        scaleRatio: 1.3,
        weightRegular: 400,
        weightBold: 600,
      },
      spacing: {
        baseUnit: 3.5,
      },
    },
  },
};

/**
 * All available presets
 */
export const PRESETS: Preset[] = [
  brutalistPreset,
  softPreset,
  neonPreset,
  editorialPreset,
  terraPreset,
  arcticPreset,
  sunsetPopPreset,
  noirLuxePreset,
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
