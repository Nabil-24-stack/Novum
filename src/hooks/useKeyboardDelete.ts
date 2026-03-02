"use client";

import { useEffect, useCallback, useRef } from "react";
import { deleteNodeAtLocation } from "@/lib/ast/writer";
import { sendToIframe } from "@/lib/inspection/iframe-messaging";
import { toast } from "sonner";
import type { SelectedElement } from "@/lib/inspection/types";
import type { DecisionConnection } from "@/lib/product-brain/types";
import { useProductBrainStore } from "@/hooks/useProductBrainStore";

interface UseKeyboardDeleteOptions {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  selectedElement: SelectedElement | null;
  inspectionMode: boolean;
  /** Cancel (not flush) pending draft edits — element is being deleted */
  cancelDraft: () => void;
  /** Clear inspection selection after delete */
  onClearSelection: () => void;
  /** Called when element has strategy annotations — show confirmation modal instead of deleting immediately */
  onAnnotatedDeleteRequest?: (info: {
    tagName: string;
    previewText?: string;
    connections: DecisionConnection[];
    onConfirm: () => void;
  }) => void;
}

/**
 * Hook that enables deleting the selected element via Delete/Backspace keys.
 * Follows the same dual-listener pattern as useKeyboardMove: handles events
 * from both the host window and forwarded from the Sandpack iframe.
 */
export function useKeyboardDelete({
  files,
  writeFile,
  selectedElement,
  inspectionMode,
  cancelDraft,
  onClearSelection,
  onAnnotatedDeleteRequest,
}: UseKeyboardDeleteOptions) {
  // Refs to always read latest values, avoiding stale closures
  const filesRef = useRef(files);
  const selectedElementRef = useRef(selectedElement);
  const inspectionModeRef = useRef(inspectionMode);

  useEffect(() => { filesRef.current = files; });
  useEffect(() => { selectedElementRef.current = selectedElement; });
  useEffect(() => { inspectionModeRef.current = inspectionMode; });

  // Send delete message to the correct Sandpack iframe (page-aware for Flow View)
  const broadcastDelete = useCallback(() => {
    sendToIframe(
      { type: "novum:delete-element" },
      selectedElementRef.current?.pageId
    );
  }, []);

  // Actually execute the delete (after any confirmation)
  const executeDelete = useCallback(() => {
    const currentElement = selectedElementRef.current;
    if (!currentElement?.source) return;

    cancelDraft();

    const fileName = currentElement.source.fileName;
    const fileContent = filesRef.current[fileName];
    if (!fileContent) {
      console.warn(`File not found: ${fileName}`);
      return;
    }

    const result = deleteNodeAtLocation(fileContent, currentElement.source);

    if (result.success && result.newCode) {
      broadcastDelete();
      writeFile(fileName, result.newCode);

      // Remove strategy connections associated with this element
      if (currentElement.strategyIds?.length) {
        const brainStore = useProductBrainStore.getState();
        for (const sid of currentElement.strategyIds) {
          brainStore.removeConnection(sid);
        }
        toast.success(`Removed ${currentElement.strategyIds.length} annotation(s) from product brain`);
      }

      onClearSelection();
    } else {
      toast.error("Could not delete this element");
    }
  }, [writeFile, cancelDraft, onClearSelection, broadcastDelete]);

  // Core delete logic - shared by both event sources
  const performDelete = useCallback(() => {
    const currentElement = selectedElementRef.current;

    // Require inspection mode, a selected element with source location
    if (!inspectionModeRef.current) return;
    if (!currentElement?.source || !currentElement?.selector) return;

    // Check if element has strategy annotations — show confirmation modal if so
    if (currentElement.strategyIds?.length && onAnnotatedDeleteRequest) {
      const brainData = useProductBrainStore.getState().brainData;
      if (brainData) {
        const strategyIdSet = new Set(currentElement.strategyIds);
        const linkedConnections: DecisionConnection[] = brainData.pages.flatMap((p) =>
          p.connections.filter((c) => strategyIdSet.has(c.id))
        );

        if (linkedConnections.length > 0) {
          onAnnotatedDeleteRequest({
            tagName: currentElement.tagName,
            previewText: currentElement.textContent,
            connections: linkedConnections,
            onConfirm: executeDelete,
          });
          return;
        }
      }
    }

    // No annotations or no callback — delete directly
    executeDelete();
  }, [executeDelete, onAnnotatedDeleteRequest]);

  // Handle keyboard events directly on the window (when iframe doesn't have focus)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if input/textarea is focused
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Only handle Delete/Backspace
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      // Check if we can perform a delete before preventing default
      const currentElement = selectedElementRef.current;
      if (!inspectionModeRef.current) return;
      if (!currentElement?.source || !currentElement?.selector) return;

      e.preventDefault();
      performDelete();
    },
    [performDelete]
  );

  // Handle keyboard events forwarded from the iframe via postMessage
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== "novum:keyboard-event") return;

      const key = e.data.payload?.key;
      if (key !== "Delete" && key !== "Backspace") return;

      // Validate selectionId matches to prevent stale actions
      const selectionId = e.data.payload?.selectionId as string | undefined;
      const currentSelectionId = selectedElementRef.current?.selectionId;
      if (selectionId && currentSelectionId && selectionId !== currentSelectionId) {
        return;
      }

      performDelete();
    },
    [performDelete]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleMessage);
    };
  }, [handleKeyDown, handleMessage]);
}
