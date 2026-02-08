/**
 * Spacing Mapper - Rule 2 of the Design System Gatekeeper
 *
 * Normalizes arbitrary spacing values (e.g., p-[11px], gap-[23px])
 * to the nearest Tailwind spacing scale entry.
 *
 * Only targets spacing-specific prefixes (padding, margin, gap, space).
 * Dimensional properties (w-[350px], h-[200px]) are intentionally left alone.
 */

// ============================================================================
// Types
// ============================================================================

export interface SpacingViolation {
  original: string;
  replacement: string;
  reason: string;
}

// ============================================================================
// Tailwind Spacing Scale (snap targets)
// ============================================================================

const SPACING_SCALE: Array<{ key: string; px: number }> = [
  { key: "0", px: 0 },
  { key: "px", px: 1 },
  { key: "0.5", px: 2 },
  { key: "1", px: 4 },
  { key: "1.5", px: 6 },
  { key: "2", px: 8 },
  { key: "2.5", px: 10 },
  { key: "3", px: 12 },
  { key: "3.5", px: 14 },
  { key: "4", px: 16 },
  { key: "5", px: 20 },
  { key: "6", px: 24 },
  { key: "7", px: 28 },
  { key: "8", px: 32 },
  { key: "9", px: 36 },
  { key: "10", px: 40 },
  { key: "11", px: 44 },
  { key: "12", px: 48 },
  { key: "14", px: 56 },
  { key: "16", px: 64 },
  { key: "20", px: 80 },
  { key: "24", px: 96 },
];

// ============================================================================
// Spacing Prefixes (only these are normalized)
// ============================================================================

/**
 * Only spacing-specific prefixes are normalized.
 * Dimensional properties (w, h, max-w, max-h, min-w, min-h, etc.) are NOT touched.
 */
const SPACING_PREFIXES = new Set([
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
  "gap", "gap-x", "gap-y",
  "space-x", "space-y",
]);

// ============================================================================
// Unit Conversion
// ============================================================================

/**
 * Convert a CSS value string to pixels.
 * Returns null if the value can't be converted (%, vh, vw, calc, var).
 */
function toPx(value: string): number | null {
  const trimmed = value.trim();

  // Skip non-convertible units
  if (trimmed.includes("%") || trimmed.includes("vh") || trimmed.includes("vw") ||
      trimmed.includes("calc") || trimmed.includes("var")) {
    return null;
  }

  // px
  const pxMatch = trimmed.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);

  // rem → ×16
  const remMatch = trimmed.match(/^([\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;

  // em → ×16 (approximate)
  const emMatch = trimmed.match(/^([\d.]+)em$/);
  if (emMatch) return parseFloat(emMatch[1]) * 16;

  // Pure number (assume px)
  const numMatch = trimmed.match(/^([\d.]+)$/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

/**
 * Find the nearest Tailwind spacing scale entry for a given px value.
 */
function findNearestScale(px: number): { key: string; px: number } {
  let best = SPACING_SCALE[0];
  let bestDist = Math.abs(px - best.px);

  for (const entry of SPACING_SCALE) {
    const dist = Math.abs(px - entry.px);
    if (dist < bestDist) {
      best = entry;
      bestDist = dist;
    }
  }

  return best;
}

// ============================================================================
// Class Parser
// ============================================================================

interface ParsedSpacingClass {
  variants: string[];
  negative: boolean;
  prefix: string;
  arbitraryValue: string;
}

/**
 * Parse a Tailwind class that uses an arbitrary spacing value.
 * Returns null if not an arbitrary spacing class.
 */
function parseArbitrarySpacing(cls: string): ParsedSpacingClass | null {
  // Split variants
  const parts = cls.split(":");
  const base = parts.pop()!;
  const variants = parts;

  // Handle negative prefix
  const negative = base.startsWith("-");
  const baseClean = negative ? base.slice(1) : base;

  // Match: prefix-[value]
  // Need to handle multi-part prefixes like gap-x, gap-y, space-x, space-y
  const match = baseClean.match(/^((?:gap-[xy]|space-[xy]|[a-z]+))-\[([^\]]+)\]$/);
  if (!match) return null;

  const [, prefix, value] = match;
  if (!SPACING_PREFIXES.has(prefix)) return null;

  return { variants, negative, prefix, arbitraryValue: value };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Map a single spacing class to its Tailwind scale equivalent.
 * Returns null if the class is not an arbitrary spacing or can't be converted.
 */
export function mapSpacingClass(cls: string): SpacingViolation | null {
  const parsed = parseArbitrarySpacing(cls);
  if (!parsed) return null;

  const px = toPx(parsed.arbitraryValue);
  if (px === null) return null;

  const nearest = findNearestScale(px);

  // Reconstruct the class
  const negPrefix = parsed.negative ? "-" : "";
  const replacement = [
    ...parsed.variants,
    `${negPrefix}${parsed.prefix}-${nearest.key}`,
  ].join(":");

  return {
    original: cls,
    replacement,
    reason: `${parsed.arbitraryValue} (${px}px) → ${nearest.key} (${nearest.px}px)`,
  };
}

/**
 * Process a className string, replacing arbitrary spacing with Tailwind scale values.
 * Returns the updated className and list of violations found.
 */
export function enforceSpacing(
  className: string,
): { result: string; violations: SpacingViolation[] } {
  const violations: SpacingViolation[] = [];

  const classes = className.trim().split(/\s+/).filter(Boolean);
  const mapped = classes.map((cls) => {
    const violation = mapSpacingClass(cls);
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
