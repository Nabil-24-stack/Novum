/**
 * Design System Gatekeeper
 *
 * Deterministic transpiler that intercepts AI-generated code blocks before
 * they hit the VFS, enforcing the Novum Design System.
 *
 * Four rules applied in order:
 * 1. Component Promotion - <button> → <Button> (structural changes first)
 * 2. Color Enforcement - bg-blue-500 → bg-primary (className transforms)
 * 3. Spacing Normalization - p-[11px] → p-3 (className transforms)
 * 4. Layout Enforcement - gap-7 → gap-8, grid-cols-[5] → grid-cols-5 (className transforms)
 *
 * Fail-safe: if any phase throws, original code passes through unchanged.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import { promoteComponents, type ComponentPromotion } from "./component-promoter";
import { enforceColors, type ColorViolation } from "./color-mapper";
import { enforceSpacing, type SpacingViolation } from "./spacing-mapper";
import { enforceLayout, type LayoutViolation } from "./layout-mapper";
import { enforceTypography, type TypographyViolation } from "./typography-mapper";
import { defaultTokenState } from "@/lib/tokens/defaults";
import type { TokenState } from "@/lib/tokens/types";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

export interface GatekeeperResult {
  code: string;
  report: GatekeeperReport;
}

export interface GatekeeperReport {
  hadChanges: boolean;
  colorViolations: ColorViolation[];
  spacingViolations: SpacingViolation[];
  layoutViolations: LayoutViolation[];
  typographyViolations: TypographyViolation[];
  componentPromotions: ComponentPromotion[];
}

// ============================================================================
// Extension Guard
// ============================================================================

const GATEABLE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

function isGateableFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."));
  return GATEABLE_EXTENSIONS.has(ext);
}

// ============================================================================
// className AST Extraction + Surgical Replacement
// ============================================================================

interface ClassNameEdit {
  start: number;
  end: number;
  originalValue: string;
}

/**
 * Find all className string literals in JSX code.
 * Handles:
 * - className="..."  (StringLiteral)
 * - className={cn("...", "...")}  (string args in cn/clsx/twMerge calls)
 */
