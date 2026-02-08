import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import { ReorderFailureReason, type SourceLocation } from "@/lib/inspection/types";
import { resolveComponentFilePath, scanComponentPropSchema } from "./prop-schema";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

/** Represents a parsed JSX prop with its value and type */
export interface ParsedProp {
  name: string;
  value: string | boolean | null;
  /** The type of the value expression */
  valueType: "string" | "boolean" | "expression" | "none";
  /** Raw source code of the value (for expressions) */
  rawValue?: string;
  /** For enum/union type props, the list of valid string options */
  options?: string[];
}

/** Result of reading props from a JSX element */
export interface GetPropsResult {
  success: boolean;
  props?: ParsedProp[];
  error?: string;
}

export type ASTOperationType =
  | "updateProp"
  | "insertChild"
  | "updateText"
  | "deleteNode"
  | "swapSibling"
  | "removeProp"
  | "moveElement";

export interface UpdatePropOperation {
  type: "updateProp";
  propName: string;
  newValue: string | boolean;
}

export interface InsertChildOperation {
  type: "insertChild";
  /** JSX code string to insert as a child */
  childCode: string;
  /** Insert position: "first", "last", or index */
  position: "first" | "last" | number;
}

export interface UpdateTextOperation {
  type: "updateText";
  newText: string;
}

export interface DeleteNodeOperation {
  type: "deleteNode";
}

export interface SwapSiblingOperation {
  type: "swapSibling";
  direction: "prev" | "next";
}

export interface RemovePropOperation {
  type: "removeProp";
  propName: string;
}

export interface MoveElementOperation {
  type: "moveElement";
  targetLocation: SourceLocation;
  position: "before" | "after" | "inside";
}

export type ASTOperation =
  | UpdatePropOperation
  | InsertChildOperation
  | UpdateTextOperation
  | DeleteNodeOperation
  | SwapSiblingOperation
  | RemovePropOperation
  | MoveElementOperation;

export interface ASTWriteResult {
  success: boolean;
  newCode?: string;
  error?: string;
  reorderFailureReason?: ReorderFailureReason;
  editMode?: "FULL_EDIT" | "LIMITED_EDIT" | "READ_ONLY";
  /** Updated source location after the operation (for operations that move elements) */
  newSourceLocation?: SourceLocation;
}

// ============================================================================
// Core Function: Find JSX Element by Source Location
// ============================================================================

interface FoundNode {
  path: NodePath<t.JSXElement>;
  node: t.JSXElement;
}

/**
 * Find a JSXElement node at the specified source location.
 * The location should match the JSXOpeningElement's start position.
 */
function findJSXElementAtLocation(
  ast: t.File,
  location: SourceLocation
): FoundNode | null {
  let found: FoundNode | null = null;

  traverse(ast, {
    JSXElement(path) {
      const openingElement = path.node.openingElement;
      const loc = openingElement.loc?.start;

      if (
        loc &&
        loc.line === location.line &&
        loc.column === location.column
      ) {
        found = { path, node: path.node };
        path.stop(); // Stop traversal once found
      }
    },
  });

  return found;
}

// ============================================================================
// Helper: Parse JSX Attribute Value
// ============================================================================

/**
 * Parse a JSX attribute value into a ParsedProp structure.
 */
