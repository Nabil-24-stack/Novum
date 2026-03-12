/**
 * Component Normalizer
 *
 * Enforces design-system-owned color styling for components whose visual
 * appearance should come from variants or built-in state classes rather than
 * AI-authored semantic color overrides in className.
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
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type TabsComponentName = "TabsList" | "TabsTrigger";

const SOLID_BG_TO_BUTTON_VARIANT: Record<string, SolidButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  destructive: "destructive",
};

const SOLID_BG_TO_BADGE_VARIANT: Record<string, Exclude<BadgeVariant, "outline">> = {
  primary: "default",
  secondary: "secondary",
  muted: "secondary",
  destructive: "destructive",
};

const SEMANTIC_BG_PATTERN = /^(background|card|popover|primary|secondary|muted|accent|destructive)$/;
const SEMANTIC_TEXT_PATTERN = /^(foreground|primary-foreground|secondary-foreground|muted-foreground|accent-foreground|destructive-foreground|card-foreground|popover-foreground)$/;

const BUTTON_REMOVABLE_COLOR_CLASSES = [
  /^bg-(primary|secondary|destructive)(?:\/\d+)?$/,
  /^text-(primary|secondary|destructive)-foreground(?:\/\d+)?$/,
];

interface ClassStringEdit {
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

export interface BadgeNormalization {
  variant?: BadgeVariant;
  removedClasses: string[];
  updatedVariant: boolean;
  reason: string;
}

export interface TabsNormalization {
  componentName: TabsComponentName;
  removedClasses: string[];
  reason: string;
}

function getComponentName(path: NodePath<t.JSXOpeningElement>): string | null {
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

function getClassStringEdits(path: NodePath<t.JSXOpeningElement>): ClassStringEdit[] {
  const edits: ClassStringEdit[] = [];

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

function inferSolidVariant<T extends string>(
  classStrings: string[],
  variantMap: Record<string, T>,
): T | null {
  let inferred: T | null = null;

  for (const classString of classStrings) {
    const classes = classString.trim().split(/\s+/).filter(Boolean);

    for (const cls of classes) {
      const parts = cls.split(":");
      const utility = parts[parts.length - 1];
      if (parts.length !== 1) continue;

      const match = utility.match(/^bg-(primary|secondary|muted|destructive)(?:\/(\d+))?$/);
      if (!match) continue;

      const opacity = match[2] ? parseInt(match[2], 10) : 100;
      if (opacity <= 30) continue;

      const variant = variantMap[match[1]];
      if (variant) {
        inferred = variant;
      }
    }
  }

  return inferred;
}

function isSemanticBgUtility(utility: string): boolean {
  const match = utility.match(/^bg-(.+?)(?:\/\d+)?$/);
  return !!match && SEMANTIC_BG_PATTERN.test(match[1]);
}

function isSemanticTextUtility(utility: string): boolean {
  const match = utility.match(/^text-(.+?)(?:\/\d+)?$/);
  return !!match && SEMANTIC_TEXT_PATTERN.test(match[1]);
}

function stripClasses(
  classString: string,
  predicate: (cls: string, utility: string, variants: string[]) => boolean,
): { value: string; removed: string[] } {
  const classes = classString.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];

  for (const cls of classes) {
    const parts = cls.split(":");
    const utility = parts[parts.length - 1];
    const variants = parts.slice(0, -1);

    if (predicate(cls, utility, variants)) {
      removed.push(cls);
      continue;
    }

    kept.push(cls);
  }

  return { value: kept.join(" "), removed };
}

function stripButtonColorOverrides(classString: string): { value: string; removed: string[] } {
  return stripClasses(classString, (_cls, utility, variants) => {
    if (variants.length > 0) return false;
    return BUTTON_REMOVABLE_COLOR_CLASSES.some((pattern) => pattern.test(utility));
  });
}

function stripBadgeColorOverrides(classString: string): { value: string; removed: string[] } {
  return stripClasses(classString, (_cls, utility) => {
    return isSemanticBgUtility(utility) || isSemanticTextUtility(utility);
  });
}

function stripTabsColorOverrides(classString: string): { value: string; removed: string[] } {
  return stripClasses(classString, (_cls, utility) => {
    return isSemanticBgUtility(utility) || isSemanticTextUtility(utility);
  });
}

function upsertVariantAttribute(
  openingSource: string,
  componentName: "Button" | "Badge",
  variant: string,
): string {
  const variantPattern = /\svariant=(?:"[^"]*"|{["'`][^"'`]*["'`]})/;
  if (variantPattern.test(openingSource)) {
    return openingSource.replace(variantPattern, ` variant="${variant}"`);
  }

  return openingSource.replace(new RegExp(`^(<\\s*${componentName}\\b)`), `$1 variant="${variant}"`);
}

function applyClassStringReplacements(
  openingSource: string,
  openStart: number,
  edits: Array<{ edit: ClassStringEdit; value: string }>,
): string {
  const replacements = edits
    .filter(({ edit, value }) => value !== edit.originalValue)
    .map(({ edit, value }) => ({
      start: edit.start - openStart,
      end: edit.end - openStart,
      text: value,
    }))
    .sort((a, b) => b.start - a.start);

  let result = openingSource;
  for (const replacement of replacements) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }

  return result;
}

export function normalizeComponents(
  code: string,
): {
  code: string;
  buttonNormalizations: ButtonNormalization[];
  badgeNormalizations: BadgeNormalization[];
  tabsNormalizations: TabsNormalization[];
} {
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return {
      code,
      buttonNormalizations: [],
      badgeNormalizations: [],
      tabsNormalizations: [],
    };
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const buttonNormalizations: ButtonNormalization[] = [];
  const badgeNormalizations: BadgeNormalization[] = [];
  const tabsNormalizations: TabsNormalization[] = [];

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const componentName = getComponentName(path);
      if (!componentName) return;

      if (componentName === "Button") {
        const variantInfo = getVariantAttributeInfo(path);
        if (variantInfo.hasVariant && !variantInfo.isSimple) return;

        const classStringEdits = getClassStringEdits(path);
        if (classStringEdits.length === 0) return;

        const inferredVariant = inferSolidVariant(classStringEdits.map((edit) => edit.originalValue), SOLID_BG_TO_BUTTON_VARIANT);
        if (!inferredVariant) return;

        const openStart = path.node.start;
        const openEnd = path.node.end;
        if (openStart == null || openEnd == null) return;

        let openingSource = code.slice(openStart, openEnd);
        const strippedEdits = classStringEdits.map((edit) => ({
          edit,
          ...stripButtonColorOverrides(edit.originalValue),
        }));
        openingSource = applyClassStringReplacements(openingSource, openStart, strippedEdits);

        const removedClasses = strippedEdits.flatMap((entry) => entry.removed);
        const needsVariantUpdate = !variantInfo.hasVariant || variantInfo.currentValue !== inferredVariant;
        if (needsVariantUpdate) {
          openingSource = upsertVariantAttribute(openingSource, "Button", inferredVariant);
        }

        if (removedClasses.length === 0 && !needsVariantUpdate) return;

        replacements.push({
          start: openStart,
          end: openEnd,
          text: openingSource,
        });

        buttonNormalizations.push({
          variant: inferredVariant,
          removedClasses: [...new Set(removedClasses)],
          updatedVariant: needsVariantUpdate,
          reason: `Normalized solid Button styling to variant="${inferredVariant}" and removed base-state semantic color overrides`,
        });
        return;
      }

      if (componentName === "Badge") {
        const variantInfo = getVariantAttributeInfo(path);
        const classStringEdits = getClassStringEdits(path);
        if (classStringEdits.length === 0) return;

        const openStart = path.node.start;
        const openEnd = path.node.end;
        if (openStart == null || openEnd == null) return;

        let openingSource = code.slice(openStart, openEnd);
        const strippedEdits = classStringEdits.map((edit) => ({
          edit,
          ...stripBadgeColorOverrides(edit.originalValue),
        }));
        openingSource = applyClassStringReplacements(openingSource, openStart, strippedEdits);

        const removedClasses = strippedEdits.flatMap((entry) => entry.removed);
        const inferredVariant = inferSolidVariant(classStringEdits.map((edit) => edit.originalValue), SOLID_BG_TO_BADGE_VARIANT);

        let needsVariantUpdate = false;
        let finalVariant: BadgeVariant | undefined = variantInfo.currentValue as BadgeVariant | undefined;

        if (variantInfo.isSimple && variantInfo.currentValue === "outline") {
          finalVariant = "outline";
        } else if (inferredVariant && variantInfo.isSimple) {
          finalVariant = inferredVariant;
          needsVariantUpdate = !variantInfo.hasVariant || variantInfo.currentValue !== inferredVariant;
          if (needsVariantUpdate) {
            openingSource = upsertVariantAttribute(openingSource, "Badge", inferredVariant);
          }
        }

        if (removedClasses.length === 0 && !needsVariantUpdate) return;

        replacements.push({
          start: openStart,
          end: openEnd,
          text: openingSource,
        });

        badgeNormalizations.push({
          variant: finalVariant,
          removedClasses: [...new Set(removedClasses)],
          updatedVariant: needsVariantUpdate,
          reason: finalVariant === "outline"
            ? `Removed semantic Badge color overrides to preserve outline styling`
            : `Normalized Badge styling${finalVariant ? ` to variant="${finalVariant}"` : ""} and removed semantic color overrides`,
        });
        return;
      }

      if (componentName === "TabsList" || componentName === "TabsTrigger") {
        const classStringEdits = getClassStringEdits(path);
        if (classStringEdits.length === 0) return;

        const openStart = path.node.start;
        const openEnd = path.node.end;
        if (openStart == null || openEnd == null) return;

        let openingSource = code.slice(openStart, openEnd);
        const strippedEdits = classStringEdits.map((edit) => ({
          edit,
          ...stripTabsColorOverrides(edit.originalValue),
        }));
        openingSource = applyClassStringReplacements(openingSource, openStart, strippedEdits);

        const removedClasses = [...new Set(strippedEdits.flatMap((entry) => entry.removed))];
        if (removedClasses.length === 0) return;

        replacements.push({
          start: openStart,
          end: openEnd,
          text: openingSource,
        });

        tabsNormalizations.push({
          componentName,
          removedClasses,
          reason: `Removed semantic color overrides from ${componentName} so built-in Tabs styling remains authoritative`,
        });
      }
    },
  });

  if (replacements.length === 0) {
    return {
      code,
      buttonNormalizations,
      badgeNormalizations,
      tabsNormalizations,
    };
  }

  replacements.sort((a, b) => b.start - a.start);
  let result = code;
  for (const replacement of replacements) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }

  return {
    code: result,
    buttonNormalizations,
    badgeNormalizations,
    tabsNormalizations,
  };
}
