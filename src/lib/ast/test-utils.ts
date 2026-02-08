/**
 * Test utilities for the AST Writer.
 * Exposes window.novum.testEdit() for console-based testing.
 */

import type { SourceLocation, SelectedElement } from "@/lib/inspection/types";
import type { WriteResult } from "@/hooks/useWriter";
import type { PropSchema } from "./prop-schema";
import { scanComponentPropSchema } from "./prop-schema";

export interface NovumTestAPI {
  /** The currently selected element (from inspection) */
  selectedElement: SelectedElement | null;
  /** Update the selected element (set by inspection hook) */
  setSelectedElement: (element: SelectedElement | null) => void;
  /** Files from VFS */
  files: Record<string, string>;
  /** Write file function from VFS */
  writeFile: (path: string, content: string) => void;
  /** Update classes at source location */
  updateClasses: (
    newClassName: string,
    sourceLocation?: SourceLocation
  ) => WriteResult;
  /** Update text at source location */
  updateText: (newText: string, sourceLocation?: SourceLocation) => WriteResult;
  /** Delete element at source location */
  deleteElement: (sourceLocation: SourceLocation) => WriteResult;
  /** Insert child at source location */
  insertChild: (
    sourceLocation: SourceLocation,
    childCode: string,
    position?: "first" | "last" | number
  ) => WriteResult;
  /** Run a test edit on the selected element (convenience for console testing) */
  testEdit: () => void;
  /** Test enum detection for a component (console debugging) */
  testEnumDetection: (componentName: string, filePath: string) => PropSchema | null;
}

declare global {
  interface Window {
    novum?: NovumTestAPI;
  }
}

/**
 * Initialize the test API on window.novum
 */
export function initializeTestAPI(api: Partial<NovumTestAPI>): void {
  if (typeof window === "undefined") return;

  window.novum = {
    selectedElement: null,
    setSelectedElement: () => {},
    files: {},
    writeFile: () => {},
    updateClasses: () => ({ success: false, error: "Not initialized" }),
    updateText: () => ({ success: false, error: "Not initialized" }),
    deleteElement: () => ({ success: false, error: "Not initialized" }),
    insertChild: () => ({ success: false, error: "Not initialized" }),
    testEdit: () => {
      console.log("=== Novum AST Writer Test ===");

      const novum = window.novum;
      if (!novum) {
        console.error("Novum API not initialized");
        return;
      }

      const selected = novum.selectedElement;
      if (!selected) {
        console.error("No element selected. Click an element in inspection mode first.");
        return;
      }

      console.log("Selected element:", selected);

      if (!selected.source) {
        console.warn("No source location available. Falling back to regex-based editing.");
        console.log("To test AST editing, make sure the Inspector reports source location.");

        // Try regex-based edit as fallback test
        if (selected.className) {
          const testClass = selected.className.includes("bg-")
            ? selected.className.replace(/bg-\S+/, "bg-red-500")
            : `${selected.className} bg-red-500`;

          console.log(`Testing regex fallback: changing className to "${testClass}"`);
          const result = novum.updateClasses(testClass);
          console.log("Result:", result);
        }
        return;
      }

      console.log("Source location:", selected.source);
      console.log(`File: ${selected.source.fileName}, Line: ${selected.source.line}, Column: ${selected.source.column}`);

      // Test 1: Update className
      if (selected.className) {
        const testClass = selected.className.includes("bg-")
          ? selected.className.replace(/bg-\S+/, "bg-green-500")
          : `${selected.className} bg-green-500`;

        console.log(`\n[Test 1] Updating className to: "${testClass}"`);
        const result = novum.updateClasses(testClass, selected.source);
        console.log("Result:", result);
      } else {
        console.log("\n[Test 1] Skipped: No className on element");
      }

      console.log("\n=== Test Complete ===");
      console.log("Check the preview to see if the background color changed to green.");
      console.log("\nOther available test functions:");
      console.log("  window.novum.updateText('New Text', source)");
      console.log("  window.novum.deleteElement(source)");
      console.log("  window.novum.insertChild(source, '<div>New Child</div>')");
      console.log("  window.novum.testEnumDetection('Button', '/components/ui/button.tsx')");
    },
    testEnumDetection: (componentName: string, filePath: string): PropSchema | null => {
      const novum = window.novum;
      if (!novum) {
        console.error("Novum API not initialized");
        return null;
      }

      const componentCode = novum.files[filePath];
      if (!componentCode) {
        console.error(`File not found: ${filePath}`);
        console.log("Available files:", Object.keys(novum.files).filter(f => f.includes("/components/")));
        return null;
      }

      console.log(`Scanning ${componentName} in ${filePath}...`);
      const schema = scanComponentPropSchema(componentCode, componentName);

      if (schema) {
        console.log("Detected enum props:", schema.enumProps);
      } else {
        console.log("No enum props detected");
      }

      return schema;
    },
    ...api,
  };

  console.log("[Novum] Test API initialized. Run window.novum.testEdit() to test AST editing.");
}

/**
 * Update the test API with new values
 */
export function updateTestAPI(updates: Partial<NovumTestAPI>): void {
  if (typeof window === "undefined" || !window.novum) return;

  Object.assign(window.novum, updates);
}
