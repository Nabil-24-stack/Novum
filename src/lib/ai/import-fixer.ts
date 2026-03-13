/**
 * Import Fixer - Phase -1 of the Design System Gatekeeper
 *
 * Fixes common AI-hallucinated import errors before other gatekeeper phases run.
 * Uses regex-based string manipulation for consistency with the existing pipeline.
 *
 * Steps (in order):
 * A. Fix known path aliases (use-toast → toast, @/ → ./)
 * B. Preserve canonical Select API usage
 * C. Remove non-existent export specifiers (DialogFooter, DialogClose, etc.)
 * D. Add missing imports for known components used in JSX
 *
 * Fail-safe: wrapped in try/catch — original code passes through on any error.
 */

import { addImportIfMissing } from "../ast/import-manager.ts";

// ============================================================================
// Types
// ============================================================================

export interface ImportFix {
  type: "path-alias" | "select-api" | "removed-specifier" | "added-import";
  original: string;
  replacement: string;
  reason: string;
}

// ============================================================================
// Component Registry — canonical export → import path map
// ============================================================================

const COMPONENT_REGISTRY: Record<string, string> = {
  // Form Controls
  Button: "./components/ui/button",
  Input: "./components/ui/input",
  Textarea: "./components/ui/textarea",
  Checkbox: "./components/ui/checkbox",
  Switch: "./components/ui/switch",
  RadioGroup: "./components/ui/radio-group",
  RadioGroupItem: "./components/ui/radio-group",
  Toggle: "./components/ui/toggle",
  Slider: "./components/ui/slider",
  Select: "./components/ui/select",
  SelectTrigger: "./components/ui/select",
  SelectValue: "./components/ui/select",
  SelectContent: "./components/ui/select",
  SelectItem: "./components/ui/select",
  SelectGroup: "./components/ui/select",
  SelectLabel: "./components/ui/select",
  SelectSeparator: "./components/ui/select",
  SelectScrollUpButton: "./components/ui/select",
  SelectScrollDownButton: "./components/ui/select",
  Label: "./components/ui/label",
  DatePicker: "./components/ui/date-picker",

  // Layout & Display
  Card: "./components/ui/card",
  CardHeader: "./components/ui/card",
  CardTitle: "./components/ui/card",
  CardDescription: "./components/ui/card",
  CardContent: "./components/ui/card",
  CardFooter: "./components/ui/card",
  Table: "./components/ui/table",
  TableHeader: "./components/ui/table",
  TableBody: "./components/ui/table",
  TableRow: "./components/ui/table",
  TableHead: "./components/ui/table",
  TableCell: "./components/ui/table",
  Separator: "./components/ui/separator",
  AspectRatio: "./components/ui/aspect-ratio",

  // Feedback
  Alert: "./components/ui/alert",
  AlertTitle: "./components/ui/alert",
  AlertDescription: "./components/ui/alert",
  Progress: "./components/ui/progress",
  Skeleton: "./components/ui/skeleton",
  ToastProvider: "./components/ui/toast",
  Toaster: "./components/ui/toast",
  ToastComponent: "./components/ui/toast",
  ToastTitle: "./components/ui/toast",
  ToastDescription: "./components/ui/toast",
  Badge: "./components/ui/badge",

  // Navigation
  Tabs: "./components/ui/tabs",
  TabsList: "./components/ui/tabs",
  TabsTrigger: "./components/ui/tabs",
  TabsContent: "./components/ui/tabs",
  Accordion: "./components/ui/accordion",
  AccordionItem: "./components/ui/accordion",
  AccordionTrigger: "./components/ui/accordion",
  AccordionContent: "./components/ui/accordion",
  Breadcrumb: "./components/ui/breadcrumb",
  BreadcrumbItem: "./components/ui/breadcrumb",
  BreadcrumbLink: "./components/ui/breadcrumb",
  BreadcrumbSeparator: "./components/ui/breadcrumb",
  BreadcrumbPage: "./components/ui/breadcrumb",

  // Overlays
  Dialog: "./components/ui/dialog",
  DialogTrigger: "./components/ui/dialog",
  DialogContent: "./components/ui/dialog",
  DialogHeader: "./components/ui/dialog",
  DialogTitle: "./components/ui/dialog",
  DialogDescription: "./components/ui/dialog",
  Tooltip: "./components/ui/tooltip",
  TooltipProvider: "./components/ui/tooltip",
  TooltipTrigger: "./components/ui/tooltip",
  TooltipContent: "./components/ui/tooltip",
  Popover: "./components/ui/popover",
  PopoverTrigger: "./components/ui/popover",
  PopoverContent: "./components/ui/popover",

  // Display
  Avatar: "./components/ui/avatar",
  AvatarImage: "./components/ui/avatar",
  AvatarFallback: "./components/ui/avatar",

  // Hooks & Utilities
  useToast: "./components/ui/toast",
  useRouter: "./lib/router",
  cn: "./lib/utils",
};

