/**
 * Class Manager Utility
 * Safely toggle Tailwind classes by category, preventing conflicts.
 */

// Semantic token lists for colors
export const SEMANTIC_BG_TOKENS = [
  "background", "card", "popover", "primary", "secondary",
  "muted", "accent", "destructive"
] as const;

export const SEMANTIC_TEXT_TOKENS = [
  "foreground", "primary-foreground", "secondary-foreground",
  "muted-foreground", "accent-foreground", "destructive-foreground",
  "card-foreground", "popover-foreground"
] as const;

export const FONT_SIZE_VALUES = [
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"
] as const;

export const FONT_WEIGHT_VALUES = [
  "normal", "medium", "semibold", "bold"
] as const;

export const TEXT_ALIGN_VALUES = ["left", "center", "right"] as const;

// Category mappings for conflicting classes
export const CATEGORY_PATTERNS = {
  display: /^(block|inline|flex|grid|hidden|inline-flex|inline-block)$/,
  flexDirection: /^flex-(row|col|row-reverse|col-reverse)$/,
  justifyContent: /^justify-(start|end|center|between|around|evenly)$/,
  alignItems: /^items-(start|end|center|baseline|stretch)$/,
  gap: /^gap-(\d+|px|x|y)/,
  padding: /^p-(\d+|px|\[.+\])$/,
  paddingX: /^px-(\d+|px|\[.+\])$/,
  paddingY: /^py-(\d+|px|\[.+\])$/,

  // Typography
  fontSize: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/,
  fontWeight: /^font-(normal|medium|semibold|bold)$/,
  textAlign: /^text-(left|center|right)$/,

  // Colors (semantic tokens only)
  bgColor: /^bg-(background|card|popover|primary|secondary|muted|accent|destructive)$/,
  textColor: /^text-(foreground|primary-foreground|secondary-foreground|muted-foreground|accent-foreground|destructive-foreground|card-foreground|popover-foreground)$/,

  // Dimensions
  width: /^w-(auto|full|fit|screen|\d+|\[.+\])$/,
  height: /^h-(auto|full|fit|screen|\d+|\[.+\])$/,

  // Border
  borderRadius: /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$|^rounded-\[.+\]$/,
  borderWidth: /^border(-0|-2|-4|-8)?$|^border-\[.+\]$/,
  borderColor: /^border-(transparent|input|border|primary|secondary|muted|accent|destructive)$/,

  // Effects
  shadow: /^shadow(-none|-sm|-md|-lg|-xl|-2xl|-inner)?$/,
  opacity: /^opacity-(0|5|10|20|25|30|40|50|60|70|75|80|90|95|100)$/,
} as const;

export type ClassCategory = keyof typeof CATEGORY_PATTERNS;

/**
 * Parse a className string into an array of individual classes.
 */
export function parseClasses(className: string): string[] {
  if (!className || typeof className !== "string") {
    return [];
  }
  return className.trim().split(/\s+/).filter(Boolean);
}

/**
 * Join an array of classes back into a className string.
 */
