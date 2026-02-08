"use client";

import { useCallback, useRef, useEffect } from "react";
import type { GhostElement, CanvasNode } from "@/lib/canvas/types";
import type { FrameState } from "@/components/canvas/Frame";
import type { SourceLocation, DropTargetFoundPayload } from "@/lib/inspection/types";
import { generateCodeForGhost, generateCodeForNode } from "@/lib/canvas/code-generator";
import { addImportsIfMissing } from "@/lib/ast/import-manager";
import { insertChildAtLocation } from "@/lib/ast/writer";

// ============================================================================
// Types
// ============================================================================

export interface MaterializeResult {
  success: boolean;
  error?: string;
  shouldRefresh?: boolean;
}

export interface UseMaterializerProps {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
}

export interface UseMaterializerReturn {
  /**
   * Materialize a ghost element into actual code in the VFS.
   * Returns a promise that resolves when the materialization is complete.
   */
  materialize: (
    ghost: GhostElement,
    frameState: FrameState,
    iframeDropPoint: { x: number; y: number },
    targetPageId?: string
  ) => Promise<MaterializeResult>;

  /**
   * Materialize a CanvasNode (potentially a group with children) into actual code.
   * Groups become flex containers with their children inside.
   */
  materializeNode: (
    node: CanvasNode,
    nodes: Map<string, CanvasNode>,
    frameState: FrameState,
    iframeDropPoint: { x: number; y: number },
    targetPageId?: string
  ) => Promise<MaterializeResult>;

