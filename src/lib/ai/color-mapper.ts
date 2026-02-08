/**
 * Color Mapper - Rule 1 of the Design System Gatekeeper
 *
 * Detects hardcoded Tailwind palette classes, arbitrary hex/rgb values,
 * and named colors, then maps them to semantic design tokens.
 *
 * Uses OKLCH Euclidean distance (via culori) to find the nearest project
 * palette and maps to appropriate semantic tokens.
 */

import { parse as colorParse, oklch, differenceEuclidean } from "culori";
import { TAILWIND_COLORS, TAILWIND_COLOR_FAMILIES, NAMED_COLOR_MAP } from "./tailwind-palette";
import { hslStringToHex } from "@/lib/tokens/color-scale";
import type { TokenState } from "@/lib/tokens/types";

// ============================================================================
// Types
// ============================================================================

export interface ColorViolation {
  original: string;
  replacement: string;
  prefix: string;
  reason: string;
}

// ============================================================================
// Semantic Token Definitions
// ============================================================================

/** All semantic bg tokens the system supports */
const SEMANTIC_BG_TOKENS = new Set([
  "background", "card", "popover", "primary", "secondary",
  "muted", "accent", "destructive",
]);

/** All semantic text tokens */
const SEMANTIC_TEXT_TOKENS = new Set([
  "foreground", "primary-foreground", "secondary-foreground",
  "muted-foreground", "accent-foreground", "destructive-foreground",
  "card-foreground", "popover-foreground",
]);

/** All semantic border tokens */
const SEMANTIC_BORDER_TOKENS = new Set([
  "border", "input", "ring", "primary", "secondary",
  "muted", "accent", "destructive",
]);

// Prefixes that carry color semantics
const COLOR_PREFIXES = new Set([
  "bg", "text", "border", "ring", "outline",
  "decoration", "divide", "placeholder", "from", "via", "to",
  "shadow", "accent",
]);

// ============================================================================
// Color Class Parser
// ============================================================================

interface ParsedColorClass {
  variants: string[];     // e.g., ["hover", "dark"]
  prefix: string;         // e.g., "bg", "text", "border"
  family: string;         // e.g., "blue", "red", or "white"/"black"
  shade: string;          // e.g., "500" or "" for named colors
  opacity: string;        // e.g., "/50" or ""
  isArbitrary: boolean;   // e.g., bg-[#3b82f6]
  arbitraryValue: string; // e.g., "#3b82f6" or "rgb(59,130,246)"
}

/**
 * Parse a Tailwind class that may contain a color.
 * Returns null if the class is not a color class.
 */
function parseColorClass(cls: string): ParsedColorClass | null {
  // Split variants: "hover:dark:bg-blue-500/50" → variants=["hover","dark"], rest="bg-blue-500/50"
  const parts = cls.split(":");
  const base = parts.pop()!;
  const variants = parts;

  // Handle negative prefix (not relevant for colors but strip it)
  const baseNonNeg = base.startsWith("-") ? base.slice(1) : base;

  // Check for arbitrary value: bg-[#hex] or text-[rgb(...)]
  const arbitraryMatch = baseNonNeg.match(/^(\w+)-\[([^\]]+)\](.*)$/);
  if (arbitraryMatch) {
    const [, prefix, value, rest] = arbitraryMatch;
    if (!COLOR_PREFIXES.has(prefix)) return null;

    // Check if value looks like a color (hex, rgb, hsl, named)
    if (!looksLikeColor(value)) return null;

    const opacity = rest.startsWith("/") ? rest : "";

    return {
      variants,
      prefix,
      family: "",
      shade: "",
      opacity,
      isArbitrary: true,
      arbitraryValue: value,
    };
  }

  // Check for named colors: bg-white, text-black, bg-transparent
  const namedMatch = baseNonNeg.match(/^(\w+)-(white|black|transparent)(\/\d+)?$/);
  if (namedMatch) {
    const [, prefix, name, opacitySuffix] = namedMatch;
    if (!COLOR_PREFIXES.has(prefix)) return null;
    if (name === "transparent") return null; // Leave transparent alone

    return {
      variants,
      prefix,
      family: name,
      shade: "",
      opacity: opacitySuffix || "",
      isArbitrary: false,
      arbitraryValue: "",
    };
  }

  // Check for palette color: bg-blue-500, text-red-600/50
  const paletteMatch = baseNonNeg.match(/^(\w+)-(\w+)-(\d+)(\/\d+)?$/);
  if (paletteMatch) {
    const [, prefix, family, shade, opacitySuffix] = paletteMatch;
    if (!COLOR_PREFIXES.has(prefix)) return null;
    if (!TAILWIND_COLOR_FAMILIES.has(family)) return null;

    return {
      variants,
      prefix,
      family,
      shade,
      opacity: opacitySuffix || "",
      isArbitrary: false,
      arbitraryValue: "",
    };
  }

  return null;
}