// Non-existent specifiers that the AI commonly hallucinates
const NON_EXISTENT_SPECIFIERS = new Set([
  "DialogFooter",
  "DialogClose",
  "SelectOption",
]);

// ============================================================================
// Step 0: Ensure React Import (for .tsx/.jsx files)
// ============================================================================

function ensureReactImport(code: string, filePath: string): { code: string; fixes: ImportFix[] } {
  const fixes: ImportFix[] = [];

  // Only apply to TSX/JSX files
  if (!/\.[jt]sx$/.test(filePath)) {
    return { code, fixes };
  }

  // Check for existing React imports
  const starImportRegex = /import\s+\*\s+as\s+React\s+from\s+["']react["']/;
  const defaultImportRegex = /import\s+React\b(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["']/;

  if (starImportRegex.test(code)) {
    // Already has the correct import
    return { code, fixes };
  }

  if (defaultImportRegex.test(code)) {
    // Has `import React from "react"` — convert to star import
    const result = code.replace(
      /import\s+React\s+from\s+["']react["']\s*;?/,
      'import * as React from "react";',
    );
    fixes.push({
      type: "path-alias",
      original: 'import React from "react"',
      replacement: 'import * as React from "react"',
      reason: "Star import required for Sandpack JSX compilation",
    });
    return { code: result, fixes };
  }

  // No React import at all — prepend it
  const result = 'import * as React from "react";\n' + code;
  fixes.push({
    type: "added-import",
    original: "(missing)",
    replacement: 'import * as React from "react"',
    reason: "React import required for Sandpack JSX compilation",
  });
  return { code: result, fixes };
}

// ============================================================================
// Step 0b: Fix export default → Named Export
// ============================================================================

function fixExportDefault(code: string, filePath: string): { code: string; fixes: ImportFix[] } {
  const fixes: ImportFix[] = [];
  let result = code;

  // Derive a component name from the file path as fallback
  const pathParts = filePath.replace(/\.[jt]sx?$/, "").split("/");
  const fallbackName = pathParts[pathParts.length - 1]
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[a-z]/, (c) => c.toUpperCase()) || "App";

  // Pattern 1: `export default function ComponentName(` → `export function ComponentName(`
  const namedFnRegex = /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/g;
  if (namedFnRegex.test(result)) {
    result = result.replace(
      /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)\s*\(/g,
      "export function $1(",
    );
    fixes.push({
      type: "removed-specifier",
      original: "export default function",
      replacement: "export function",
      reason: "export default causes Sandpack crashes — converted to named export",
    });
  }

  // Pattern 2: `export default function(` (anonymous) → `export function FallbackName(`
  const anonFnRegex = /export\s+default\s+function\s*\(/;
  if (anonFnRegex.test(result)) {
    result = result.replace(
      /export\s+default\s+function\s*\(/,
      `export function ${fallbackName}(`,
    );
    fixes.push({
      type: "removed-specifier",
      original: "export default function (anonymous)",
      replacement: `export function ${fallbackName}`,
      reason: "Anonymous default export converted to named export",
    });
  }

  // Pattern 3: `export default ComponentName;` or `export default ComponentName` (re-export at end of file)
  // Only match standalone `export default Identifier;` lines (not `export default function` which is handled above)
  const reExportRegex = /^export\s+default\s+([A-Z][A-Za-z0-9]*)\s*;?\s*$/gm;
  if (reExportRegex.test(result)) {
    result = result.replace(
      /^export\s+default\s+([A-Z][A-Za-z0-9]*)\s*;?\s*$/gm,
      "",
    );
    // Clean up extra blank lines
    result = result.replace(/\n{3,}/g, "\n\n");
    fixes.push({
      type: "removed-specifier",
      original: "export default ComponentName",
      replacement: "(removed — component already has named export or const)",
      reason: "Removed default re-export to prevent Sandpack crash",
    });
  }

  // Pattern 4: Fix default imports → named imports
  // `import Foo from "./path"` → `import { Foo } from "./path"`
  // But NOT `import * as Foo` or `import "path"` or `import React from "react"`
  const defaultImportRegex = /import\s+([A-Z][A-Za-z0-9]*)\s+from\s+(["'][^"']+["'])/g;
  let importMatch: RegExpExecArray | null;
  const importReplacements: Array<{ start: number; end: number; original: string; replacement: string; name: string }> = [];

  while ((importMatch = defaultImportRegex.exec(result)) !== null) {
    const fullMatch = importMatch[0];
    const name = importMatch[1];
    const path = importMatch[2];

    // Skip React imports (handled by ensureReactImport)
    if (name === "React") continue;

    importReplacements.push({
      start: importMatch.index,
      end: importMatch.index + fullMatch.length,
      original: fullMatch,
      replacement: `import { ${name} } from ${path}`,
      name,
    });
  }

  // Apply in reverse order
  for (let i = importReplacements.length - 1; i >= 0; i--) {
    const rep = importReplacements[i];
    result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
    fixes.push({
      type: "removed-specifier",
      original: rep.original,
      replacement: rep.replacement,
      reason: `Default import converted to named import (default imports crash Sandpack)`,
    });
  }

  return { code: result, fixes };
}

// ============================================================================
// Step A: Fix Known Path Aliases
// ============================================================================

/** Map of wrong path endings → correct path endings */
const PATH_FIXES: Array<[RegExp, string]> = [
  // use-toast → toast
  [/\/components\/ui\/use-toast(?:['"])/g, "/components/ui/toast"],
  [/\/components\/ui\/useToast(?:['"])/g, "/components/ui/toast"],
  // hooks/use-toast → components/ui/toast
  [/\/hooks\/use-toast(?:['"])/g, "/components/ui/toast"],
  [/\/hooks\/useToast(?:['"])/g, "/components/ui/toast"],
];

function fixPathAliases(code: string): { code: string; fixes: ImportFix[] } {
  const fixes: ImportFix[] = [];
  let result = code;

  // Fix @/ aliases → relative paths
  // Match import statements with @/ paths
  const atAliasRegex = /from\s+["']@\/(.*?)["']/g;
  let match: RegExpExecArray | null;
  const atAliasReplacements: Array<{ start: number; end: number; original: string; replacement: string }> = [];

  while ((match = atAliasRegex.exec(result)) !== null) {
    const fullMatch = match[0];
    const innerPath = match[1];
    const replacement = `from "./${innerPath}"`;
    atAliasReplacements.push({
      start: match.index,
      end: match.index + fullMatch.length,
      original: fullMatch,
      replacement,
    });
  }

  // Apply @ alias replacements in reverse order
  for (let i = atAliasReplacements.length - 1; i >= 0; i--) {
    const rep = atAliasReplacements[i];
    result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
    fixes.push({
      type: "path-alias",
      original: rep.original,
      replacement: rep.replacement,
      reason: "@/ alias not supported in Sandpack",
    });
  }

  // Fix known wrong paths
  for (const [pattern, correctEnding] of PATH_FIXES) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let pathMatch: RegExpExecArray | null;
    const pathReplacements: Array<{ start: number; end: number; original: string; replacement: string }> = [];

    while ((pathMatch = regex.exec(result)) !== null) {
      const fullMatch = pathMatch[0];
      // Keep the quote character at the end
      const quoteChar = fullMatch[fullMatch.length - 1];
      const replacement = correctEnding + quoteChar;
      // Find the start of the path portion (after the last / before the wrong part)
      const wrongPathStart = pathMatch.index;
      pathReplacements.push({
        start: wrongPathStart,
        end: wrongPathStart + fullMatch.length,
        original: fullMatch,
        replacement,
      });
    }

    for (let i = pathReplacements.length - 1; i >= 0; i--) {
      const rep = pathReplacements[i];
      result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
      fixes.push({
        type: "path-alias",
        original: rep.original,
        replacement: rep.replacement,
        reason: "Wrong import path corrected",
      });
    }
  }

  return { code: result, fixes };
}

// ============================================================================
// Step B: Preserve canonical Select API usage
// ============================================================================

function fixSelectApi(code: string): { code: string; fixes: ImportFix[] } {
  return { code, fixes: [] };
}

// ============================================================================
// Step C: Remove Non-Existent Export Specifiers
// ============================================================================

function removeNonExistentSpecifiers(code: string): { code: string; fixes: ImportFix[] } {
  const fixes: ImportFix[] = [];
  let result = code;

  // Match import { ... } from "..."; statements
  const importRegex = /import\s*\{([^}]*)\}\s*from\s*["']([^"']*)["'];?/g;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(result)) !== null) {
    const fullMatch = match[0];
    const specifiers = match[1];
    const path = match[2];

    const specs = specifiers
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const removed: string[] = [];
    const kept = specs.filter((spec) => {
      if (NON_EXISTENT_SPECIFIERS.has(spec)) {
        removed.push(spec);
        return false;
      }
      return true;
    });

    if (removed.length > 0) {
      let replacement: string;
      if (kept.length === 0) {
        // All specifiers removed — remove entire import line
        replacement = "";
      } else {
        replacement = `import { ${kept.join(", ")} } from "${path}";`;
      }

      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        replacement,
      });

      for (const spec of removed) {
        fixes.push({
          type: "removed-specifier",
          original: spec,
          replacement: kept.length > 0 ? `removed from import` : "entire import removed",
          reason: `${spec} doesn't exist in VFS component library`,
        });
      }
    }
  }

  // Apply in reverse order
  for (let i = replacements.length - 1; i >= 0; i--) {
    const rep = replacements[i];
    result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
  }

  // Clean up empty lines from removed imports
  result = result.replace(/\n{3,}/g, "\n\n");

  return { code: result, fixes };
}

// ============================================================================
// Step D: VFS Export Discovery + Add Missing Imports
// ============================================================================

/**
 * Scan VFS files for exported components/functions and return a map of
 * component name → import path. Skips `/components/ui/*` (covered by
 * COMPONENT_REGISTRY) and the current file being processed.
 */
function discoverVfsExports(
  files: Record<string, string>,
  currentFilePath: string,
): Record<string, string> {
  const discovered: Record<string, string> = {};
  const exportRegex = /export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;

  for (const [filePath, content] of Object.entries(files)) {
    // Skip non-component files
    if (!/\.[jt]sx?$/.test(filePath)) continue;
    // Skip the file being processed (no self-imports)
    if (filePath === currentFilePath) continue;
    // Skip built-in UI components (already in COMPONENT_REGISTRY)
    if (filePath.startsWith("/components/ui/")) continue;
    // Skip utility/config files
    if (filePath === "/index.tsx" || filePath === "/globals.css" || filePath === "/lib/utils.ts") continue;

    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) {
      const name = match[1];
      // Don't overwrite static registry entries
      if (COMPONENT_REGISTRY[name]) continue;
      // Convert absolute VFS path to relative import path (strip extension)
      const importPath = "." + filePath.replace(/\.[jt]sx?$/, "");
      discovered[name] = importPath;
    }
  }

  return discovered;
}

function addMissingImports(
  code: string,
  filePath: string,
  files?: Record<string, string>,
): { code: string; fixes: ImportFix[] } {
  const fixes: ImportFix[] = [];
  let result = code;

  // Find all PascalCase component usage in JSX: <ComponentName
  const jsxComponentRegex = /<([A-Z][A-Za-z0-9]*)\b/g;
  const usedComponents = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = jsxComponentRegex.exec(code)) !== null) {
    usedComponents.add(match[1]);
  }

  // Find hook calls: useToast(), useRouter()
  const hookRegex = /\b(useToast|useRouter)\s*\(/g;
  while ((match = hookRegex.exec(code)) !== null) {
    usedComponents.add(match[1]);
  }

  // Find cn() usage
  if (/\bcn\s*\(/.test(code)) {
    usedComponents.add("cn");
  }

  // Merge static registry with VFS-discovered exports (static wins on conflict)
  const mergedRegistry = files
    ? { ...discoverVfsExports(files, filePath), ...COMPONENT_REGISTRY }
    : COMPONENT_REGISTRY;

  // Check each used component against existing imports
  for (const componentName of usedComponents) {
    const importPath = mergedRegistry[componentName];
    if (!importPath) continue;

    // Quick regex check: is this already imported?
    // Look for the component name in any import statement
    const importCheckRegex = new RegExp(
      `import\\s*\\{[^}]*\\b${componentName}\\b[^}]*\\}\\s*from`,
    );
    if (importCheckRegex.test(result)) continue;

    // Also check for default import pattern (shouldn't happen but be safe)
    const defaultImportCheck = new RegExp(
      `import\\s+${componentName}\\s+from`,
    );
    if (defaultImportCheck.test(result)) continue;

    // Add the missing import using the AST-based import manager
    const addResult = addImportIfMissing(
      result,
      componentName,
      importPath,
      true,
      filePath,
    );

    if (addResult.success && addResult.newCode && !addResult.alreadyExists) {
      result = addResult.newCode;
      fixes.push({
        type: "added-import",
        original: componentName,
        replacement: `import { ${componentName} } from "${importPath}"`,
        reason: `${componentName} used in JSX but not imported`,
      });
    }
  }

  return { code: result, fixes };
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Fix common import errors in AI-generated code.
 *
 * @param code - The AI-generated code to process
 * @param filePath - The target file path (for relative import resolution)
 * @returns The fixed code and a list of applied fixes
 */
export function fixImports(
  code: string,
  filePath: string,
  files?: Record<string, string>,
): { code: string; fixes: ImportFix[] } {
  const allFixes: ImportFix[] = [];
  let currentCode = code;

  // Step 0: Ensure React import exists (for .tsx/.jsx files)
  try {
    const { code: reactFixed, fixes } = ensureReactImport(currentCode, filePath);
    currentCode = reactFixed;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] React import fixing failed, skipping:", err);
  }

  // Step 0b: Fix export default → named export
  try {
    const { code: defaultFixed, fixes } = fixExportDefault(currentCode, filePath);
    currentCode = defaultFixed;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] Export default fixing failed, skipping:", err);
  }

  // Step A: Fix known path aliases
  try {
    const { code: pathFixed, fixes } = fixPathAliases(currentCode);
    currentCode = pathFixed;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] Path alias fixing failed, skipping:", err);
  }

  // Step B: Preserve canonical Select API usage
  try {
    const { code: selectFixed, fixes } = fixSelectApi(currentCode);
    currentCode = selectFixed;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] Select API fixing failed, skipping:", err);
  }

  // Step C: Remove non-existent specifiers
  try {
    const { code: cleanedCode, fixes } = removeNonExistentSpecifiers(currentCode);
    currentCode = cleanedCode;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] Specifier removal failed, skipping:", err);
  }

  // Step D: Add missing imports
  try {
    const { code: importedCode, fixes } = addMissingImports(currentCode, filePath, files);
    currentCode = importedCode;
    allFixes.push(...fixes);
  } catch (err) {
    console.warn("[ImportFixer] Missing import addition failed, skipping:", err);
  }

  return { code: currentCode, fixes: allFixes };
}
