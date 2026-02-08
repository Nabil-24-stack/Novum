/**
 * Component Promoter - Rule 3 of the Design System Gatekeeper
 *
 * Promotes raw HTML elements (<button>, <input>, <textarea>, <label>)
 * to their Shadcn/ui equivalents (<Button>, <Input>, <Textarea>, <Label>).
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
// Promotion Map
// ============================================================================

const PROMOTION_MAP: Record<string, PromotionTarget> = {
  button: { componentName: "Button", importPath: "./components/ui/button" },
  input: { componentName: "Input", importPath: "./components/ui/input" },
  textarea: { componentName: "Textarea", importPath: "./components/ui/textarea" },
  label: { componentName: "Label", importPath: "./components/ui/label" },
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