function findClassNameStrings(code: string): ClassNameEdit[] {
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch {
    return [];
  }

  const edits: ClassNameEdit[] = [];
  const CN_FUNCTIONS = new Set(["cn", "clsx", "twMerge"]);

  traverse(ast, {
    JSXAttribute(path: NodePath<t.JSXAttribute>) {
      const attrName = path.node.name;
      if (attrName.type !== "JSXIdentifier" || attrName.name !== "className") return;

      const value = path.node.value;
      if (!value) return;

      // Case 1: className="literal string"
      if (value.type === "StringLiteral") {
        if (value.start != null && value.end != null) {
          edits.push({
            // +1 / -1 to exclude the quotes themselves
            start: value.start + 1,
            end: value.end - 1,
            originalValue: value.value,
          });
        }
        return;
      }

      // Case 2: className={expression}
      if (value.type === "JSXExpressionContainer") {
        const expr = value.expression;

        // className={cn("...", "...")} or className={clsx("...")} or className={twMerge("...")}
        if (expr.type === "CallExpression") {
          const callee = expr.callee;
          let funcName: string | null = null;

          if (callee.type === "Identifier") {
            funcName = callee.name;
          }

          if (funcName && CN_FUNCTIONS.has(funcName)) {
            // Process each string argument
            for (const arg of expr.arguments) {
              if (arg.type === "StringLiteral" && arg.start != null && arg.end != null) {
                edits.push({
                  start: arg.start + 1,
                  end: arg.end - 1,
                  originalValue: arg.value,
                });
              }
            }
          }
        }

        // className={"literal string"}
        if (expr.type === "StringLiteral" && expr.start != null && expr.end != null) {
          edits.push({
            start: expr.start + 1,
            end: expr.end - 1,
            originalValue: expr.value,
          });
        }
      }
    },
  });

  return edits;
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Load tokens from VFS, falling back to defaults.
 */
function loadTokens(files: Record<string, string>): TokenState {
  const tokensJson = files["/tokens.json"];
  if (!tokensJson) return defaultTokenState;

  try {
    return JSON.parse(tokensJson) as TokenState;
  } catch {
    return defaultTokenState;
  }
}

/**
 * Run the full gatekeeper pipeline on a code string.
 *
 * @param code - The AI-generated code to process
 * @param files - Current VFS files (for reading tokens.json)
 * @param filePath - The target file path (for extension checking, component promotion)
 */
export function runGatekeeper(
  code: string,
  files: Record<string, string>,
  filePath: string,
): GatekeeperResult {
  const emptyReport: GatekeeperReport = {
    hadChanges: false,
    colorViolations: [],
    spacingViolations: [],
    layoutViolations: [],
    typographyViolations: [],
    componentPromotions: [],
  };

  // Extension guard
  if (!isGateableFile(filePath)) {
    return { code, report: emptyReport };
  }

  const tokens = loadTokens(files);
  let currentCode = code;
  const allColorViolations: ColorViolation[] = [];
  const allSpacingViolations: SpacingViolation[] = [];
  const allLayoutViolations: LayoutViolation[] = [];
  const allTypographyViolations: TypographyViolation[] = [];
  let allPromotions: ComponentPromotion[] = [];

  // ── Phase 1: Component Promotion ──
  try {
    const { code: promoted, promotions } = promoteComponents(currentCode, filePath);
    currentCode = promoted;
    allPromotions = promotions;
  } catch (err) {
    console.warn("[Gatekeeper] Component promotion failed, skipping:", err);
  }

  // ── Phase 2 & 3: Color Enforcement + Spacing Normalization ──
  // Single AST pass to find all className strings, then apply both mappers
  try {
    const classEdits = findClassNameStrings(currentCode);

    if (classEdits.length > 0) {
      // Process edits and collect replacements
      const replacements: Array<{ start: number; end: number; newValue: string }> = [];

      for (const edit of classEdits) {
        let classString = edit.originalValue;
        let changed = false;

        // Phase 2: Color enforcement
        const colorResult = enforceColors(classString, tokens);
        if (colorResult.violations.length > 0) {
          classString = colorResult.result;
          allColorViolations.push(...colorResult.violations);
          changed = true;
        }

        // Phase 3: Spacing normalization
        const spacingResult = enforceSpacing(classString);
        if (spacingResult.violations.length > 0) {
          classString = spacingResult.result;
          allSpacingViolations.push(...spacingResult.violations);
          changed = true;
        }

        // Phase 4: Layout enforcement
        const layoutResult = enforceLayout(classString);
        if (layoutResult.violations.length > 0) {
          classString = layoutResult.result;
          allLayoutViolations.push(...layoutResult.violations);
          changed = true;
        }

        // Phase 5: Typography enforcement
        const typographyResult = enforceTypography(classString);
        if (typographyResult.violations.length > 0) {
          classString = typographyResult.result;
          allTypographyViolations.push(...typographyResult.violations);
          changed = true;
        }

        if (changed) {
          replacements.push({
            start: edit.start,
            end: edit.end,
            newValue: classString,
          });
        }
      }

      // Apply replacements in reverse order (to preserve offsets)
      if (replacements.length > 0) {
        replacements.sort((a, b) => b.start - a.start);
        for (const rep of replacements) {
          currentCode = currentCode.slice(0, rep.start) + rep.newValue + currentCode.slice(rep.end);
        }
      }
    }
  } catch (err) {
    console.warn("[Gatekeeper] Color/spacing enforcement failed, skipping:", err);
  }

  const hadChanges =
    allColorViolations.length > 0 ||
    allSpacingViolations.length > 0 ||
    allLayoutViolations.length > 0 ||
    allTypographyViolations.length > 0 ||
    allPromotions.length > 0;

  return {
    code: currentCode,
    report: {
      hadChanges,
      colorViolations: allColorViolations,
      spacingViolations: allSpacingViolations,
      layoutViolations: allLayoutViolations,
      typographyViolations: allTypographyViolations,
      componentPromotions: allPromotions,
    },
  };
}
