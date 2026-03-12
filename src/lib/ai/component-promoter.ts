/**
 * Component Promoter - Rule 3 of the Design System Gatekeeper
 *
 * Promotes raw HTML elements to their Shadcn/ui equivalents.
 *
 * Two passes:
 * 1. Tag-based promotions: <button> → <Button>, <input> → <Input>, etc.
 * 2. Pattern-based promotions: detects Badge, Card, Alert, Avatar, etc.
 *    from className patterns on generic tags (div, span, img).
 *
 * Uses Babel AST to safely detect elements and verify they don't use
 * unsafe props (ref, style, spread, complex event handlers, data-* attributes).
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import { addImportsIfMissing, type ImportInfo } from "@/lib/ast/import-manager";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

export interface ComponentPromotion {
  original: string;
  replacement: string;
  tagName: string;
  reason: string;
}

interface PromotionTarget {
  componentName: string;
  importPath: string;
}

// ============================================================================
// Pattern-Based Promotion Types
// ============================================================================

interface PatternContext {
  tagName: string;
  className: string;
  classes: Set<string>;
  attributes: Map<string, string | true>;
  hasChildren: boolean;
}

interface PatternMatch {
  componentName: string;
  variant?: string;
  propsToAdd?: Record<string, string>;
  classesToRemove?: Set<string>;
}

interface PatternRule {
  targetTags: Set<string>;
  detect: (ctx: PatternContext) => PatternMatch | null;
  target: PromotionTarget;
}

// ============================================================================
// Tag-Based Promotion Map
// ============================================================================

const PROMOTION_MAP: Record<string, PromotionTarget> = {
  button: { componentName: "Button", importPath: "./components/ui/button" },
  input: { componentName: "Input", importPath: "./components/ui/input" },
  textarea: { componentName: "Textarea", importPath: "./components/ui/textarea" },
  label: { componentName: "Label", importPath: "./components/ui/label" },
  hr: { componentName: "Separator", importPath: "./components/ui/separator" },
  table: { componentName: "Table", importPath: "./components/ui/table" },
  thead: { componentName: "TableHeader", importPath: "./components/ui/table" },
  tbody: { componentName: "TableBody", importPath: "./components/ui/table" },
  tr: { componentName: "TableRow", importPath: "./components/ui/table" },
  th: { componentName: "TableHead", importPath: "./components/ui/table" },
  td: { componentName: "TableCell", importPath: "./components/ui/table" },
};

// ============================================================================
// Safe/Unsafe Prop Detection
// ============================================================================

/** Props that are safe to keep when promoting */
const SAFE_PROPS = new Set([
  "className", "type", "placeholder", "disabled", "value", "onChange", "onClick",
  "name", "id", "htmlFor", "rows", "defaultValue", "required", "autoFocus",
  "autoComplete", "readOnly", "min", "max", "step", "pattern", "maxLength",
  "checked", "defaultChecked",
  // Additional safe props for pattern-based promotions
  "role", "tabIndex", "title", "alt", "src", "href", "colSpan", "rowSpan", "scope",
]);

/** Prop prefixes that are safe */
const SAFE_PROP_PREFIXES = ["aria-"];

/** Props/patterns that cause bail-out */
const UNSAFE_PROPS = new Set([
  "ref", "style",
  "onMouseDown", "onMouseUp", "onMouseMove", "onMouseEnter", "onMouseLeave",
  "onKeyDown", "onKeyUp", "onKeyPress",
  "onPointerDown", "onPointerUp", "onPointerMove",
  "onFocus", "onBlur",
  "onTouchStart", "onTouchEnd", "onTouchMove",
  "onDrag", "onDragStart", "onDragEnd", "onDragOver", "onDrop",
  "onSubmit", "onReset",
  "onScroll", "onWheel",
  "onContextMenu",
  "onInput", "onSelect", "onCopy", "onCut", "onPaste",
]);

/** Tags eligible for pattern-based promotion */
const GENERIC_TAGS = new Set(["div", "span", "img"]);

/**
 * Check if an attribute name is safe for promotion.
 */
