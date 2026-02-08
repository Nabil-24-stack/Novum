import type { CanvasNode } from "./types";

// ============================================================================
// Coordinate Helpers for Hierarchical Canvas
// ============================================================================

/**
 * Calculate the world position of a node, accounting for parent hierarchy.
 * Children use relative coordinates; this converts to absolute world coordinates.
 * Also accounts for parent's padding (children are offset inward by padding).
 */
export function getWorldPosition(
  nodeId: string,
  nodes: Map<string, CanvasNode>
): { x: number; y: number } {
  const node = nodes.get(nodeId);
  if (!node) {
    return { x: 0, y: 0 };
  }

  // Start with the node's own position
  let x = node.x;
  let y = node.y;

  // Walk up the parent chain, accumulating positions and padding
  let currentId = node.parentId;
  while (currentId) {
    const parent = nodes.get(currentId);
    if (!parent) break;

    // Add parent's position
    x += parent.x;
    y += parent.y;

    // Add parent's padding (children are inset by padding)
    const parentPadding = parent.layout?.padding || 0;
    x += parentPadding;
    y += parentPadding;

    currentId = parent.parentId;
  }

  return { x, y };
}

/**
 * Bounding box result with position and dimensions.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the bounding box that contains all specified nodes.
 * Uses world coordinates for accurate positioning.
 */
export function calculateBoundingBox(
  nodeIds: string[],
  nodes: Map<string, CanvasNode>
): BoundingBox | null {
  if (nodeIds.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of nodeIds) {
    const node = nodes.get(id);
    if (!node) continue;

    const worldPos = getWorldPosition(id, nodes);
    const nodeRight = worldPos.x + node.width;
    const nodeBottom = worldPos.y + node.height;

    minX = Math.min(minX, worldPos.x);
    minY = Math.min(minY, worldPos.y);
    maxX = Math.max(maxX, nodeRight);
    maxY = Math.max(maxY, nodeBottom);
  }

  if (minX === Infinity) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Convert world coordinates to local (relative to parent) coordinates.
 */
export function worldToLocal(
  worldX: number,
  worldY: number,
  parentId: string | null | undefined,
  nodes: Map<string, CanvasNode>
): { x: number; y: number } {
  if (!parentId) {
    return { x: worldX, y: worldY };
  }

  const parentWorld = getWorldPosition(parentId, nodes);
  return {
    x: worldX - parentWorld.x,
    y: worldY - parentWorld.y,
  };
}

/**
 * Get all children of a node, ordered by the children array.
 */
export function getChildren(
  nodeId: string,
  nodes: Map<string, CanvasNode>
): CanvasNode[] {
  const node = nodes.get(nodeId);
  if (!node?.children) {
    return [];
  }

  return node.children
    .map((childId) => nodes.get(childId))
    .filter((child): child is CanvasNode => child !== undefined);
}

/**
 * Get all root nodes (nodes without a parent).
 */
export function getRootNodes(nodes: Map<string, CanvasNode>): CanvasNode[] {
  const roots: CanvasNode[] = [];
  for (const node of nodes.values()) {
    if (!node.parentId) {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Check if a node is an ancestor of another node.
 */
export function isAncestor(
  ancestorId: string,
  nodeId: string,
  nodes: Map<string, CanvasNode>
): boolean {
  let currentId: string | null | undefined = nodeId;

  while (currentId) {
    const node = nodes.get(currentId);
    if (!node) return false;
    if (node.parentId === ancestorId) return true;
    currentId = node.parentId;
  }

  return false;
}

/**
 * Calculate positions for children based on auto-layout configuration.
 * Returns new positions relative to the group's origin.
 */
export function calculateAutoLayoutPositions(
  layout: { direction: "row" | "column"; gap: number; alignItems?: string },
  children: CanvasNode[]
): { id: string; x: number; y: number }[] {
  if (children.length === 0) return [];

  const positions: { id: string; x: number; y: number }[] = [];
  let offset = 0;

  for (const child of children) {
    if (layout.direction === "row") {
      positions.push({ id: child.id, x: offset, y: 0 });
      offset += child.width + layout.gap;
    } else {
      positions.push({ id: child.id, x: 0, y: offset });
      offset += child.height + layout.gap;
    }
  }

  return positions;
}

/**
 * Calculate the total size needed for auto-layout children.
 * Includes padding on all sides if specified.
 */
export function calculateAutoLayoutSize(
  layout: { direction: "row" | "column"; gap: number; padding?: number },
  children: CanvasNode[]
): { width: number; height: number } {
  const padding = layout.padding || 0;

  if (children.length === 0) {
    return { width: padding * 2, height: padding * 2 };
  }

  let totalWidth = 0;
  let totalHeight = 0;
  let maxWidth = 0;
  let maxHeight = 0;

  for (const child of children) {
    maxWidth = Math.max(maxWidth, child.width);
    maxHeight = Math.max(maxHeight, child.height);
    totalWidth += child.width;
    totalHeight += child.height;
  }

  const gapTotal = layout.gap * (children.length - 1);

  if (layout.direction === "row") {
    return {
      width: totalWidth + gapTotal + padding * 2,
      height: maxHeight + padding * 2,
    };
  } else {
    return {
      width: maxWidth + padding * 2,
      height: totalHeight + gapTotal + padding * 2,
    };
  }
}
