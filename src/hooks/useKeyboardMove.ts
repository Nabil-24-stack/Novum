"use client";

import { useEffect, useCallback, useRef } from "react";
import { preflightSwapSiblingAtLocation, swapSiblingAtLocation } from "@/lib/ast/writer";
import { toast } from "sonner";
import {
  ReorderFailureReason,
  type SelectedElement,
  type ParentLayoutInfo,
  type SourceLocation,
} from "@/lib/inspection/types";

interface UseKeyboardMoveOptions {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  selectedElement: SelectedElement | null;
  /** Called before swap to flush any pending draft changes */
  flushDraft: () => void;
  /** Called to perform optimistic DOM swap in iframe */
  onOptimisticSwap: (selector: string, direction: "prev" | "next") => void;
  /** Called to update the source location after a successful swap */
  onSourceLocationUpdate?: (source: SourceLocation) => void;
}

/**
 * Maps arrow keys to swap directions based on parent layout.
 *
 * | Parent Layout       | Arrow Key | Swap Direction |
 * |---------------------|-----------|----------------|
 * | flex-row            | Left      | prev           |
 * | flex-row            | Right     | next           |
 * | flex-row-reverse    | Left      | next           |
 * | flex-row-reverse    | Right     | prev           |
 * | flex-col / block    | Up        | prev           |
 * | flex-col / block    | Down      | next           |
 */
function getSwapDirection(
  key: string,
  parentLayout: ParentLayoutInfo | undefined
): { direction: "prev" | "next" | null; reason?: ReorderFailureReason } {
  if (!parentLayout || parentLayout.layout !== "flex") {
    return { direction: null, reason: ReorderFailureReason.NON_REORDERABLE_CONTEXT };
  }

  const layout = parentLayout?.layout ?? "block";
  const direction = parentLayout?.direction ?? "column";
  const isReverse = parentLayout?.isReverse ?? false;

  // For row layouts (flex-row), use Left/Right arrows
  if (layout === "flex" && direction === "row") {
    if (key === "ArrowLeft") {
      return { direction: isReverse ? "next" : "prev" };
    }
    if (key === "ArrowRight") {
      return { direction: isReverse ? "prev" : "next" };
    }
    return { direction: null };
  }

  // For column layouts (flex-col, block, grid), use Up/Down arrows
  if (key === "ArrowUp") {
    return { direction: isReverse ? "next" : "prev" };
  }
  if (key === "ArrowDown") {
    return { direction: isReverse ? "prev" : "next" };
  }

  return { direction: null };
}

function reorderFailureMessage(reason: ReorderFailureReason): string {
  switch (reason) {
    case ReorderFailureReason.NON_REORDERABLE_CONTEXT:
      return "Reorder works only when the selected element's parent uses flex layout";
    case ReorderFailureReason.NO_SIBLING_IN_DIRECTION:
      return "No sibling in that direction";
    case ReorderFailureReason.STALE_SOURCE_LOCATION:
      return "Selection changed; reselect the element and try again";
    case ReorderFailureReason.SOURCE_NOT_FOUND:
      return "Could not locate this element in source";
    default:
      return "Could not reorder element";
  }
}

/**
 * Hook that enables keyboard reordering of selected elements using arrow keys.
 * Arrow key direction maps to swap direction based on parent's layout.
 */
export function useKeyboardMove({
  files,
  writeFile,
  selectedElement,
  flushDraft,
  onOptimisticSwap,
  onSourceLocationUpdate,
}: UseKeyboardMoveOptions) {
  // Refs to always read latest values, avoiding stale closures during rapid key presses
  const filesRef = useRef(files);
  const selectedElementRef = useRef(selectedElement);

  useEffect(() => { filesRef.current = files; });
  useEffect(() => { selectedElementRef.current = selectedElement; });

  // Core swap logic - shared by both event sources
  const performSwap = useCallback(
    (key: string, parentLayoutOverride?: ParentLayoutInfo) => {
      // Read from refs to get latest values (not stale closure)
      const currentElement = selectedElementRef.current;

      // Require a selected element with source location
      if (!currentElement?.source || !currentElement?.selector) {
        return;
      }

      // Map arrow key to swap direction based on parent layout
      const { direction: swapDirection, reason } = getSwapDirection(
        key,
        parentLayoutOverride ?? currentElement.parentLayout
      );
      if (!swapDirection) {
        if (reason) {
          toast.error(reorderFailureMessage(reason));
        }
        return;
      }

      // Flush any pending draft changes first
      flushDraft();

      // Get the file content from ref
      const fileName = currentElement.source.fileName;
      const fileContent = filesRef.current[fileName];
      if (!fileContent) {
        console.warn(`File not found: ${fileName}`);
        return;
      }

      // Preflight before optimistic swap to avoid visible snap-back.
      const preflight = preflightSwapSiblingAtLocation(
        fileContent,
        currentElement.source,
        swapDirection
      );
      if (!preflight.success) {
        toast.error(reorderFailureMessage(preflight.reason || ReorderFailureReason.UNKNOWN));
        return;
      }

      // Perform optimistic DOM swap in iframe
      onOptimisticSwap(currentElement.selector, swapDirection);

      // Perform AST-based swap in VFS
      const result = swapSiblingAtLocation(
        fileContent,
        currentElement.source,
        swapDirection
      );

      if (result.success && result.newCode) {
        writeFile(fileName, result.newCode);

        // Immediately update refs so the next swap in the same render cycle
        // sees the updated code and source location
        filesRef.current = { ...filesRef.current, [fileName]: result.newCode };

        // Update the source location to track the element's new position
        if (result.newSourceLocation && onSourceLocationUpdate) {
          onSourceLocationUpdate(result.newSourceLocation);
          selectedElementRef.current = { ...currentElement, source: result.newSourceLocation };
        }
      } else {
        console.warn("Swap failed:", result.error);
        // Revert the optimistic DOM swap
        const reverseDirection = swapDirection === "prev" ? "next" : "prev";
        onOptimisticSwap(currentElement.selector, reverseDirection);
        toast.error(
          reorderFailureMessage(
            result.reorderFailureReason || ReorderFailureReason.UNKNOWN
          )
        );
      }
    },
    [writeFile, flushDraft, onOptimisticSwap, onSourceLocationUpdate]
  );

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

      // Only handle arrow keys
      if (
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        return;
      }

      // Check if we can perform a swap before preventing default
      const currentElement = selectedElementRef.current;
      if (!currentElement?.source || !currentElement?.selector) {
        return;
      }

      // Prevent default scrolling behavior
      e.preventDefault();

      performSwap(e.key);
    },
    [performSwap]
  );

  // Handle keyboard events forwarded from the iframe via postMessage
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== "novum:keyboard-event") {
        return;
      }

      const key = e.data.payload?.key;
      const parentLayout = e.data.payload?.parentLayout as ParentLayoutInfo | undefined;
      const selectionId = e.data.payload?.selectionId as string | undefined;
      if (
        !key ||
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)
      ) {
        return;
      }

      const currentSelectionId = selectedElementRef.current?.selectionId;
      if (selectionId && currentSelectionId && selectionId !== currentSelectionId) {
        return;
      }

      performSwap(key, parentLayout);
    },
    [performSwap]
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
