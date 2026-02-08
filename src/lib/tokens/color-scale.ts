/**
 * OKLCH Color Scale Generator
 * Uses culori library for perceptually uniform color scales
 */

import { parse, oklch, formatHsl, interpolate, samples } from "culori";
import type { ColorScale, ColorStep } from "./types";

// The 11 steps we generate (Tailwind convention)
const STEPS: ColorStep[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Target lightness values for each step (in OKLCH L, range 0-1)
// These define the relative positions in the lightness range
// The actual values will be interpolated based on the input color
const LIGHTNESS_POSITIONS: Record<ColorStep, number> = {
  "50": 0.97,
  "100": 0.93,
  "200": 0.85,
  "300": 0.75,
  "400": 0.63,
  "500": 0.50,  // Anchor point - will be set to input color's lightness
  "600": 0.40,
  "700": 0.32,
  "800": 0.24,
  "900": 0.16,
  "950": 0.10,
};

// Chroma scaling factors (how much to preserve saturation at each step)
// Higher values preserve more chroma, lower values desaturate
const CHROMA_FACTORS: Record<ColorStep, number> = {
  "50": 0.15,
  "100": 0.25,
  "200": 0.45,
  "300": 0.7,
  "400": 0.9,
  "500": 1.0,
  "600": 0.95,
  "700": 0.85,
  "800": 0.7,
  "900": 0.55,
  "950": 0.4,
};

/**
 * Convert any CSS color to HSL string format "h s% l%"
 */
export function toHSLString(color: string): string {
  try {
    const hsl = formatHsl(parse(color));
    if (!hsl) return "0 0% 50%";

    // Parse the hsl() format and convert to our format
    const match = hsl.match(/hsl\(\s*([\d.]+)\s*([\d.]+)%\s*([\d.]+)%\s*\)/);
    if (match) {
      const h = Math.round(parseFloat(match[1]));
      const s = Math.round(parseFloat(match[2]));
      const l = Math.round(parseFloat(match[3]));
      return `${h} ${s}% ${l}%`;
    }

    // Alternative format: hsl(h, s%, l%)
    const altMatch = hsl.match(/hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\s*\)/);
    if (altMatch) {
      const h = Math.round(parseFloat(altMatch[1]));
      const s = Math.round(parseFloat(altMatch[2]));
      const l = Math.round(parseFloat(altMatch[3]));
      return `${h} ${s}% ${l}%`;
    }

    return "0 0% 50%";
  } catch {
    return "0 0% 50%";
  }
}

/**
 * Convert HSL string "h s% l%" to hex
 */
export function hslStringToHex(hslString: string): string {
  const parts = hslString.trim().split(/\s+/);
  if (parts.length < 3) return "#808080";

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h/360 + 1/3);
    g = hue2rgb(p, q, h/360);
    b = hue2rgb(p, q, h/360 - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert hex to HSL string "h s% l%"
 */
export function hexToHSLString(hex: string): string {
  return toHSLString(hex);
}

/**
 * Generate a complete 50-950 color scale from a base color
 * Uses OKLCH for perceptually uniform interpolation
 * The input color will be preserved exactly at the 500 step
 */
export function generateColorScale(baseColor: string): ColorScale {
  const parsed = parse(baseColor);
  if (!parsed) {
    // Return a neutral gray scale as fallback
    return generateNeutralScale();
  }

  // Convert to OKLCH
  const baseOklch = oklch(parsed);
  if (!baseOklch) {
    return generateNeutralScale();
  }

  const scale: Partial<ColorScale> = {};

  // Get base properties
  const baseChroma = baseOklch.c || 0;
  const baseHue = baseOklch.h || 0;
  const baseLightness = baseOklch.l || 0.5;

  // Calculate lightness range without clamping - preserves exact input color at 500
  // For very light colors, lighter steps will be compressed
  // For very dark colors, darker steps will be compressed
  const lightnessToWhite = Math.max(0.01, 0.99 - baseLightness); // Room to go lighter
  const lightnessToBlack = Math.max(0.01, baseLightness - 0.05); // Room to go darker

  // Generate each step
  for (const step of STEPS) {
    const position = LIGHTNESS_POSITIONS[step];
    const chromaFactor = CHROMA_FACTORS[step];

    // For step 500, use exact base color values
    if (step === "500") {
      const stepColor = {
        mode: "oklch" as const,
        l: baseLightness,
        c: baseChroma,
        h: baseHue,
      };
      scale[step] = toHSLString(formatHsl(stepColor) || "hsl(0, 0%, 50%)");
      continue;
    }

    // Calculate lightness based on position relative to 500
    let targetL: number;
    if (position >= 0.5) {
      // Steps 50-400: interpolate from base toward white
      const t = (position - 0.5) / 0.5; // 0 at 500, 1 at 50
      targetL = baseLightness + (t * lightnessToWhite);
    } else {
      // Steps 600-950: interpolate from base toward black
      const t = (0.5 - position) / 0.5; // 0 at 500, 1 at 950
      targetL = baseLightness - (t * lightnessToBlack);
    }

    // Create color at this step
    const stepColor = {
      mode: "oklch" as const,
      l: targetL,
      c: baseChroma * chromaFactor,
      h: baseHue,
    };

    // Convert to HSL string
    scale[step] = toHSLString(formatHsl(stepColor) || "hsl(0, 0%, 50%)");
  }

  return scale as ColorScale;
}

/**
 * Generate a neutral (gray) scale with no chroma
 */
export function generateNeutralScale(): ColorScale {
  // Fixed lightness values for neutral grays (HSL lightness %)
  const NEUTRAL_LIGHTNESS: Record<ColorStep, number> = {
    "50": 98, "100": 96, "200": 90, "300": 83, "400": 64,
    "500": 45, "600": 32, "700": 25, "800": 15, "900": 9, "950": 4,
  };

  const scale: Partial<ColorScale> = {};

  for (const step of STEPS) {
    const l = NEUTRAL_LIGHTNESS[step];
    scale[step] = `0 0% ${l}%`;
  }

  return scale as ColorScale;
}

/**
 * Interpolate between two colors for smooth gradients
 * Returns an array of colors from start to end
 */
export function interpolateColors(startColor: string, endColor: string, steps: number): string[] {
  const start = parse(startColor);
  const end = parse(endColor);

  if (!start || !end) {
    return Array(steps).fill("#808080");
  }

  const interp = interpolate([start, end], "oklch");
  const samplePoints = samples(steps);

  return samplePoints.map(t => {
    const color = interp(t);
    return formatHsl(color) || "#808080";
  });
}

/**
 * Get the perceived brightness of a color (0-1)
 * Useful for determining if text should be light or dark
 */
export function getPerceivedBrightness(color: string): number {
  const parsed = parse(color);
  if (!parsed) return 0.5;

  const colorOklch = oklch(parsed);
  return colorOklch?.l || 0.5;
}

/**
 * Determine if a color needs light or dark foreground text
 */
export function needsLightForeground(color: string): boolean {
  return getPerceivedBrightness(color) < 0.6;
}