function parseAttributeValue(
  attr: t.JSXAttribute,
  originalCode: string
): ParsedProp {
  const name =
    attr.name.type === "JSXIdentifier" ? attr.name.name : String(attr.name);

  // No value means boolean true (e.g., <Button disabled />)
  if (attr.value === null || attr.value === undefined) {
    return {
      name,
      value: true,
      valueType: "none",
    };
  }

  // String literal (e.g., variant="outline")
  if (attr.value.type === "StringLiteral") {
    return {
      name,
      value: attr.value.value,
      valueType: "string",
    };
  }

  // JSX Expression Container (e.g., disabled={true} or onClick={() => {}})
  if (attr.value.type === "JSXExpressionContainer") {
    const expr = attr.value.expression;

    // Boolean literal
    if (expr.type === "BooleanLiteral") {
      return {
        name,
        value: expr.value,
        valueType: "boolean",
      };
    }

    // String literal in expression (e.g., className={"foo"})
    if (expr.type === "StringLiteral") {
      return {
        name,
        value: expr.value,
        valueType: "string",
      };
    }

    // Other expressions - extract raw source code
    const start = attr.value.start;
    const end = attr.value.end;
    if (start != null && end != null) {
      // Remove the outer { }
      const raw = originalCode.slice(start + 1, end - 1);
      return {
        name,
        value: null,
        valueType: "expression",
        rawValue: raw,
      };
    }
  }

  return {
    name,
    value: null,
    valueType: "expression",
  };
}

// ============================================================================
// Get Props at Location
// ============================================================================

/**
 * Get the component name from a JSX opening element.
 */
function getComponentName(openingElement: t.JSXOpeningElement): string | null {
  const name = openingElement.name;

  if (name.type === "JSXIdentifier") {
    return name.name;
  }

  // Handle JSXMemberExpression (e.g., Card.Header)
  if (name.type === "JSXMemberExpression") {
    // Get the rightmost identifier
    return name.property.name;
  }

  return null;
}

/**
 * Get all props from a JSX element at the specified source location.
 * Excludes: children, key (internal React props)
 *
 * When vfsFiles is provided and the element is a custom component (PascalCase),
 * this function will scan the component's TypeScript interface for union types
 * and add `options` to the returned props.
 */