/**
 * Check if a string looks like a CSS color value
 */
function looksLikeColor(value: string): boolean {
  if (value.startsWith("#")) return true;
  if (value.startsWith("rgb")) return true;
  if (value.startsWith("hsl")) return true;
  // Try culori parse
  try {
    return colorParse(value) != null;
  } catch {
    return false;
  }
}

// ============================================================================
// Token Reverse Mapping
// ============================================================================

interface PaletteMatch {
  paletteName: string;
  distance: number;
}

/**
 * Build a reverse map from token palette names to their base hex colors.
 */
function getProjectPaletteColors(tokens: TokenState): Record<string, string> {
  const result: Record<string, string> = {};

  // Use baseColors if available (most accurate)
  if (tokens.primitives.baseColors) {
    for (const [name, hex] of Object.entries(tokens.primitives.baseColors)) {
      result[name] = hex;
    }
  } else {
    // Fall back to converting the 500 shade from each color scale
    for (const [name, scale] of Object.entries(tokens.primitives.colors)) {
      if (scale["500"]) {
        result[name] = hslStringToHex(scale["500"]);
      }
    }
  }

  return result;
}

/**
 * Find the nearest project palette for a given hex color using OKLCH distance.
 */
function findNearestPalette(hex: string, paletteColors: Record<string, string>): PaletteMatch | null {
  const targetColor = colorParse(hex);
  if (!targetColor) return null;

  const targetOklch = oklch(targetColor);
  if (!targetOklch) return null;

  const distFn = differenceEuclidean("oklch");
  let best: PaletteMatch | null = null;

  for (const [name, paletteHex] of Object.entries(paletteColors)) {
    const paletteColor = colorParse(paletteHex);
    if (!paletteColor) continue;

    const paletteOklch = oklch(paletteColor);
    if (!paletteOklch) continue;

    const distance = distFn(targetOklch, paletteOklch);
    if (!best || distance < best.distance) {
      best = { paletteName: name, distance };
    }
  }

  return best;
}

/**
 * Build reverse map from palette name → semantic tokens
 */
function buildSemanticMap(tokens: TokenState): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const [tokenName, value] of Object.entries(tokens.semantics.colors)) {
    // Extract palette name from the reference (e.g., "brand-600" → "brand")
    const lightRef = value.light;
    const paletteName = lightRef.replace(/-\d+$/, "");

    if (!map[paletteName]) {
      map[paletteName] = [];
    }
    map[paletteName].push(tokenName);
  }

  return map;
}

// ============================================================================
// Shade-Based Semantic Token Selection
// ============================================================================

/**
 * Map a palette + shade + prefix to the most appropriate semantic token.
 */
function mapToSemanticToken(
  paletteName: string,
  shade: string,
  prefix: string,
  semanticMap: Record<string, string[]>,
): string | null {
  const shadeNum = shade ? parseInt(shade, 10) : 500;

  // Direct palette-to-token mappings
  if (paletteName === "brand") {
    return mapBrandToken(shadeNum, prefix);
  }
  if (paletteName === "error") {
    return mapErrorToken(shadeNum, prefix);
  }
  if (paletteName === "neutral") {
    return mapNeutralToken(shadeNum, prefix);
  }
  // success, warning, info → accent (no dedicated semantic tokens for these)
  if (paletteName === "success" || paletteName === "warning" || paletteName === "info") {
    return mapAccentToken(shadeNum, prefix);
  }

  // For unknown palettes, check if they appear in the semantic map
  const tokens = semanticMap[paletteName];
  if (tokens && tokens.length > 0) {
    // Find the most appropriate token based on prefix
    return pickTokenForPrefix(tokens, prefix);
  }

  // Fallback: map to primary
  return mapBrandToken(shadeNum, prefix);
}

