/**
 * Auto-layout calculation for flow nodes
 * Uses BFS (Breadth-First Search) to assign levels based on navigation flow
 * Positions nodes left-to-right by level, stacked vertically within each column
 *
 * No external dependencies - pure TypeScript implementation
 */

import type { FlowPage, FlowConnection, FlowNodePosition, LayoutResult } from "./types";
import { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/lib/constants";

// Node dimensions - always match Prototype view frame size
export const NODE_WIDTH = DEFAULT_FRAME_WIDTH;
export const NODE_HEIGHT = DEFAULT_FRAME_HEIGHT;

// Layout spacing - extra space for full-featured frames with headers
const COLUMN_SPACING = NODE_WIDTH + 100;   // Horizontal distance between columns
const ROW_SPACING = NODE_HEIGHT + 120;     // Vertical distance between rows (+ Frame header + gap)
const MARGIN = 50;           // Canvas margin

// Routing constants
const STUB = 30;             // Distance to go straight out before turning
const GAP = 50;              // Clearance below cards for backward routing

/**
 * Build adjacency list from connections
 */
function buildAdjacencyList(
  pages: FlowPage[],
  connections: FlowConnection[]
): Map<string, string[]> {
  const pageIds = new Set(pages.map(p => p.id));
  const adjacency = new Map<string, string[]>();

  for (const page of pages) {
    adjacency.set(page.id, []);
  }

  for (const conn of connections) {
    if (pageIds.has(conn.from) && pageIds.has(conn.to)) {
      adjacency.get(conn.from)!.push(conn.to);
    }
  }

  return adjacency;
}

/**
 * Find the start node (prioritize route "/" or first page with no incoming edges)
 */
function findStartNodes(
  pages: FlowPage[],
  connections: FlowConnection[]
): FlowPage[] {
  const inDegree = new Map<string, number>();
  for (const page of pages) {
    inDegree.set(page.id, 0);
  }
  for (const conn of connections) {
    if (inDegree.has(conn.to)) {
      inDegree.set(conn.to, inDegree.get(conn.to)! + 1);
    }
  }

  const homePage = pages.find(p => p.route === "/");
  const rootPages = pages.filter(p => inDegree.get(p.id) === 0);

  if (homePage) {
    const others = rootPages.filter(p => p.id !== homePage.id);
    return [homePage, ...others];
  }

  if (rootPages.length === 0 && pages.length > 0) {
    return [pages[0]];
  }

  return rootPages;
}

/**
 * Assign levels using BFS from start nodes
 */
function assignLevels(
  pages: FlowPage[],
  connections: FlowConnection[]
): Map<string, number> {
  const adjacency = buildAdjacencyList(pages, connections);
  const levels = new Map<string, number>();
  const startNodes = findStartNodes(pages, connections);

  const queue: [string, number][] = startNodes.map(p => [p.id, 0]);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [pageId, level] = queue.shift()!;

    if (visited.has(pageId)) {
      continue;
    }

    visited.add(pageId);
    levels.set(pageId, level);

    const neighbors = adjacency.get(pageId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push([neighbor, level + 1]);
      }
    }
  }

  const maxLevel = Math.max(0, ...Array.from(levels.values()));
  for (const page of pages) {
    if (!levels.has(page.id)) {
      levels.set(page.id, maxLevel + 1);
    }
  }

  return levels;
}

/**
 * Group pages by their assigned level
 */
function groupByLevel(
  pages: FlowPage[],
  levels: Map<string, number>
): Map<number, FlowPage[]> {
  const groups = new Map<number, FlowPage[]>();

  for (const page of pages) {
    const level = levels.get(page.id) ?? 0;
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(page);
  }

  return groups;
}

/**
 * Calculate the layout for all flow nodes
 */
export function calculateFlowLayout(
  pages: FlowPage[],
  connections: FlowConnection[]
): LayoutResult {
  if (pages.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const levels = assignLevels(pages, connections);
  const groups = groupByLevel(pages, levels);

  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const maxNodesInColumn = Math.max(
    ...Array.from(groups.values()).map(g => g.length),
    1
  );

  const totalHeight = maxNodesInColumn * NODE_HEIGHT + (maxNodesInColumn - 1) * (ROW_SPACING - NODE_HEIGHT);
  const nodes: FlowNodePosition[] = [];

  for (let level = 0; level <= maxLevel; level++) {
    const nodesInLevel = groups.get(level) || [];
    const columnX = MARGIN + level * COLUMN_SPACING;

    const levelHeight = nodesInLevel.length * NODE_HEIGHT +
      (nodesInLevel.length - 1) * (ROW_SPACING - NODE_HEIGHT);
    const startY = MARGIN + (totalHeight - levelHeight) / 2;

    for (let i = 0; i < nodesInLevel.length; i++) {
      const page = nodesInLevel[i];
      nodes.push({
        id: page.id,
        x: columnX,
        y: startY + i * ROW_SPACING,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }
  }

  const maxX = Math.max(...nodes.map(n => n.x + n.width), 0);
  const maxY = Math.max(...nodes.map(n => n.y + n.height), 0);

  return {
    nodes,
    width: maxX + MARGIN,
    height: maxY + MARGIN + GAP + 50, // Extra space for backward routes
  };
}

/**
 * Determine if a connection is a "forward" connection (left to right)
 */
export function isForwardConnection(
  from: FlowNodePosition,
  to: FlowNodePosition
): boolean {
  return from.x < to.x;
}

/**
 * Calculate smart orthogonal path with stub and clearance
 * Forward: Right → Stub → Turn → Target
 * Backward: Right → Down (under cards) → Left → Up → Target
 *
 * @param verticalOffset - Offset for bidirectional connections
 */
export function getSmartOrthogonalPath(
  from: FlowNodePosition,
  to: FlowNodePosition,
  verticalOffset: number = 0
): string {
  const isForward = isForwardConnection(from, to);

  if (isForward) {
    // Forward: right edge of source → left edge of target
    const startX = from.x + from.width;
    const startY = from.y + from.height / 2 + verticalOffset;
    const endX = to.x;
    const endY = to.y + to.height / 2 + verticalOffset;

    // Midpoint for the elbow (with stub)
    const midX = startX + STUB + (endX - startX - STUB * 2) / 2;

    // Path: Start → Stub right → Vertical to target Y → Horizontal to target
    return `M ${startX} ${startY} L ${startX + STUB} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX - STUB} ${endY} L ${endX} ${endY}`;
  } else {
    // Backward: left edge of source → right edge of target (mirror of forward)
    const startX = from.x;
    const startY = from.y + from.height / 2 + verticalOffset;
    const endX = to.x + to.width;
    const endY = to.y + to.height / 2 + verticalOffset;

    // Midpoint for the elbow (mirror of forward logic)
    const midX = endX + STUB + (startX - endX - STUB * 2) / 2;

    // Path: Start → Stub left → Vertical to target Y → Horizontal to target
    return `M ${startX} ${startY} L ${startX - STUB} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX + STUB} ${endY} L ${endX} ${endY}`;
  }
}

// Alias for backwards compatibility
export function getOrthogonalPath(
  from: FlowNodePosition,
  to: FlowNodePosition,
  verticalOffset: number = 0
): string {
  return getSmartOrthogonalPath(from, to, verticalOffset);
}
