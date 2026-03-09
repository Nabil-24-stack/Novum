/**
 * Deterministic pre-validation pass.
 * Catches structural issues (syntax errors, missing imports, missing deps, unresolvable files)
 * BEFORE Sandpack compiles, without needing an AI call.
 *
 * Auto-fixes what it can (missing npm deps, missing React imports).
 * Returns unresolved errors as precise messages for the AI fix loop.
 */

import { parse } from "@babel/parser";

// Built-in modules and packages that don't need to be in package.json
const BUILTIN_MODULES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

// Common packages we auto-install during builds
const COMMON_PACKAGES: Record<string, string> = {
  "lucide-react": "^0.460.0",
  "recharts": "^2.12.0",
  "date-fns": "^3.6.0",
  "framer-motion": "^11.0.0",
  "@radix-ui/react-icons": "^1.3.0",
};

interface ImportInfo {
  filePath: string;
  line: number;
  importPath: string;
  namedImports: string[];
  isDefault: boolean;
  raw: string;
}

interface PreValidationResult {
  autoFixed: string[];
  unresolvedErrors: string[];
}

/**
 * Parse import statements from source code.
 * Returns structured info for each import.
 */
function parseImports(code: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = code.split("\n");

  // Match: import { X, Y } from "path"
  // Match: import X from "path"
  // Match: import * as X from "path"
  // Match: import "path" (side-effect)
  const importRegex = /^import\s+(?:(?:\{([^}]*)\})|(?:\*\s+as\s+\w+)|(?:(\w+)(?:\s*,\s*\{([^}]*)\})?))\s+from\s+["']([^"']+)["']/;
  const sideEffectImportRegex = /^import\s+["']([^"']+)["']/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("import")) continue;

    const match = line.match(importRegex);
    if (match) {
      const namedImportsStr = match[1] || match[3] || "";
      const defaultImport = match[2] || "";
      const importPath = match[4];

      const namedImports = namedImportsStr
        ? namedImportsStr
            .split(",")
            .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
            .filter(Boolean)
        : [];

      imports.push({
        filePath,
        line: i + 1,
        importPath,
        namedImports,
        isDefault: !!defaultImport,
        raw: line,
      });
      continue;
    }

    const sideMatch = line.match(sideEffectImportRegex);
    if (sideMatch) {
      imports.push({
        filePath,
        line: i + 1,
        importPath: sideMatch[1],
        namedImports: [],
        isDefault: false,
        raw: line,
      });
    }
  }

  return imports;
}

/**
 * Check if a local import path resolves to an existing VFS file.
 * Tries common extensions: .tsx, .ts, .jsx, .js, /index.tsx, /index.ts
 */
function resolveLocalImport(
  importPath: string,
  fromFile: string,
  allFiles: Record<string, string>
): string | null {
  // Normalize relative paths to absolute
  let resolved = importPath;
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const parts = [...fromDir.split("/"), ...importPath.split("/")];
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") {
        normalized.pop();
      } else {
        normalized.push(part);
      }
    }
    resolved = "/" + normalized.join("/");
  }

  // Try exact path first
  if (allFiles[resolved] !== undefined) return resolved;

  // Try with extensions
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  for (const ext of extensions) {
    if (allFiles[resolved + ext] !== undefined) return resolved + ext;
  }

  // Try as directory with index
  const indexExtensions = ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
  for (const ext of indexExtensions) {
    if (allFiles[resolved + ext] !== undefined) return resolved + ext;
  }

  return null;
}

/**
 * Check if an import is a local (VFS) import vs npm package.
 */
function isLocalImport(importPath: string): boolean {
  return (
    importPath.startsWith("/") ||
    importPath.startsWith("./") ||
    importPath.startsWith("../")
  );
}

/**
 * Extract the npm package name from an import path.
 * e.g., "recharts" → "recharts"
 *       "@radix-ui/react-icons" → "@radix-ui/react-icons"
 *       "lucide-react/dist/esm/icons" → "lucide-react"
 */
function getPackageName(importPath: string): string {
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.slice(0, 2).join("/");
  }
  return importPath.split("/")[0];
}

/**
 * Parse export names from source code using simple regex.
 * Not AST-based (for speed), so may miss complex cases,
 * but catches the common patterns.
 */
function parseExports(code: string): string[] {
  const exports: string[] = [];

  // export function X
  for (const match of code.matchAll(/export\s+function\s+(\w+)/g)) {
    exports.push(match[1]);
  }
  // export const X / export let X / export var X
  for (const match of code.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) {
    exports.push(match[1]);
  }
  // export class X
  for (const match of code.matchAll(/export\s+class\s+(\w+)/g)) {
    exports.push(match[1]);
  }
  // export type X / export interface X
  for (const match of code.matchAll(/export\s+(?:type|interface)\s+(\w+)/g)) {
    exports.push(match[1]);
  }
  // export { X, Y, Z }
  for (const match of code.matchAll(/export\s+\{([^}]+)\}/g)) {
    const names = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
    exports.push(...names.filter(Boolean));
  }
  // export default
  if (/export\s+default\s/.test(code)) {
    exports.push("default");
  }

  return [...new Set(exports)];
}

/**
 * Run deterministic pre-validation on files that were just written.
 * Returns auto-fixed issues and unresolved errors.
 */
