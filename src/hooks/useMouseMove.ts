"use client";

import { useEffect, useCallback } from "react";
import { moveElementAtLocation } from "@/lib/ast/writer";
import { getPageIdFromMessageSource } from "@/lib/inspection/iframe-messaging";
import type { MoveElementPayload, OptimisticMovePayload } from "@/lib/inspection/types";

interface UseMouseMoveOptions {
  writeFile: (path: string, content: string) => void;
  /** Called before move to flush any pending draft changes */
  flushDraft: () => void;
  /** Called to perform optimistic DOM move in iframe (with optional pageId for Flow View) */
  onOptimisticMove: (payload: OptimisticMovePayload, pageId?: string) => void;
  /** Read the latest file content synchronously (includes writes not yet in React state) */
  getLatestFile: (path: string) => string | undefined;
}

/**
 * Hook that handles mouse drag-and-drop of elements.
 * Listens for `novum:move-element` messages from the iframe and performs
 * the AST-based move in the VFS.
 */
export function useMouseMove({
  writeFile,
  flushDraft,
  onOptimisticMove,
  getLatestFile,
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

      // Detect which FlowFrame page the message came from (for targeted optimistic update)
      const pageId = getPageIdFromMessageSource(e);

      // Flush any pending draft changes first
      flushDraft();

      // Get the file content via immediate ref (includes writes not yet in React state)
      const fileName = sourceLocation.fileName;
      const fileContent = getLatestFile(fileName);
      if (!fileContent) {
        console.warn(`File not found: ${fileName}`);
        return;
      }

      // Perform optimistic DOM move in the correct iframe
      onOptimisticMove({
        sourceSelector,
        targetSelector,
        position,
      }, pageId);

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
    [writeFile, flushDraft, onOptimisticMove, getLatestFile]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);
}
