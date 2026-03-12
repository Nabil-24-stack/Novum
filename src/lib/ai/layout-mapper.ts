/**
 * Layout Mapper - Rule 4 of the Design System Gatekeeper
 *
 * Structural normalization only:
 * 1. grid-cols-[N] → grid-cols-N
 * 2. col-span-[N] → col-span-N
 *
 * Spacing rhythm is handled separately by the token-aware spacing mapper.
 */

export interface LayoutViolation {
  original: string;
  replacement: string;
  reason: string;
}

const GRID_COLS_ARBITRARY_REGEX = /^((?:[a-z0-9\[\]]+:)*)grid-cols-\[([^\]]+)\]$/;
const COL_SPAN_ARBITRARY_REGEX = /^((?:[a-z0-9\[\]]+:)*)col-span-\[([^\]]+)\]$/;

function parseArbitraryGridCols(value: string): number | null {
  const intMatch = value.match(/^\d+$/);
  if (intMatch) return parseInt(value, 10);

  const repeatMatch = value.match(/^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/);
  if (repeatMatch) return parseInt(repeatMatch[1], 10);

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mapLayoutClass(cls: string): LayoutViolation | null {
  const gridColsMatch = cls.match(GRID_COLS_ARBITRARY_REGEX);
  if (gridColsMatch) {
    const [, variants, value] = gridColsMatch;
    const count = parseArbitraryGridCols(value);
    if (count !== null) {
      const clamped = clamp(count, 1, 12);
      return {
        original: cls,
        replacement: `${variants}grid-cols-${clamped}`,
        reason: `grid-cols-[${value}] → grid-cols-${clamped}`,
      };
    }
    return null;
  }

  const colSpanMatch = cls.match(COL_SPAN_ARBITRARY_REGEX);
  if (colSpanMatch) {
    const [, variants, value] = colSpanMatch;
    const intMatch = value.match(/^\d+$/);
    if (intMatch) {
      const count = clamp(parseInt(value, 10), 1, 12);
      return {
        original: cls,
        replacement: `${variants}col-span-${count}`,
        reason: `col-span-[${value}] → col-span-${count}`,
      };
    }
  }

  return null;
}

export function enforceLayout(
  className: string
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
