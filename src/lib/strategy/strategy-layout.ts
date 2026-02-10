/**
 * Layout algorithm for strategy flow nodes.
 * Adapted from src/lib/flow/auto-layout.ts but for smaller abstract nodes.
 * Uses BFS topological sort to assign levels (columns) to nodes.
 */

import type { FlowNodePosition, LayoutResult } from "@/lib/flow/types";
import type { StrategyNode, StrategyConnection } from "@/hooks/useStrategyStore";

// Strategy node dimensions (smaller than app FlowFrames)
export const STRATEGY_NODE_WIDTH = 220;
export const STRATEGY_NODE_HEIGHT = 90;

// Layout spacing
const COLUMN_SPACING = 400;
const ROW_SPACING = 180;
const MARGIN = 40;

/**
 * Build adjacency list from connections
 */
function buildAdjacencyList(
  nodes: StrategyNode[],
  connections: StrategyConnection[]
): Map<string, string[]> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const conn of connections) {
    if (nodeIds.has(conn.from) && nodeIds.has(conn.to)) {
      adjacency.get(conn.from)!.push(conn.to);
    }
  }

  return adjacency;
}

/**
 * Find start nodes (no incoming edges, prioritize first node)
 */
function findStartNodes(
  nodes: StrategyNode[],
  connections: StrategyConnection[]
): StrategyNode[] {
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }
  for (const conn of connections) {
    if (inDegree.has(conn.to)) {
      inDegree.set(conn.to, inDegree.get(conn.to)! + 1);
    }
  }

  const rootNodes = nodes.filter((n) => inDegree.get(n.id) === 0);

  if (rootNodes.length === 0 && nodes.length > 0) {
    return [nodes[0]];
  }

  return rootNodes;
}

/**
 * Assign levels using BFS from start nodes
 */
function assignLevels(
  nodes: StrategyNode[],
  connections: StrategyConnection[]
): Map<string, number> {
  const adjacency = buildAdjacencyList(nodes, connections);
  const levels = new Map<string, number>();
  const startNodes = findStartNodes(nodes, connections);

  const queue: [string, number][] = startNodes.map((n) => [n.id, 0]);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [nodeId, level] = queue.shift()!;

    if (visited.has(nodeId)) continue;

    visited.add(nodeId);
    levels.set(nodeId, level);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push([neighbor, level + 1]);
      }
    }
  }

  // Assign unvisited nodes to the last level + 1
  const maxLevel = Math.max(0, ...Array.from(levels.values()));
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, maxLevel + 1);
    }
  }

  return levels;
}

/**
 * Group nodes by their assigned level
 */
function groupByLevel(
  nodes: StrategyNode[],
  levels: Map<string, number>
): Map<number, StrategyNode[]> {
  const groups = new Map<number, StrategyNode[]>();

  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(node);
  }

  return groups;
}

/**
 * Calculate layout positions for strategy flow nodes
 */
export function calculateStrategyLayout(
  nodes: StrategyNode[],
  connections: StrategyConnection[]
): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const levels = assignLevels(nodes, connections);
  const groups = groupByLevel(nodes, levels);

  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const maxNodesInColumn = Math.max(
    ...Array.from(groups.values()).map((g) => g.length),
    1
  );

  const totalHeight =
    maxNodesInColumn * STRATEGY_NODE_HEIGHT +
    (maxNodesInColumn - 1) * (ROW_SPACING - STRATEGY_NODE_HEIGHT);

  const positions: FlowNodePosition[] = [];

  for (let level = 0; level <= maxLevel; level++) {
    const nodesInLevel = groups.get(level) || [];
    const columnX = MARGIN + level * COLUMN_SPACING;

    const levelHeight =
      nodesInLevel.length * STRATEGY_NODE_HEIGHT +
      (nodesInLevel.length - 1) * (ROW_SPACING - STRATEGY_NODE_HEIGHT);
    const startY = MARGIN + (totalHeight - levelHeight) / 2;

    for (let i = 0; i < nodesInLevel.length; i++) {
      const node = nodesInLevel[i];
      positions.push({
        id: node.id,
        x: columnX,
        y: startY + i * ROW_SPACING,
        width: STRATEGY_NODE_WIDTH,
        height: STRATEGY_NODE_HEIGHT,
      });
    }
  }

  const maxX = Math.max(...positions.map((n) => n.x + n.width), 0);
  const maxY = Math.max(...positions.map((n) => n.y + n.height), 0);

  return {
    nodes: positions,
    width: maxX + MARGIN,
    height: maxY + MARGIN,
  };
}