export function joinClasses(classes: string[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Check if a class matches a specific category pattern.
 */
export function matchesCategory(className: string, category: ClassCategory): boolean {
  const pattern = CATEGORY_PATTERNS[category];
  return pattern.test(className);
}

/**
 * Get the current class for a specific category from a className string.
 */
export function getClassForCategory(className: string, category: ClassCategory): string | null {
  const classes = parseClasses(className);
  const pattern = CATEGORY_PATTERNS[category];
  return classes.find((cls) => pattern.test(cls)) || null;
}

/**
 * Update a className string by replacing all classes of a given category
 * with a new value (or removing them if newValue is null/empty).
 *
 * IMPORTANT: This function preserves class order by replacing in-place
 * instead of removing and appending.
 *
 * @param originalClasses - The current className string
 * @param category - The category of classes to update
 * @param newValue - The new class to add (or null/empty to just remove)
 * @returns Updated className string
 */
export function updateClass(
  originalClasses: string,
  category: ClassCategory,
  newValue: string | null
): string {
  const classes = parseClasses(originalClasses);
  const pattern = CATEGORY_PATTERNS[category];

  // Find the index of the first matching class
  const firstMatchIndex = classes.findIndex((cls) => pattern.test(cls));

  if (firstMatchIndex === -1) {
    // No existing class in this category - append at end if we have a new value
    if (newValue && newValue.trim()) {
      return joinClasses([...classes, newValue.trim()]);
    }
    return joinClasses(classes);
  }

  // Replace in-place: remove all matches, then insert new value at first match position
  const result: string[] = [];
  let inserted = false;

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    if (pattern.test(cls)) {
      // This is a match - replace the first one, skip the rest
      if (!inserted && newValue && newValue.trim()) {
        result.push(newValue.trim());
        inserted = true;
      }
      // Skip this class (it's being replaced or removed)
    } else {
      result.push(cls);
    }
  }

  return joinClasses(result);
}

/**
 * Remove all layout-related classes (for the Reset Layout button).
 */
export function removeLayoutClasses(originalClasses: string): string {
  const classes = parseClasses(originalClasses);

  const layoutCategories: ClassCategory[] = [
    "display",
    "flexDirection",
    "justifyContent",
    "alignItems",
    "gap",
    "padding",
    "paddingX",
    "paddingY",
  ];

  const filtered = classes.filter((cls) => {
    return !layoutCategories.some((category) => {
      const pattern = CATEGORY_PATTERNS[category];
      return pattern.test(cls);
    });
  });

  return joinClasses(filtered);
}

/**
 * Check if a className contains dynamic class patterns that shouldn't be auto-edited.
 * Returns true if the className uses cn(), template literals, or ternary operators.
 */
export function isDynamicClassName(className: string): boolean {
  if (!className) return false;

  // Check for cn() function calls
  if (/cn\s*\(/.test(className)) return true;

  // Check for template literals (backticks)
  if (className.includes("`")) return true;

  // Check for ternary operators
  if (/\?\s*['"]/.test(className)) return true;

  // Check for variable interpolation
  if (/\$\{/.test(className)) return true;

  return false;
}

/**
 * Detect the current layout mode from a className string.
 */
export function detectLayoutMode(className: string): "block" | "flex" | "grid" | null {
  const classes = parseClasses(className);

  if (classes.includes("flex") || classes.includes("inline-flex")) {
    return "flex";
  }
  if (classes.includes("grid")) {
    return "grid";
  }
  if (classes.includes("block") || classes.includes("inline-block") || classes.includes("inline")) {
    return "block";
  }

  return null;
}

/**
 * Detect flex direction from a className string.
 */
export function detectFlexDirection(className: string): "row" | "col" | null {
  const classes = parseClasses(className);

  if (classes.includes("flex-col") || classes.includes("flex-col-reverse")) {
    return "col";
  }
  if (classes.includes("flex-row") || classes.includes("flex-row-reverse")) {
    return "row";
  }

  // Default flex direction is row
  return null;
}

/**
 * Detect justify-content value from a className string.
 */
export function detectJustifyContent(className: string): string | null {
  const classes = parseClasses(className);
  const justifyPattern = /^justify-(start|end|center|between|around|evenly)$/;

  const match = classes.find((cls) => justifyPattern.test(cls));
  if (match) {
    return match.replace("justify-", "");
  }

  return null;
}

/**
 * Detect align-items value from a className string.
 */
export function detectAlignItems(className: string): string | null {
  const classes = parseClasses(className);
  const itemsPattern = /^items-(start|end|center|baseline|stretch)$/;

  const match = classes.find((cls) => itemsPattern.test(cls));
  if (match) {
    return match.replace("items-", "");
  }

  return null;
}

/**
 * Detect gap value from a className string (returns the numeric part).
 */
export function detectGap(className: string): string | null {
  const classes = parseClasses(className);
  const gapPattern = /^gap-(\d+)$/;

  for (const cls of classes) {
    const match = cls.match(gapPattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Detect padding value from a className string (returns the numeric part).
 */
export function detectPadding(className: string): string | null {
  const classes = parseClasses(className);
  const paddingPattern = /^p-(\d+)$/;

  for (const cls of classes) {
    const match = cls.match(paddingPattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// Tailwind spacing scale with pixel values
export const SPACING_SCALE: Array<{ value: string; px: number }> = [
  { value: "0", px: 0 },
  { value: "1", px: 4 },
  { value: "2", px: 8 },
  { value: "4", px: 16 },
  { value: "6", px: 24 },
  { value: "8", px: 32 },
  { value: "12", px: 48 },
  { value: "16", px: 64 },
];

// Typography and color UI scales
export const FONT_SIZE_SCALE: Array<{ value: string; label: string; size: string }> = [
  { value: "xs", label: "XS", size: "12px" },
  { value: "sm", label: "SM", size: "14px" },
  { value: "base", label: "Base", size: "16px" },
  { value: "lg", label: "LG", size: "18px" },
  { value: "xl", label: "XL", size: "20px" },
  { value: "2xl", label: "2XL", size: "24px" },
  { value: "3xl", label: "3XL", size: "30px" },
];

export const FONT_WEIGHT_SCALE: Array<{ value: string; label: string; weight: number }> = [
  { value: "normal", label: "Normal", weight: 400 },
  { value: "medium", label: "Medium", weight: 500 },
  { value: "semibold", label: "Semi", weight: 600 },
  { value: "bold", label: "Bold", weight: 700 },
];

export const BG_COLOR_OPTIONS: Array<{ value: string; label: string; cssVar: string }> = [
  { value: "", label: "None", cssVar: "" },
  { value: "background", label: "Background", cssVar: "--background" },
  { value: "card", label: "Card", cssVar: "--card" },
  { value: "primary", label: "Primary", cssVar: "--primary" },
  { value: "secondary", label: "Secondary", cssVar: "--secondary" },
  { value: "muted", label: "Muted", cssVar: "--muted" },
  { value: "accent", label: "Accent", cssVar: "--accent" },
  { value: "destructive", label: "Destructive", cssVar: "--destructive" },
];

export const TEXT_COLOR_OPTIONS: Array<{ value: string; label: string; cssVar: string }> = [
  { value: "", label: "None", cssVar: "" },
  { value: "foreground", label: "Foreground", cssVar: "--foreground" },
  { value: "primary-foreground", label: "Primary FG", cssVar: "--primary-foreground" },
  { value: "secondary-foreground", label: "Secondary FG", cssVar: "--secondary-foreground" },
  { value: "muted-foreground", label: "Muted FG", cssVar: "--muted-foreground" },
  { value: "accent-foreground", label: "Accent FG", cssVar: "--accent-foreground" },
  { value: "destructive-foreground", label: "Destructive FG", cssVar: "--destructive-foreground" },
];

// Dimension preset options
export const DIMENSION_PRESETS = [
  { value: "auto", label: "Auto" },
  { value: "full", label: "Full (100%)" },
  { value: "fit", label: "Fit Content" },
  { value: "screen", label: "Screen" },
] as const;

// Border radius scale
export const BORDER_RADIUS_SCALE: Array<{ value: string; label: string; px: string }> = [
  { value: "none", label: "None", px: "0" },
  { value: "sm", label: "SM", px: "2px" },
  { value: "", label: "Default", px: "4px" },
  { value: "md", label: "MD", px: "6px" },
  { value: "lg", label: "LG", px: "8px" },
  { value: "xl", label: "XL", px: "12px" },
  { value: "2xl", label: "2XL", px: "16px" },
  { value: "full", label: "Full", px: "9999px" },
];

// Border width scale
export const BORDER_WIDTH_SCALE: Array<{ value: string; label: string; px: number }> = [
  { value: "0", label: "None", px: 0 },
  { value: "", label: "1px", px: 1 },
  { value: "2", label: "2px", px: 2 },
  { value: "4", label: "4px", px: 4 },
];

// Border color options (semantic tokens)
export const BORDER_COLOR_OPTIONS: Array<{ value: string; label: string; cssVar: string }> = [
  { value: "", label: "None", cssVar: "" },
  { value: "input", label: "Input", cssVar: "--input" },
  { value: "border", label: "Border", cssVar: "--border" },
  { value: "primary", label: "Primary", cssVar: "--primary" },
  { value: "muted", label: "Muted", cssVar: "--muted" },
  { value: "destructive", label: "Destructive", cssVar: "--destructive" },
];

// Shadow scale
export const SHADOW_SCALE: Array<{ value: string; label: string }> = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "", label: "Default" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

// Opacity scale
export const OPACITY_SCALE: Array<{ value: string; percent: number }> = [
  { value: "0", percent: 0 },
  { value: "25", percent: 25 },
  { value: "50", percent: 50 },
  { value: "75", percent: 75 },
  { value: "100", percent: 100 },
];

/**
 * Detect font size from a className string.
 */
export function detectFontSize(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Detect font weight from a className string.
 */
export function detectFontWeight(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^font-(normal|medium|semibold|bold)$/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Detect text alignment from a className string.
 */
export function detectTextAlign(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^text-(left|center|right)$/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Detect background color (semantic token) from a className string.
 */
export function detectBgColor(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    if (cls.startsWith("bg-")) {
      const token = cls.replace("bg-", "");
      if (SEMANTIC_BG_TOKENS.includes(token as typeof SEMANTIC_BG_TOKENS[number])) {
        return token;
      }
    }
  }
  return null;
}

/**
 * Detect text color (semantic token) from a className string.
 */
export function detectTextColor(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    if (cls.startsWith("text-")) {
      const token = cls.replace("text-", "");
      if (SEMANTIC_TEXT_TOKENS.includes(token as typeof SEMANTIC_TEXT_TOKENS[number])) {
        return token;
      }
    }
  }
  return null;
}

/**
 * Detect width from a className string.
 * Returns "full", "auto", "fit", "screen", arbitrary value like "[350px]", or null.
 */
export function detectWidth(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^w-(auto|full|fit|screen|\d+|\[.+\])$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Detect height from a className string.
 * Returns "full", "auto", "fit", "screen", arbitrary value like "[350px]", or null.
 */
export function detectHeight(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^h-(auto|full|fit|screen|\d+|\[.+\])$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Detect border radius from a className string.
 * Returns "none", "sm", "md", "lg", "xl", "2xl", "3xl", "full", "" (default), or arbitrary value.
 */
export function detectBorderRadius(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    // Check for arbitrary value first
    const arbitraryMatch = cls.match(/^rounded-(\[.+\])$/);
    if (arbitraryMatch) {
      return arbitraryMatch[1];
    }
    // Check for scale values
    const scaleMatch = cls.match(/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/);
    if (scaleMatch) {
      // scaleMatch[1] is undefined for "rounded" (default), or "-sm", "-lg", etc.
      if (scaleMatch[1] === undefined) {
        return ""; // default rounded
      }
      return scaleMatch[1].replace("-", ""); // "sm", "lg", "none", "full", etc.
    }
  }
  return null;
}

/**
 * Detect border width from a className string.
 * Returns "0", "" (1px), "2", "4", "8", or arbitrary value.
 */
export function detectBorderWidth(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    // Check for arbitrary value first
    const arbitraryMatch = cls.match(/^border-(\[.+\])$/);
    if (arbitraryMatch) {
      return arbitraryMatch[1];
    }
    // Check for scale values
    const scaleMatch = cls.match(/^border(-0|-2|-4|-8)?$/);
    if (scaleMatch) {
      if (scaleMatch[1] === undefined) {
        return ""; // default border (1px)
      }
      return scaleMatch[1].replace("-", ""); // "0", "2", "4", "8"
    }
  }
  return null;
}

/**
 * Detect border color (semantic token) from a className string.
 */
export function detectBorderColor(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^border-(transparent|input|border|primary|secondary|muted|accent|destructive)$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Detect shadow from a className string.
 * Returns "none", "sm", "" (default), "md", "lg", "xl", "2xl", "inner", or null.
 */
export function detectShadow(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^shadow(-none|-sm|-md|-lg|-xl|-2xl|-inner)?$/);
    if (match) {
      if (match[1] === undefined) {
        return ""; // default shadow
      }
      return match[1].replace("-", ""); // "none", "sm", "md", "lg", etc.
    }
  }
  return null;
}

/**
 * Detect opacity from a className string.
 * Returns "0", "5", "10", ..., "100", or null.
 */
export function detectOpacity(className: string): string | null {
  const classes = parseClasses(className);
  for (const cls of classes) {
    const match = cls.match(/^opacity-(0|5|10|20|25|30|40|50|60|70|75|80|90|95|100)$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}
