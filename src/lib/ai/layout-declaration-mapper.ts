/**
 * Layout Declaration Enforcer - Phase 0 of the Design System Gatekeeper
 *
 * AST-based rule that ensures every container element with 2+ direct JSX element
 * children has an explicit layout declaration (flex or grid).
 *
 * If a container div/section/article/etc. has multiple children but no flex/grid
 * class, this rule adds `flex flex-col` as a safe default (matches implicit
 * block flow - top-to-bottom stacking).
 *
 * Safety checks prevent modifying:
 * - Elements with `style` prop (custom positioning)
 * - Positioned containers (absolute/relative/fixed/sticky)
 * - Hidden containers (hidden/sr-only)
 * - Elements with spread attributes ({...props})
 * - Component elements (PascalCase - manage their own layout)
 * - Leaf elements with 0-1 children
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

export interface LayoutDeclarationAddition {
  tagName: string;
  added: string;
  line: number;
  column: number;
}

export interface LayoutDeclarationResult {
  code: string;
  additions: LayoutDeclarationAddition[];
}

// ============================================================================
// Constants
// ============================================================================

/** HTML container elements that should declare layout when they have multiple children */
const CONTAINER_TAGS = new Set([
  "div", "section", "article", "main", "aside", "nav", "header", "footer", "form", "fieldset",
]);

/** Classes that indicate an existing layout declaration */
const LAYOUT_CLASSES = /(?:^|\s)(?:flex|inline-flex|grid|inline-grid)(?:\s|$)/;

/** Classes that indicate positioned elements (bail out) */
const POSITION_CLASSES = /(?:^|\s)(?:absolute|relative|fixed|sticky)(?:\s|$)/;

/** Classes that indicate hidden elements (bail out) */
const HIDDEN_CLASSES = /(?:^|\s)(?:hidden|sr-only)(?:\s|$)/;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a JSX element name is a native HTML tag (lowercase).
 * Component elements (PascalCase) are skipped.
 */
function isNativeElement(openingElement: t.JSXOpeningElement): boolean {
  const name = openingElement.name;
  if (name.type !== "JSXIdentifier") return false;
  // Native tags start with lowercase
  return name.name[0] === name.name[0].toLowerCase();
}

/**
 * Get the tag name from a JSX opening element.
 */
function getTagName(openingElement: t.JSXOpeningElement): string | null {
  const name = openingElement.name;
  if (name.type === "JSXIdentifier") return name.name;
  return null;
}

/**
 * Count direct JSX element children (skip whitespace text, simple expressions).
 */
function countElementChildren(children: t.JSXElement["children"]): number {
  let count = 0;
  for (const child of children) {
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      count++;
    } else if (child.type === "JSXExpressionContainer") {
      // Count map() calls and other expressions that produce elements
      const expr = child.expression;
      if (expr.type !== "JSXEmptyExpression") {
        // Expression containers like {items.map(...)} or {condition && <div/>}
        // are counted as potential child-producing expressions
        count++;
      }
    }
    // JSXText (whitespace) is not counted
  }
  return count;
}

/**
 * Extract the className string value from a JSX element's attributes.
 * Returns null if className uses a dynamic expression.
 */
function getStaticClassName(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): {
  value: string | null;
  attr: t.JSXAttribute | null;
  isDynamic: boolean;
} {
  for (const attr of attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier" || attr.name.name !== "className") continue;

    const value = attr.value;

    // className="..."
    if (value?.type === "StringLiteral") {
      return { value: value.value, attr, isDynamic: false };
    }

    // className={cn(...)} or className={"..."}
    if (value?.type === "JSXExpressionContainer") {
      const expr = value.expression;

      // className={"literal"}
      if (expr.type === "StringLiteral") {
        return { value: expr.value, attr, isDynamic: false };
      }

      // className={cn("...", "...")} - check first string arg
      if (
        expr.type === "CallExpression" &&
        expr.callee.type === "Identifier" &&
        ["cn", "clsx", "twMerge"].includes(expr.callee.name)
      ) {
        // Check all string args for existing layout classes
        const allStrings = expr.arguments
          .filter((arg): arg is t.StringLiteral => arg.type === "StringLiteral")
          .map((arg) => arg.value)
          .join(" ");
        return { value: allStrings, attr, isDynamic: true };
      }

      // Other dynamic expressions - bail
      return { value: null, attr: null, isDynamic: true };
    }

    // No value (boolean attribute - shouldn't happen for className)
    return { value: "", attr, isDynamic: false };
  }

  // No className prop at all
  return { value: null, attr: null, isDynamic: false };
}

/**
 * Check if element has props that indicate we should bail out.
 */
