/**
 * Typography Mapper - Rule 5 of the Design System Gatekeeper
 *
 * Maps raw Tailwind text size classes (text-xs, text-sm, text-3xl, etc.)
 * to semantic typography classes (text-caption, text-body-sm, text-h2, etc.).
 *
 * Also strips redundant weight classes when a semantic class already
 * includes weight (e.g., text-h1 font-bold → text-h1).
 */

// ============================================================================
// Types
// ============================================================================

export interface TypographyViolation {
  original: string;
  replacement: string;
  reason: string;
}

// ============================================================================
// Mapping Table
// ============================================================================

const SIZE_TO_SEMANTIC: Record<string, string> = {
  "xs": "caption",
  "sm": "body-sm",
  "base": "body",
  "lg": "h4",
  "xl": "h4",
  "2xl": "h3",
  "3xl": "h2",
  "4xl": "h1",
  "5xl": "h1",
  "6xl": "h1",
  "7xl": "h1",
  "8xl": "h1",
  "9xl": "h1",
};

// Regex to match text size classes with optional variants
// Captures: (variants:)text-(size)
const TEXT_SIZE_RE = /^((?:[a-z0-9[\]]+:)*)text-(xs|sm|base|lg|xl|[2-9]xl)$/;

// Heading semantic classes include bold weight
const HEADING_CLASSES = new Set(["text-h1", "text-h2", "text-h3", "text-h4"]);

// Body semantic classes include regular weight
const BODY_CLASSES = new Set(["text-body", "text-body-sm", "text-caption"]);

// Weight classes that are redundant with heading semantics (bold)
const BOLD_WEIGHT_CLASSES = new Set([
  "font-bold",
  "font-semibold",
  "font-extrabold",
  "font-black",
  "font-medium",
]);

// Weight classes redundant with body semantics (regular)
const REGULAR_WEIGHT_CLASSES = new Set([
  "font-normal",
  "font-light",
  "font-thin",
  "font-extralight",
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Process a className string, replacing raw text size classes with semantic ones
 * and stripping redundant weight classes.
 */
export function enforceTypography(
  className: string,
): { result: string; violations: TypographyViolation[] } {
  const violations: TypographyViolation[] = [];
  const classes = className.trim().split(/\s+/).filter(Boolean);

  // First pass: map text sizes to semantic classes
  const mapped = classes.map((cls) => {
    const match = cls.match(TEXT_SIZE_RE);
    if (!match) return cls;

    const [, variants, size] = match;
    const semantic = SIZE_TO_SEMANTIC[size];
    if (!semantic) return cls;

    const replacement = `${variants}text-${semantic}`;
    violations.push({
      original: cls,
      replacement,
      reason: `text-${size} → text-${semantic}`,
    });
    return replacement;
  });

  // Second pass: strip redundant weight classes
  const hasHeading = mapped.some((c) => HEADING_CLASSES.has(c));
  const hasBody = mapped.some((c) => BODY_CLASSES.has(c));

  const filtered = mapped.filter((cls) => {
    if (hasHeading && BOLD_WEIGHT_CLASSES.has(cls)) {
      violations.push({
        original: cls,
        replacement: "",
        reason: `${cls} is redundant (heading class includes bold weight)`,
      });
      return false;
    }
    if (hasBody && REGULAR_WEIGHT_CLASSES.has(cls)) {
      violations.push({
        original: cls,
        replacement: "",
        reason: `${cls} is redundant (body class includes regular weight)`,
      });
      return false;
    }
    return true;
  });

  return {
    result: filtered.join(" "),
    violations,
  };
}