function mapBrandToken(shade: number, prefix: string): string {
  if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") {
    return shade >= 800 ? "primary-foreground" : "primary";
  }
  if (prefix === "text" || prefix === "decoration") {
    return shade <= 200 ? "primary-foreground" : "primary";
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") {
    return "primary";
  }
  return "primary";
}

function mapErrorToken(shade: number, prefix: string): string {
  if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") {
    return shade >= 800 ? "destructive-foreground" : "destructive";
  }
  if (prefix === "text" || prefix === "decoration") {
    return shade <= 200 ? "destructive-foreground" : "destructive";
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") {
    return "destructive";
  }
  return "destructive";
}

function mapAccentToken(shade: number, prefix: string): string {
  if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") {
    return shade >= 800 ? "accent-foreground" : "accent";
  }
  if (prefix === "text" || prefix === "decoration") {
    return shade <= 200 ? "accent-foreground" : "accent";
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") {
    return "accent";
  }
  return "accent";
}

function mapNeutralToken(shade: number, prefix: string): string {
  if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") {
    if (shade <= 50) return "background";
    if (shade <= 200) return "muted";
    if (shade <= 500) return "secondary";
    if (shade <= 800) return "accent";
    return "foreground";
  }
  if (prefix === "text" || prefix === "decoration") {
    if (shade <= 50) return "primary-foreground";
    if (shade <= 200) return "primary-foreground";
    if (shade <= 500) return "muted-foreground";
    if (shade <= 800) return "secondary-foreground";
    return "foreground";
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") {
    if (shade <= 200) return "border";
    if (shade <= 400) return "input";
    if (shade <= 600) return "muted";
    return "foreground";
  }
  // Fallback
  if (shade <= 300) return "muted";
  if (shade <= 600) return "secondary";
  return "foreground";
}

function pickTokenForPrefix(tokens: string[], prefix: string): string | null {
  // Prefer bg tokens for bg prefix, text tokens for text prefix, etc.
  if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") {
    // Prefer non-foreground tokens
    const bgToken = tokens.find(t => SEMANTIC_BG_TOKENS.has(t));
    if (bgToken) return bgToken;
  }
  if (prefix === "text" || prefix === "decoration") {
    const textToken = tokens.find(t => SEMANTIC_TEXT_TOKENS.has(t));
    if (textToken) return textToken;
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") {
    const borderToken = tokens.find(t => SEMANTIC_BORDER_TOKENS.has(t));
    if (borderToken) return borderToken;
  }
  return tokens[0] || null;
}

// ============================================================================
// Named Color Mapping
// ============================================================================

/**
 * Map named colors (white, black) to semantic tokens
 */
function mapNamedColor(family: string, prefix: string): string | null {
  if (family === "white") {
    if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") return "background";
    if (prefix === "text" || prefix === "decoration") return "primary-foreground";
    if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") return "border";
    return "background";
  }
  if (family === "black") {
    if (prefix === "bg" || prefix === "from" || prefix === "via" || prefix === "to") return "foreground";
    if (prefix === "text" || prefix === "decoration") return "foreground";
    if (prefix === "border" || prefix === "ring" || prefix === "outline" || prefix === "divide") return "foreground";
    return "foreground";
  }
  return null;
}

// ============================================================================
// Resolve hex from a parsed color class
// ============================================================================