function shouldBailOut(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): boolean {
  for (const attr of attributes) {
    // Spread attributes mean unknown classNames
    if (attr.type === "JSXSpreadAttribute") return true;

    if (attr.type === "JSXAttribute") {
      const name = attr.name.type === "JSXIdentifier" ? attr.name.name : "";

      // style prop means custom positioning
      if (name === "style") return true;
    }
  }
  return false;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Enforce layout declarations on container elements with multiple children.
 * Adds `flex flex-col` to containers that lack explicit flex/grid classes.
 */
export function enforceLayoutDeclarations(code: string): LayoutDeclarationResult {
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return { code, additions: [] };
  }

  const edits: Array<{
    start: number;
    end: number;
    newValue: string;
    addition: LayoutDeclarationAddition;
  }> = [];

  traverse(ast, {
    JSXElement(path: NodePath<t.JSXElement>) {
      const openingElement = path.node.openingElement;

      // Only process native HTML elements
      if (!isNativeElement(openingElement)) return;

      const tagName = getTagName(openingElement);
      if (!tagName || !CONTAINER_TAGS.has(tagName)) return;

      // Need 2+ element children
      const childCount = countElementChildren(path.node.children);
      if (childCount < 2) return;

      // Check for bail-out props
      if (shouldBailOut(openingElement.attributes)) return;

      // Check className for existing layout or positioning
      const classInfo = getStaticClassName(openingElement.attributes);

      // If we can't read the className (fully dynamic), bail
      if (classInfo.isDynamic && classInfo.value === null) return;

      const existingClasses = classInfo.value || "";

      // Already has layout declaration
      if (LAYOUT_CLASSES.test(existingClasses)) return;

      // Has positioning classes - bail
      if (POSITION_CLASSES.test(existingClasses)) return;

      // Is hidden - bail
      if (HIDDEN_CLASSES.test(existingClasses)) return;

      // Determine the edit
      const loc = openingElement.loc?.start;
      const addition: LayoutDeclarationAddition = {
        tagName,
        added: "flex flex-col",
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
      };

      if (classInfo.attr) {
        // className exists - append to it
        const attrValue = classInfo.attr.value;

        if (attrValue?.type === "StringLiteral") {
          // className="existing classes" → className="existing classes flex flex-col"
          const start = attrValue.start;
          const end = attrValue.end;
          if (start != null && end != null) {
            const currentValue = attrValue.value;
            const newValue = currentValue
              ? `"${currentValue} flex flex-col"`
              : `"flex flex-col"`;
            edits.push({ start, end, newValue, addition });
          }
        } else if (
          attrValue?.type === "JSXExpressionContainer" &&
          attrValue.expression.type === "StringLiteral"
        ) {
          // className={"existing"} → className={"existing flex flex-col"}
          const expr = attrValue.expression;
          const start = expr.start;
          const end = expr.end;
          if (start != null && end != null) {
            const currentValue = expr.value;
            const newValue = currentValue
              ? `"${currentValue} flex flex-col"`
              : `"flex flex-col"`;
            edits.push({ start, end, newValue, addition });
          }
        } else if (
          attrValue?.type === "JSXExpressionContainer" &&
          attrValue.expression.type === "CallExpression"
        ) {
          // className={cn("...", ...)} → className={cn("flex flex-col", "...", ...)}
          const expr = attrValue.expression;
          if (
            expr.callee.type === "Identifier" &&
            ["cn", "clsx", "twMerge"].includes(expr.callee.name)
          ) {
            // Insert "flex flex-col" as first argument
            const callee = expr.callee;
            const calleeEnd = callee.end;
            if (calleeEnd != null) {
              // Find the opening paren
              const openParen = code.indexOf("(", calleeEnd);
              if (openParen !== -1) {
                const insertPoint = openParen + 1;
                // Check if there are existing args
                const hasArgs = expr.arguments.length > 0;
                const insertText = hasArgs
                  ? `"flex flex-col", `
                  : `"flex flex-col"`;
                edits.push({
                  start: insertPoint,
                  end: insertPoint,
                  newValue: insertText,
                  addition,
                });
              }
            }
          }
        }
      } else {
        // No className prop at all - add one after the tag name
        const tagNameNode = openingElement.name;
        const tagEnd = tagNameNode.end;
        if (tagEnd != null) {
          edits.push({
            start: tagEnd,
            end: tagEnd,
            newValue: ` className="flex flex-col"`,
            addition,
          });
        }
      }
    },
  });

  if (edits.length === 0) {
    return { code, additions: [] };
  }

  // Apply edits in reverse order to preserve offsets
  edits.sort((a, b) => b.start - a.start);
  let result = code;
  const additions: LayoutDeclarationAddition[] = [];

  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.newValue + result.slice(edit.end);
    additions.push(edit.addition);
  }

  return { code: result, additions };
}
