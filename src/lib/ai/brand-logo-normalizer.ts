/**
 * Brand Logo Normalizer
 *
 * Detects cases where AI-generated code uses the Button component as a
 * decorative app logo/wordmark and rewrites it to static brand markup.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

const HEADER_CONTEXT_PATTERN = /\b(nav|navbar|topbar|toolbar|header|masthead)\b/i;
const APP_NAME_TOKEN_PATTERN = /^[a-z0-9&+.'-]+$/i;
const ACTION_LABELS = new Set([
  "dashboard",
  "home",
  "settings",
  "reports",
  "analytics",
  "profile",
  "billing",
  "pricing",
  "login",
  "log",
  "sign",
  "signup",
  "register",
  "menu",
  "search",
  "notifications",
  "help",
  "docs",
  "documentation",
  "add",
  "new",
  "create",
  "edit",
  "save",
  "delete",
  "remove",
  "cancel",
  "submit",
  "continue",
  "back",
  "next",
  "start",
  "launch",
  "open",
  "view",
  "explore",
  "upgrade",
  "download",
  "install",
  "share",
  "invite",
]);

const BUTTON_BASE_CLASSES = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium";

const VARIANT_CLASS_MAP: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  outline: "border border-input bg-background text-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  ghost: "text-foreground",
  link: "text-primary underline-offset-4",
};

const SIZE_CLASS_MAP: Record<string, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
};

const INTERACTIVE_ATTRS = new Set([
  "type",
  "disabled",
  "asChild",
  "href",
  "form",
  "formAction",
  "formEncType",
  "formMethod",
  "formNoValidate",
  "formTarget",
  "autoFocus",
  "tabIndex",
  "aria-expanded",
  "aria-haspopup",
  "aria-controls",
  "aria-pressed",
]);

const REMOVABLE_BUTTON_ATTRS = new Set([
  "variant",
  "size",
  "type",
  "disabled",
  "asChild",
]);

const PASSTHROUGH_ATTRS = new Set([
  "className",
  "id",
  "title",
  "style",
  "role",
  "aria-label",
  "aria-hidden",
]);

export interface BrandLogoNormalization {
  text: string;
  replacementTag: "div";
  removedAttributes: string[];
  reason: string;
  signals: string[];
}

function getJsxName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string | null {
  if (name.type === "JSXIdentifier") return name.name;
  return null;
}

function getSimpleStringAttributeValue(attr: t.JSXAttribute): string | null {
  if (!attr.value) return "";
  if (attr.value.type === "StringLiteral") return attr.value.value;
  if (
    attr.value.type === "JSXExpressionContainer" &&
    attr.value.expression.type === "StringLiteral"
  ) {
    return attr.value.expression.value;
  }
  return null;
}

function extractTextFromChildren(children: t.JSXElement["children"]): string {
  const parts: string[] = [];

  for (const child of children) {
    if (child.type === "JSXText") {
      const normalized = child.value.replace(/\s+/g, " ").trim();
      if (normalized) parts.push(normalized);
      continue;
    }

    if (child.type === "JSXExpressionContainer" && child.expression.type === "StringLiteral") {
      const normalized = child.expression.value.replace(/\s+/g, " ").trim();
      if (normalized) parts.push(normalized);
      continue;
    }

    if (child.type === "JSXElement") {
      const nested = extractTextFromChildren(child.children);
      if (nested) parts.push(nested);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function hasVisualIcon(children: t.JSXElement["children"]): boolean {
  return children.some((child) => {
    if (child.type !== "JSXElement") return false;
    const name = getJsxName(child.openingElement.name);
    return !!name && /^[A-Z]/.test(name);
  });
}

function getAncestorContextSignals(path: NodePath<t.JSXElement>): string[] {
  const signals = new Set<string>();

  if (path.parentPath.isJSXElement()) {
    const parentName = getJsxName(path.parentPath.node.openingElement.name);
    if (parentName && /^(nav|header)$/i.test(parentName)) {
      signals.add(`ancestor:${parentName.toLowerCase()}`);
    }
  }

  path.findParent((ancestorPath) => {
    if (!ancestorPath.isJSXElement()) return false;

    const name = getJsxName(ancestorPath.node.openingElement.name);
    if (name && /^(nav|header)$/i.test(name)) {
      signals.add(`ancestor:${name.toLowerCase()}`);
      return false;
    }

    for (const attr of ancestorPath.node.openingElement.attributes) {
      if (attr.type !== "JSXAttribute") continue;
      if (attr.name.type !== "JSXIdentifier" || attr.name.name !== "className") continue;
      const value = getSimpleStringAttributeValue(attr);
      if (value && HEADER_CONTEXT_PATTERN.test(value)) {
        signals.add(`ancestor-class:${value}`);
        return false;
      }
    }

    return false;
  });

  return [...signals];
}

function isHeaderContext(path: NodePath<t.JSXElement>, filePath?: string): boolean {
  if (filePath && HEADER_CONTEXT_PATTERN.test(filePath)) return true;
  return getAncestorContextSignals(path).length > 0;
}

function hasInteractiveBehavior(openingElement: t.JSXOpeningElement): boolean {
  for (const attr of openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") return true;
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier") return true;

    const name = attr.name.name;
    if (name.startsWith("on")) return true;
    if (INTERACTIVE_ATTRS.has(name)) return true;
  }

  return false;
}

function hasOnlySupportedAttributes(openingElement: t.JSXOpeningElement): boolean {
  for (const attr of openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") return false;
    if (attr.type !== "JSXAttribute") return false;
    if (attr.name.type !== "JSXIdentifier") return false;

    const name = attr.name.name;
    if (
      PASSTHROUGH_ATTRS.has(name) ||
      REMOVABLE_BUTTON_ATTRS.has(name) ||
      name.startsWith("data-")
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function isLikelyBrandText(text: string, hasIcon: boolean): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;

  const normalizedWords = words.map((word) => word.toLowerCase());
  if (normalizedWords.some((word) => ACTION_LABELS.has(word))) return false;
  if (words.some((word) => !APP_NAME_TOKEN_PATTERN.test(word))) return false;

  const joined = words.join(" ");
  if (joined.length < 3 || joined.length > 32) return false;

  if (words.length >= 2) return true;
  return hasIcon;
}

function buildStaticBrandClasses(
  variantValue: string | null,
  sizeValue: string | null,
  classNameValue: string | null,
): string {
  const variantClasses = VARIANT_CLASS_MAP[variantValue || "default"] || VARIANT_CLASS_MAP.default;
  const sizeClasses = SIZE_CLASS_MAP[sizeValue || "default"] || SIZE_CLASS_MAP.default;
  return [BUTTON_BASE_CLASSES, variantClasses, sizeClasses, classNameValue || ""]
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildReplacementElement(
  code: string,
  path: NodePath<t.JSXElement>,
): { text: string; removedAttributes: string[] } | null {
  const opening = path.node.openingElement;
  const closing = path.node.closingElement;
  if (!closing || opening.end == null || closing.start == null) return null;

  let classNameValue: string | null = null;
  let variantValue: string | null = null;
  let sizeValue: string | null = null;
  const keptAttrSources: string[] = [];
  const removedAttributes: string[] = [];

  for (const attr of opening.attributes) {
    if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") return null;

    const name = attr.name.name;
    if (REMOVABLE_BUTTON_ATTRS.has(name)) {
      removedAttributes.push(name);
      if (name === "variant") variantValue = getSimpleStringAttributeValue(attr);
      if (name === "size") sizeValue = getSimpleStringAttributeValue(attr);
      continue;
    }

    if (name === "className") {
      const value = getSimpleStringAttributeValue(attr);
      if (value == null) return null;
      classNameValue = value;
      continue;
    }

    if (PASSTHROUGH_ATTRS.has(name) || name.startsWith("data-")) {
      if (attr.start == null || attr.end == null) return null;
      keptAttrSources.push(code.slice(attr.start, attr.end));
      continue;
    }

    return null;
  }

  const mergedClassName = buildStaticBrandClasses(variantValue, sizeValue, classNameValue);
  const attrs = [`className="${mergedClassName}"`, ...keptAttrSources];
  const childrenSource = code.slice(opening.end, closing.start);

  return {
    text: `<div ${attrs.join(" ")}>${childrenSource}</div>`,
    removedAttributes,
  };
}

export function normalizeBrandLogos(
  code: string,
  filePath?: string,
): {
  code: string;
  brandLogoNormalizations: BrandLogoNormalization[];
} {
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return { code, brandLogoNormalizations: [] };
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const brandLogoNormalizations: BrandLogoNormalization[] = [];

  traverse(ast, {
    JSXElement(path: NodePath<t.JSXElement>) {
      const openingName = getJsxName(path.node.openingElement.name);
      if (openingName !== "Button") return;
      if (!path.node.closingElement) return;

      if (!isHeaderContext(path, filePath)) return;
      if (hasInteractiveBehavior(path.node.openingElement)) return;
      if (!hasOnlySupportedAttributes(path.node.openingElement)) return;

      const text = extractTextFromChildren(path.node.children);
      const iconLike = hasVisualIcon(path.node.children);
      if (!isLikelyBrandText(text, iconLike)) return;

      const replacement = buildReplacementElement(code, path);
      if (!replacement) return;

      const start = path.node.start;
      const end = path.node.end;
      if (start == null || end == null) return;

      const signals = [
        "header-context",
        iconLike ? "icon-plus-wordmark" : "short-wordmark",
        "non-interactive-button",
      ];

      replacements.push({ start, end, text: replacement.text });
      brandLogoNormalizations.push({
        text,
        replacementTag: "div",
        removedAttributes: replacement.removedAttributes,
        reason: "Converted a decorative brand/logo Button into static brand markup",
        signals: [...new Set([...signals, ...getAncestorContextSignals(path)])],
      });

      path.skip();
    },
  });

  if (replacements.length === 0) {
    return { code, brandLogoNormalizations };
  }

  let nextCode = code;
  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    nextCode = nextCode.slice(0, replacement.start) + replacement.text + nextCode.slice(replacement.end);
  }

  return { code: nextCode, brandLogoNormalizations };
}
