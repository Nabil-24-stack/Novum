"use client";

import { useEffect, useCallback, useRef } from "react";
import { deleteNodeAtLocation } from "@/lib/ast/writer";
import { toast } from "sonner";
import type { SelectedElement } from "@/lib/inspection/types";

interface UseKeyboardDeleteOptions {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  selectedElement: SelectedElement | null;
  inspectionMode: boolean;
  /** Cancel (not flush) pending draft edits — element is being deleted */
  cancelDraft: () => void;
  /** Clear inspection selection after delete */
  onClearSelection: () => void;
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
}: UseKeyboardDeleteOptions) {
  // Refs to always read latest values, avoiding stale closures
  const filesRef = useRef(files);
  const selectedElementRef = useRef(selectedElement);
  const inspectionModeRef = useRef(inspectionMode);

  useEffect(() => { filesRef.current = files; });
  useEffect(() => { selectedElementRef.current = selectedElement; });
  useEffect(() => { inspectionModeRef.current = inspectionMode; });

  // Broadcast delete message to all Sandpack iframes for optimistic DOM removal
  const broadcastDelete = useCallback(() => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[title="Sandpack Preview"]'
    );
    iframes.forEach((iframe) => {
      iframe.contentWindow?.postMessage(
        { type: "novum:delete-element" },
        "*"
      );
    });
  }, []);

  // Core delete logic - shared by both event sources
  const performDelete = useCallback(() => {
    const currentElement = selectedElementRef.current;

    // Require inspection mode, a selected element with source location
    if (!inspectionModeRef.current) return;
    if (!currentElement?.source || !currentElement?.selector) return;

    // Cancel any pending draft edits (element is being deleted, don't flush stale edits)
    cancelDraft();

    // Get the file content
    const fileName = currentElement.source.fileName;
    const fileContent = filesRef.current[fileName];
    if (!fileContent) {
      console.warn(`File not found: ${fileName}`);
      return;
    }

    // Perform AST-based delete
    const result = deleteNodeAtLocation(fileContent, currentElement.source);

    if (result.success && result.newCode) {
      // Optimistic DOM removal in iframe(s)
      broadcastDelete();

      // Persist to VFS
      writeFile(fileName, result.newCode);

      // Clear selection
      onClearSelection();
    } else {
      toast.error("Could not delete this element");
    }
  }, [writeFile, cancelDraft, onClearSelection, broadcastDelete]);

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