export function preValidate(
  writtenFilePaths: string[],
  allFiles: Record<string, string>,
  writeFile: (path: string, content: string) => void
): PreValidationResult {
  const autoFixed: string[] = [];
  const unresolvedErrors: string[] = [];

  // --- Check 0: Syntax validation ---
  for (const filePath of writtenFilePaths) {
    const code = allFiles[filePath];
    if (!code) continue;
    const ext = filePath.split(".").pop() || "";
    if (!["tsx", "ts", "jsx", "js"].includes(ext)) continue;

    try {
      parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        sourceFilename: filePath,
      });
    } catch (err) {
      if (err instanceof SyntaxError) {
        const loc = (err as SyntaxError & { loc?: { line: number; column: number } }).loc;
        const lineInfo = loc ? ` (line ${loc.line}, col ${loc.column})` : "";
        unresolvedErrors.push(
          `Syntax error in ${filePath}${lineInfo}: ${err.message}`
        );
      }
    }
  }

  // Collect all imports from written files
  const allImports: ImportInfo[] = [];
  for (const filePath of writtenFilePaths) {
    const code = allFiles[filePath];
    if (!code) continue;
    const ext = filePath.split(".").pop() || "";
    if (!["tsx", "ts", "jsx", "js"].includes(ext)) continue;
    allImports.push(...parseImports(code, filePath));
  }

  // --- Check 1: Local import resolution ---
  for (const imp of allImports) {
    if (!isLocalImport(imp.importPath)) continue;
    const resolved = resolveLocalImport(imp.importPath, imp.filePath, allFiles);
    if (!resolved) {
      unresolvedErrors.push(
        `Missing file: "${imp.importPath}" imported by ${imp.filePath}:${imp.line} does not exist in VFS`
      );
    }
  }

  // --- Check 2: npm dependency check ---
  let packageJson: { dependencies?: Record<string, string> } | null = null;
  try {
    packageJson = JSON.parse(allFiles["/package.json"] || "{}");
  } catch {
    packageJson = { dependencies: {} };
  }
  const deps = packageJson?.dependencies || {};
  const missingDeps: Record<string, string> = {};

  for (const imp of allImports) {
    if (isLocalImport(imp.importPath)) continue;
    const pkgName = getPackageName(imp.importPath);
    if (BUILTIN_MODULES.has(pkgName) || BUILTIN_MODULES.has(imp.importPath)) continue;
    if (deps[pkgName]) continue; // Already in package.json

    // Auto-fix: add to package.json
    const version = COMMON_PACKAGES[pkgName] || "latest";
    missingDeps[pkgName] = version;
  }

  if (Object.keys(missingDeps).length > 0) {
    try {
      const pkg = JSON.parse(allFiles["/package.json"] || "{}");
      pkg.dependencies = { ...(pkg.dependencies || {}), ...missingDeps };
      const newPkgJson = JSON.stringify(pkg, null, 2);
      writeFile("/package.json", newPkgJson);
      allFiles["/package.json"] = newPkgJson;

      for (const [name, version] of Object.entries(missingDeps)) {
        autoFixed.push(`Added missing npm dependency: ${name}@${version}`);
      }
    } catch {
      for (const name of Object.keys(missingDeps)) {
        unresolvedErrors.push(
          `Missing npm dependency: "${name}" is imported but not in /package.json`
        );
      }
    }
  }

  // --- Check 3: Export validation ---
  for (const imp of allImports) {
    if (!isLocalImport(imp.importPath)) continue;
    if (imp.namedImports.length === 0 && !imp.isDefault) continue;

    const resolved = resolveLocalImport(imp.importPath, imp.filePath, allFiles);
    if (!resolved) continue; // Already reported as missing file

    const targetCode = allFiles[resolved];
    if (!targetCode) continue;

    const targetExports = parseExports(targetCode);

    for (const name of imp.namedImports) {
      if (!targetExports.includes(name)) {
        unresolvedErrors.push(
          `Export mismatch: "${name}" is imported by ${imp.filePath}:${imp.line} but not exported from ${resolved}. Available exports: [${targetExports.join(", ")}]`
        );
      }
    }

    if (imp.isDefault && !targetExports.includes("default")) {
      unresolvedErrors.push(
        `Default export missing: ${imp.filePath}:${imp.line} uses default import from ${resolved} but it only has named exports: [${targetExports.join(", ")}]`
      );
    }
  }

  // --- Check 4: flow.json consistency ---
  try {
    const flowJson = JSON.parse(allFiles["/flow.json"] || "{}");
    const pages = flowJson.pages || [];
    for (const page of pages) {
      if (!page.route || !page.name) continue;
      // Convert page name to component name (PascalCase)
      const componentName = page.name.replace(/\s+/g, "");
      const possiblePaths = [
        `/pages/${componentName}.tsx`,
        `/pages/${componentName}.ts`,
        `/pages/${componentName}.jsx`,
        `/pages/${componentName}.js`,
      ];
      const exists = possiblePaths.some((p) => allFiles[p] !== undefined);
      if (!exists && page.route !== "/" && page.route !== "/design-system") {
        unresolvedErrors.push(
          `flow.json references page "${page.name}" (route: ${page.route}) but no matching file found. Expected one of: ${possiblePaths.join(", ")}`
        );
      }
    }
  } catch {
    // flow.json parse failure — not critical
  }

  return { autoFixed, unresolvedErrors };
}

/**
 * Extract a simplified exports map for AI context.
 * Returns { filePath: ["ExportName1", "ExportName2", ...] } for key VFS files.
 */
export function buildExportsMap(allFiles: Record<string, string>): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const [path, code] of Object.entries(allFiles)) {
    const ext = path.split(".").pop() || "";
    if (!["tsx", "ts", "jsx", "js"].includes(ext)) continue;
    // Only include user files, not node_modules-like paths
    if (path.includes("node_modules")) continue;

    const exports = parseExports(code);
    if (exports.length > 0) {
      map[path] = exports;
    }
  }

  return map;
}
