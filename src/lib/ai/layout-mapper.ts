/**
 * Layout Mapper - Rule 4 of the Design System Gatekeeper
 *
 * Two enforcement rules:
 * 1. Grid Normalization — grid-cols-[N] → grid-cols-N, col-span-[N] → col-span-N (clamped 1–12)
 * 2. 8px Rhythm Enforcement — For gap/p/m standard classes >= 16px, snap to nearest 8px multiple
 *
 * NOT applied to: space-x/space-y, width/height classes, or values < 16px.
 */

// ============================================================================
// Types
// ============================================================================

export interface LayoutViolation {
  original: string;
  replacement: string;
  reason: string;
}

// ============================================================================
// 8px Rhythm Snap Table
// ============================================================================

/**
 * Standard Tailwind suffixes where the px value is >= 16 but NOT on the 8px grid.
 * Ties snap UP (prefer generous spacing).
 *
 * Suffix 5 (20px) → 6 (24px)
 * Suffix 7 (28px) → 8 (32px)
 * Suffix 9 (36px) → 10 (40px)
 * Suffix 11 (44px) → 12 (48px)
 */
const RHYTHM_SNAP: Record<string, string> = {
  "5": "6",   // 20px → 24px
  "7": "8",   // 28px → 32px
  "9": "10",  // 36px → 40px
  "11": "12", // 44px → 48px
};

const RHYTHM_PX: Record<string, [number, number]> = {
  "5": [20, 24],
  "7": [28, 32],
  "9": [36, 40],
  "11": [44, 48],
};

// Prefixes subject to 8px rhythm enforcement
const RHYTHM_PREFIXES = new Set([
  "gap", "gap-x", "gap-y",
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "m", "mx", "my", "mt", "mr", "mb", "ml",
]);

// ============================================================================
// 8px Rhythm Regex
// ============================================================================

/**
 * Match a standard (non-arbitrary) Tailwind spacing class.
 * Handles variants (md:gap-7), negative prefix (-m-7), and multi-part prefixes (gap-x).
 * Captures: [full match, variants+neg+prefix, suffix]
 */
const RHYTHM_REGEX = /^((?:[a-z0-9\[\]]+:)*-?(?:gap-[xy]|[a-z]+))-(5|7|9|11)$/;

// ============================================================================
// Grid Normalization Regexes
// ============================================================================

/**
 * grid-cols-[N] where N is a plain integer
 * Also matches grid-cols-[repeat(N,minmax(0,1fr))]
 */
const GRID_COLS_ARBITRARY_REGEX = /^((?:[a-z0-9\[\]]+:)*)grid-cols-\[([^\]]+)\]$/;

/**
 * col-span-[N] where N is a plain integer
 */
const COL_SPAN_ARBITRARY_REGEX = /^((?:[a-z0-9\[\]]+:)*)col-span-\[([^\]]+)\]$/;

// ============================================================================
// Grid Normalization Helpers
// ============================================================================

/**
 * Parse an arbitrary grid-cols value to extract an integer column count.
 * Returns null for non-integer templates (e.g., "200px_1fr", "none", "subgrid").
 */
function parseArbitraryGridCols(value: string): number | null {
  // Plain integer: grid-cols-[5]
  const intMatch = value.match(/^\d+$/);
  if (intMatch) return parseInt(value, 10);

  // repeat(N,minmax(0,1fr)): grid-cols-[repeat(5,minmax(0,1fr))]
  const repeatMatch = value.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
  if (repeatMatch) return parseInt(repeatMatch[1], 10);

  return null;
}

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Map a single class through layout enforcement rules.
 * Returns a LayoutViolation if the class was changed, null otherwise.
 */
export function mapLayoutClass(cls: string): LayoutViolation | null {
  // ── Rule 1: Grid Normalization ──

  // grid-cols-[...]
  const gridColsMatch = cls.match(GRID_COLS_ARBITRARY_REGEX);
  if (gridColsMatch) {
    const [, variants, value] = gridColsMatch;
    const count = parseArbitraryGridCols(value);
    if (count !== null) {
      const clamped = clamp(count, 1, 12);
      const replacement = `${variants}grid-cols-${clamped}`;
      return {
        original: cls,
        replacement,
        reason: `grid-cols-[${value}] → grid-cols-${clamped}`,
      };
    }
    return null;
  }

  // col-span-[...]
  const colSpanMatch = cls.match(COL_SPAN_ARBITRARY_REGEX);
  if (colSpanMatch) {
    const [, variants, value] = colSpanMatch;
    const intMatch = value.match(/^\d+$/);
    if (intMatch) {
      const count = clamp(parseInt(value, 10), 1, 12);
      const replacement = `${variants}col-span-${count}`;
      return {
        original: cls,
        replacement,
        reason: `col-span-[${value}] → col-span-${count}`,
      };
    }
    return null;
  }

  // ── Rule 2: 8px Rhythm Enforcement ──

  const rhythmMatch = cls.match(RHYTHM_REGEX);
  if (rhythmMatch) {
    const [, prefixWithVariants, suffix] = rhythmMatch;

    // Extract the actual utility prefix (strip variants and negative sign)
    const parts = prefixWithVariants.split(":");
    const base = parts[parts.length - 1];
    const negative = base.startsWith("-");
    const utilPrefix = negative ? base.slice(1) : base;

    if (!RHYTHM_PREFIXES.has(utilPrefix)) return null;

    const snapTo = RHYTHM_SNAP[suffix];
    if (!snapTo) return null;

    // Reconstruct: variants + negative prefix + utility prefix + snapped suffix
    const variantStr = parts.slice(0, -1).join(":");
    const negPrefix = negative ? "-" : "";
    const replacement = variantStr
      ? `${variantStr}:${negPrefix}${utilPrefix}-${snapTo}`
      : `${negPrefix}${utilPrefix}-${snapTo}`;

    const [fromPx, toPx] = RHYTHM_PX[suffix];
    return {
      original: cls,
      replacement,
      reason: `${suffix} (${fromPx}px) → ${snapTo} (${toPx}px) [8px rhythm]`,
    };
  }

  return null;
}

/**
 * Process a className string, applying layout enforcement rules.
 * Returns the updated className and list of violations found.
 */
export function enforceLayout(
  className: string,
): { result: string; violations: LayoutViolation[] } {
  const violations: LayoutViolation[] = [];

  const classes = className.trim().split(/\s+/).filter(Boolean);
  const mapped = classes.map((cls) => {
    const violation = mapLayoutClass(cls);
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