  /**
   * Query the iframe for the drop target at the given coordinates.
   * Returns a promise that resolves with the drop target info.
   */
  findDropTarget: (
    iframeX: number,
    iframeY: number,
    targetPageId?: string
  ) => Promise<DropTargetFoundPayload | null>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMaterializer({
  files,
  writeFile,
}: UseMaterializerProps): UseMaterializerReturn {
  // Keep refs to latest values to avoid stale closures in message handlers
  const filesRef = useRef(files);
  const writeFileRef = useRef(writeFile);

  useEffect(() => {
    filesRef.current = files;
    writeFileRef.current = writeFile;
  }, [files, writeFile]);

  // Track pending drop target requests
  const pendingDropTargetRef = useRef<{
    resolve: (value: DropTargetFoundPayload | null) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Listen for drop target responses from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "novum:drop-target-found" && pendingDropTargetRef.current) {
        const { resolve, timeout } = pendingDropTargetRef.current;
        clearTimeout(timeout);
        pendingDropTargetRef.current = null;
        resolve(event.data.payload as DropTargetFoundPayload);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /**
   * Find the Sandpack iframe and send a message to it.
   * When targetPageId is provided, targets a specific FlowFrame's iframe.
   */
  const sendToIframe = useCallback((message: { type: string; payload?: unknown }, targetPageId?: string) => {
    const selector = targetPageId
      ? `[data-flow-page-id="${targetPageId}"] iframe[title="Sandpack Preview"]`
      : 'iframe[title="Sandpack Preview"]';
    const iframe = document.querySelector<HTMLIFrameElement>(selector);
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(message, "*");
      return true;
    }
    return false;
  }, []);

  /**
   * Query the iframe for the drop target at the given coordinates.
   * When targetPageId is provided, queries a specific FlowFrame's iframe.
   */
  const findDropTarget = useCallback(
    (iframeX: number, iframeY: number, targetPageId?: string): Promise<DropTargetFoundPayload | null> => {
      return new Promise((resolve) => {
        // Clear any pending request
        if (pendingDropTargetRef.current) {
          clearTimeout(pendingDropTargetRef.current.timeout);
        }

        // Set up timeout for response
        const timeout = setTimeout(() => {
          pendingDropTargetRef.current = null;
          resolve(null);
        }, 500);

        pendingDropTargetRef.current = { resolve, timeout };

        // Send request to iframe
        const sent = sendToIframe({
          type: "novum:find-drop-target",
          payload: { x: iframeX, y: iframeY },
        }, targetPageId);

        if (!sent) {
          clearTimeout(timeout);
          pendingDropTargetRef.current = null;
          resolve(null);
        }
      });
    },
    [sendToIframe]
  );

  /**
   * Find the root JSX element location in App.tsx for fallback insertion.
   * Looks for the return statement's first JSX element.
   */
  const findAppRootLocation = useCallback((appCode: string): SourceLocation | null => {
    // Look for common patterns in App.tsx return statement
    // Pattern 1: return (<div ...) or return <div ...
    const returnMatch = appCode.match(/return\s*\(?[\s\n]*<([a-zA-Z][a-zA-Z0-9]*)/m);

    if (returnMatch) {
      // Find the line and column of the JSX element
      const matchedContent = appCode.slice(returnMatch.index);

      // Find where the actual JSX tag starts
      const jsxTagMatch = matchedContent.match(/<([a-zA-Z][a-zA-Z0-9]*)/);
      if (jsxTagMatch && jsxTagMatch.index !== undefined) {
        const jsxStartIndex = (returnMatch.index || 0) + jsxTagMatch.index;
        const beforeJsx = appCode.slice(0, jsxStartIndex);

        // Calculate line and column
        const lines = beforeJsx.split("\n");
        const line = lines.length;
        const column = lines[lines.length - 1].length;

        return {
          fileName: "/App.tsx",
          line,
          column,
        };
      }
    }

    return null;
  }, []);

  /**
   * Materialize a ghost element into actual code.
   * Always uses flow/auto-layout - elements are inserted as children of the target container.
   */
  const materialize = useCallback(
    async (
      ghost: GhostElement,
      frameState: FrameState,
      iframeDropPoint: { x: number; y: number },
      targetPageId?: string
    ): Promise<MaterializeResult> => {
      const currentFiles = filesRef.current;
      const currentWriteFile = writeFileRef.current;

      // Send optimistic placeholder to iframe for instant visual feedback
      sendToIframe({
        type: "novum:insert-placeholder",
        payload: {
          x: iframeDropPoint.x,
          y: iframeDropPoint.y,
          componentName: ghost.componentType || ghost.type,
        },
      }, targetPageId);

      // 1. Query iframe for drop target
      const dropTarget = await findDropTarget(iframeDropPoint.x, iframeDropPoint.y, targetPageId);

      // 2. Generate JSX code (always flow layout)
      const generated = generateCodeForGhost(ghost);

      // 3. Determine target file and location
      let targetFile: string;
      let targetLocation: SourceLocation | null;

      if (dropTarget?.isContainer && dropTarget.source) {
        // Smart nesting: insert into the container
        targetFile = dropTarget.source.fileName;
        targetLocation = dropTarget.source;
      } else {
        // Fallback: insert into App.tsx root
        targetFile = "/App.tsx";
        targetLocation = findAppRootLocation(currentFiles["/App.tsx"] || "");
      }

      if (!targetLocation) {
        return {
          success: false,
          error: "Could not find a valid insertion point in the code",
        };
      }

      // 4. Get the file content
      let code = currentFiles[targetFile];
      if (!code) {
        return {
          success: false,
          error: `File not found: ${targetFile}`,
        };
      }

      // 5. Add imports if needed
      if (generated.imports.length > 0) {
        const importResult = addImportsIfMissing(
          code,
          generated.imports.map((imp) => ({
            componentName: imp.componentName,
            importPath: imp.importPath,
            isNamedExport: imp.isNamedExport,
          })),
          targetFile // Pass target file for relative path resolution
        );

        if (!importResult.success) {
          return {
            success: false,
            error: importResult.error || "Failed to add imports",
          };
        }

        code = importResult.newCode!;

        // Recalculate target location since imports may have shifted line numbers
        // Count how many new lines were added
        const originalLines = (currentFiles[targetFile] || "").split("\n").length;
        const newLines = code.split("\n").length;
        const lineOffset = newLines - originalLines;

        if (lineOffset > 0 && targetLocation) {
          targetLocation = {
            ...targetLocation,
            line: targetLocation.line + lineOffset,
          };
        }
      }

      // 6. Insert JSX as last child of target
      let insertResult = insertChildAtLocation(
        code,
        targetLocation,
        generated.jsx,
        "last"
      );

      // If smart nesting failed (stale source location after edits), fallback to App root
      if (!insertResult.success && dropTarget?.isContainer && dropTarget.source) {
        const fallbackLocation = findAppRootLocation(code);
        if (fallbackLocation) {
          insertResult = insertChildAtLocation(
            code,
            fallbackLocation,
            generated.jsx,
            "last"
          );
        }
      }

      if (!insertResult.success) {
        return {
          success: false,
          error: insertResult.error || "Failed to insert code",
        };
      }

      // 7. Write to VFS
      currentWriteFile(targetFile, insertResult.newCode!);

      // 8. Remove placeholder after a brief delay to let HMR paint the real component first
      setTimeout(() => {
        sendToIframe({ type: "novum:remove-placeholder" }, targetPageId);
      }, 100);

      return { success: true, shouldRefresh: true };
    },
    [findDropTarget, findAppRootLocation, sendToIframe]
  );

  /**
   * Materialize a CanvasNode (potentially a group with children) into actual code.
   * Groups become flex containers with their children inside.
   */
  const materializeNode = useCallback(
    async (
      node: CanvasNode,
      nodes: Map<string, CanvasNode>,
      frameState: FrameState,
      iframeDropPoint: { x: number; y: number },
      targetPageId?: string
    ): Promise<MaterializeResult> => {
      const currentFiles = filesRef.current;
      const currentWriteFile = writeFileRef.current;

      // Send optimistic placeholder to iframe for instant visual feedback
      sendToIframe({
        type: "novum:insert-placeholder",
        payload: {
          x: iframeDropPoint.x,
          y: iframeDropPoint.y,
          componentName: node.name || node.componentType || node.type,
        },
      }, targetPageId);

      // 1. Query iframe for drop target
      const dropTarget = await findDropTarget(iframeDropPoint.x, iframeDropPoint.y, targetPageId);

      // 2. Generate JSX code - use recursive function for groups
      const generated = generateCodeForNode(node, nodes);

      // 3. Determine target file and location
      let targetFile: string;
      let targetLocation: SourceLocation | null;

      if (dropTarget?.isContainer && dropTarget.source) {
        targetFile = dropTarget.source.fileName;
        targetLocation = dropTarget.source;
      } else {
        targetFile = "/App.tsx";
        targetLocation = findAppRootLocation(currentFiles["/App.tsx"] || "");
      }

      if (!targetLocation) {
        return {
          success: false,
          error: "Could not find a valid insertion point in the code",
        };
      }

      // 4. Get the file content
      let code = currentFiles[targetFile];
      if (!code) {
        return {
          success: false,
          error: `File not found: ${targetFile}`,
        };
      }

      // 5. Add imports if needed
      if (generated.imports.length > 0) {
        const importResult = addImportsIfMissing(
          code,
          generated.imports.map((imp) => ({
            componentName: imp.componentName,
            importPath: imp.importPath,
            isNamedExport: imp.isNamedExport,
          })),
          targetFile
        );

        if (!importResult.success) {
          return {
            success: false,
            error: importResult.error || "Failed to add imports",
          };
        }

        code = importResult.newCode!;

        // Recalculate target location since imports may have shifted line numbers
        const originalLines = (currentFiles[targetFile] || "").split("\n").length;
        const newLines = code.split("\n").length;
        const lineOffset = newLines - originalLines;

        if (lineOffset > 0 && targetLocation) {
          targetLocation = {
            ...targetLocation,
            line: targetLocation.line + lineOffset,
          };
        }
      }

      // 6. Insert JSX as last child of target
      let insertResult = insertChildAtLocation(
        code,
        targetLocation,
        generated.jsx,
        "last"
      );

      // If smart nesting failed, fallback to App root
      if (!insertResult.success && dropTarget?.isContainer && dropTarget.source) {
        const fallbackLocation = findAppRootLocation(code);
        if (fallbackLocation) {
          insertResult = insertChildAtLocation(
            code,
            fallbackLocation,
            generated.jsx,
            "last"
          );
        }
      }

      if (!insertResult.success) {
        return {
          success: false,
          error: insertResult.error || "Failed to insert code",
        };
      }

      // 7. Write to VFS
      currentWriteFile(targetFile, insertResult.newCode!);

      // 8. Remove placeholder
      setTimeout(() => {
        sendToIframe({ type: "novum:remove-placeholder" }, targetPageId);
      }, 100);

      return { success: true, shouldRefresh: true };
    },
    [findDropTarget, findAppRootLocation, sendToIframe]
  );

  return {
    materialize,
    materializeNode,
    findDropTarget,
  };
}
