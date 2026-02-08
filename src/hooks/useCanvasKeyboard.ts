"use client";

import { useEffect, useCallback } from "react";
import { useCanvasStore } from "./useCanvasStore";

interface UseCanvasKeyboardOptions {
  /**
   * Callback when group operation completes.
   */
  onGroup?: (groupId: string) => void;
  /**
   * Callback when ungroup operation completes.
   */
  onUngroup?: (childIds: string[]) => void;
}

/**
 * Hook that handles keyboard shortcuts for canvas operations:
 * - Cmd/Ctrl+G: Group selected elements
 * - Cmd/Ctrl+Shift+G: Ungroup selected group
 * - Delete/Backspace: Remove selected elements
 * - Escape: Deselect all
 */
export function useCanvasKeyboard(options: UseCanvasKeyboardOptions = {}) {
  const {
    selection,
    groupSelection,
    ungroupNode,
    removeNode,
    deselectAll,
    nodes,
  } = useCanvasStore();

  const handleGroup = useCallback(() => {
    if (selection.selectedIds.size < 2) return;

    const groupId = groupSelection();
    if (groupId) {
      options.onGroup?.(groupId);
    }
  }, [selection.selectedIds.size, groupSelection, options]);

  const handleUngroup = useCallback(() => {
    if (!selection.primaryId) return;

    const node = nodes.get(selection.primaryId);
    if (!node?.children || node.children.length === 0) return;

    const childIds = [...node.children];
    ungroupNode(selection.primaryId);
    options.onUngroup?.(childIds);
  }, [selection.primaryId, nodes, ungroupNode, options]);

  const handleDelete = useCallback(() => {
    if (selection.selectedIds.size === 0) return;

    // Remove all selected nodes
    for (const id of selection.selectedIds) {
      removeNode(id);
    }
  }, [selection.selectedIds, removeNode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focused on an input
      const tagName = document.activeElement?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") return;

      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+G: Group
      if (isMod && e.key.toLowerCase() === "g" && !e.shiftKey) {
        e.preventDefault();
        handleGroup();
        return;
      }

      // Cmd/Ctrl+Shift+G: Ungroup
      if (isMod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleUngroup();
        return;
      }

      // Delete/Backspace: Remove selected
      if ((e.key === "Delete" || e.key === "Backspace") && selection.selectedIds.size > 0) {
        e.preventDefault();
        handleDelete();
        return;
      }

      // Escape: Deselect all
      if (e.key === "Escape" && selection.selectedIds.size > 0) {
        e.preventDefault();
        deselectAll();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGroup, handleUngroup, handleDelete, deselectAll, selection.selectedIds.size]);
}
