"use client";

import { useEffect, useCallback, useRef } from "react";
import {
  preflightSwapSiblingAtLocation,
  swapSiblingAtLocation,
  preflightMoveBySiblingOffset,
  moveBySiblingOffsetAtLocation,
} from "@/lib/ast/writer";
import { toast } from "sonner";
import {
  ReorderFailureReason,
  type SelectedElement,
  type ParentLayoutInfo,
  type SourceLocation,
} from "@/lib/inspection/types";

interface UseKeyboardMoveOptions {
  writeFile: (path: string, content: string) => void;
  selectedElement: SelectedElement | null;
  /** Called before swap to flush any pending draft changes */
  flushDraft: () => void;
  /** Called to perform optimistic DOM swap in iframe */
  onOptimisticSwap: (selector: string, direction: "prev" | "next") => void;
  /** Called to perform optimistic DOM move by offset in iframe */
  onOptimisticMoveByOffset?: (offset: number) => void;
  /** Called to update the source location after a successful swap */
  onSourceLocationUpdate?: (source: SourceLocation) => void;
  /** Read the latest file content synchronously (includes writes not yet in React state) */
  getLatestFile: (path: string) => string | undefined;
}

/** Move instruction for keyboard reordering */
type MoveInstruction =
  | { type: "swap"; direction: "prev" | "next" }
  | { type: "offset"; offset: number };

/**
 * Maps arrow keys to move instructions based on parent layout.
 *
 * Flex layouts:
 * | Parent Layout       | Arrow Key | Action          |
 * |---------------------|-----------|-----------------|
 * | flex-row            | Left      | swap prev       |
 * | flex-row            | Right     | swap next       |
 * | flex-row-reverse    | Left      | swap next       |
 * | flex-row-reverse    | Right     | swap prev       |
 * | flex-col / block    | Up        | swap prev       |
 * | flex-col / block    | Down      | swap next       |
 *
 * Grid layouts:
 * | Arrow Key | Action                          |
 * |-----------|---------------------------------|
 * | Left      | swap prev (adjacent)            |
 * | Right     | swap next (adjacent)            |
 * | Up        | offset -numCols (jump row up)   |
 * | Down      | offset +numCols (jump row down) |
 */
function getMoveInstruction(
  key: string,
  parentLayout: ParentLayoutInfo | undefined
): { instruction: MoveInstruction | null; reason?: ReorderFailureReason } {
  if (!parentLayout || (parentLayout.layout !== "flex" && parentLayout.layout !== "grid")) {
    return { instruction: null, reason: ReorderFailureReason.NON_REORDERABLE_CONTEXT };
  }

  // Grid layout
  if (parentLayout.layout === "grid") {
    // Block explicitly-placed grids
    if (parentLayout.hasExplicitPlacement) {
      return { instruction: null, reason: ReorderFailureReason.NON_REORDERABLE_CONTEXT };
    }

    if (key === "ArrowLeft") {
      return { instruction: { type: "swap", direction: "prev" } };
    }
    if (key === "ArrowRight") {
      return { instruction: { type: "swap", direction: "next" } };
    }
    if (key === "ArrowUp") {
      const numCols = parentLayout.numCols ?? 1;
      return { instruction: { type: "offset", offset: -numCols } };
    }
    if (key === "ArrowDown") {
      const numCols = parentLayout.numCols ?? 1;
      return { instruction: { type: "offset", offset: numCols } };
    }
    return { instruction: null };
  }

  // Flex layout
  const direction = parentLayout.direction ?? "column";
  const isReverse = parentLayout.isReverse ?? false;

  // For row layouts (flex-row), use Left/Right arrows
  if (direction === "row") {
    if (key === "ArrowLeft") {
      return { instruction: { type: "swap", direction: isReverse ? "next" : "prev" } };
    }
    if (key === "ArrowRight") {
      return { instruction: { type: "swap", direction: isReverse ? "prev" : "next" } };
    }
    return { instruction: null };
  }

  // For column layouts (flex-col), use Up/Down arrows
  if (key === "ArrowUp") {
    return { instruction: { type: "swap", direction: isReverse ? "next" : "prev" } };
  }
  if (key === "ArrowDown") {
    return { instruction: { type: "swap", direction: isReverse ? "prev" : "next" } };
  }

  return { instruction: null };
}