export function getPropsAtLocation(
  code: string,
  location: SourceLocation,
  vfsFiles?: Record<string, string>
): GetPropsResult {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      ranges: true,
    });

    const found = findJSXElementAtLocation(ast, location);

    if (!found) {
      return {
        success: false,
        error: `Could not find JSX element at ${location.fileName}:${location.line}:${location.column}`,
      };
    }

    const { node } = found;
    const attributes = node.openingElement.attributes;

    // Props to exclude from the UI
    const excludedProps = new Set(["children", "key", "ref", "data-source-loc"]);

    const props: ParsedProp[] = [];

    for (const attr of attributes) {
      // Skip spread attributes
      if (attr.type === "JSXSpreadAttribute") {
        continue;
      }

      const propName =
        attr.name.type === "JSXIdentifier" ? attr.name.name : String(attr.name);

      // Skip excluded props
      if (excludedProps.has(propName)) {
        continue;
      }

      props.push(parseAttributeValue(attr, code));
    }

    // Enrich props with enum options if VFS files are provided
    if (vfsFiles) {
      const componentName = getComponentName(node.openingElement);

      // Only scan for custom components (PascalCase)
      if (componentName && componentName[0] === componentName[0].toUpperCase()) {
        const componentPath = resolveComponentFilePath(componentName, vfsFiles);

        if (componentPath && vfsFiles[componentPath]) {
          const schema = scanComponentPropSchema(vfsFiles[componentPath], componentName);

          if (schema?.enumProps) {
            // Track which props already exist in the instance
            const existingPropNames = new Set(props.map((p) => p.name));

            // Merge options into matching props
            for (const prop of props) {
              if (schema.enumProps[prop.name]) {
                prop.options = schema.enumProps[prop.name];
              }
            }

            // Add "phantom props" - schema props not set in the JSX instance
            // These allow users to set props that exist in the component's interface
            for (const [propName, options] of Object.entries(schema.enumProps)) {
              if (!existingPropNames.has(propName)) {
                props.push({
                  name: propName,
                  value: null, // Not set in JSX
                  valueType: "string", // Will be a string when set
                  options,
                });
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      props,
    };
  } catch (error) {
    return {
      success: false,
      error: `AST parsing error: ${String(error)}`,
    };
  }
}

// ============================================================================
// Operation A: Update Prop
// ============================================================================

/**
 * Format a value for JSX attribute based on its type.
 * - String values: propName="value"
 * - Boolean true: propName (shorthand) or propName={true}
 * - Boolean false: propName={false}
 */
function formatPropValue(propName: string, value: string | boolean): string {
  if (typeof value === "boolean") {
    if (value === true) {
      // Use shorthand for true: <Button disabled />
      return propName;
    } else {
      // Explicit false: <Button disabled={false} />
      return `${propName}={false}`;
    }
  }

  // String value
  return `${propName}="${value}"`;
}

function performUpdateProp(
  node: t.JSXElement,
  propName: string,
  newValue: string | boolean
): { start: number; end: number; newCode: string } | null {
  const openingElement = node.openingElement;
  const attributes = openingElement.attributes;

  // Find existing attribute
  const existingAttrIndex = attributes.findIndex(
    (attr) =>
      attr.type === "JSXAttribute" &&
      attr.name.type === "JSXIdentifier" &&
      attr.name.name === propName
  );

  if (existingAttrIndex !== -1) {
    // Update existing attribute
    const attr = attributes[existingAttrIndex] as t.JSXAttribute;
    const attrStart = attr.start;
    const attrEnd = attr.end;

    if (attrStart == null || attrEnd == null) {
      return null;
    }

    // Generate new attribute string
    const newAttrCode = formatPropValue(propName, newValue);

    return {
      start: attrStart,
      end: attrEnd,
      newCode: newAttrCode,
    };
  } else {
    // Add new attribute after the tag name
    // Find the position right after the opening tag name
    const tagName = openingElement.name;
    const tagEnd = tagName.end;

    if (tagEnd == null) {
      return null;
    }

    // Insert new attribute with a space before it
    const newAttrCode = ` ${formatPropValue(propName, newValue)}`;

    return {
      start: tagEnd,
      end: tagEnd,
      newCode: newAttrCode,
    };
  }
}

// ============================================================================
// Operation F: Remove Prop
// ============================================================================

function performRemoveProp(
  node: t.JSXElement,
  propName: string,
  originalCode: string
): { start: number; end: number; newCode: string } | null {
  const openingElement = node.openingElement;
  const attributes = openingElement.attributes;

  // Find existing attribute
  const existingAttrIndex = attributes.findIndex(
    (attr) =>
      attr.type === "JSXAttribute" &&
      attr.name.type === "JSXIdentifier" &&
      attr.name.name === propName
  );

  if (existingAttrIndex === -1) {
    // Prop doesn't exist, nothing to remove
    return null;
  }

  const attr = attributes[existingAttrIndex] as t.JSXAttribute;
  let attrStart = attr.start;
  const attrEnd = attr.end;

  if (attrStart == null || attrEnd == null) {
    return null;
  }

  // Include leading whitespace in the removal
  const beforeAttr = originalCode.slice(Math.max(0, attrStart - 10), attrStart);
  const leadingWsMatch = beforeAttr.match(/\s+$/);
  if (leadingWsMatch) {
    attrStart -= leadingWsMatch[0].length;
  }

  return {
    start: attrStart,
    end: attrEnd,
    newCode: "",
  };
}

// ============================================================================
// Operation B: Insert Child
// ============================================================================

function performInsertChild(
  node: t.JSXElement,
  childCode: string,
  position: "first" | "last" | number,
  originalCode: string
): { start: number; end: number; newCode: string } | null {
  const openingElement = node.openingElement;
  const closingElement = node.closingElement;

  // Self-closing elements can't have children
  if (openingElement.selfClosing || !closingElement) {
    // Need to convert to non-self-closing
    const openingEnd = openingElement.end;
    if (openingEnd == null) return null;

    // Get the tag name
    const tagName =
      openingElement.name.type === "JSXIdentifier"
        ? openingElement.name.name
        : "div";

    // Find where the /> is
    const selfCloseIndex = originalCode.lastIndexOf("/>", openingEnd);
    if (selfCloseIndex === -1) return null;

    // Replace /> with >{childCode}</tagName>
    const newCode = `>\n  ${childCode}\n</${tagName}>`;

    return {
      start: selfCloseIndex,
      end: openingEnd,
      newCode,
    };
  }

  // Non-self-closing element - insert between opening and closing tags
  const children = node.children;
  const openingEnd = openingElement.end;
  const closingStart = closingElement.start;

  if (openingEnd == null || closingStart == null) {
    return null;
  }

  // Determine insert position
  let insertPoint: number;

  if (position === "first" || children.length === 0) {
    insertPoint = openingEnd;
  } else if (position === "last") {
    insertPoint = closingStart;
  } else {
    // Numeric position
    const targetIndex = Math.min(position, children.length);
    if (targetIndex === 0) {
      insertPoint = openingEnd;
    } else {
      const prevChild = children[targetIndex - 1];
      insertPoint = prevChild.end ?? closingStart;
    }
  }

  // Format the child code with proper indentation
  const newCode = `\n  ${childCode}`;

  return {
    start: insertPoint,
    end: insertPoint,
    newCode,
  };
}

// ============================================================================
// Operation C: Update Text
// ============================================================================

function performUpdateText(
  node: t.JSXElement,
  newText: string
): { start: number; end: number; newCode: string } | null {
  const children = node.children;

  // Find text node(s) among children
  const textChildren = children.filter(
    (child): child is t.JSXText => child.type === "JSXText"
  );

  if (textChildren.length === 0) {
    // No text children - check if it's a simple element we can add text to
    const openingEnd = node.openingElement.end;
    const closingStart = node.closingElement?.start;

    if (openingEnd == null || closingStart == null) {
      return null;
    }

    // Replace all children with the new text
    return {
      start: openingEnd,
      end: closingStart,
      newCode: newText,
    };
  }

  // Find the text child with actual content (not just whitespace)
  const contentTextChild = textChildren.find(
    (child) => child.value.trim().length > 0
  );

  if (contentTextChild) {
    const start = contentTextChild.start;
    const end = contentTextChild.end;

    if (start == null || end == null) {
      return null;
    }

    // Preserve leading/trailing whitespace from original
    const original = contentTextChild.value;
    const leadingWs = original.match(/^(\s*)/)?.[1] || "";
    const trailingWs = original.match(/(\s*)$/)?.[1] || "";

    return {
      start,
      end,
      newCode: `${leadingWs}${newText}${trailingWs}`,
    };
  }

  // If all text children are whitespace-only, replace the first one
  if (textChildren.length > 0) {
    const firstText = textChildren[0];
    const start = firstText.start;
    const end = firstText.end;

    if (start == null || end == null) {
      return null;
    }

    return {
      start,
      end,
      newCode: newText,
    };
  }

  return null;
}

// ============================================================================
// Operation D: Delete Node
// ============================================================================

function performDeleteNode(
  node: t.JSXElement,
  originalCode: string
): { start: number; end: number; newCode: string } | null {
  const start = node.start;
  const end = node.end;

  if (start == null || end == null) {
    return null;
  }

  // Check for leading whitespace/newline to clean up
  let actualStart = start;
  const beforeNode = originalCode.slice(Math.max(0, start - 50), start);
  const lastNewline = beforeNode.lastIndexOf("\n");

  if (lastNewline !== -1) {
    const afterNewline = beforeNode.slice(lastNewline + 1);
    // If only whitespace between newline and node, include in deletion
    if (/^\s*$/.test(afterNewline)) {
      actualStart = start - afterNewline.length;
    }
  }

  // Check for trailing newline
  let actualEnd = end;
  if (originalCode[end] === "\n") {
    actualEnd = end + 1;
  }

  return {
    start: actualStart,
    end: actualEnd,
    newCode: "",
  };
}

// ============================================================================
// Operation E: Swap Sibling
// ============================================================================

interface SwapSiblingResult {
  start: number;
  end: number;
  newCode: string;
  /** Character offset where the swapped element now starts */
  newElementStart: number;
}

function performSwapSibling(
  path: NodePath<t.JSXElement>,
  node: t.JSXElement,
  direction: "prev" | "next",
  originalCode: string
): SwapSiblingResult | null {
  // Find sibling JSXElement (skip JSXText whitespace nodes)
  const siblingPath =
    direction === "prev"
      ? path
          .getAllPrevSiblings()
          .reverse()
          .find((s) => s.isJSXElement())
      : path.getAllNextSiblings().find((s) => s.isJSXElement());

  if (!siblingPath?.isJSXElement()) return null;

  const siblingNode = siblingPath.node as t.JSXElement;

  const nodeStart = node.start;
  const nodeEnd = node.end;
  const sibStart = siblingNode.start;
  const sibEnd = siblingNode.end;

  if (
    nodeStart == null ||
    nodeEnd == null ||
    sibStart == null ||
    sibEnd == null
  ) {
    return null;
  }

  // Determine order (which comes first in source)
  const [firstStart, firstEnd, secondStart, secondEnd] =
    direction === "prev"
      ? [sibStart, sibEnd, nodeStart, nodeEnd]
      : [nodeStart, nodeEnd, sibStart, sibEnd];

  const firstCode = originalCode.slice(firstStart, firstEnd);
  const secondCode = originalCode.slice(secondStart, secondEnd);
  const betweenCode = originalCode.slice(firstEnd, secondStart);

  // Swap: second + between + first
  // After swap, the element that was second now comes first
  // Calculate where our node ends up
  let newElementStart: number;
  if (direction === "prev") {
    // Our node was second, now it's first - starts at firstStart
    newElementStart = firstStart;
  } else {
    // Our node was first, now it's second - starts at firstStart + siblingCode.length + betweenCode.length
    newElementStart = firstStart + secondCode.length + betweenCode.length;
  }

  return {
    start: firstStart,
    end: secondEnd,
    newCode: secondCode + betweenCode + firstCode,
    newElementStart,
  };
}

// ============================================================================
// Main Function: Update Code at Location
// ============================================================================

/**
 * Update code at a specific source location using AST-based surgical editing.
 *
 * This function:
 * 1. Parses the code to AST
 * 2. Finds the JSX element at the specified location
 * 3. Calculates the exact character range to modify
 * 4. Performs surgical string replacement (preserves formatting elsewhere)
 *
 * @param code - The original source code
 * @param location - The source location of the target element
 * @param operation - The operation to perform
 * @returns The modified code or an error
 */
export function updateCodeAtLocation(
  code: string,
  location: SourceLocation,
  operation: ASTOperation
): ASTWriteResult {
  try {
    // Parse the code
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      // Track positions for surgical replacement
      ranges: true,
    });

    // Find the target element
    const found = findJSXElementAtLocation(ast, location);

    if (!found) {
      return {
        success: false,
        error: `Could not find JSX element at ${location.fileName}:${location.line}:${location.column}`,
        reorderFailureReason:
          operation.type === "swapSibling"
            ? ReorderFailureReason.STALE_SOURCE_LOCATION
            : undefined,
      };
    }

    // Perform the operation
    let editInfo: { start: number; end: number; newCode: string } | null = null;
    let swapResult: SwapSiblingResult | null = null;

    switch (operation.type) {
      case "updateProp":
        editInfo = performUpdateProp(
          found.node,
          operation.propName,
          operation.newValue
        );
        break;

      case "removeProp":
        editInfo = performRemoveProp(
          found.node,
          operation.propName,
          code
        );
        break;

      case "insertChild":
        editInfo = performInsertChild(
          found.node,
          operation.childCode,
          operation.position,
          code
        );
        break;

      case "updateText":
        editInfo = performUpdateText(found.node, operation.newText);
        break;

      case "deleteNode":
        editInfo = performDeleteNode(found.node, code);
        break;

      case "swapSibling":
        swapResult = performSwapSibling(
          found.path,
          found.node,
          operation.direction,
          code
        );
        editInfo = swapResult;
        break;
    }

    if (!editInfo) {
      return {
        success: false,
        error: `Failed to perform ${operation.type} operation`,
        reorderFailureReason:
          operation.type === "swapSibling"
            ? ReorderFailureReason.NO_SIBLING_IN_DIRECTION
            : undefined,
      };
    }

    // Surgical string replacement
    const newCode =
      code.slice(0, editInfo.start) +
      editInfo.newCode +
      code.slice(editInfo.end);

    // Calculate new source location for swap operations
    let newSourceLocation: SourceLocation | undefined;
    if (swapResult) {
      // Convert character offset to line:column in the new code
      const newElementStart = swapResult.newElementStart;
      const beforeElement = newCode.slice(0, newElementStart);
      const lines = beforeElement.split("\n");
      const line = lines.length;
      const column = lines[lines.length - 1].length;

      newSourceLocation = {
        fileName: location.fileName,
        line,
        column,
      };
    }

    return {
      success: true,
      newCode,
      newSourceLocation,
    };
  } catch (error) {
    return {
      success: false,
      error: `AST parsing/transformation error: ${String(error)}`,
      reorderFailureReason:
        operation.type === "swapSibling"
          ? ReorderFailureReason.UNKNOWN
          : undefined,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Update a className attribute at a specific location.
 */
export function updateClassNameAtLocation(
  code: string,
  location: SourceLocation,
  newClassName: string,
  options: { strategy?: "safe" | "force" } = {}
): ASTWriteResult {
  const strategy = options.strategy ?? "safe";

  if (strategy === "safe") {
    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      const found = findJSXElementAtLocation(ast, location);
      if (!found) {
        return {
          success: false,
          error: `Could not find JSX element at ${location.fileName}:${location.line}:${location.column}`,
          editMode: "READ_ONLY",
        };
      }

      const classAttr = found.node.openingElement.attributes.find(
        (attr): attr is t.JSXAttribute =>
          attr.type === "JSXAttribute" &&
          attr.name.type === "JSXIdentifier" &&
          attr.name.name === "className"
      );

      // If there's no className attr, adding one is always safe.
      if (classAttr) {
        const value = classAttr.value;
        const isSafeValue =
          value == null ||
          value.type === "StringLiteral" ||
          (value.type === "JSXExpressionContainer" &&
            value.expression.type === "StringLiteral");

        if (!isSafeValue) {
          return {
            success: false,
            error: "Dynamic class expression is not safely editable",
            editMode: "LIMITED_EDIT",
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to analyze className expression: ${String(error)}`,
        editMode: "READ_ONLY",
      };
    }
  }

  return updateCodeAtLocation(code, location, {
    type: "updateProp",
    propName: "className",
    newValue: newClassName,
  });
}

/**
 * Update text content at a specific location.
 */
export function updateTextAtLocation(
  code: string,
  location: SourceLocation,
  newText: string
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "updateText",
    newText,
  });
}

/**
 * Insert a child element at a specific location.
 */
export function insertChildAtLocation(
  code: string,
  location: SourceLocation,
  childCode: string,
  position: "first" | "last" | number = "last"
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "insertChild",
    childCode,
    position,
  });
}

/**
 * Delete a node at a specific location.
 */
export function deleteNodeAtLocation(
  code: string,
  location: SourceLocation
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "deleteNode",
  });
}

/**
 * Swap an element with its sibling at a specific location.
 */
export function swapSiblingAtLocation(
  code: string,
  location: SourceLocation,
  direction: "prev" | "next"
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "swapSibling",
    direction,
  });
}

export interface SwapPreflightResult {
  success: boolean;
  reason?: ReorderFailureReason;
}

/**
 * Lightweight preflight for keyboard reordering.
 * This avoids optimistic DOM swaps when AST cannot perform the real swap.
 */
export function preflightSwapSiblingAtLocation(
  code: string,
  location: SourceLocation,
  direction: "prev" | "next"
): SwapPreflightResult {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    const found = findJSXElementAtLocation(ast, location);
    if (!found) {
      return { success: false, reason: ReorderFailureReason.STALE_SOURCE_LOCATION };
    }

    const siblingPath =
      direction === "prev"
        ? found.path
            .getAllPrevSiblings()
            .reverse()
            .find((s) => s.isJSXElement())
        : found.path.getAllNextSiblings().find((s) => s.isJSXElement());

    if (!siblingPath?.isJSXElement()) {
      return { success: false, reason: ReorderFailureReason.NO_SIBLING_IN_DIRECTION };
    }

    return { success: true };
  } catch {
    return { success: false, reason: ReorderFailureReason.UNKNOWN };
  }
}

/**
 * Update a prop at a specific location.
 * Handles both string and boolean values.
 */
export function updatePropAtLocation(
  code: string,
  location: SourceLocation,
  propName: string,
  value: string | boolean
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "updateProp",
    propName,
    newValue: value,
  });
}

/**
 * Remove a prop at a specific location.
 */
export function removePropAtLocation(
  code: string,
  location: SourceLocation,
  propName: string
): ASTWriteResult {
  return updateCodeAtLocation(code, location, {
    type: "removeProp",
    propName,
  });
}

// ============================================================================
// Operation G: Move Element (for drag-and-drop)
// ============================================================================

/**
 * Move an element from one location to another.
 * This is a compound operation: extract source, delete source, insert at target.
 *
 * Algorithm:
 * 1. Find both source and target JSX elements
 * 2. Extract source element code
 * 3. Calculate insertion point based on position (before/after/inside)
 * 4. Process edits in reverse order (end-of-file first) to preserve offsets
 *
 * @param code - The original source code
 * @param sourceLocation - The source location of the element to move
 * @param targetLocation - The source location of the target element
 * @param position - Where to place relative to target: "before", "after", or "inside"
 */
export function moveElementAtLocation(
  code: string,
  sourceLocation: SourceLocation,
  targetLocation: SourceLocation,
  position: "before" | "after" | "inside"
): ASTWriteResult {
  try {
    // Parse the code
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      ranges: true,
    });

    // Find source element
    const sourceFound = findJSXElementAtLocation(ast, sourceLocation);
    if (!sourceFound) {
      return {
        success: false,
        error: `Could not find source element at ${sourceLocation.fileName}:${sourceLocation.line}:${sourceLocation.column}`,
      };
    }

    // Find target element
    const targetFound = findJSXElementAtLocation(ast, targetLocation);
    if (!targetFound) {
      return {
        success: false,
        error: `Could not find target element at ${targetLocation.fileName}:${targetLocation.line}:${targetLocation.column}`,
      };
    }

    const sourceNode = sourceFound.node;
    const targetNode = targetFound.node;

    // Get source bounds
    const sourceStart = sourceNode.start;
    const sourceEnd = sourceNode.end;
    if (sourceStart == null || sourceEnd == null) {
      return { success: false, error: "Source element has no position info" };
    }

    // Check for invalid moves: can't drop element inside its own descendant
    if (position === "inside") {
      const targetStart = targetNode.start;
      const targetEnd = targetNode.end;
      if (targetStart != null && targetEnd != null) {
        if (targetStart >= sourceStart && targetEnd <= sourceEnd) {
          return {
            success: false,
            error: "Cannot move element inside its own descendant",
          };
        }
      }
    }

    // Extract source element code (trimmed)
    const sourceCode = code.slice(sourceStart, sourceEnd);

    // Calculate source deletion range (include leading whitespace/newline)
    let deleteStart = sourceStart;
    const beforeSource = code.slice(Math.max(0, sourceStart - 50), sourceStart);
    const lastNewline = beforeSource.lastIndexOf("\n");
    if (lastNewline !== -1) {
      const afterNewline = beforeSource.slice(lastNewline + 1);
      if (/^\s*$/.test(afterNewline)) {
        deleteStart = sourceStart - afterNewline.length;
      }
    }

    let deleteEnd = sourceEnd;
    if (code[sourceEnd] === "\n") {
      deleteEnd = sourceEnd + 1;
    }

    // Calculate insertion point based on position
    let insertPoint: number;
    let insertCode: string;

    if (position === "before") {
      const targetStart = targetNode.start;
      if (targetStart == null) {
        return { success: false, error: "Target has no start position" };
      }
      insertPoint = targetStart;
      insertCode = sourceCode + "\n";
    } else if (position === "after") {
      const targetEnd = targetNode.end;
      if (targetEnd == null) {
        return { success: false, error: "Target has no end position" };
      }
      insertPoint = targetEnd;
      insertCode = "\n" + sourceCode;
    } else {
      // position === "inside"
      const openingElement = targetNode.openingElement;
      const closingElement = targetNode.closingElement;

      if (openingElement.selfClosing || !closingElement) {
        // Self-closing element - convert to container
        const openingEnd = openingElement.end;
        if (openingEnd == null) {
          return { success: false, error: "Opening element has no end position" };
        }

        // Get the tag name
        const tagName =
          openingElement.name.type === "JSXIdentifier"
            ? openingElement.name.name
            : "div";

        // Find where /> is
        const selfCloseIndex = code.lastIndexOf("/>", openingEnd);
        if (selfCloseIndex === -1) {
          return { success: false, error: "Cannot find self-closing tag" };
        }

        // We need to:
        // 1. Delete source element
        // 2. Replace /> with >..child..</tag>
        // Process in reverse order (higher offset first)

        const convertCode = `>\n  ${sourceCode}\n</${tagName}>`;

        // If source comes after the self-close, delete source first, then convert
        if (sourceStart > selfCloseIndex) {
          // Delete source first (higher offset), then convert self-closing
          // Since delete is after the self-close position, no offset adjustment needed
          let result = code.slice(0, deleteStart) + code.slice(deleteEnd);
          result =
            result.slice(0, selfCloseIndex) +
            convertCode +
            result.slice(openingEnd);
          return { success: true, newCode: result };
        } else {
          // Source comes before - convert first, then delete
          let result =
            code.slice(0, selfCloseIndex) + convertCode + code.slice(openingEnd);
          // Adjust source deletion for inserted chars
          const insertedLen = convertCode.length;
          const removedLen = openingEnd - selfCloseIndex;
          const offset = insertedLen - removedLen;
          const adjustedDeleteStart = deleteStart + offset;
          const adjustedDeleteEnd = deleteEnd + offset;
          result =
            result.slice(0, adjustedDeleteStart) +
            result.slice(adjustedDeleteEnd);
          return { success: true, newCode: result };
        }
      }

      // Non-self-closing - insert as last child
      const closingStart = closingElement.start;
      if (closingStart == null) {
        return { success: false, error: "Closing element has no start position" };
      }
      insertPoint = closingStart;
      insertCode = sourceCode + "\n";
    }

    // For before/after positions, we have two edits:
    // 1. Delete source
    // 2. Insert at target

    // Process in reverse order to maintain offsets
    let result = code;

    if (insertPoint > deleteStart) {
      // Insert comes after delete - do insert first
      result = result.slice(0, insertPoint) + insertCode + result.slice(insertPoint);
      // Then delete (no offset adjustment needed since delete is before insert)
      result = result.slice(0, deleteStart) + result.slice(deleteEnd);
    } else {
      // Delete comes after insert - do delete first
      result = result.slice(0, deleteStart) + result.slice(deleteEnd);
      // Then insert (no adjustment needed since insert is before deleted region)
      result =
        result.slice(0, insertPoint) +
        insertCode +
        result.slice(insertPoint);
    }

    return { success: true, newCode: result };
  } catch (error) {
    return {
      success: false,
      error: `Move operation failed: ${String(error)}`,
    };
  }
}
