"use client";

import { create } from "zustand";
import type { CanvasNode, LayoutConfig, NodeStyle, SelectionState } from "@/lib/canvas/types";
import {
  getWorldPosition,
  calculateBoundingBox,
  worldToLocal,
  getChildren,
  calculateAutoLayoutPositions,
  calculateAutoLayoutSize,
} from "@/lib/canvas/coordinates";

// ============================================================================
// Store Interface
// ============================================================================

interface CanvasStore {
  // State
  nodes: Map<string, CanvasNode>;
  rootIds: string[];
  selection: SelectionState;
  frameCounter: number;

  // CRUD Operations
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;
  clearNodes: () => void;

  // Selection
  selectNode: (id: string, additive?: boolean) => void;
  deselectAll: () => void;
  toggleSelection: (id: string) => void;

  // Grouping
  groupSelection: () => string | null;
  ungroupNode: (id: string) => void;

  // Layout
  setLayout: (id: string, layout: LayoutConfig | null) => void;

  // Style
  setStyle: (id: string, style: NodeStyle | null) => void;

  // Frame Counter
  incrementFrameCounter: () => void;

  // Helpers (computed from state)
  getWorldPosition: (id: string) => { x: number; y: number };
  getChildren: (id: string) => CanvasNode[];
  getSelectedNodes: () => CanvasNode[];
  getSelectionBoundingBox: () => { x: number; y: number; width: number; height: number } | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function removeFromChildren(
  nodes: Map<string, CanvasNode>,
  parentId: string,
  childId: string
): void {
  const parent = nodes.get(parentId);
  if (parent?.children) {
    parent.children = parent.children.filter((id) => id !== childId);
  }
}

function addToChildren(
  nodes: Map<string, CanvasNode>,
  parentId: string,
  childId: string
): void {
  const parent = nodes.get(parentId);
  if (parent) {
    if (!parent.children) {
      parent.children = [];
    }
    if (!parent.children.includes(childId)) {
      parent.children.push(childId);
    }
  }
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // Initial State
  nodes: new Map(),
  rootIds: [],
  selection: {
    selectedIds: new Set(),
    primaryId: null,
  },
  frameCounter: 1,

  // -------------------------------------------------------------------------
  // CRUD Operations
  // -------------------------------------------------------------------------

  addNode: (node) => {
    set((state) => {
      const newNodes = new Map(state.nodes);
      newNodes.set(node.id, node);

      let newRootIds = state.rootIds;
      if (!node.parentId) {
        newRootIds = [...state.rootIds, node.id];
      } else {
        // Add to parent's children
        addToChildren(newNodes, node.parentId, node.id);
      }

      return { nodes: newNodes, rootIds: newRootIds };
    });
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes.get(id);
      if (!node) return state;

      const newNodes = new Map(state.nodes);
      const updatedNode = { ...node, ...updates };
      newNodes.set(id, updatedNode);

      // Handle parent change
      if (updates.parentId !== undefined && updates.parentId !== node.parentId) {
        // Remove from old parent
        if (node.parentId) {
          removeFromChildren(newNodes, node.parentId, id);
        }
        // Add to new parent
        if (updates.parentId) {
          addToChildren(newNodes, updates.parentId, id);
        }
        // Update rootIds
        let newRootIds = state.rootIds;
        if (!node.parentId && updates.parentId) {
          // Moved from root to child
          newRootIds = state.rootIds.filter((rid) => rid !== id);
        } else if (node.parentId && !updates.parentId) {
          // Moved from child to root
          newRootIds = [...state.rootIds, id];
        }
        return { nodes: newNodes, rootIds: newRootIds };
      }

      return { nodes: newNodes };
    });
  },

  removeNode: (id) => {
    set((state) => {
      const node = state.nodes.get(id);
      if (!node) return state;

      const newNodes = new Map(state.nodes);

      // Recursively remove all children
      const removeRecursive = (nodeId: string) => {
        const n = newNodes.get(nodeId);
        if (n?.children) {
          for (const childId of n.children) {
            removeRecursive(childId);
          }
        }
        newNodes.delete(nodeId);
      };

      removeRecursive(id);

      // Remove from parent's children
      if (node.parentId) {
        removeFromChildren(newNodes, node.parentId, id);
      }

      // Update rootIds
      const newRootIds = state.rootIds.filter((rid) => rid !== id);

      // Update selection
      const newSelectedIds = new Set(state.selection.selectedIds);
      newSelectedIds.delete(id);
      const newPrimaryId = state.selection.primaryId === id ? null : state.selection.primaryId;

      return {
        nodes: newNodes,
        rootIds: newRootIds,
        selection: {
          selectedIds: newSelectedIds,
          primaryId: newPrimaryId,
        },
      };
    });
  },

  clearNodes: () => {
    set({
      nodes: new Map(),
      rootIds: [],
      selection: { selectedIds: new Set(), primaryId: null },
    });
  },

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  selectNode: (id, additive = false) => {
    set((state) => {
      if (!state.nodes.has(id)) return state;

      if (additive) {
        const newSelectedIds = new Set(state.selection.selectedIds);
        newSelectedIds.add(id);
        return {
          selection: {
            selectedIds: newSelectedIds,
            primaryId: id,
          },
        };
      } else {
        return {
          selection: {
            selectedIds: new Set([id]),
            primaryId: id,
          },
        };
      }
    });
  },

  deselectAll: () => {
    set({
      selection: { selectedIds: new Set(), primaryId: null },
    });
  },

  toggleSelection: (id) => {
    set((state) => {
      if (!state.nodes.has(id)) return state;

      const newSelectedIds = new Set(state.selection.selectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
        // If deselecting primary, pick another or null
        const newPrimaryId =
          state.selection.primaryId === id
            ? newSelectedIds.size > 0
              ? Array.from(newSelectedIds)[0]
              : null
            : state.selection.primaryId;
        return {
          selection: {
            selectedIds: newSelectedIds,
            primaryId: newPrimaryId,
          },
        };
      } else {
        newSelectedIds.add(id);
        return {
          selection: {
            selectedIds: newSelectedIds,
            primaryId: id,
          },
        };
      }
    });
  },

  // -------------------------------------------------------------------------
  // Grouping
  // -------------------------------------------------------------------------

  groupSelection: () => {
    const state = get();
    const selectedIds = Array.from(state.selection.selectedIds);

    if (selectedIds.length < 2) {
      return null; // Need at least 2 elements to group
    }

    // Get all selected nodes that are at root level or share the same parent
    const selectedNodes = selectedIds
      .map((id) => state.nodes.get(id))
      .filter((n): n is CanvasNode => n !== undefined);

    // Check if all nodes have the same parent (or all are roots)
    const parentIds = new Set(selectedNodes.map((n) => n.parentId || null));
    if (parentIds.size > 1) {
      // Mixed parents - only group root-level nodes
      const rootSelected = selectedNodes.filter((n) => !n.parentId);
      if (rootSelected.length < 2) return null;
    }

    // Calculate bounding box in world coordinates
    const bbox = calculateBoundingBox(selectedIds, state.nodes);
    if (!bbox) return null;

    // Create the group node
    const groupId = generateId();
    const groupNode: CanvasNode = {
      id: groupId,
      type: "frame",
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      name: `Group ${state.frameCounter}`,
      parentId: null,
      children: [],
      layout: { direction: "row", gap: 8 },
    };

    set((currentState) => {
      const newNodes = new Map(currentState.nodes);
      const newRootIds = [...currentState.rootIds];

      // Add group node
      newNodes.set(groupId, groupNode);
      newRootIds.push(groupId);

      // Move selected nodes into group
      for (const node of selectedNodes) {
        if (node.parentId) continue; // Skip non-root nodes for now

        // Convert to relative coordinates
        const worldPos = getWorldPosition(node.id, currentState.nodes);
        const localPos = worldToLocal(worldPos.x, worldPos.y, groupId, newNodes);

        // Update node
        const updatedNode = {
          ...node,
          x: localPos.x,
          y: localPos.y,
          parentId: groupId,
        };
        newNodes.set(node.id, updatedNode);

        // Remove from root
        const rootIndex = newRootIds.indexOf(node.id);
        if (rootIndex !== -1) {
          newRootIds.splice(rootIndex, 1);
        }

        // Add to group's children
        const group = newNodes.get(groupId)!;
        group.children = group.children || [];
        group.children.push(node.id);
      }

      // Apply auto-layout to position children
      const group = newNodes.get(groupId)!;
      if (group.layout && group.children) {
        const children = group.children
          .map((id) => newNodes.get(id))
          .filter((n): n is CanvasNode => n !== undefined);
        const positions = calculateAutoLayoutPositions(group.layout, children);
        for (const pos of positions) {
          const child = newNodes.get(pos.id);
          if (child) {
            newNodes.set(pos.id, { ...child, x: pos.x, y: pos.y });
          }
        }

        // Recalculate group size based on children
        const size = calculateAutoLayoutSize(group.layout, children);
        newNodes.set(groupId, { ...group, width: size.width, height: size.height });
      }

      return {
        nodes: newNodes,
        rootIds: newRootIds.filter((id) => id !== undefined),
        frameCounter: currentState.frameCounter + 1,
        selection: {
          selectedIds: new Set([groupId]),
          primaryId: groupId,
        },
      };
    });

    return groupId;
  },

  ungroupNode: (id) => {
    const state = get();
    const group = state.nodes.get(id);

    if (!group || !group.children || group.children.length === 0) {
      return; // Not a group or no children
    }

    set((currentState) => {
      const newNodes = new Map(currentState.nodes);
      let newRootIds = [...currentState.rootIds];

      const groupWorldPos = getWorldPosition(id, currentState.nodes);
      const childIds = [...(group.children || [])];

      // Convert children to world coordinates and make them root nodes
      for (const childId of childIds) {
        const child = newNodes.get(childId);
        if (!child) continue;

        // Convert to world coordinates
        const newNode = {
          ...child,
          x: child.x + groupWorldPos.x,
          y: child.y + groupWorldPos.y,
          parentId: group.parentId || null,
        };
        newNodes.set(childId, newNode);

        // Add to appropriate parent or root
        if (!newNode.parentId) {
          newRootIds.push(childId);
        } else {
          addToChildren(newNodes, newNode.parentId, childId);
        }
      }

      // Remove group from its parent
      if (group.parentId) {
        removeFromChildren(newNodes, group.parentId, id);
      }

      // Delete the group
      newNodes.delete(id);
      newRootIds = newRootIds.filter((rid) => rid !== id);

      // Select the ungrouped children
      return {
        nodes: newNodes,
        rootIds: newRootIds,
        selection: {
          selectedIds: new Set(childIds),
          primaryId: childIds[0] || null,
        },
      };
    });
  },

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  setLayout: (id, layout) => {
    const state = get();
    const node = state.nodes.get(id);
    if (!node) return;

    set((currentState) => {
      const newNodes = new Map(currentState.nodes);
      const updatedNode = { ...node, layout: layout || undefined };
      newNodes.set(id, updatedNode);

      // If layout is set and node has children, recalculate positions
      if (layout && node.children && node.children.length > 0) {
        const children = node.children
          .map((cid) => newNodes.get(cid))
          .filter((n): n is CanvasNode => n !== undefined);

        const positions = calculateAutoLayoutPositions(layout, children);
        for (const pos of positions) {
          const child = newNodes.get(pos.id);
          if (child) {
            newNodes.set(pos.id, { ...child, x: pos.x, y: pos.y });
          }
        }

        // Recalculate group size
        const size = calculateAutoLayoutSize(layout, children);
        const group = newNodes.get(id)!;
        newNodes.set(id, { ...group, width: size.width, height: size.height });
      }

      return { nodes: newNodes };
    });
  },

  // -------------------------------------------------------------------------
  // Style
  // -------------------------------------------------------------------------

  setStyle: (id, style) => {
    const state = get();
    const node = state.nodes.get(id);
    if (!node) return;

    set((currentState) => {
      const newNodes = new Map(currentState.nodes);
      const updatedNode = { ...node, style: style || undefined };
      newNodes.set(id, updatedNode);
      return { nodes: newNodes };
    });
  },

  // -------------------------------------------------------------------------
  // Frame Counter
  // -------------------------------------------------------------------------

  incrementFrameCounter: () => {
    set((state) => ({ frameCounter: state.frameCounter + 1 }));
  },

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getWorldPosition: (id) => {
    return getWorldPosition(id, get().nodes);
  },

  getChildren: (id) => {
    return getChildren(id, get().nodes);
  },

  getSelectedNodes: () => {
    const state = get();
    const nodes: CanvasNode[] = [];
    for (const id of state.selection.selectedIds) {
      const node = state.nodes.get(id);
      if (node) nodes.push(node);
    }
    return nodes;
  },

  getSelectionBoundingBox: () => {
    const state = get();
    const selectedIds = Array.from(state.selection.selectedIds);
    return calculateBoundingBox(selectedIds, state.nodes);
  },
}));

// ============================================================================
// Selector Hooks (for performance optimization)
// ============================================================================

export function useSelectedIds(): Set<string> {
  return useCanvasStore((state) => state.selection.selectedIds);
}

export function usePrimarySelectedId(): string | null {
  return useCanvasStore((state) => state.selection.primaryId);
}

export function useNode(id: string): CanvasNode | undefined {
  return useCanvasStore((state) => state.nodes.get(id));
}

export function useRootNodes(): CanvasNode[] {
  return useCanvasStore((state) =>
    state.rootIds
      .map((id) => state.nodes.get(id))
      .filter((n): n is CanvasNode => n !== undefined)
  );
}

export function useIsNodeSelected(id: string): boolean {
  return useCanvasStore((state) => state.selection.selectedIds.has(id));
}

export function useIsNodePrimary(id: string): boolean {
  return useCanvasStore((state) => state.selection.primaryId === id);
}
