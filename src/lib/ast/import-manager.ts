import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type * as t from "@babel/types";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

export interface ImportInfo {
  componentName: string;
  importPath: string;
  isNamedExport: boolean;
}

// ============================================================================
// Path Resolution Helpers
// ============================================================================

/**
 * Resolve an import path relative to a target file.
 *
 * If importPath starts with './', it's resolved relative to the VFS root.
 * We need to adjust it based on the target file's directory depth.
 *
 * Example:
 * - importPath: "./components/ui/button"
 * - targetFile: "/App.tsx" -> "./components/ui/button" (no change)
 * - targetFile: "/components/dashboard/Dashboard.tsx" -> "../../components/ui/button"
 */
function resolveImportPath(importPath: string, targetFile: string): string {
  // Only adjust relative paths starting with ./
  if (!importPath.startsWith("./")) {
    return importPath;
  }

  // Normalize target file path (remove leading /)
  const normalizedTarget = targetFile.startsWith("/") ? targetFile.slice(1) : targetFile;

  // Get the directory of the target file
  const targetDir = normalizedTarget.includes("/")
    ? normalizedTarget.substring(0, normalizedTarget.lastIndexOf("/"))
    : "";

  // If target is at root level (no subdirectory), no adjustment needed
  if (!targetDir) {
    return importPath;
  }

  // Count directory depth
  const depth = targetDir.split("/").length;

  // Build the relative path prefix (../ for each level)
  const prefix = "../".repeat(depth);

  // Replace ./ with the correct relative prefix
  return prefix + importPath.slice(2);
}

export interface AddImportResult {
  success: boolean;
  newCode?: string;
  error?: string;
  alreadyExists?: boolean;
}

// ============================================================================
// Check if Import Exists
// ============================================================================

/**
 * Check if a specific import already exists in the code.
 * Handles both named imports { Button } and default imports Button.
 */
export function hasImport(
  code: string,
  componentName: string,
  importPath: string
): boolean {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let found = false;

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;

        // Check if the import path matches
        if (source !== importPath) return;

        // Check specifiers for the component name
        for (const specifier of path.node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            // Named import: import { Button } from "..."
            const imported = specifier.imported;
            const name = imported.type === "Identifier"
              ? imported.name
              : imported.value;
            if (name === componentName) {
              found = true;
              path.stop();
              return;
            }
          } else if (specifier.type === "ImportDefaultSpecifier") {
            // Default import: import Button from "..."
            if (specifier.local.name === componentName) {
              found = true;
              path.stop();
              return;
            }
          }
        }
      },
    });

    return found;
  } catch (error) {
    console.error("Error checking import:", error);
    return false;
  }
}

/**
 * Check if an identifier is already imported from ANY path.
 * Used to prevent duplicate identifier declarations.
 */
export function hasIdentifierImport(
  code: string,
  componentName: string
): boolean {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let found = false;

    traverse(ast, {
      ImportDeclaration(path) {
        // Check all specifiers for the component name (regardless of path)
        for (const specifier of path.node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            const imported = specifier.imported;
            const name = imported.type === "Identifier"
              ? imported.name
              : imported.value;
            if (name === componentName) {
              found = true;
              path.stop();
              return;
            }
          } else if (specifier.type === "ImportDefaultSpecifier") {
            if (specifier.local.name === componentName) {
              found = true;
              path.stop();
              return;
            }
          }
        }
      },
    });

    return found;
  } catch (error) {
    console.error("Error checking identifier import:", error);
    return false;
  }
}

/**
 * Check if an import path already exists (regardless of which components are imported).
 * Returns the import declaration node if found.
 */
function findExistingImportDeclaration(
  ast: t.File,
  importPath: string
): { node: t.ImportDeclaration; start: number; end: number } | null {
  let result: { node: t.ImportDeclaration; start: number; end: number } | null = null;

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === importPath) {
        const start = path.node.start;
        const end = path.node.end;
        if (start != null && end != null) {
          result = { node: path.node, start, end };
          path.stop();
        }
      }
    },
  });

  return result;
}

/**
 * Find the position after the last import declaration for inserting new imports.
 */
function findLastImportPosition(ast: t.File): number {
  let lastImportEnd = 0;

  traverse(ast, {
    ImportDeclaration(path) {
      const end = path.node.end;
      if (end != null && end > lastImportEnd) {
        lastImportEnd = end;
      }
    },
  });

  return lastImportEnd;
}

// ============================================================================
// Add Import If Missing
// ============================================================================

/**
 * Add an import if it doesn't already exist.
 * Uses surgical string replacement to preserve formatting.
 *
 * If the import path already exists, adds the component to existing import.
 * Otherwise, creates a new import declaration after the last import.
 *
 * @param targetFile - Optional target file path for resolving relative imports
 */
export function addImportIfMissing(
  code: string,
  componentName: string,
  importPath: string,
  isNamedExport: boolean = true,
  targetFile?: string
): AddImportResult {
  try {
    // Resolve import path relative to target file
    const resolvedPath = targetFile ? resolveImportPath(importPath, targetFile) : importPath;

    // First check if this exact import already exists
    if (hasImport(code, componentName, resolvedPath)) {
      return { success: true, newCode: code, alreadyExists: true };
    }

    // Check if identifier is imported from a different path (prevents duplicate declarations)
    if (hasIdentifierImport(code, componentName)) {
      return { success: true, newCode: code, alreadyExists: true };
    }

    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      ranges: true,
    });

    // Check if there's an existing import from this path
    const existingImport = findExistingImportDeclaration(ast, resolvedPath);

    if (existingImport && isNamedExport) {
      // Add to existing import declaration
      // Find the position to insert the new specifier
      const specifiers = existingImport.node.specifiers;
      const namedSpecifiers = specifiers.filter(
        (s): s is t.ImportSpecifier => s.type === "ImportSpecifier"
      );

      if (namedSpecifiers.length > 0) {
        // Insert after the last named specifier
        const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
        const insertPos = lastSpecifier.end;

        if (insertPos != null) {
          const newCode =
            code.slice(0, insertPos) +
            `, ${componentName}` +
            code.slice(insertPos);

          return { success: true, newCode };
        }
      } else {
        // No named specifiers yet, need to add one
        // This is rare (usually there's at least one named import)
        // Fall through to create new import
      }
    }

    // Create a new import declaration
    const lastImportPos = findLastImportPosition(ast);

    let importStatement: string;
    if (isNamedExport) {
      importStatement = `import { ${componentName} } from "${resolvedPath}";`;
    } else {
      importStatement = `import ${componentName} from "${resolvedPath}";`;
    }

    let newCode: string;
    if (lastImportPos > 0) {
      // Insert after last import
      newCode =
        code.slice(0, lastImportPos) +
        "\n" + importStatement +
        code.slice(lastImportPos);
    } else {
      // No imports exist, add at the beginning
      newCode = importStatement + "\n" + code;
    }

    return { success: true, newCode };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add import: ${String(error)}`,
    };
  }
}

/**
 * Add multiple imports at once.
 * Optimizes by batching imports from the same path.
 *
 * @param targetFile - Optional target file path for resolving relative imports
 */
export function addImportsIfMissing(
  code: string,
  imports: ImportInfo[],
  targetFile?: string
): AddImportResult {
  let currentCode = code;

  for (const imp of imports) {
    const result = addImportIfMissing(
      currentCode,
      imp.componentName,
      imp.importPath,
      imp.isNamedExport,
      targetFile
    );

    if (!result.success) {
      return result;
    }

    currentCode = result.newCode!;
  }

  return { success: true, newCode: currentCode };
}