function isPropSafe(name: string): boolean {
  if (SAFE_PROPS.has(name)) return true;
  if (SAFE_PROP_PREFIXES.some(prefix => name.startsWith(prefix))) return true;
  return false;
}

/**
 * Check if an attribute name is explicitly unsafe.
 */
function isPropUnsafe(name: string): boolean {
  if (UNSAFE_PROPS.has(name)) return true;
  if (name.startsWith("data-")) return true;
  return false;
}

// ============================================================================
// Pattern Helpers
// ============================================================================

/** Check if the class set contains any class from the provided list */
function hasAnyClass(classes: Set<string>, targets: string[]): boolean {
  return targets.some(t => classes.has(t));
}


// ============================================================================
// Pattern Rules
// ============================================================================

const PATTERN_RULES: PatternRule[] = [
  // ── Role-based detections (highest priority) ──

  // Alert: role="alert"
  {
    targetTags: new Set(["div"]),
    target: { componentName: "Alert", importPath: "./components/ui/alert" },
    detect: (ctx) => {
      if (ctx.attributes.get("role") !== "alert") return null;
      let variant: string | undefined;
      if (ctx.classes.has("bg-destructive") || ctx.classes.has("border-destructive")) {
        variant = "destructive";
      } else if (ctx.classes.has("bg-success") || ctx.classes.has("border-success")) {
        variant = "success";
      } else if (ctx.classes.has("bg-warning") || ctx.classes.has("border-warning")) {
        variant = "warning";
      } else if (ctx.classes.has("bg-info") || ctx.classes.has("border-info")) {
        variant = "info";
      }
      const classesToRemove = new Set<string>();
      for (const cls of [
        "bg-destructive",
        "border-destructive",
        "bg-success",
        "border-success",
        "bg-warning",
        "border-warning",
        "bg-info",
        "border-info",
      ]) {
        if (ctx.classes.has(cls)) {
          classesToRemove.add(cls);
        }
      }
      return {
        componentName: "Alert",
        variant,
        classesToRemove: classesToRemove.size > 0 ? classesToRemove : undefined,
      };
    },
  },

  // Progress: role="progressbar"
  {
    targetTags: new Set(["div"]),
    target: { componentName: "Progress", importPath: "./components/ui/progress" },
    detect: (ctx) => {
      if (ctx.attributes.get("role") !== "progressbar") return null;
      return { componentName: "Progress" };
    },
  },

  // Switch: role="switch"
  {
    targetTags: new Set(["div", "span"]),
    target: { componentName: "Switch", importPath: "./components/ui/switch" },
    detect: (ctx) => {
      if (ctx.attributes.get("role") !== "switch") return null;
      return { componentName: "Switch" };
    },
  },

  // Checkbox: role="checkbox"
  {
    targetTags: new Set(["div", "span"]),
    target: { componentName: "Checkbox", importPath: "./components/ui/checkbox" },
    detect: (ctx) => {
      if (ctx.attributes.get("role") !== "checkbox") return null;
      return { componentName: "Checkbox" };
    },
  },

  // Separator: role="separator" OR visual pattern
  {
    targetTags: new Set(["div"]),
    target: { componentName: "Separator", importPath: "./components/ui/separator" },
    detect: (ctx) => {
      // Role-based
      if (ctx.attributes.get("role") === "separator") {
        return { componentName: "Separator" };
      }
      // Pattern-based: thin horizontal line div
      const hasHeight = ctx.classes.has("h-px") || ctx.classes.has("h-[1px]");
      const hasWidth = ctx.classes.has("w-full");
      const hasBgLine = ctx.classes.has("bg-border") || ctx.classes.has("bg-muted");
      if (hasHeight && hasWidth && hasBgLine && !ctx.hasChildren) {
        return {
          componentName: "Separator",
          classesToRemove: new Set(["h-px", "h-[1px]", "w-full", "bg-border", "bg-muted"]),
        };
      }
      return null;
    },
  },

  // ── Pattern-based detections ──

  // Badge: inline-flex + small padding + small text + font weight + rounded
  {
    targetTags: new Set(["div", "span"]),
    target: { componentName: "Badge", importPath: "./components/ui/badge" },
    detect: (ctx) => {
      let signals = 0;

      // Signal 1: inline-flex or inline-block
      if (hasAnyClass(ctx.classes, ["inline-flex", "inline-block"])) signals++;

      // Signal 2: small padding
      if (hasAnyClass(ctx.classes, ["px-2", "px-2.5", "px-3", "py-0.5", "py-1"])) signals++;

      // Signal 3: small text
      if (hasAnyClass(ctx.classes, ["text-xs", "text-sm", "text-caption", "text-body-sm"])) signals++;

      // Signal 4: font weight
      if (hasAnyClass(ctx.classes, ["font-semibold", "font-medium", "font-bold"])) signals++;

      // Signal 5: rounded
      if (hasAnyClass(ctx.classes, [
        "rounded", "rounded-full", "rounded-md", "rounded-lg", "rounded-sm", "rounded-xl",
      ])) signals++;

      if (signals < 4) return null;

      // Determine variant from bg class
      let variant: string | undefined;
      if (ctx.classes.has("bg-destructive")) variant = "destructive";
      else if (ctx.classes.has("bg-success")) variant = "success";
      else if (ctx.classes.has("bg-warning")) variant = "warning";
      else if (ctx.classes.has("bg-info")) variant = "info";
      else if (ctx.classes.has("bg-secondary")) variant = "secondary";
      else if (ctx.classes.has("bg-muted")) variant = "secondary";

      // Collect styling classes to remove (Badge provides its own)
      const classesToRemove = new Set<string>();
      const badgeAbsorbedClasses = [
        "inline-flex", "inline-block", "items-center",
        "px-2", "px-2.5", "px-3", "py-0.5", "py-1",
        "text-xs", "text-sm", "text-caption", "text-body-sm",
        "font-semibold", "font-medium", "font-bold",
        "rounded", "rounded-full", "rounded-md", "rounded-lg", "rounded-sm", "rounded-xl",
        "bg-primary", "bg-secondary", "bg-success", "bg-warning", "bg-info",
        "bg-destructive", "bg-muted", "bg-accent",
        "text-primary-foreground", "text-secondary-foreground", "text-success-foreground",
        "text-warning-foreground", "text-info-foreground", "text-destructive-foreground",
        "text-muted-foreground", "text-accent-foreground",
        "border", "border-border", "border-success", "border-warning", "border-info", "border-destructive",
      ];
      for (const c of badgeAbsorbedClasses) {
        if (ctx.classes.has(c)) classesToRemove.add(c);
      }

      return { componentName: "Badge", variant, classesToRemove };
    },
  },

  // Avatar: rounded-full + matching square dimensions (h-N w-N)
  {
    targetTags: new Set(["div", "img"]),
    target: { componentName: "Avatar", importPath: "./components/ui/avatar" },
    detect: (ctx) => {
      if (!ctx.classes.has("rounded-full")) return null;

      // Look for matching h-N w-N pairs
      const sizePattern = /^[hw]-(\d+)$/;
      let hSize: string | undefined;
      let wSize: string | undefined;

      for (const cls of ctx.classes) {
        const m = cls.match(sizePattern);
        if (m) {
          if (cls.startsWith("h-")) hSize = m[1];
          if (cls.startsWith("w-")) wSize = m[1];
        }
      }

      if (!hSize || !wSize || hSize !== wSize) return null;

      // Size must be reasonable for an avatar (6-16 in Tailwind scale ≈ 24-64px)
      const size = parseInt(hSize, 10);
      if (size < 6 || size > 20) return null;

      return {
        componentName: "Avatar",
        classesToRemove: new Set(["rounded-full", `h-${hSize}`, `w-${wSize}`, "overflow-hidden"]),
      };
    },
  },

  // Card: rounded + border + bg + children (lowest priority since it's broad)
  {
    targetTags: new Set(["div"]),
    target: { componentName: "Card", importPath: "./components/ui/card" },
    detect: (ctx) => {
      if (!ctx.hasChildren) return null;

      let signals = 0;

      // Signal 1: rounded-lg or rounded-xl
      if (hasAnyClass(ctx.classes, ["rounded-lg", "rounded-xl"])) signals++;

      // Signal 2: border
      if (hasAnyClass(ctx.classes, ["border", "border-border"])) signals++;

      // Signal 3: card-like bg or shadow
      if (hasAnyClass(ctx.classes, ["bg-card", "bg-background", "shadow", "shadow-sm", "shadow-md", "shadow-lg"])) signals++;

      // Need all 3 signals for Card
      if (signals < 3) return null;

      const classesToRemove = new Set<string>();
      const cardAbsorbed = [
        "rounded-lg", "rounded-xl", "border", "border-border",
        "bg-card", "bg-background", "shadow", "shadow-sm",
        "text-card-foreground",
      ];
      for (const c of cardAbsorbed) {
        if (ctx.classes.has(c)) classesToRemove.add(c);
      }

      return { componentName: "Card", classesToRemove };
    },
  },
];

