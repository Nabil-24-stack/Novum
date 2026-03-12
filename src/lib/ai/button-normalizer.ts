/**
 * Button Normalizer
 *
 * Infers solid Button variants from semantic color styling, then removes the
 * corresponding base-state color overrides so the shared Button component's
 * design-system variant classes remain authoritative.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

const CLASSNAME_HELPERS = new Set(["cn", "clsx", "twMerge"]);

type SolidButtonVariant = "default" | "secondary" | "destructive";

const SOLID_BG_TO_VARIANT: Record<string, SolidButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  destructive: "destructive",
};

const REMOVABLE_SOLID_COLOR_CLASSES = [
  /^bg-(primary|secondary|destructive)(?:\/\d+)?$/,
  /^text-(primary|secondary|destructive)-foreground(?:\/\d+)?$/,
];

interface ButtonClassStringEdit {
  start: number;
  end: number;
  originalValue: string;
}

interface VariantAttributeInfo {
  currentValue?: string;
  hasVariant: boolean;
  isSimple: boolean;
}

export interface ButtonNormalization {
  variant: SolidButtonVariant;
  removedClasses: string[];
  updatedVariant: boolean;
  reason: string;
}

function getButtonName(path: NodePath<t.JSXOpeningElement>): string | null {
  const nameNode = path.node.name;
  if (nameNode.type !== "JSXIdentifier") return null;
  return nameNode.name;
}

function getVariantAttributeInfo(path: NodePath<t.JSXOpeningElement>): VariantAttributeInfo {
  for (const attr of path.node.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier" || attr.name.name !== "variant") continue;

    if (!attr.value) {
      return { hasVariant: true, isSimple: false };
    }

    if (attr.value.type === "StringLiteral") {
      return {
        currentValue: attr.value.value,
        hasVariant: true,
        isSimple: true,
      };
    }

    if (
      attr.value.type === "JSXExpressionContainer" &&
      attr.value.expression.type === "StringLiteral"
    ) {
      return {
        currentValue: attr.value.expression.value,
        hasVariant: true,
        isSimple: true,
      };
    }

    return { hasVariant: true, isSimple: false };
  }

  return { hasVariant: false, isSimple: true };
}

function getClassStringEdits(path: NodePath<t.JSXOpeningElement>): ButtonClassStringEdit[] {
  const edits: ButtonClassStringEdit[] = [];

  for (const attr of path.node.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier" || attr.name.name !== "className") continue;
    if (!attr.value) continue;

    if (attr.value.type === "StringLiteral" && attr.value.start != null && attr.value.end != null) {
      edits.push({
        start: attr.value.start + 1,
        end: attr.value.end - 1,
        originalValue: attr.value.value,
      });
      continue;
    }

    if (attr.value.type !== "JSXExpressionContainer") continue;
    const expr = attr.value.expression;

    if (expr.type === "StringLiteral" && expr.start != null && expr.end != null) {
      edits.push({
        start: expr.start + 1,
        end: expr.end - 1,
        originalValue: expr.value,
      });
      continue;
    }

    if (expr.type !== "CallExpression" || expr.callee.type !== "Identifier") continue;
    if (!CLASSNAME_HELPERS.has(expr.callee.name)) continue;

    for (const arg of expr.arguments) {
      if (arg.type !== "StringLiteral" || arg.start == null || arg.end == null) continue;
      edits.push({
        start: arg.start + 1,
        end: arg.end - 1,
        originalValue: arg.value,
      });
    }
  }

  return edits;
}

function inferSolidVariant(classStrings: string[]): SolidButtonVariant | null {
  let inferred: SolidButtonVariant | null = null;

  for (const classString of classStrings) {
    const classes = classString.trim().split(/\s+/).filter(Boolean);

    for (const cls of classes) {
      const parts = cls.split(":");
      const utility = parts[parts.length - 1];
      if (parts.length !== 1) continue;

      const match = utility.match(/^bg-(primary|secondary|destructive)(?:\/(\d+))?$/);
      if (!match) continue;

      const opacity = match[2] ? parseInt(match[2], 10) : 100;
      if (opacity <= 30) continue;

      inferred = SOLID_BG_TO_VARIANT[match[1]];
    }
  }

  return inferred;
}

function stripSolidColorOverrides(classString: string): { value: string; removed: string[] } {
  const classes = classString.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];

  for (const cls of classes) {
    const parts = cls.split(":");
    const utility = parts[parts.length - 1];
    const isBaseState = parts.length === 1;
    const isSolidColorOverride = REMOVABLE_SOLID_COLOR_CLASSES.some((pattern) => pattern.test(utility));

    if (isBaseState && isSolidColorOverride) {
      removed.push(cls);
      continue;
    }

    kept.push(cls);
  }

  return { value: kept.join(" "), removed };
}

function upsertVariantAttribute(openingSource: string, variant: SolidButtonVariant): string {
  const variantPattern = /\svariant=(?:"[^"]*"|{["'`][^"'`]*["'`]})/;
  if (variantPattern.test(openingSource)) {
    return openingSource.replace(variantPattern, ` variant="${variant}"`);
  }

  return openingSource.replace(/^(<\s*Button\b)/, `$1 variant="${variant}"`);
}

export function normalizeButtons(
  code: string,
): { code: string; normalizations: ButtonNormalization[] } {
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return { code, normalizations: [] };
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const normalizations: ButtonNormalization[] = [];

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      if (getButtonName(path) !== "Button") return;

      const variantInfo = getVariantAttributeInfo(path);
      if (variantInfo.hasVariant && !variantInfo.isSimple) return;

      const classStringEdits = getClassStringEdits(path);
      if (classStringEdits.length === 0) return;

      const inferredVariant = inferSolidVariant(classStringEdits.map((edit) => edit.originalValue));
      if (!inferredVariant) return;

      const openStart = path.node.start;
      const openEnd = path.node.end;
      if (openStart == null || openEnd == null) return;

      let openingSource = code.slice(openStart, openEnd);
      const localReplacements: Array<{ start: number; end: number; text: string }> = [];
      const removedClasses: string[] = [];

      for (const edit of classStringEdits) {
        const stripped = stripSolidColorOverrides(edit.originalValue);
        removedClasses.push(...stripped.removed);
        if (stripped.value === edit.originalValue) continue;

        localReplacements.push({
          start: edit.start - openStart,
          end: edit.end - openStart,
          text: stripped.value,
        });
      }

      localReplacements.sort((a, b) => b.start - a.start);
      for (const replacement of localReplacements) {
        openingSource =
          openingSource.slice(0, replacement.start) +
          replacement.text +
          openingSource.slice(replacement.end);
      }

      const needsVariantUpdate = !variantInfo.hasVariant || variantInfo.currentValue !== inferredVariant;
      if (needsVariantUpdate) {
        openingSource = upsertVariantAttribute(openingSource, inferredVariant);
      }

      if (removedClasses.length === 0 && !needsVariantUpdate) return;

      replacements.push({
        start: openStart,
        end: openEnd,
        text: openingSource,
      });

      const uniqueRemovedClasses = [...new Set(removedClasses)];
      normalizations.push({
        variant: inferredVariant,
        removedClasses: uniqueRemovedClasses,
        updatedVariant: needsVariantUpdate,
        reason: `Normalized solid Button styling to variant="${inferredVariant}" and removed base-state semantic color overrides`,
      });
    },
  });

  if (replacements.length === 0) {
    return { code, normalizations };
  }

  replacements.sort((a, b) => b.start - a.start);
  let result = code;
  for (const replacement of replacements) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }

  return { code: result, normalizations };
}