function resolveHex(parsed: ParsedColorClass): string | null {
  if (parsed.isArbitrary) {
    // Try parsing the arbitrary value directly
    const c = colorParse(parsed.arbitraryValue);
    if (!c) return null;
    // Convert to hex via oklch roundtrip isn't needed, just format
    const { r, g, b } = colorParse(parsed.arbitraryValue) as { r: number; g: number; b: number; mode: string };
    if (r !== undefined && g !== undefined && b !== undefined) {
      const toHex = (x: number) => {
        const hex = Math.round(Math.min(255, Math.max(0, x * 255))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    return null;
  }

  if (parsed.family && NAMED_COLOR_MAP[parsed.family]) {
    return NAMED_COLOR_MAP[parsed.family];
  }

  if (parsed.family && parsed.shade) {
    const familyColors = TAILWIND_COLORS[parsed.family];
    if (familyColors && familyColors[parsed.shade]) {
      return familyColors[parsed.shade];
    }
  }

  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a class is already using a semantic token (skip it)
 */
function isAlreadySemantic(cls: string): boolean {
  // Strip variants
  const parts = cls.split(":");
  const base = parts[parts.length - 1];

  // Strip opacity
  const baseClean = base.replace(/\/\d+$/, "");

  // Check all semantic-aware patterns
  const bgMatch = baseClean.match(/^bg-(.+)$/);
  if (bgMatch && SEMANTIC_BG_TOKENS.has(bgMatch[1])) return true;

  const textMatch = baseClean.match(/^text-(.+)$/);
  if (textMatch && SEMANTIC_TEXT_TOKENS.has(textMatch[1])) return true;

  const borderMatch = baseClean.match(/^border-(.+)$/);
  if (borderMatch && SEMANTIC_BORDER_TOKENS.has(borderMatch[1])) return true;

  const ringMatch = baseClean.match(/^ring-(.+)$/);
  if (ringMatch && (ringMatch[1] === "ring" || SEMANTIC_BG_TOKENS.has(ringMatch[1]))) return true;

  return false;
}

/**
 * Map a single Tailwind class to its semantic replacement.
 * Returns null if the class is not a color violation or can't be mapped.
 */
export function mapColorClass(
  cls: string,
  tokens: TokenState,
  paletteColors: Record<string, string>,
  semanticMap: Record<string, string[]>,
): ColorViolation | null {
  // Skip already-semantic classes
  if (isAlreadySemantic(cls)) return null;

  const parsed = parseColorClass(cls);
  if (!parsed) return null;

  // Handle named colors (white, black)
  if (!parsed.isArbitrary && parsed.family && !parsed.shade && NAMED_COLOR_MAP[parsed.family]) {
    const token = mapNamedColor(parsed.family, parsed.prefix);
    if (!token) return null;

    const replacement = [
      ...parsed.variants,
      `${parsed.prefix}-${token}${parsed.opacity}`,
    ].join(":");

    return {
      original: cls,
      replacement,
      prefix: parsed.prefix,
      reason: `Named color "${parsed.family}" → semantic token "${token}"`,
    };
  }

  // Resolve the hex color
  const hex = resolveHex(parsed);
  if (!hex) return null;

  // Find nearest project palette
  const match = findNearestPalette(hex, paletteColors);
  if (!match) return null;

  // Map to semantic token
  const token = mapToSemanticToken(match.paletteName, parsed.shade, parsed.prefix, semanticMap);
  if (!token) return null;

  // Reconstruct the class
  const replacement = [
    ...parsed.variants,
    `${parsed.prefix}-${token}${parsed.opacity}`,
  ].join(":");

  return {
    original: cls,
    replacement,
    prefix: parsed.prefix,
    reason: parsed.isArbitrary
      ? `Arbitrary color "${parsed.arbitraryValue}" → nearest palette "${match.paletteName}" → "${token}"`
      : `${parsed.family}-${parsed.shade} → nearest palette "${match.paletteName}" → "${token}"`,
  };
}

/**
 * Process a className string, replacing color violations with semantic tokens.
 * Returns the updated className and list of violations found.
 */
export function enforceColors(
  className: string,
  tokens: TokenState,
): { result: string; violations: ColorViolation[] } {
  const paletteColors = getProjectPaletteColors(tokens);
  const semanticMap = buildSemanticMap(tokens);
  const violations: ColorViolation[] = [];

  const classes = className.trim().split(/\s+/).filter(Boolean);
  const mapped = classes.map((cls) => {
    const violation = mapColorClass(cls, tokens, paletteColors, semanticMap);
    if (violation) {
      violations.push(violation);
      return violation.replacement;
    }
    return cls;
  });

  return {
    result: mapped.join(" "),
    violations,
  };
}