// ============================================================================
// AST-Based Promotion
// ============================================================================

interface ReplacementEdit {
  // Opening tag replacement
  openStart: number;
  openEnd: number;
  newOpenTag: string;
  // Closing tag replacement (null for self-closing)
  closeStart: number | null;
  closeEnd: number | null;
  newCloseTag: string | null;
  // Metadata
  tagName: string;
  componentName: string;
}

/**
 * Build a PatternContext from a JSXOpeningElement AST node.
 */
function buildPatternContext(
  path: NodePath<t.JSXOpeningElement>,
): PatternContext | null {
  const nameNode = path.node.name;
  if (nameNode.type !== "JSXIdentifier") return null;

  const tagName = nameNode.name;

  // Extract className string
  let className = "";
  const attributes = new Map<string, string | true>();

  for (const attr of path.node.attributes) {
    if (attr.type === "JSXSpreadAttribute") return null; // bail on spread

    if (attr.type === "JSXAttribute") {
      const attrName = attr.name.type === "JSXIdentifier"
        ? attr.name.name
        : `${attr.name.namespace.name}:${attr.name.name.name}`;

      if (isPropUnsafe(attrName)) return null; // bail on unsafe props

      if (attrName === "className" && attr.value) {
        if (attr.value.type === "StringLiteral") {
          className = attr.value.value;
        }
        // For JSXExpressionContainer with string literal
        else if (
          attr.value.type === "JSXExpressionContainer" &&
          attr.value.expression.type === "StringLiteral"
        ) {
          className = attr.value.expression.value;
        }
      } else if (attr.value) {
        if (attr.value.type === "StringLiteral") {
          attributes.set(attrName, attr.value.value);
        } else {
          attributes.set(attrName, true);
        }
      } else {
        // Boolean attribute (e.g., disabled)
        attributes.set(attrName, true);
      }
    }
  }

  // Check if parent JSXElement has children
  const parent = path.parentPath;
  let hasChildren = false;
  if (parent?.node.type === "JSXElement") {
    const children = (parent.node as t.JSXElement).children;
    hasChildren = children.some(child => {
      if (child.type === "JSXText") return child.value.trim().length > 0;
      return true;
    });
  }

  const classes = new Set(className.trim().split(/\s+/).filter(Boolean));

  return { tagName, className, classes, attributes, hasChildren };
}

