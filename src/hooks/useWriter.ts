"use client";

import { useCallback } from "react";
import {
  updateClassNameAtLocation,
  updateTextAtLocation,
  deleteNodeAtLocation,
  insertChildAtLocation,
  getPropsAtLocation,
  updatePropAtLocation,
  removePropAtLocation,
  type ASTWriteResult,
} from "@/lib/ast/writer";
import type { ParsedProp } from "@/lib/ast/writer";
import type { SourceLocation } from "@/lib/inspection/types";

// Re-export for consumers
export type { ParsedProp };

export interface UseWriterProps {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
}

export interface WriteResult {
  success: boolean;
  file?: string;
  error?: string;
}

export interface EditabilityResult {
  isEditable: boolean;
  file?: string;
  reason?: string;
}

export type ClassEditMode = "FULL_EDIT" | "LIMITED_EDIT" | "READ_ONLY";

export interface ClassEditCapability {
  mode: ClassEditMode;
  file?: string;
  reason?: string;
}

export interface TextEditabilityResult {
  isEditable: boolean;
  file?: string;
  reason?: string;
}

/** Result of getting component props */
export interface GetPropsWriteResult {
  success: boolean;
  props?: ParsedProp[];
  error?: string;
}

export interface UseWriterReturn {
  /** Update classes using AST (preferred) or regex fallback */
  updateElementClasses: (
    selector: string,
    originalClassName: string,
    newClassName: string,
    sourceLocation?: SourceLocation
  ) => WriteResult;
  getClassEditCapability: (
    className: string | null | undefined,
    sourceLocation?: SourceLocation
  ) => ClassEditCapability;
  checkEditability: (className: string, sourceLocation?: SourceLocation) => EditabilityResult;
  checkTextEditability: (textContent: string, className: string, sourceLocation?: SourceLocation) => TextEditabilityResult;
  /** Update text using AST (preferred) or regex fallback */
  updateElementText: (
    originalText: string,
    newText: string,
    className: string,
    sourceLocation?: SourceLocation
  ) => WriteResult;
  /** Delete a node using AST (requires source location) */
  deleteElement: (sourceLocation: SourceLocation) => WriteResult;
  /** Insert a child element using AST (requires source location) */
  insertChildElement: (
    sourceLocation: SourceLocation,
    childCode: string,
    position?: "first" | "last" | number
  ) => WriteResult;
  /** Get component props from AST (requires source location) */
  getComponentProps: (sourceLocation: SourceLocation) => GetPropsWriteResult;
  /** Update a component prop using AST (requires source location) */
  updateComponentProp: (
    sourceLocation: SourceLocation,
    propName: string,
    value: string | boolean
  ) => WriteResult;
  /** Remove a component prop using AST (requires source location) */
  removeComponentProp: (
    sourceLocation: SourceLocation,
    propName: string
  ) => WriteResult;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a className string into a Set of individual classes.
 */
function parseClasses(className: string): Set<string> {
  return new Set(className.trim().split(/\s+/).filter(Boolean));
}

/**
 * Normalize a className string for comparison by sorting classes alphabetically.
 */
function normalizeClassName(className: string): string {
  return className
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Check if two className strings have the same classes (regardless of order).
 */
function classNamesMatch(a: string, b: string): boolean {
  return normalizeClassName(a) === normalizeClassName(b);
}

/**
 * Get the diff between two className strings.
 * Returns classes that were removed and added.
 */
function getClassDiff(original: string, updated: string): {
  removed: string[];
  added: string[];
} {
  const originalClasses = parseClasses(original);
  const updatedClasses = parseClasses(updated);

  const removed: string[] = [];
  const added: string[] = [];

  for (const cls of originalClasses) {
    if (!updatedClasses.has(cls)) {
      removed.push(cls);
    }
  }

  for (const cls of updatedClasses) {
    if (!originalClasses.has(cls)) {
      added.push(cls);
    }
  }

  return { removed, added };
}

/**
 * Types of className patterns we can match.
 */
type ClassNamePatternType = "static" | "cn" | "clsx" | "twMerge";

interface ClassNamePattern {
  type: ClassNamePatternType;
  fullMatch: string;
  staticClasses: string;
  quoteChar: string;
  // For cn/clsx patterns, the individual string literals
  stringLiterals: Array<{ value: string; quoteChar: string; startIndex: number }>;
}

/**
 * Extract string literals from a cn()/clsx()/twMerge() call.
 * Handles: cn("class1 class2", condition && "class3", "class4")
 */
function extractStringLiterals(
  cnArgs: string
): Array<{ value: string; quoteChar: string; startIndex: number }> {
  const literals: Array<{ value: string; quoteChar: string; startIndex: number }> = [];

  // Match string literals (both single and double quoted)
  // We need to be careful to only match actual string literals, not parts of expressions
  const stringRegex = /(["'])([^"']*)\1/g;
  let match;

  while ((match = stringRegex.exec(cnArgs)) !== null) {
    // Check if this string is a direct argument or part of a conditional
    // Both are valid for our purposes - we want all static strings
    literals.push({
      value: match[2],
      quoteChar: match[1],
      startIndex: match.index,
    });
  }

  return literals;
}

/**
 * Find a className pattern in content that matches the target classes.
 * Handles static className="..." and dynamic className={cn(...)} patterns.
 */
function findClassNamePattern(
  content: string,
  targetClassName: string
): ClassNamePattern | null {
  const targetClasses = parseClasses(targetClassName);

  // 1. Try static className="..." or className='...'
  const staticRegex = /className=(["'])([^"']*)\1/g;
  let match;

  while ((match = staticRegex.exec(content)) !== null) {
    const quoteChar = match[1];
    const classValue = match[2];

    if (classNamesMatch(classValue, targetClassName)) {
      return {
        type: "static",
        fullMatch: match[0],
        staticClasses: classValue,
        quoteChar,
        stringLiterals: [{ value: classValue, quoteChar, startIndex: 0 }],
      };
    }
  }

  // 2. Try cn(), clsx(), or twMerge() patterns
  // Pattern: className={cn(...)} or className={clsx(...)} or className={twMerge(...)}
  const dynamicRegex = /className=\{(cn|clsx|twMerge)\(([^}]*)\)\}/g;

  while ((match = dynamicRegex.exec(content)) !== null) {
    const fnName = match[1] as ClassNamePatternType;
    const fnArgs = match[2];
    const stringLiterals = extractStringLiterals(fnArgs);

    if (stringLiterals.length === 0) continue;

    // Combine all static classes from string literals
    const staticClasses = stringLiterals.map((l) => l.value).join(" ");
    const staticClassSet = parseClasses(staticClasses);

    // Check if all static classes exist in the target
    // (The target might have additional dynamic classes that are currently active)
    let allStaticInTarget = true;
    for (const cls of staticClassSet) {
      if (!targetClasses.has(cls)) {
        allStaticInTarget = false;
        break;
      }
    }

    // Also check: target shouldn't have TOO many extra classes
    // (to avoid false positives). Allow up to 3 extra classes from conditionals.
    const extraClasses = targetClasses.size - staticClassSet.size;
    const reasonableMatch = extraClasses <= 3;

    if (allStaticInTarget && staticClassSet.size > 0 && reasonableMatch) {
      return {
        type: fnName,
        fullMatch: match[0],
        staticClasses,
        quoteChar: '"',
        stringLiterals,
      };
    }
  }

  return null;
}

/**
 * Replace a class within className patterns in the content.
 * Works for both static className and cn()/clsx()/twMerge() patterns.
 */
function replaceClassInContent(
  content: string,
  oldClass: string,
  newClass: string
): { newContent: string; replaced: boolean } {
  const escapedOld = escapeRegex(oldClass);
  let newContent = content;
  let replaced = false;

  // Strategy: Replace the class wherever it appears in a className context
  // Use word boundaries to avoid partial matches (e.g., "gap-4" shouldn't match "gap-40")

  // Replace in static className="..." or className='...'
  const staticPattern = new RegExp(
    `(className=["'][^"']*)\\b${escapedOld}\\b([^"']*["'])`,
    "g"
  );

  newContent = newContent.replace(staticPattern, (match, before, after) => {
    replaced = true;
    return `${before}${newClass}${after}`;
  });

  if (replaced) {
    return { newContent, replaced };
  }

  // Replace in cn()/clsx()/twMerge() string literals
  // More careful pattern to only replace within string literals inside these function calls
  const dynamicPattern = new RegExp(
    `(className=\\{(?:cn|clsx|twMerge)\\([^}]*["'][^"']*)\\b${escapedOld}\\b([^"']*["'][^}]*\\)\\})`,
    "g"
  );

  newContent = newContent.replace(dynamicPattern, (match, before, after) => {
    replaced = true;
    return `${before}${newClass}${after}`;
  });

  return { newContent, replaced };
}

/**
 * Add a class to a className pattern.
 * For static: appends to the class string.
 * For cn(): appends to the first string literal.
 */
function addClassToContent(
  content: string,
  newClass: string,
  existingClasses: string
): { newContent: string; added: boolean } {
  // Find a className pattern that contains the existing classes
  const pattern = findClassNamePattern(content, existingClasses);
  if (!pattern) {
    return { newContent: content, added: false };
  }

  let newContent = content;
  let added = false;

  if (pattern.type === "static") {
    // For static: append to the class string
    const oldAttr = pattern.fullMatch;
    const newClasses = pattern.staticClasses
      ? `${pattern.staticClasses} ${newClass}`
      : newClass;
    const newAttr = `className=${pattern.quoteChar}${newClasses}${pattern.quoteChar}`;
    newContent = content.replace(oldAttr, newAttr);
    added = newContent !== content;
  } else {
    // For cn()/clsx()/twMerge(): append to the first string literal
    if (pattern.stringLiterals.length > 0) {
      const firstLiteral = pattern.stringLiterals[0];
      const oldString = `${firstLiteral.quoteChar}${firstLiteral.value}${firstLiteral.quoteChar}`;
      const newValue = firstLiteral.value
        ? `${firstLiteral.value} ${newClass}`
        : newClass;
      const newString = `${firstLiteral.quoteChar}${newValue}${firstLiteral.quoteChar}`;

      // Replace within the full match to be safe
      const newFullMatch = pattern.fullMatch.replace(oldString, newString);
      newContent = content.replace(pattern.fullMatch, newFullMatch);
      added = newContent !== content;
    }
  }

  return { newContent, added };
}

/**
 * Remove a class from className patterns.
 */
function removeClassFromContent(
  content: string,
  classToRemove: string
): { newContent: string; removed: boolean } {
  const escaped = escapeRegex(classToRemove);
  let newContent = content;
  let removed = false;

  // Remove from className patterns (handles both static and dynamic)
  // Match the class with optional surrounding whitespace
  const patterns = [
    // Static className with class at start: className="class other" -> className="other"
    new RegExp(
      `(className=["'])${escaped}\\s+([^"']*["'])`,
      "g"
    ),
    // Static className with class at end: className="other class" -> className="other"
    new RegExp(
      `(className=["'][^"']*)\\s+${escaped}(["'])`,
      "g"
    ),
    // Static className with class in middle: className="a class b" -> className="a b"
    new RegExp(
      `(className=["'][^"']*)\\s+${escaped}\\s+([^"']*["'])`,
      "g"
    ),
    // Static className with only this class: className="class" -> className=""
    new RegExp(
      `(className=["'])${escaped}(["'])`,
      "g"
    ),
    // Same patterns for cn()/clsx()/twMerge() string literals
    new RegExp(
      `(className=\\{(?:cn|clsx|twMerge)\\([^}]*["'])${escaped}\\s+([^"']*["'][^}]*\\)\\})`,
      "g"
    ),
    new RegExp(
      `(className=\\{(?:cn|clsx|twMerge)\\([^}]*["'][^"']*)\\s+${escaped}(["'][^}]*\\)\\})`,
      "g"
    ),
    new RegExp(
      `(className=\\{(?:cn|clsx|twMerge)\\([^}]*["'])${escaped}(["'][^}]*\\)\\})`,
      "g"
    ),
  ];

  for (const pattern of patterns) {
    const result = newContent.replace(pattern, "$1$2");
    if (result !== newContent) {
      newContent = result;
      removed = true;
      break;
    }
  }

  // Clean up any double spaces that might have been created
  newContent = newContent.replace(/className="(\s+)/g, 'className="');
  newContent = newContent.replace(/(\s+)"/g, '"');
  newContent = newContent.replace(/className='(\s+)/g, "className='");
  newContent = newContent.replace(/(\s+)'/g, "'");
  newContent = newContent.replace(/\s{2,}/g, " ");

  return { newContent, removed };
}

/**
 * Hook to find and replace className values in VFS files.
 * Supports both static className="..." and dynamic className={cn(...)} patterns.
 *
 * When a sourceLocation is provided, uses precise AST-based editing.
 * Falls back to regex-based pattern matching when no source location is available.
 */
export function useWriter({ files, writeFile }: UseWriterProps): UseWriterReturn {
  // ============================================================================
  // AST-based Operations (when sourceLocation is available)
  // ============================================================================

  /**
   * Update classes using AST-based surgical editing.
   * Returns null if AST editing fails (caller should fallback to regex).
   */
  const updateClassesViaAST = useCallback(
    (sourceLocation: SourceLocation, newClassName: string): ASTWriteResult | WriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = updateClassNameAtLocation(content, sourceLocation, newClassName, {
        strategy: "safe",
      });

      if (result.success && result.newCode) {
        writeFile(filePath, result.newCode);
        console.log(`[useWriter:AST] Updated className at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`);
        return { success: true, file: filePath };
      }

      console.warn(`[useWriter:AST] Failed: ${result.error}`);
      return result;
    },
    [files, writeFile]
  );

  /**
   * Update text using AST-based surgical editing.
   * Returns null if AST editing fails (caller should fallback to regex).
   */
  const updateTextViaAST = useCallback(
    (sourceLocation: SourceLocation, newText: string): WriteResult | null => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = updateTextAtLocation(content, sourceLocation, newText);

      if (result.success && result.newCode) {
        writeFile(filePath, result.newCode);
        console.log(`[useWriter:AST] Updated text at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`);
        return { success: true, file: filePath };
      }

      // AST failed - return null to signal fallback
      console.warn(`[useWriter:AST] Failed: ${result.error}`);
      return null;
    },
    [files, writeFile]
  );

  /**
   * Delete a node using AST (requires source location).
   */
  const deleteElement = useCallback(
    (sourceLocation: SourceLocation): WriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = deleteNodeAtLocation(content, sourceLocation);

      if (result.success && result.newCode !== undefined) {
        writeFile(filePath, result.newCode);
        console.log(`[useWriter:AST] Deleted node at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`);
        return { success: true, file: filePath };
      }

      return { success: false, error: result.error || "Failed to delete element" };
    },
    [files, writeFile]
  );

  /**
   * Insert a child element using AST (requires source location).
   */
  const insertChildElement = useCallback(
    (
      sourceLocation: SourceLocation,
      childCode: string,
      position: "first" | "last" | number = "last"
    ): WriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = insertChildAtLocation(content, sourceLocation, childCode, position);

      if (result.success && result.newCode) {
        writeFile(filePath, result.newCode);
        console.log(`[useWriter:AST] Inserted child at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`);
        return { success: true, file: filePath };
      }

      return { success: false, error: result.error || "Failed to insert child" };
    },
    [files, writeFile]
  );

  // ============================================================================
  // Regex-based Operations (fallback when no sourceLocation)
  // ============================================================================

  /**
   * Search order for VFS files - prioritize main app file, then components.
   */
  const getSearchOrder = useCallback((): string[] => {
    const order: string[] = [];

    // Start with App.tsx
    if (files["/App.tsx"]) {
      order.push("/App.tsx");
    }

    // Then check component files
    const componentFiles = Object.keys(files)
      .filter(
        (path) =>
          path.startsWith("/components/") &&
          path.endsWith(".tsx") &&
          path !== "/App.tsx"
      )
      .sort();

    order.push(...componentFiles);

    // Add any other tsx files
    const otherFiles = Object.keys(files)
      .filter(
        (path) =>
          path.endsWith(".tsx") &&
          !order.includes(path) &&
          path !== "/index.tsx" // Skip entry point
      )
      .sort();

    order.push(...otherFiles);

    return order;
  }, [files]);

  const getClassEditCapability = useCallback(
    (
      className: string | null | undefined,
      sourceLocation?: SourceLocation
    ): ClassEditCapability => {
      // Source-backed elements are the safest path.
      if (sourceLocation) {
        const filePath = sourceLocation.fileName;
        const content = files[filePath];
        if (!content) {
          return {
            mode: "READ_ONLY",
            reason: `File not found: ${filePath}`,
          };
        }

        const probeValue = className && className.trim().length > 0
          ? className
          : "__novum_probe__";
        const probe = updateClassNameAtLocation(content, sourceLocation, probeValue, {
          strategy: "safe",
        });

        if (probe.success) {
          return {
            mode: "FULL_EDIT",
            file: filePath,
          };
        }

        if (probe.editMode === "LIMITED_EDIT") {
          return {
            mode: "LIMITED_EDIT",
            file: filePath,
            reason: probe.error || "Complex class expression is protected from destructive rewrites",
          };
        }

        return {
          mode: "READ_ONLY",
          reason: probe.error || "Source location is stale",
        };
      }

      // Without source location, fall back to regex discoverability.
      if (!className || className.trim() === "") {
        return {
          mode: "READ_ONLY",
          reason: "No source location available for this element",
        };
      }

      const searchOrder = getSearchOrder();
      for (const filePath of searchOrder) {
        const content = files[filePath];
        if (!content) continue;

        const pattern = findClassNamePattern(content, className);
        if (pattern) {
          return {
            mode: "FULL_EDIT",
            file: filePath,
          };
        }
      }

      return {
        mode: "READ_ONLY",
        reason: "Styles generated by component",
      };
    },
    [files, getSearchOrder]
  );

  /**
   * Check if a className can be found and edited in VFS files.
   * If sourceLocation is provided, checks that the file exists.
   * Otherwise, uses regex-based pattern matching.
   */
  const checkEditability = useCallback(
    (className: string, sourceLocation?: SourceLocation): EditabilityResult => {
      const capability = getClassEditCapability(className, sourceLocation);
      return {
        isEditable: capability.mode === "FULL_EDIT",
        file: capability.file,
        reason: capability.reason,
      };
    },
    [getClassEditCapability]
  );

  /**
   * Find and replace className values in VFS files.
   * Uses AST-based editing when sourceLocation is available, otherwise falls back to regex.
   */
  const updateElementClasses = useCallback(
    (
      selector: string,
      originalClassName: string,
      newClassName: string,
      sourceLocation?: SourceLocation
    ): WriteResult => {
      // Don't update if no change
      if (normalizeClassName(originalClassName) === normalizeClassName(newClassName)) {
        return { success: true, file: undefined };
      }

      // Try AST-based editing first if we have source location
      if (sourceLocation) {
        const astResult = updateClassesViaAST(sourceLocation, newClassName);
        if (astResult.success && "file" in astResult) {
          return astResult;
        }
        // Source-backed class edits must not fallback to regex. It's too risky for dynamic expressions.
        return {
          success: false,
          error: astResult.error || "Class expression is not safely editable",
        };
      }

      const { removed, added } = getClassDiff(originalClassName, newClassName);
      const searchOrder = getSearchOrder();

      // Strategy: Find the file with the matching pattern, then apply changes
      for (const filePath of searchOrder) {
        const content = files[filePath];
        if (!content) continue;

        const pattern = findClassNamePattern(content, originalClassName);
        if (!pattern) continue;

        let newContent = content;
        let modified = false;

        // Handle class replacements (one removed, one added = replace)
        if (removed.length === 1 && added.length === 1) {
          const result = replaceClassInContent(newContent, removed[0], added[0]);
          if (result.replaced) {
            newContent = result.newContent;
            modified = true;
          }
        } else {
          // Handle removals
          for (const cls of removed) {
            const result = removeClassFromContent(newContent, cls);
            if (result.removed) {
              newContent = result.newContent;
              modified = true;
            }
          }

          // Handle additions
          for (const cls of added) {
            // Use the current state of classes for finding the pattern
            const currentClasses = [...parseClasses(originalClassName)]
              .filter((c) => !removed.includes(c))
              .join(" ");

            const result = addClassToContent(
              newContent,
              cls,
              currentClasses || originalClassName
            );
            if (result.added) {
              newContent = result.newContent;
              modified = true;
            }
          }
        }

        if (modified) {
          writeFile(filePath, newContent);

          console.log(
            `[useWriter] Updated className in ${filePath}:`,
            `removed=[${removed.join(", ")}], added=[${added.join(", ")}]`
          );

          return {
            success: true,
            file: filePath,
          };
        }

        // If we found the pattern but couldn't modify it, still report the file
        // This handles edge cases
        return {
          success: false,
          error: `Found pattern in ${filePath} but couldn't apply changes. The class may be part of a conditional expression.`,
        };
      }

      return {
        success: false,
        error: "Element styles are generated dynamically (inside a component). Edit the component source directly.",
      };
    },
    [files, writeFile, getSearchOrder, updateClassesViaAST]
  );

  /**
   * Find text content in a file near a className match.
   */
  const findMatchingText = useCallback(
    (
      content: string,
      targetText: string,
      className: string
    ): { match: string; fullMatch: string } | null => {
      if (!targetText || !className) return null;

      const normalizedTarget = targetText.trim();
      if (!normalizedTarget) return null;

      const textPattern = new RegExp(
        `>\\s*(${escapeRegex(normalizedTarget)})\\s*<`,
        "g"
      );

      let match;
      while ((match = textPattern.exec(content)) !== null) {
        const startPos = Math.max(0, match.index - 200);
        const contextBefore = content.substring(startPos, match.index);

        if (className && contextBefore.includes("className=")) {
          // Check static className
          const classMatch = contextBefore.match(/className=["']([^"']*)["']/);
          if (classMatch && classNamesMatch(classMatch[1], className)) {
            return {
              match: match[1],
              fullMatch: match[0],
            };
          }

          // Check cn()/clsx()/twMerge() className
          const cnMatch = contextBefore.match(
            /className=\{(?:cn|clsx|twMerge)\(([^}]*)\)\}/
          );
          if (cnMatch) {
            const literals = extractStringLiterals(cnMatch[1]);
            const staticClasses = literals.map((l) => l.value).join(" ");
            const staticSet = parseClasses(staticClasses);
            const targetSet = parseClasses(className);

            let allStaticInTarget = true;
            for (const cls of staticSet) {
              if (!targetSet.has(cls)) {
                allStaticInTarget = false;
                break;
              }
            }

            if (allStaticInTarget && staticSet.size > 0) {
              return {
                match: match[1],
                fullMatch: match[0],
              };
            }
          }
        }
      }

      // Fallback: just look for the exact text anywhere
      const simpleMatch = content.match(
        new RegExp(`>\\s*(${escapeRegex(normalizedTarget)})\\s*<`)
      );
      if (simpleMatch) {
        return {
          match: simpleMatch[1],
          fullMatch: simpleMatch[0],
        };
      }

      return null;
    },
    []
  );

  /**
   * Check if text content can be found and edited in VFS files.
   * If sourceLocation is provided, checks that the file exists.
   */
  const checkTextEditability = useCallback(
    (textContent: string, className: string, sourceLocation?: SourceLocation): TextEditabilityResult => {
      if (!textContent || textContent.trim() === "") {
        return {
          isEditable: false,
          reason: "No text content",
        };
      }

      // If we have AST source location, we can always edit (assuming file exists)
      if (sourceLocation) {
        const filePath = sourceLocation.fileName;
        if (files[filePath]) {
          return {
            isEditable: true,
            file: filePath,
          };
        }
        return {
          isEditable: false,
          reason: `File not found: ${filePath}`,
        };
      }

      // Fallback: regex-based pattern matching
      const searchOrder = getSearchOrder();

      for (const filePath of searchOrder) {
        const content = files[filePath];
        if (!content) continue;

        const found = findMatchingText(content, textContent, className);
        if (found) {
          return {
            isEditable: true,
            file: filePath,
          };
        }
      }

      return {
        isEditable: false,
        reason: "Text is dynamically generated",
      };
    },
    [files, getSearchOrder, findMatchingText]
  );

  /**
   * Find and replace text content in VFS files.
   * Uses AST-based editing when sourceLocation is available, otherwise falls back to regex.
   */
  const updateElementText = useCallback(
    (originalText: string, newText: string, className: string, sourceLocation?: SourceLocation): WriteResult => {
      if (originalText.trim() === newText.trim()) {
        return { success: true, file: undefined };
      }

      // Try AST-based editing first if we have source location
      if (sourceLocation) {
        const astResult = updateTextViaAST(sourceLocation, newText);
        if (astResult) {
          return astResult;
        }
        // AST failed, fall through to regex
        console.log("[useWriter] AST failed for text, falling back to regex");
      }

      // Fallback: regex-based pattern matching
      const searchOrder = getSearchOrder();

      for (const filePath of searchOrder) {
        const content = files[filePath];
        if (!content) continue;

        const found = findMatchingText(content, originalText, className);
        if (found) {
          const oldPattern = `>${found.match}<`;
          const newPattern = `>${newText}<`;
          const newContent = content.replace(oldPattern, newPattern);

          if (newContent !== content) {
            writeFile(filePath, newContent);

            console.log(
              `[useWriter] Updated text in ${filePath}:`,
              `"${found.match}" -> "${newText}"`
            );

            return {
              success: true,
              file: filePath,
            };
          }
        }
      }

      return {
        success: false,
        error: "Could not find text in source files",
      };
    },
    [files, writeFile, getSearchOrder, findMatchingText, updateTextViaAST]
  );

  // ============================================================================
  // Component Props Operations
  // ============================================================================

  /**
   * Get component props from AST.
   * Passes VFS files to enable enum detection from TypeScript interfaces.
   */
  const getComponentProps = useCallback(
    (sourceLocation: SourceLocation): GetPropsWriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      // Pass VFS files to enable enum prop detection
      const result = getPropsAtLocation(content, sourceLocation, files);

      if (result.success && result.props) {
        return { success: true, props: result.props };
      }

      return { success: false, error: result.error || "Failed to get props" };
    },
    [files]
  );

  /**
   * Update a component prop using AST.
   */
  const updateComponentProp = useCallback(
    (
      sourceLocation: SourceLocation,
      propName: string,
      value: string | boolean
    ): WriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = updatePropAtLocation(content, sourceLocation, propName, value);

      if (result.success && result.newCode) {
        writeFile(filePath, result.newCode);
        console.log(
          `[useWriter] Updated prop "${propName}" at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`
        );
        return { success: true, file: filePath };
      }

      return { success: false, error: result.error || "Failed to update prop" };
    },
    [files, writeFile]
  );

  /**
   * Remove a component prop using AST.
   */
  const removeComponentProp = useCallback(
    (sourceLocation: SourceLocation, propName: string): WriteResult => {
      const filePath = sourceLocation.fileName;
      const content = files[filePath];

      if (!content) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const result = removePropAtLocation(content, sourceLocation, propName);

      if (result.success && result.newCode) {
        writeFile(filePath, result.newCode);
        console.log(
          `[useWriter] Removed prop "${propName}" at ${filePath}:${sourceLocation.line}:${sourceLocation.column}`
        );
        return { success: true, file: filePath };
      }

      return { success: false, error: result.error || "Failed to remove prop" };
    },
    [files, writeFile]
  );

  return {
    updateElementClasses,
    getClassEditCapability,
    checkEditability,
    checkTextEditability,
    updateElementText,
    deleteElement,
    insertChildElement,
    getComponentProps,
    updateComponentProp,
    removeComponentProp,
  };
}
