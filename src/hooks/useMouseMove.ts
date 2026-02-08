"use client";

import { useEffect, useCallback } from "react";
import { moveElementAtLocation } from "@/lib/ast/writer";
import type { MoveElementPayload, OptimisticMovePayload } from "@/lib/inspection/types";

interface UseMouseMoveOptions {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  /** Called before move to flush any pending draft changes */
  flushDraft: () => void;
  /** Called to perform optimistic DOM move in iframe */
  onOptimisticMove: (payload: OptimisticMovePayload) => void;
}

/**
 * Hook that handles mouse drag-and-drop of elements.
 * Listens for `novum:move-element` messages from the iframe and performs
 * the AST-based move in the VFS.
 */
export function useMouseMove({
  files,
  writeFile,
  flushDraft,
  onOptimisticMove,
}: UseMouseMoveOptions) {
  // Handle move requests from the iframe
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== "novum:move-element") {
        return;
      }

      const payload = e.data.payload as MoveElementPayload | undefined;
      if (!payload) return;

      const {
        sourceSelector,
        sourceLocation,
        targetSelector,
        targetLocation,
        position,
      } = payload;

      // Validate same file (cross-file moves not supported yet)
      if (sourceLocation.fileName !== targetLocation.fileName) {
        console.warn("Cross-file moves not supported");
        return;
      }

      // Flush any pending draft changes first
      flushDraft();

      // Get the file content
      const fileName = sourceLocation.fileName;
      const fileContent = files[fileName];
      if (!fileContent) {
        console.warn(`File not found: ${fileName}`);
        return;
      }

      // Perform optimistic DOM move in iframe
      onOptimisticMove({
        sourceSelector,
        targetSelector,
        position,
      });

      // Perform AST-based move in VFS
      const result = moveElementAtLocation(
        fileContent,
        sourceLocation,
        targetLocation,
        position
      );

      if (result.success && result.newCode) {
        writeFile(fileName, result.newCode);
      } else {
        console.warn("Move failed:", result.error);
        // Note: Optimistic move already happened, iframe will re-sync on next render
      }
    },
    [files, writeFile, flushDraft, onOptimisticMove]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);
}