/**
 * Build a ReplacementEdit for a pattern match.
 * Handles className modification (removing absorbed classes) and tag name change.
 */
function buildPatternEdit(
  path: NodePath<t.JSXOpeningElement>,
  code: string,
  match: PatternMatch,
): ReplacementEdit | null {
  const nameNode = path.node.name;
  if (nameNode.type !== "JSXIdentifier") return null;

  const tagName = nameNode.name;
  const openStart = path.node.start;
  const openEnd = path.node.end;
  if (openStart == null || openEnd == null) return null;

  let openingSource = code.slice(openStart, openEnd);

  // Replace tag name
  openingSource = openingSource.replace(
    new RegExp(`^(<\\s*)${tagName}\\b`),
    `$1${match.componentName}`
  );

  // Remove absorbed classes from className
  if (match.classesToRemove && match.classesToRemove.size > 0) {
    openingSource = removeClassesFromJSX(openingSource, match.classesToRemove);
  }

  // Add variant prop if specified
  if (match.variant) {
    // Insert variant prop after component name
    openingSource = openingSource.replace(
      new RegExp(`^(<\\s*${match.componentName})`),
      `$1 variant="${match.variant}"`
    );
  }

  // Add other props if specified
  if (match.propsToAdd) {
    for (const [key, value] of Object.entries(match.propsToAdd)) {
      openingSource = openingSource.replace(
        new RegExp(`^(<\\s*${match.componentName}(?:\\s+variant="[^"]*")?)`),
        `$1 ${key}="${value}"`
      );
    }
  }

  // Remove role attribute if it was used for detection (component handles it internally)
  // Use regex on the modified string (not AST offsets which are stale after earlier edits)
  openingSource = openingSource.replace(/\s+role="[^"]*"/, "");

  // Handle closing tag
  let closeStart: number | null = null;
  let closeEnd: number | null = null;
  let newCloseTag: string | null = null;

  if (!path.node.selfClosing) {
    const parent = path.parentPath;
    if (parent?.node.type === "JSXElement") {
      const closingElement = (parent.node as t.JSXElement).closingElement;
      if (closingElement && closingElement.start != null && closingElement.end != null) {
        closeStart = closingElement.start;
        closeEnd = closingElement.end;
        newCloseTag = `</${match.componentName}>`;
      }
    }
  }

  return {
    openStart,
    openEnd,
    newOpenTag: openingSource,
    closeStart,
    closeEnd,
    newCloseTag,
    tagName,
    componentName: match.componentName,
  };
}