function reorderFailureMessage(reason: ReorderFailureReason): string {
  switch (reason) {
    case ReorderFailureReason.NON_REORDERABLE_CONTEXT:
      return "Reorder works only when the selected element's parent uses flex or grid layout";
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
 * Supports both flex (adjacent swap) and grid (row-jumping by offset).
 */
export function useKeyboardMove({
  writeFile,
  selectedElement,
  flushDraft,
  onOptimisticSwap,
  onOptimisticMoveByOffset,
  onSourceLocationUpdate,
  getLatestFile,
}: UseKeyboardMoveOptions) {
  // Ref to always read latest selected element, avoiding stale closures during rapid key presses.
  const selectedElementRef = useRef(selectedElement);

  // Monotonic counter: incremented each time performMove manually updates the ref.
  // Prevents the useEffect sync from overwriting manually-set source locations
  // with stale React state during rapid swaps (the core race condition fix).
  const manualUpdateCounterRef = useRef(0);
  const lastSyncedCounterRef = useRef(0);

  useEffect(() => {
    if (manualUpdateCounterRef.current === lastSyncedCounterRef.current) {
      // No manual swap since last sync — safe to sync from React state
      selectedElementRef.current = selectedElement;
    } else {
      // A swap happened — React state may lag behind the ref.
      // Merge non-source fields from React state but preserve the ref's
      // manually-set source and parentLayout.
      const currentSource = selectedElementRef.current?.source;
      const currentParentLayout = selectedElementRef.current?.parentLayout;
      if (selectedElement) {
        selectedElementRef.current = {
          ...selectedElement,
          source: currentSource ?? selectedElement.source,
          parentLayout: currentParentLayout ?? selectedElement.parentLayout,
        };
      }
    }
    lastSyncedCounterRef.current = manualUpdateCounterRef.current;
  }, [selectedElement]);

  // Core move logic - shared by both event sources
  const performMove = useCallback(
    (key: string, parentLayoutOverride?: ParentLayoutInfo) => {
      // Read from refs to get latest values (not stale closure)
      const currentElement = selectedElementRef.current;

      // Require a selected element with source location
      if (!currentElement?.source || !currentElement?.selector) {
        return;
      }

      // Determine the best parentLayout to use.
      // The iframe may report a stale "block" layout if the selected element
      // became disconnected (e.g., after Sandpack recompiled from a VFS write).
      // In that case, prefer the ref's known layout over the iframe's stale report.
      let effectiveParentLayout = parentLayoutOverride ?? currentElement.parentLayout;
      if (
        parentLayoutOverride?.layout === "block" &&
        currentElement.parentLayout &&
        (currentElement.parentLayout.layout === "flex" || currentElement.parentLayout.layout === "grid")
      ) {
        effectiveParentLayout = currentElement.parentLayout;
      }

      // Map arrow key to move instruction based on parent layout
      const { instruction, reason } = getMoveInstruction(
        key,
        effectiveParentLayout
      );
      if (!instruction) {
        if (reason) {
          toast.error(reorderFailureMessage(reason));
        }
        return;
      }

      // Flush any pending draft changes first
      flushDraft();

      // Get the file content via immediate ref (includes writes not yet in React state)
      const fileName = currentElement.source.fileName;
      const fileContent = getLatestFile(fileName);
      if (!fileContent) {
        console.warn(`File not found: ${fileName}`);
        return;
      }

      if (instruction.type === "swap") {
        // Adjacent swap (flex or grid left/right)
        const swapDirection = instruction.direction;

        // Preflight before optimistic swap (pass tagName for recovery if location drifted)
        const preflight = preflightSwapSiblingAtLocation(
          fileContent,
          currentElement.source,
          swapDirection,
          currentElement.tagName
        );
        if (!preflight.success) {
          toast.error(reorderFailureMessage(preflight.reason || ReorderFailureReason.UNKNOWN));
          return;
        }

        // Use corrected location if preflight recovered from a stale position
        const effectiveSource = preflight.correctedLocation ?? currentElement.source;

        // Perform optimistic DOM swap in iframe
        onOptimisticSwap(currentElement.selector, swapDirection);

        // Perform AST-based swap in VFS
        const result = swapSiblingAtLocation(
          fileContent,
          effectiveSource,
          swapDirection
        );

        if (result.success && result.newCode) {
          writeFile(fileName, result.newCode);

          if (result.newSourceLocation && onSourceLocationUpdate) {
            onSourceLocationUpdate(result.newSourceLocation);
            manualUpdateCounterRef.current++;
            // Keep parentLayout from the effective layout used for this swap,
            // not the potentially stale value from a selection-revalidated message.
            selectedElementRef.current = {
              ...currentElement,
              source: result.newSourceLocation,
              parentLayout: effectiveParentLayout,
            };
          }
        } else {
          console.warn("Swap failed:", result.error);
          const reverseDirection = swapDirection === "prev" ? "next" : "prev";
          onOptimisticSwap(currentElement.selector, reverseDirection);
          toast.error(
            reorderFailureMessage(
              result.reorderFailureReason || ReorderFailureReason.UNKNOWN
            )
          );
        }
      } else {
        // Offset-based move (grid up/down)
        const offset = instruction.offset;

        // Preflight before optimistic move (pass tagName for recovery)
        const preflight = preflightMoveBySiblingOffset(
          fileContent,
          currentElement.source,
          offset,
          currentElement.tagName
        );
        if (!preflight.success) {
          toast.error(reorderFailureMessage(preflight.reason || ReorderFailureReason.UNKNOWN));
          return;
        }

        // Use corrected location if preflight recovered from a stale position
        const effectiveSource = preflight.correctedLocation ?? currentElement.source;

        // Perform optimistic DOM move in iframe
        if (onOptimisticMoveByOffset) {
          onOptimisticMoveByOffset(offset);
        }

        // Perform AST-based move in VFS
        const result = moveBySiblingOffsetAtLocation(
          fileContent,
          effectiveSource,
          offset
        );

        if (result.success && result.newCode) {
          writeFile(fileName, result.newCode);

          if (result.newSourceLocation && onSourceLocationUpdate) {
            onSourceLocationUpdate(result.newSourceLocation);
            manualUpdateCounterRef.current++;
            selectedElementRef.current = {
              ...currentElement,
              source: result.newSourceLocation,
              parentLayout: effectiveParentLayout,
            };
          }
        } else {
          console.warn("Move by offset failed:", result.error);
          // Revert the optimistic move by reversing offset
          if (onOptimisticMoveByOffset) {
            onOptimisticMoveByOffset(-offset);
          }
          toast.error(
            reorderFailureMessage(
              result.reorderFailureReason || ReorderFailureReason.UNKNOWN
            )
          );
        }
      }
    },
    [writeFile, flushDraft, onOptimisticSwap, onOptimisticMoveByOffset, onSourceLocationUpdate, getLatestFile]
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

      performMove(e.key);
    },
    [performMove]
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

      // If selectionId from iframe doesn't match the ref, the ref may be stale
      // (e.g., after a swap where the iframe generated a new selectionId but
      // the ref hasn't been updated by React yet). In this case, still proceed
      // but don't trust the iframe's parentLayout — it may also be stale from
      // a disconnected element. Use undefined so performMove falls back to the ref.
      const iframeLayoutTrustworthy =
        !selectionId || !currentSelectionId || selectionId === currentSelectionId;

      performMove(key, iframeLayoutTrustworthy ? parentLayout : undefined);
    },
    [performMove]
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
