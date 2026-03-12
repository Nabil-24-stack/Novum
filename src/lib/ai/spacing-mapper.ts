/**
 * Spacing Mapper - Rule 2 of the Design System Gatekeeper
 *
 * Normalizes arbitrary spacing values (e.g. p-[11px], gap-[23px])
 * to the nearest runtime spacing token for the active token file.
 */

import type { TokenState } from "@/lib/tokens/types";

export interface SpacingViolation {
  original: string;
  replacement: string;
  reason: string;
}

const SPACING_KEYS = [
  "0",
  "px",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
] as const;

const SPACING_PREFIXES = new Set([
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
]);

interface ParsedSpacingClass {
  variants: string[];
  negative: boolean;
  prefix: string;
  arbitraryValue: string;
}

function buildSpacingScale(baseUnit: number): Array<{ key: string; px: number }> {
  return SPACING_KEYS.map((key) => {
    if (key === "0") return { key, px: 0 };
    if (key === "px") return { key, px: 1 };
    return { key, px: parseFloat(key) * baseUnit };
  });
}

function toPx(value: string): number | null {
  const trimmed = value.trim();

  if (
    trimmed.includes("%") ||
    trimmed.includes("vh") ||
    trimmed.includes("vw") ||
    trimmed.includes("calc") ||
    trimmed.includes("var")
  ) {
    return null;
  }

  const pxMatch = trimmed.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);

  const remMatch = trimmed.match(/^([\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;

  const emMatch = trimmed.match(/^([\d.]+)em$/);
  if (emMatch) return parseFloat(emMatch[1]) * 16;

  const numMatch = trimmed.match(/^([\d.]+)$/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

function findNearestScale(
  px: number,
  baseUnit: number
): { key: string; px: number } {
  const scale = buildSpacingScale(baseUnit);
  let best = scale[0];
  let bestDist = Math.abs(px - best.px);

  for (const entry of scale) {
    const dist = Math.abs(px - entry.px);
    if (dist < bestDist || (dist === bestDist && entry.px > best.px)) {
      best = entry;
      bestDist = dist;
    }
  }

  return best;
}

function parseArbitrarySpacing(cls: string): ParsedSpacingClass | null {
  const parts = cls.split(":");
  const base = parts.pop()!;
  const variants = parts;

  const negative = base.startsWith("-");
  const baseClean = negative ? base.slice(1) : base;

  const match = baseClean.match(/^((?:gap-[xy]|space-[xy]|[a-z]+))-\[([^\]]+)\]$/);
  if (!match) return null;

  const [, prefix, value] = match;
  if (!SPACING_PREFIXES.has(prefix)) return null;

  return { variants, negative, prefix, arbitraryValue: value };
}

export function mapSpacingClass(
  cls: string,
  tokens?: Pick<TokenState, "globals">
): SpacingViolation | null {
  const parsed = parseArbitrarySpacing(cls);
  if (!parsed) return null;

  const px = toPx(parsed.arbitraryValue);
  if (px === null) return null;

  const baseUnit = tokens?.globals.spacing.baseUnit ?? 4;
  const nearest = findNearestScale(px, baseUnit);
  const negPrefix = parsed.negative ? "-" : "";
  const replacement = [...parsed.variants, `${negPrefix}${parsed.prefix}-${nearest.key}`].join(":");

  return {
    original: cls,
    replacement,
    reason: `${parsed.arbitraryValue} (${px}px) → ${nearest.key} (${nearest.px}px with baseUnit=${baseUnit})`,
  };
}

export function enforceSpacing(
  className: string,
  tokens?: Pick<TokenState, "globals">
): { result: string; violations: SpacingViolation[] } {
  const violations: SpacingViolation[] = [];

  const classes = className.trim().split(/\s+/).filter(Boolean);
  const mapped = classes.map((cls) => {
    const violation = mapSpacingClass(cls, tokens);
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