/**
 * Remove specific classes from a className attribute within a JSX opening tag string.
 */
function removeClassesFromJSX(openingTag: string, classesToRemove: Set<string>): string {
  // Match className="..." or className={"..."}
  return openingTag.replace(
    /className=(?:"([^"]*)"|{["`']([^"`']*)["`']})/,
    (fullMatch, strLiteral, exprLiteral) => {
      const original = strLiteral ?? exprLiteral ?? "";
      const remaining = original
        .split(/\s+/)
        .filter((c: string) => c && !classesToRemove.has(c))
        .join(" ");

      if (!remaining) {
        // Remove the entire className attribute if no classes remain
        return "";
      }

      if (strLiteral !== undefined) {
        return `className="${remaining}"`;
      }
      return `className={"${remaining}"}`;
    }
  );
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Promote raw HTML elements to Shadcn components in the given code.
 * Returns the modified code and list of promotions.
 */
export function promoteComponents(
  code: string,
  filePath: string,
): { code: string; promotions: ComponentPromotion[] } {
  // Skip component definition files
  if (filePath.match(/\/components\/ui\//)) {
    return { code, promotions: [] };
  }

  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return { code, promotions: [] };
  }

  const edits: ReplacementEdit[] = [];
  const requiredImports: ImportInfo[] = [];
  const importsSeen = new Set<string>();

  // ── Pass 1: Tag-based promotions ──
  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const nameNode = path.node.name;
      if (nameNode.type !== "JSXIdentifier") return;

      const tagName = nameNode.name;
      const target = PROMOTION_MAP[tagName];
      if (!target) return;

      // Check all attributes for safety
      let hasBailout = false;
      for (const attr of path.node.attributes) {
        // Spread attributes → bail
        if (attr.type === "JSXSpreadAttribute") {
          hasBailout = true;
          break;
        }

        if (attr.type === "JSXAttribute") {
          const attrName = attr.name.type === "JSXIdentifier"
            ? attr.name.name
            : `${attr.name.namespace.name}:${attr.name.name.name}`;

          if (isPropUnsafe(attrName)) {
            hasBailout = true;
            break;
          }

          // Unknown props that aren't explicitly safe → bail
          if (!isPropSafe(attrName) && !isPropUnsafe(attrName)) {
            hasBailout = true;
            break;
          }
        }
      }

      if (hasBailout) return;

      // Compute opening tag positions
      const openStart = path.node.start;
      const openEnd = path.node.end;
      if (openStart == null || openEnd == null) return;

      // Find the tag name within the opening element for surgical replacement
      // The tag name starts right after '<'
      const openingSource = code.slice(openStart, openEnd);

      // Build new opening tag by replacing tag name
      const newOpenTag = openingSource.replace(
        new RegExp(`^(<\\s*)${tagName}\\b`),
        `$1${target.componentName}`
      );

      // Handle closing tag
      let closeStart: number | null = null;
      let closeEnd: number | null = null;
      let newCloseTag: string | null = null;

      if (!path.node.selfClosing) {
        // Find the parent JSXElement to get the closing tag
        const parent = path.parentPath;
        if (parent?.node.type === "JSXElement") {
          const closingElement = (parent.node as t.JSXElement).closingElement;
          if (closingElement && closingElement.start != null && closingElement.end != null) {
            closeStart = closingElement.start;
            closeEnd = closingElement.end;
            newCloseTag = `</${target.componentName}>`;
          }
        }
      }

      edits.push({
        openStart,
        openEnd,
        newOpenTag,
        closeStart,
        closeEnd,
        newCloseTag,
        tagName,
        componentName: target.componentName,
      });

      // Track required imports
      if (!importsSeen.has(target.componentName)) {
        importsSeen.add(target.componentName);
        requiredImports.push({
          componentName: target.componentName,
          importPath: target.importPath,
          isNamedExport: true,
        });
      }
    },
  });

  // ── Pass 2: Pattern-based promotions on generic tags ──
  // Re-parse since pass 1 may have already collected edits (we track edited positions)
  const editedPositions = new Set(edits.map(e => e.openStart));

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const nameNode = path.node.name;
      if (nameNode.type !== "JSXIdentifier") return;
      if (!GENERIC_TAGS.has(nameNode.name)) return;

      // Skip if this element was already edited in pass 1
      if (path.node.start != null && editedPositions.has(path.node.start)) return;

      const ctx = buildPatternContext(path);
      if (!ctx) return;

      // Try each pattern rule in order (first match wins)
      for (const rule of PATTERN_RULES) {
        if (!rule.targetTags.has(ctx.tagName)) continue;

        const match = rule.detect(ctx);
        if (!match) continue;

        const edit = buildPatternEdit(path, code, match);
        if (!edit) continue;

        edits.push(edit);

        // Track required imports
        if (!importsSeen.has(match.componentName)) {
          importsSeen.add(match.componentName);
          requiredImports.push({
            componentName: match.componentName,
            importPath: rule.target.importPath,
            isNamedExport: true,
          });
        }

        break; // first match wins
      }
    },
  });

  if (edits.length === 0) {
    return { code, promotions: [] };
  }

  // Sort edits by position in reverse order (apply from end to start)
  const allReplacements: Array<{ start: number; end: number; text: string }> = [];

  for (const edit of edits) {
    allReplacements.push({
      start: edit.openStart,
      end: edit.openEnd,
      text: edit.newOpenTag,
    });
    if (edit.closeStart != null && edit.closeEnd != null && edit.newCloseTag != null) {
      allReplacements.push({
        start: edit.closeStart,
        end: edit.closeEnd,
        text: edit.newCloseTag,
      });
    }
  }

  // Sort in reverse order by start position
  allReplacements.sort((a, b) => b.start - a.start);

  // Apply surgical replacements
  let result = code;
  for (const rep of allReplacements) {
    result = result.slice(0, rep.start) + rep.text + result.slice(rep.end);
  }

  // Add imports
  if (requiredImports.length > 0) {
    const importResult = addImportsIfMissing(result, requiredImports, filePath);
    if (importResult.success && importResult.newCode) {
      result = importResult.newCode;
    }
  }

  // Build promotion report
  const promotions: ComponentPromotion[] = edits.map((edit) => ({
    original: `<${edit.tagName}>`,
    replacement: `<${edit.componentName}>`,
    tagName: edit.tagName,
    reason: `Promoted <${edit.tagName}> to <${edit.componentName}> (Shadcn)`,
  }));

  return { code: result, promotions };
}
